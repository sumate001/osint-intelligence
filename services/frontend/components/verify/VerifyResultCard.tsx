"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp,
  MapPin, Camera, Globe, Copy, Check, FileText, Film, Music,
  PlusCircle, X, Rss, Trash2, Loader2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import type { VerifyJob } from "@/lib/types/verify";
import { useCases, useAddEvidence } from "@/lib/hooks/useCase";
import { useDeleteVerifyJob } from "@/lib/hooks/useVerify";
import type { EvidenceCreate } from "@/lib/types/investigation";

// ── Auth-aware image loader ───────────────────────────────────────────────────

function AuthImage({ src, className, fallback }: { src: string; className?: string; fallback?: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    const stored = typeof window !== "undefined" ? localStorage.getItem("osintdesk-auth") : null;
    const token = stored ? JSON.parse(stored)?.state?.token : null;

    fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error("fail"); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch(() => setError(true));

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);

  if (error) return <>{fallback ?? null}</>;
  if (!url) return <div className={cn("bg-[var(--surface-3)] animate-pulse rounded-lg", className)} />;
  return <img src={url} alt="" className={cn("object-cover rounded-lg", className)} />;
}

// ── Thumbnail by file type ────────────────────────────────────────────────────

function FileTypeThumb({ job }: { job: VerifyJob }) {
  const exif = job.exif_data as Record<string, unknown>;
  const shotCount = Array.isArray(exif?.KeyframeAnalysis) ? (exif.KeyframeAnalysis as unknown[]).length : 0;
  const isProcessing = job.status === "PENDING" || job.status === "PROCESSING";

  if (job.file_type === "image") {
    return <AuthImage src={`/api/v1/verify/jobs/${job.id}/media`} className="w-full h-full" />;
  }

  if (isProcessing) {
    return (
      <div className="w-full h-full rounded-lg bg-[var(--surface-2)] flex items-center justify-center">
        <Loader2 size={22} className="text-[var(--yellow)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full rounded-lg bg-[var(--surface-2)] flex flex-col items-center justify-center gap-1.5">
      {job.file_type === "video" ? (
        <>
          <Film size={24} className="text-[var(--accent)]" />
          {shotCount > 0 && <span className="text-[9px] text-[var(--text-3)]">{shotCount} ช็อท</span>}
        </>
      ) : (
        <Music size={24} className="text-[var(--teal)]" />
      )}
    </div>
  );
}

// ── Verdict badge ─────────────────────────────────────────────────────────────

const VERDICT_CFG = {
  VERIFIED:   { icon: CheckCircle,   color: "text-[var(--green)]",  bg: "bg-[var(--green)]/10 border-[var(--green)]/40",   label: "Verified"   },
  SUSPICIOUS: { icon: AlertTriangle, color: "text-[var(--yellow)]", bg: "bg-[var(--yellow)]/10 border-[var(--yellow)]/40", label: "Suspicious" },
  UNVERIFIED: { icon: HelpCircle,    color: "text-[var(--text-2)]", bg: "bg-[var(--surface-3)] border-[var(--border-2)]",  label: "Unverified" },
};

function VerdictBadge({ verdict }: { verdict: string | null }) {
  const key = (verdict ?? "UNVERIFIED") as keyof typeof VERDICT_CFG;
  const cfg = VERDICT_CFG[key] ?? VERDICT_CFG.UNVERIFIED;
  const Icon = cfg.icon;
  return (
    <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold shrink-0", cfg.color, cfg.bg)}>
      <Icon size={11} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}

// ── File size formatter ───────────────────────────────────────────────────────

function fmtSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Case picker modal ─────────────────────────────────────────────────────────

function CasePicker({ job, onClose }: { job: VerifyJob; onClose: () => void }) {
  const { data, isLoading } = useCases({ status: "ACTIVE" });
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const addEvidence = useAddEvidence(selectedCaseId ?? "");
  const [done, setDone] = useState(false);

  const verdict = job.verdict ?? "UNVERIFIED";
  type KfShot = { ts: number; description: string; transcript_context: string; minio_key?: string };
  const exif = job.exif_data as Record<string, unknown>;
  const shots: KfShot[] = Array.isArray(exif?.KeyframeAnalysis)
    ? (exif.KeyframeAnalysis as KfShot[])
    : Array.isArray(exif?.KeyframeDescriptions)
      ? (exif.KeyframeDescriptions as string[]).map((d, i) => ({ ts: i, description: d, transcript_context: "" }))
      : [];

  const buildContent = () => {
    const parts: string[] = [];
    if (job.transcript) parts.push(`## ถอดเสียง\n${job.transcript}`);
    if (shots.length > 0) {
      parts.push(`## วิเคราะห์ภาพ (${shots.length} ช็อท)\n` +
        shots.map(s => `[${s.ts}s]${s.transcript_context ? ` "${s.transcript_context}"` : ""}: ${s.description}`).join("\n"));
    }
    if (job.verdict_notes) parts.push(`## บันทึกการตรวจสอบ\n${job.verdict_notes}`);
    return parts.join("\n\n") || job.filename;
  };

  const handleAdd = async () => {
    if (!selectedCaseId) return;
    const payload: EvidenceCreate = {
      title: `[${verdict}] ${job.filename}`,
      content: buildContent(),
      url: job.wayback_url ?? undefined,
      status: verdict === "VERIFIED" ? "VERIFIED" : verdict === "SUSPICIOUS" ? "PARTIAL" : "UNVERIFIED",
      source_type: "verify",
    };
    await addEvidence.mutateAsync(payload);
    setDone(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl w-[400px] max-h-[65vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <span className="text-sm font-medium text-[var(--text)]">เพิ่มเป็นหลักฐาน</span>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)]"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {isLoading && <p className="text-xs text-[var(--text-3)] text-center py-4">กำลังโหลด...</p>}
          {!isLoading && (!data?.items || data.items.length === 0) && (
            <p className="text-xs text-[var(--text-3)] text-center py-4">ไม่มี Case ที่เปิดอยู่</p>
          )}
          {data?.items.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCaseId(c.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors",
                selectedCaseId === c.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-2)] hover:bg-[var(--surface-2)]"
              )}
            >
              <span className="font-medium">{c.title}</span>
              {c.description && <span className="ml-2 opacity-60 truncate">{c.description}</span>}
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--text-2)] hover:text-[var(--text)]">ยกเลิก</button>
          <button
            onClick={handleAdd}
            disabled={!selectedCaseId || addEvidence.isPending || done}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors",
              done ? "bg-[var(--green)] text-white" : "bg-[var(--accent)] text-white disabled:opacity-40"
            )}
          >
            {done ? <><Check size={12} /> เพิ่มแล้ว</> : addEvidence.isPending ? "กำลังเพิ่ม..." : <><PlusCircle size={12} /> เพิ่มหลักฐาน</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function VerifyResultCard({ job }: { job: VerifyJob }) {
  const [expanded, setExpanded] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [keyframesOpen, setKeyframesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteJob = useDeleteVerifyJob();

  // Split verdict_notes: LLM summary (before ---) + rule notes (after ---)
  const rawNotes = job.verdict_notes ?? "";
  const noteParts = rawNotes.split("\n\n---\n");
  const ruleNotes = noteParts.length > 1 ? noteParts[noteParts.length - 1].trim() : rawNotes.trim();
  const llmSummary = noteParts.length > 1 ? noteParts.slice(0, -1).join("\n\n---\n").trim() : null;

  type KfShot = { ts: number; description: string; transcript_context: string; minio_key?: string };
  const exif = job.exif_data as Record<string, unknown>;
  const keyframeShots: KfShot[] = Array.isArray(exif?.KeyframeAnalysis)
    ? (exif.KeyframeAnalysis as KfShot[])
    : Array.isArray(exif?.KeyframeDescriptions)
      ? (exif.KeyframeDescriptions as string[]).map((d, i) => ({ ts: i, description: d, transcript_context: "" }))
      : [];

  const isProcessing = job.status === "PENDING" || job.status === "PROCESSING";
  const isDone = job.status === "DONE";
  const isFailed = job.status === "FAILED";

  const hasExpandable = isDone && (!!llmSummary || !!job.transcript || keyframeShots.length > 0 || job.duplicate_hits.length > 0);

  const waybackOld = job.wayback_first_seen
    ? new Date(job.wayback_first_seen) < new Date(Date.now() - 30 * 86_400_000)
    : false;

  const borderClass = isDone && job.verdict === "VERIFIED" ? "border-[var(--green)]/25"
    : isDone && job.verdict === "SUSPICIOUS" ? "border-[var(--yellow)]/25"
    : isFailed ? "border-[var(--red)]/20"
    : "border-[var(--border)]";

  const copyTranscript = () => {
    if (!job.transcript) return;
    navigator.clipboard.writeText(job.transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {showPicker && <CasePicker job={job} onClose={() => setShowPicker(false)} />}

      <div className={cn("bg-[var(--surface)] border rounded-xl overflow-hidden", borderClass)}>

        {/* ── Always-visible body ── */}
        <div className="flex gap-3 p-3.5">

          {/* Thumbnail — 76×76 */}
          <div className="w-[76px] h-[76px] shrink-0">
            <FileTypeThumb job={job} />
          </div>

          {/* Right content */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">

            {/* Row 1: filename + verdict/status */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-medium text-[var(--text)] leading-tight truncate">{job.filename}</p>
              {isProcessing ? (
                <span className="flex items-center gap-1 text-[10px] text-[var(--yellow)] shrink-0 pt-0.5">
                  <Loader2 size={9} className="animate-spin" />
                  {job.status === "PROCESSING" ? "กำลังวิเคราะห์" : "รอ"}
                </span>
              ) : isFailed ? (
                <span className="text-[10px] font-medium text-[var(--red)] shrink-0 pt-0.5">ล้มเหลว</span>
              ) : (
                <VerdictBadge verdict={job.verdict} />
              )}
            </div>

            {/* Row 2: file type + size + camera */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="text-[11px] text-[var(--text-2)]">
                {job.file_type === "image" ? "🖼" : job.file_type === "video" ? "🎬" : "🎵"}{" "}
                {job.file_type}
                {fmtSize(job.file_size) && (
                  <span className="text-[var(--text-3)]"> · {fmtSize(job.file_size)}</span>
                )}
              </span>
              {(job.camera_make || job.camera_model) && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-2)]">
                  <Camera size={10} className="text-[var(--text-3)] shrink-0" />
                  {[job.camera_make, job.camera_model].filter(Boolean).join(" ")}
                </span>
              )}
              {job.feed_item_id && (
                <span className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--accent)] border border-[var(--border-2)]">
                  <Rss size={8} /> AUTO
                </span>
              )}
            </div>

            {/* Row 3: GPS + Wayback (only when relevant) */}
            {(job.gps_lat !== null || job.wayback_first_seen) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {job.gps_lat !== null && (
                  <a
                    href={`https://maps.google.com/?q=${job.gps_lat},${job.gps_lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
                  >
                    <MapPin size={10} className="shrink-0" />
                    {job.gps_lat?.toFixed(4)}°, {job.gps_lon?.toFixed(4)}°
                  </a>
                )}
                {job.wayback_first_seen && (
                  <span className={cn(
                    "flex items-center gap-1 text-[11px]",
                    waybackOld ? "text-[var(--yellow)]" : "text-[var(--text-2)]"
                  )}>
                    <Globe size={10} className="shrink-0" />
                    Wayback: {formatDate(job.wayback_first_seen, "dd MMM yyyy")}
                    {waybackOld && " ⚠"}
                  </span>
                )}
              </div>
            )}

            {/* Row 4: indicators (transcript / keyframes / duplicates) */}
            {isDone && (job.transcript || keyframeShots.length > 0 || job.duplicate_hits.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {job.transcript && (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--green)]">
                    <FileText size={9} /> ถอดเสียงแล้ว
                  </span>
                )}
                {keyframeShots.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--accent)]">
                    <Film size={9} /> {keyframeShots.length} ช็อท
                  </span>
                )}
                {job.duplicate_hits.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--yellow)] font-medium">
                    ⚠ พบซ้ำ {job.duplicate_hits.length} แหล่ง
                  </span>
                )}
              </div>
            )}

            {/* Row 5: rule notes — always visible */}
            {ruleNotes && !isProcessing && (
              <p className={cn(
                "text-[11px] leading-relaxed",
                isFailed ? "text-[var(--red)]" : "text-[var(--text-2)]"
              )}>
                {ruleNotes}
              </p>
            )}
          </div>
        </div>

        {/* ── Footer: actions ── */}
        <div className="flex items-center justify-between px-3.5 pb-3 -mt-0.5">
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-3)]">
            <Clock size={9} />
            {formatDate(job.created_at, "dd MMM HH:mm")}
            {job.completed_at && (
              <span className="ml-1 text-[var(--text-3)]">· เสร็จ {formatDate(job.completed_at, "HH:mm")}</span>
            )}
          </span>
          <div className="flex items-center gap-0.5">
            {isDone && (
              <button
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
              >
                <PlusCircle size={10} /> หลักฐาน
              </button>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={() => deleteJob.mutate(job.id)}
                  disabled={deleteJob.isPending}
                  className="px-2 py-1 rounded-lg text-[10px] bg-[var(--red)] text-white font-medium"
                >
                  {deleteJob.isPending ? "..." : "ยืนยันลบ"}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 text-[10px] text-[var(--text-3)] hover:text-[var(--text)]">
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--red)] transition-colors"
                title="ลบ"
              >
                <Trash2 size={12} />
              </button>
            )}
            {hasExpandable && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors"
              >
                {expanded ? <><ChevronUp size={10} /> ย่อ</> : <><ChevronDown size={10} /> รายละเอียด</>}
              </button>
            )}
          </div>
        </div>

        {/* ── Expanded details ── */}
        {expanded && (
          <div className="border-t border-[var(--border)] px-4 py-4 space-y-4">

            {/* LLM media summary */}
            {llmSummary && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-[var(--text-3)] uppercase tracking-widest font-semibold">สรุปจาก AI</p>
                <p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap">{llmSummary}</p>
              </div>
            )}

            {/* Transcript */}
            {job.transcript && (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors"
                  onClick={() => setTranscriptOpen((v) => !v)}
                >
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-2)] uppercase tracking-widest font-semibold">
                    <FileText size={10} /> ถอดเสียง
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyTranscript(); }}
                      className="flex items-center gap-1 text-[9px] text-[var(--text-3)] hover:text-[var(--accent)] transition-colors"
                    >
                      {copied
                        ? <><Check size={9} className="text-[var(--green)]" /> คัดลอกแล้ว</>
                        : <><Copy size={9} /> คัดลอก</>}
                    </button>
                    {transcriptOpen
                      ? <ChevronUp size={12} className="text-[var(--text-3)]" />
                      : <ChevronDown size={12} className="text-[var(--text-3)]" />}
                  </div>
                </button>
                {transcriptOpen && (
                  <div className="px-3 py-3 bg-[var(--surface-2)] border-t border-[var(--border)] max-h-52 overflow-y-auto">
                    <p className="text-xs text-[var(--text)] leading-relaxed font-mono whitespace-pre-wrap">
                      {job.transcript}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Keyframe analysis */}
            {keyframeShots.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors"
                  onClick={() => setKeyframesOpen((v) => !v)}
                >
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-2)] uppercase tracking-widest font-semibold">
                    <Film size={10} /> วิเคราะห์ภาพ ({keyframeShots.length} ช็อท)
                  </div>
                  {keyframesOpen
                    ? <ChevronUp size={12} className="text-[var(--text-3)]" />
                    : <ChevronDown size={12} className="text-[var(--text-3)]" />}
                </button>
                {keyframesOpen && (
                  <div className="divide-y divide-[var(--border)]">
                    {keyframeShots.map((shot, i) => (
                      <div key={i} className="flex gap-3 px-3 py-3 bg-[var(--surface-2)]">
                        {/* Frame thumbnail */}
                        <div className="shrink-0 w-[120px] h-[80px]">
                          {shot.minio_key ? (
                            <AuthImage
                              src={`/api/v1/verify/jobs/${job.id}/frames/${i}`}
                              className="w-[120px] h-[80px]"
                              fallback={
                                <div className="w-[120px] h-[80px] rounded-lg bg-[var(--surface-3)] flex items-center justify-center">
                                  <Film size={16} className="text-[var(--text-3)]" />
                                </div>
                              }
                            />
                          ) : (
                            <div className="w-[120px] h-[80px] rounded-lg bg-[var(--surface-3)] flex items-center justify-center">
                              <Film size={16} className="text-[var(--text-3)]" />
                            </div>
                          )}
                        </div>
                        {/* Description */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--accent)] shrink-0">
                              {Math.floor(shot.ts / 60)}:{String(Math.round(shot.ts % 60)).padStart(2, "0")}
                            </span>
                            {shot.transcript_context && (
                              <span className="text-[10px] text-[var(--yellow)] italic truncate">
                                &ldquo;{shot.transcript_context}&rdquo;
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text)] leading-relaxed">{shot.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Duplicate hits */}
            {job.duplicate_hits.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-[var(--yellow)] uppercase tracking-widest font-semibold">
                  ⚠ พบซ้ำ {job.duplicate_hits.length} แหล่ง
                </p>
                <div className="space-y-1">
                  {job.duplicate_hits.slice(0, 5).map((hit, i) => (
                    <a
                      key={i}
                      href={hit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1.5 text-[11px] text-[var(--accent)] hover:underline"
                    >
                      <span className="shrink-0 mt-0.5">•</span>
                      <span className="truncate">{hit.title || hit.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Wayback detail */}
            {job.wayback_first_seen && job.wayback_url && (
              <div className="space-y-1">
                <p className="text-[10px] text-[var(--text-3)] uppercase tracking-widest font-semibold">Wayback Machine</p>
                <p className={cn("text-xs", waybackOld ? "text-[var(--yellow)]" : "text-[var(--text-2)]")}>
                  พบครั้งแรก: {formatDate(job.wayback_first_seen, "dd MMM yyyy")}
                </p>
                <a
                  href={job.wayback_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[var(--accent)] hover:underline block truncate"
                >
                  {job.wayback_url.length > 70 ? job.wayback_url.slice(0, 70) + "…" : job.wayback_url}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
