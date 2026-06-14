"use client";

import { useState } from "react";
import {
  CheckCircle, AlertTriangle, HelpCircle,
  ChevronDown, ChevronUp, MapPin, Camera, Clock, Globe,
  Copy, Check, FileText, Film, PlusCircle, X, Rss, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import type { VerifyJob } from "@/lib/types/verify";
import { useCases, useAddEvidence } from "@/lib/hooks/useCase";
import { useDeleteVerifyJob } from "@/lib/hooks/useVerify";
import type { EvidenceCreate } from "@/lib/types/investigation";

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

// ── Case Picker Modal ──────────────────────────────────────────────────────────

interface CasePickerProps {
  job: VerifyJob;
  onClose: () => void;
}

function CasePicker({ job, onClose }: CasePickerProps) {
  const { data, isLoading } = useCases({ status: "ACTIVE" });
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const addEvidence = useAddEvidence(selectedCaseId ?? "");
  const [done, setDone] = useState(false);

  const verdict = job.verdict ?? "UNVERIFIED";
  type KfShot = { ts: number; description: string; transcript_context: string };
  const _exifPicker = job.exif_data as Record<string, unknown>;
  const pickerShots: KfShot[] = Array.isArray(_exifPicker?.KeyframeAnalysis)
    ? (_exifPicker.KeyframeAnalysis as KfShot[])
    : Array.isArray(_exifPicker?.KeyframeDescriptions)
      ? (_exifPicker.KeyframeDescriptions as string[]).map((d, i) => ({ ts: i, description: d, transcript_context: "" }))
      : [];

  const buildContent = () => {
    const parts: string[] = [];
    if (job.transcript) parts.push(`## ถอดเสียง\n${job.transcript}`);
    if (pickerShots.length > 0) {
      const shotLines = pickerShots.map(s =>
        `[${s.ts}s]${s.transcript_context ? ` "${s.transcript_context}"` : ""}: ${s.description}`
      ).join("\n");
      parts.push(`## วิเคราะห์ภาพ (${pickerShots.length} ช็อท)\n${shotLines}`);
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
        className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl w-[420px] max-h-[70vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <span className="text-sm font-medium text-[var(--text)]">เพิ่มเป็นหลักฐาน</span>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Case list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {isLoading && (
            <p className="text-xs text-[var(--text-3)] text-center py-4">กำลังโหลด Case...</p>
          )}
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
              {c.description && (
                <span className="ml-2 text-[var(--text-3)] truncate">{c.description}</span>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedCaseId || addEvidence.isPending || done}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors",
              done
                ? "bg-[var(--green)] text-white"
                : "bg-[var(--accent)] text-white disabled:opacity-40"
            )}
          >
            {done ? (
              <><Check size={12} /> เพิ่มแล้ว</>
            ) : addEvidence.isPending ? (
              "กำลังเพิ่ม..."
            ) : (
              <><PlusCircle size={12} /> เพิ่มหลักฐาน</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main card ──────────────────────────────────────────────────────────────────

export function VerifyResultCard({ job }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [keyframesOpen, setKeyframesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteJob = useDeleteVerifyJob();

  const verdict = job.verdict ?? "UNVERIFIED";
  const cfg = VERDICT_CONFIG[verdict as keyof typeof VERDICT_CONFIG] ?? VERDICT_CONFIG.UNVERIFIED;
  const Icon = cfg.icon;

  const fileTypeIcon = job.file_type === "image" ? "🖼" : job.file_type === "video" ? "🎬" : "🎵";
  const isAV = job.file_type === "video" || job.file_type === "audio";

  // KeyframeAnalysis (new) or KeyframeDescriptions (legacy)
  type KfShot = { ts: number; description: string; transcript_context: string };
  const exif = job.exif_data as Record<string, unknown>;
  const keyframeShots: KfShot[] = Array.isArray(exif?.KeyframeAnalysis)
    ? (exif.KeyframeAnalysis as KfShot[])
    : Array.isArray(exif?.KeyframeDescriptions)
      ? (exif.KeyframeDescriptions as string[]).map((d, i) => ({ ts: i, description: d, transcript_context: "" }))
      : [];
  const hasShots = keyframeShots.length > 0;

  const copyTranscript = () => {
    if (!job.transcript) return;
    navigator.clipboard.writeText(job.transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {showPicker && <CasePicker job={job} onClose={() => setShowPicker(false)} />}

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
              {isAV && job.transcript && (
                <span className="flex items-center gap-0.5 text-[10px] text-[var(--green)]">
                  <FileText size={9} />
                  มีถอดเสียง
                </span>
              )}
              {hasShots && (
                <span className="flex items-center gap-0.5 text-[10px] text-[var(--accent)]">
                  <Film size={9} />
                  {keyframeShots.length} ช็อท
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {job.feed_item_id && (
              <span className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--accent)] border border-[var(--border-2)]">
                <Rss size={8} />
                AUTO
              </span>
            )}
            <div className={cn("flex items-center gap-1 text-xs font-medium", cfg.color)}>
              <Icon size={14} />
              <span>{cfg.label}</span>
            </div>

            {/* Delete / cancel button */}
            {confirmDelete ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => deleteJob.mutate(job.id)}
                  disabled={deleteJob.isPending}
                  className="text-[10px] px-2 py-0.5 rounded bg-[var(--red)] text-white font-medium"
                >
                  {deleteJob.isPending ? "..." : job.status === "PROCESSING" ? "ยกเลิก" : "ลบ"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[10px] text-[var(--text-3)] hover:text-[var(--text)]"
                >
                  ไม่
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--red)] transition-colors"
                title={job.status === "PROCESSING" ? "ยกเลิก" : "ลบ"}
              >
                <Trash2 size={12} />
              </button>
            )}

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

            {/* Transcript — video / audio only */}
            {isAV && job.transcript && (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors text-left"
                  onClick={() => setTranscriptOpen((v) => !v)}
                >
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-2)] uppercase tracking-wide font-medium">
                    <FileText size={10} />
                    ถอดเสียง
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyTranscript(); }}
                      className="flex items-center gap-1 text-[9px] text-[var(--text-3)] hover:text-[var(--accent)] transition-colors"
                    >
                      {copied ? <Check size={10} className="text-[var(--green)]" /> : <Copy size={10} />}
                      {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                    </button>
                    {transcriptOpen
                      ? <ChevronUp size={12} className="text-[var(--text-3)]" />
                      : <ChevronDown size={12} className="text-[var(--text-3)]" />}
                  </div>
                </button>
                {transcriptOpen && (
                  <div className="px-3 py-2 bg-[var(--surface-2)] border-t border-[var(--border)] max-h-40 overflow-y-auto">
                    <p className="text-xs text-[var(--text-2)] whitespace-pre-wrap leading-relaxed font-mono">
                      {job.transcript}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Shot analysis — video only */}
            {hasShots && (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors text-left"
                  onClick={() => setKeyframesOpen((v) => !v)}
                >
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-2)] uppercase tracking-wide font-medium">
                    <Film size={10} />
                    วิเคราะห์ภาพ ({keyframeShots.length} ช็อท)
                  </div>
                  {keyframesOpen
                    ? <ChevronUp size={12} className="text-[var(--text-3)]" />
                    : <ChevronDown size={12} className="text-[var(--text-3)]" />}
                </button>
                {keyframesOpen && (
                  <div className="divide-y divide-[var(--border)]">
                    {keyframeShots.map((shot, i) => (
                      <div key={i} className="px-3 py-3 bg-[var(--surface-2)] space-y-1.5">
                        {/* Timestamp + transcript context */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--accent)]">
                            {Math.floor(shot.ts / 60)}:{String(Math.round(shot.ts % 60)).padStart(2, "0")}
                          </span>
                          {shot.transcript_context && (
                            <span className="text-[10px] text-[var(--yellow)] italic truncate flex-1">
                              &ldquo;{shot.transcript_context}&rdquo;
                            </span>
                          )}
                        </div>
                        {/* Frame description — full, not truncated */}
                        <p className="text-xs text-[var(--text-2)] leading-relaxed whitespace-pre-wrap">
                          {shot.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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

            {/* Footer: timestamp + Add to Evidence */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1 text-[10px] text-[var(--text-3)]">
                <Clock size={9} />
                อัปโหลด: {formatDate(job.created_at)}
                {job.completed_at && (
                  <span className="ml-2">· เสร็จ: {formatDate(job.completed_at)}</span>
                )}
              </div>
              {job.status === "DONE" && (
                <button
                  onClick={() => setShowPicker(true)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--surface-3)] hover:bg-[var(--border-2)] text-[10px] text-[var(--accent)] font-medium transition-colors"
                >
                  <PlusCircle size={10} />
                  เพิ่มเป็นหลักฐาน
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
