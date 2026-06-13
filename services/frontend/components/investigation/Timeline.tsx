"use client";

import { CheckCircle, AlertCircle, HelpCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import type { Evidence } from "@/lib/types/investigation";

const statusIcon = {
  VERIFIED: <CheckCircle size={14} className="text-[var(--green)]" />,
  PARTIAL: <AlertCircle size={14} className="text-[var(--yellow)]" />,
  UNVERIFIED: <HelpCircle size={14} className="text-[var(--text-3)]" />,
};

interface Props {
  evidence: Evidence[];
}

export function Timeline({ evidence }: Props) {
  const sorted = [...evidence].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[var(--text-3)] text-sm">
        ยังไม่มี evidence — เพิ่มจาก Evidence Board
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-4">
      {/* Vertical line */}
      <div className="absolute left-2 top-2 bottom-2 w-px bg-[var(--border-2)]" />

      {sorted.map((ev) => (
        <div key={ev.id} className="relative flex gap-3">
          {/* Dot */}
          <div className="absolute -left-[18px] mt-0.5">
            {statusIcon[ev.status as keyof typeof statusIcon] ?? <Clock size={14} className="text-[var(--text-3)]" />}
          </div>

          {/* Card */}
          <div className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[var(--text)] leading-snug">{ev.title}</p>
              <span className="text-[10px] text-[var(--text-3)] shrink-0 font-mono">
                {formatDate(ev.created_at)}
              </span>
            </div>
            {ev.content && (
              <p className="text-[11px] text-[var(--text-2)] leading-relaxed">{ev.content}</p>
            )}
            <div className="flex items-center gap-2 pt-0.5">
              <span
                className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded border font-medium",
                  ev.status === "VERIFIED" && "border-[var(--green)] text-[var(--green)]",
                  ev.status === "PARTIAL" && "border-[var(--yellow)] text-[var(--yellow)]",
                  ev.status === "UNVERIFIED" && "border-[var(--text-3)] text-[var(--text-3)]"
                )}
              >
                {ev.status}
              </span>
              <span className="text-[10px] text-[var(--text-3)]">{ev.source_type}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
