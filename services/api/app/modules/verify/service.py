"""Verification service: EXIF, Wayback, reverse image search, media analysis."""
import io
import json
import logging
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from ...core.config import get_settings

log = logging.getLogger(__name__)


def _parse_gps_coord(coord_val: Any, ref: str) -> float | None:
    """Convert EXIF GPS rational list [deg, min, sec] to decimal degrees."""
    try:
        if isinstance(coord_val, list) and len(coord_val) == 3:
            deg, mn, sec = [float(v) for v in coord_val]
            decimal = deg + mn / 60 + sec / 3600
            if ref in ("S", "W"):
                decimal = -decimal
            return round(decimal, 6)
    except Exception:
        pass
    return None


def extract_exif_from_bytes(data: bytes, filename: str) -> dict:
    """Extract EXIF using exiftool subprocess. Falls back to empty dict."""
    try:
        result = subprocess.run(
            ["exiftool", "-json", "-"],
            input=data,
            capture_output=True,
            timeout=15,
        )
        if result.returncode == 0:
            parsed = json.loads(result.stdout.decode())
            return parsed[0] if parsed else {}
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError, IndexError):
        pass
    return {}


def extract_gps(exif: dict) -> tuple[float | None, float | None, str | None]:
    """Return (lat, lon, timestamp) from exiftool JSON output."""
    lat = lon = gps_ts = None

    gps_lat = exif.get("GPSLatitude")
    gps_lat_ref = exif.get("GPSLatitudeRef", "N")
    gps_lon = exif.get("GPSLongitude")
    gps_lon_ref = exif.get("GPSLongitudeRef", "E")

    if isinstance(gps_lat, (int, float)):
        lat = round(float(gps_lat) * (1 if gps_lat_ref == "N" else -1), 6)
    if isinstance(gps_lon, (int, float)):
        lon = round(float(gps_lon) * (1 if gps_lon_ref == "E" else -1), 6)

    gps_ts = exif.get("GPSDateTime") or exif.get("GPSDateStamp")
    return lat, lon, gps_ts


async def check_wayback(url: str) -> tuple[str | None, datetime | None]:
    """Query Wayback CDX API for first seen timestamp of a URL."""
    if not url:
        return None, None
    try:
        cdx_url = (
            f"https://web.archive.org/cdx/search/cdx"
            f"?url={url}&output=json&limit=1&from=20000101&fl=timestamp,original&fastLatest=true"
        )
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(cdx_url)
            if resp.status_code == 200:
                rows = resp.json()
                if len(rows) > 1:
                    ts_str, original = rows[1][0], rows[1][1]
                    ts = datetime.strptime(ts_str, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
                    wb_url = f"https://web.archive.org/web/{ts_str}/{original}"
                    return wb_url, ts
    except Exception as exc:
        log.debug("Wayback check failed: %s", exc)
    return None, None


async def reverse_image_search(image_bytes: bytes, filename: str) -> list[dict]:
    """Use SearXNG to do reverse image search. Returns list of hit dicts."""
    settings = get_settings()
    searxng_url = getattr(settings, "searxng_url", "") or ""
    if not searxng_url:
        return []
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{searxng_url}/search",
                data={"q": filename, "format": "json", "engines": "google_images,bing_images"},
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                return [
                    {"title": r.get("title", ""), "url": r.get("url", ""), "thumbnail": r.get("thumbnail", "")}
                    for r in results[:10]
                ]
    except Exception as exc:
        log.debug("Reverse image search failed: %s", exc)
    return []


async def upload_to_minio(data: bytes, key: str, content_type: str) -> bool:
    """Upload bytes to MinIO. Returns True on success."""
    import httpx
    settings = get_settings()
    minio_endpoint = getattr(settings, "minio_endpoint", "") or ""
    minio_user = getattr(settings, "minio_user", "") or ""
    minio_password = getattr(settings, "minio_password", "") or ""
    if not minio_endpoint:
        return False
    try:
        bucket, *key_parts = key.split("/", 1)
        obj_key = key_parts[0] if key_parts else key
        async with httpx.AsyncClient(timeout=30) as client:
            await client.put(
                f"http://{minio_endpoint}/{bucket}",
                auth=(minio_user, minio_password),
            )
            resp = await client.put(
                f"http://{minio_endpoint}/{bucket}/{obj_key}",
                content=data,
                headers={"Content-Type": content_type},
                auth=(minio_user, minio_password),
            )
            return resp.status_code in (200, 204)
    except Exception:
        return False


def extract_audio_bytes(video_bytes: bytes) -> bytes | None:
    """Extract audio from video as 16kHz mono WAV using ffmpeg (stdin→stdout)."""
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-i", "pipe:0",
                "-vn",                  # no video
                "-acodec", "pcm_s16le", # WAV PCM
                "-ar", "16000",         # 16kHz — Whisper optimal
                "-ac", "1",             # mono
                "-f", "wav", "pipe:1",
            ],
            input=video_bytes,
            capture_output=True,
            timeout=120,
        )
        if result.returncode == 0 and result.stdout:
            return result.stdout
        log.warning("ffmpeg audio extract stderr: %s", result.stderr[:200])
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        log.warning("ffmpeg audio extract failed: %s", exc)
    return None


def extract_keyframes(video_bytes: bytes, max_frames: int = 5) -> list[bytes]:
    """Extract I-frames (keyframes) from video as JPEG bytes via ffmpeg."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = f"{tmpdir}/input.mp4"
            Path(input_path).write_bytes(video_bytes)
            subprocess.run(
                [
                    "ffmpeg", "-i", input_path,
                    "-vf", "select=eq(pict_type\\,I),scale=640:-1",
                    "-vsync", "vfr",
                    "-q:v", "5",
                    f"{tmpdir}/frame_%04d.jpg",
                ],
                capture_output=True,
                timeout=120,
                check=False,
            )
            frames = []
            for jpg in sorted(Path(tmpdir).glob("frame_*.jpg"))[:max_frames]:
                frames.append(jpg.read_bytes())
            return frames
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        log.warning("ffmpeg keyframe extract failed: %s", exc)
    return []


def determine_file_type(filename: str, content_type: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".tiff", ".bmp"}:
        return "image"
    if suffix in {".mp4", ".mov", ".avi", ".mkv", ".webm"}:
        return "video"
    if suffix in {".mp3", ".wav", ".m4a", ".ogg", ".flac"}:
        return "audio"
    if "image" in content_type:
        return "image"
    if "video" in content_type:
        return "video"
    if "audio" in content_type:
        return "audio"
    return "unknown"


def determine_verdict(
    exif: dict,
    gps_lat: float | None,
    wb_first_seen: datetime | None,
    duplicate_count: int,
) -> tuple[str, str]:
    """Simple heuristic verdict based on available evidence."""
    notes = []

    if not exif:
        notes.append("ไม่พบ EXIF metadata")
        return "SUSPICIOUS", "; ".join(notes)

    if duplicate_count > 0:
        notes.append(f"พบซ้ำ {duplicate_count} แหล่ง")

    if wb_first_seen:
        age_days = (datetime.now(timezone.utc) - wb_first_seen).days
        if age_days > 30:
            notes.append(f"พบ Wayback ครั้งแรก {age_days} วันก่อน")
            return "SUSPICIOUS", "; ".join(notes)
        notes.append(f"Wayback: ครั้งแรกพบ {wb_first_seen.strftime('%d/%m/%Y')}")

    if gps_lat is not None:
        notes.append(f"GPS: {gps_lat:.4f}°")

    if notes:
        return "VERIFIED", "; ".join(notes)
    return "UNVERIFIED", "ข้อมูลไม่ครบ"
