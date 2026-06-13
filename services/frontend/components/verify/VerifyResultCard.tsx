"use client";

import { useState } from "react";
import {
  CheckCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp,
  MapPin, Camera, Clock, Globe, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import type { VerifyJob } from "@/lib/types/verify";

const VERDICT_CONFIG = {
  VERIFIED: { icon: CheckCircle, color: "text-[var(--green)]", border: "border-[var(--green)]", label: "Verified" },
  SUSPICIOUS: { icon: AlertTriangle, color: "text-[var(--yellow)]", border: "border-[var(--yellow)]", label: "Suspicious" },
  UNVERIFIED: { icon: HelpCircle, color: "text-[var(--text-3)]", border: "border-[var(--border-2)]", label: "Unverified" },
};

const STATUS_COLORS = {
  PENDING: "text-[var(--text-3)]",
  PROCESSING: "text-[var(--yellow)]",
  DONE: "text-[var(--green)]",
  FAILED: "text-[var(--red)]",
};

interface Props {
  job: VerifyJob;
}

export function VerifyResultCard({ job }: Props) {
  const [expanded, setExpanded] = useState(false);

  const verdict = job.verdict ?? "UNVERIFIED";
  const cfg = VERDICT_CONFIG[verdict as keyof typeof VERDICT_CONFIG] ?? VERDICT_CONFIG.UNVERIFIED;
  const Icon = cfg.icon;

  const fileTypeIcon = job.file_type === "image" ? "🖼" : job.file_type === "video" ? "🎬" : "🎵";

  return (
    <div className={cn("bg-[var(--surface)] border rounded-lg overflow-hidden", cfg.border)}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-lg shrink-0">{fileTypeIcon}</span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text)] truncate">{job.filename}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className={cn("text-[10px]", STATUS_COLORS[job.status])}>
              {job.status === "PROCESSING" ? "⏳ กำลังวิเคราะห์..." : job.status}
            </span>
            {job.gps_lat !== null && (
              <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-3)]">
                <MapPin size={9} />
                {job.gps_lat?.toFixed(4)}°, {job.gps_lon?.toFixed(4)}°
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className={cn("flex items-center gap-1 text-xs font-medium", cfg.color)}>
            <Icon size={14} />
            <span>{cfg.label}</span>
          </div>
          {expanded ? <ChevronUp size={14} className="text-[var(--text-3)]" /> : <ChevronDown size={14} className="text-[var(--text-3)]" />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
          {/* Verdict notes */}
          {job.verdict_notes && (
            <div className={cn("text-xs px-3 py-2 rounded-lg", cfg.color, "bg-[var(--surface-2)]")}>
              {job.verdict_notes}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* EXIF */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-3)] uppercase tracking-wide">
                <Camera size={10} />
                EXIF
              </div>
              {job.camera_make || job.camera_model ? (
                <p className="text-xs text-[var(--text-2)]">
                  {[job.camera_make, job.camera_model].filter(Boolean).join(" ")}
                </p>
              ) : (
                <p className="text-xs text-[var(--text-3)]">ไม่พบกล้อง</p>
              )}
              {job.gps_lat !== null ? (
                <p className="text-xs text-[var(--text-2)] font-mono">
                  {job.gps_lat?.toFixed(6)}, {job.gps_lon?.toFixed(6)}
                </p>
              ) : (
                <p className="text-xs text-[var(--text-3)]">ไม่มี GPS</p>
              )}
              {job.gps_timestamp && (
                <p className="text-xs text-[var(--text-3)]">{job.gps_timestamp}</p>
              )}
            </div>

            {/* Wayback */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-3)] uppercase tracking-wide">
                <Globe size={10} />
                Wayback Machine
              </div>
              {job.wayback_first_seen ? (
                <>
                  <p className="text-xs text-[var(--yellow)]">
                    พบครั้งแรก: {formatDate(job.wayback_first_seen)}
                  </p>
                  {job.wayback_url && (
                    <a
                      href={job.wayback_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[var(--accent)] hover:underline block truncate"
                    >
                      {job.wayback_url.slice(0, 50)}…
                    </a>
                  )}
                </>
              ) : (
                <p className="text-xs text-[var(--text-3)]">ไม่พบใน archive</p>
              )}
            </div>
          </div>

          {/* Duplicates */}
          {job.duplicate_hits.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wide">
                พบซ้ำ {job.duplicate_hits.length} แหล่ง
              </div>
              <div className="space-y-1">
                {job.duplicate_hits.slice(0, 3).map((hit, i) => (
                  <a
                    key={i}
                    href={hit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline truncate"
                  >
                    • {hit.title || hit.url}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div className="flex items-center gap-1 text-[10px] text-[var(--text-3)]">
            <Clock size={9} />
            อัปโหลด: {formatDate(job.created_at)}
            {job.completed_at && (
              <span className="ml-2">· เสร็จ: {formatDate(job.completed_at)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
