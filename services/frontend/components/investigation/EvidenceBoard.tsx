"use client";

import { useState } from "react";
import { CheckCircle, AlertCircle, HelpCircle, Trash2, ExternalLink, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Evidence, EvidenceStatus } from "@/lib/types/investigation";

const COLUMNS: { status: EvidenceStatus; label: string; icon: React.ReactNode; color: string }[] = [
  {
    status: "VERIFIED",
    label: "Verified",
    icon: <CheckCircle size={14} />,
    color: "text-[var(--green)]",
  },
  {
    status: "PARTIAL",
    label: "Partial",
    icon: <AlertCircle size={14} />,
    color: "text-[var(--yellow)]",
  },
  {
    status: "UNVERIFIED",
    label: "Unverified",
    icon: <HelpCircle size={14} />,
    color: "text-[var(--text-3)]",
  },
];

interface Props {
  evidence: Evidence[];
  onStatusChange: (evidenceId: string, status: EvidenceStatus) => void;
  onDelete: (evidenceId: string) => void;
  onAdd: (data: { title: string; content: string; url: string }) => void;
}

export function EvidenceBoard({ evidence, onStatusChange, onDelete, onAdd }: Props) {
  const [addingTo, setAddingTo] = useState<EvidenceStatus | null>(null);
  const [form, setForm] = useState({ title: "", content: "", url: "" });

  function handleAdd(status: EvidenceStatus) {
    if (!form.title.trim()) return;
    onAdd({ ...form });
    setForm({ title: "", content: "", url: "" });
    setAddingTo(null);
  }

  return (
    <div className="flex gap-3 h-full overflow-x-auto p-1">
      {COLUMNS.map((col) => {
        const colItems = evidence.filter((e) => e.status === col.status);
        return (
          <div
            key={col.status}
            className="flex flex-col flex-1 min-w-[240px] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg overflow-hidden"
          >
            {/* Column header */}
            <div className={cn("flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]", col.color)}>
              {col.icon}
              <span className="text-xs font-semibold uppercase tracking-wide">{col.label}</span>
              <span className="ml-auto bg-[var(--surface-3)] text-[var(--text-3)] text-xs rounded px-1.5 py-0.5">
                {colItems.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {colItems.map((ev) => (
                <EvidenceCard
                  key={ev.id}
                  ev={ev}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                />
              ))}

              {/* Add form */}
              {addingTo === col.status ? (
                <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded p-2 space-y-1.5">
                  <input
                    autoFocus
                    placeholder="หัวข้อ *"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
                  />
                  <textarea
                    placeholder="รายละเอียด"
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    rows={2}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none"
                  />
                  <input
                    placeholder="URL (optional)"
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleAdd(col.status)}
                      className="flex-1 bg-[var(--accent)] text-white text-xs rounded py-1 hover:opacity-90"
                    >
                      เพิ่ม
                    </button>
                    <button
                      onClick={() => setAddingTo(null)}
                      className="flex-1 bg-[var(--surface-3)] text-[var(--text-2)] text-xs rounded py-1"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTo(col.status)}
                  className="w-full flex items-center gap-1 text-[var(--text-3)] text-xs py-1.5 px-2 rounded hover:bg-[var(--surface)] hover:text-[var(--text-2)] transition-colors"
                >
                  <Plus size={12} />
                  เพิ่ม evidence
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EvidenceCard({
  ev,
  onStatusChange,
  onDelete,
}: {
  ev: Evidence;
  onStatusChange: (id: string, status: EvidenceStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded p-2.5 space-y-1.5 group">
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-medium text-[var(--text)] leading-snug flex-1">{ev.title}</p>
        <button
          onClick={() => onDelete(ev.id)}
          className="opacity-0 group-hover:opacity-100 text-[var(--text-3)] hover:text-[var(--red)] transition-opacity shrink-0"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {ev.content && (
        <p className="text-[11px] text-[var(--text-2)] leading-relaxed line-clamp-2">{ev.content}</p>
      )}

      {ev.url && (
        <a
          href={ev.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline truncate"
        >
          <ExternalLink size={9} />
          {ev.url.replace(/^https?:\/\//, "").slice(0, 40)}
        </a>
      )}

      {/* Move to column */}
      <div className="flex gap-1 pt-0.5">
        {(["VERIFIED", "PARTIAL", "UNVERIFIED"] as EvidenceStatus[])
          .filter((s) => s !== ev.status)
          .map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(ev.id, s)}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded border transition-colors",
                s === "VERIFIED" && "border-[var(--green)] text-[var(--green)] hover:bg-[var(--green)] hover:text-white",
                s === "PARTIAL" && "border-[var(--yellow)] text-[var(--yellow)] hover:bg-[var(--yellow)] hover:text-white",
                s === "UNVERIFIED" && "border-[var(--text-3)] text-[var(--text-3)] hover:bg-[var(--surface-3)]"
              )}
            >
              → {s}
            </button>
          ))}
      </div>
    </div>
  );
}
