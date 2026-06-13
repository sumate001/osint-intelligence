"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ShieldCheck, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type { BriefListItem } from "@/lib/types/brief";
import type { ConfidenceRecord } from "@/lib/types/brief";
import { cn } from "@/lib/utils/cn";

const LEVEL_STYLES = {
  HIGH: "text-[var(--green)] bg-[var(--green)]/10",
  MEDIUM: "text-[var(--yellow)] bg-[var(--yellow)]/10",
  LOW: "text-[var(--red)] bg-[var(--red)]/10",
};

function BriefConfidenceRow({ brief }: { brief: BriefListItem }) {
  const { data: conf } = useQuery<ConfidenceRecord | null>({
    queryKey: ["confidence", brief.id],
    queryFn: () => apiFetch(`/api/v1/briefs/${brief.id}/confidence`),
  });

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border)] last:border-0">
      <FileText size={14} className="text-[var(--text-3)] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text)] truncate">{brief.title}</p>
        {conf?.dissent && (
          <p className="text-[10px] text-[var(--yellow)] mt-0.5 truncate">⚠ Dissent: {conf.dissent}</p>
        )}
      </div>
      {conf ? (
        <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded shrink-0", LEVEL_STYLES[conf.level as keyof typeof LEVEL_STYLES])}>
          {conf.level}
        </span>
      ) : (
        <span className="text-[10px] text-[var(--text-3)] shrink-0">ยังไม่ระบุ</span>
      )}
      <Link href={`/brief/${brief.id}`} className="text-[10px] text-[var(--accent)] hover:underline shrink-0">
        เปิด →
      </Link>
    </div>
  );
}

export function ConfidenceTab() {
  const { data: briefs = [] } = useQuery<BriefListItem[]>({
    queryKey: ["briefs"],
    queryFn: () => apiFetch("/api/v1/briefs"),
  });

  const withConf = briefs.filter((b) => b.status !== "DRAFT" || true);

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <p className="text-[10px] font-mono text-[var(--text-3)] tracking-widest">ANALYTIC CONFIDENCE — ทุก Brief</p>
        </div>
        {withConf.length === 0 && (
          <p className="text-sm text-[var(--text-3)] text-center py-8">ยังไม่มี brief</p>
        )}
        {withConf.map((b) => <BriefConfidenceRow key={b.id} brief={b} />)}
      </div>

      {/* Confidence scale reference */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
        <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mb-3">CONFIDENCE SCALE</p>
        <div className="space-y-2">
          {[
            { level: "HIGH", desc: "หลักฐานครบ ≥3 แหล่ง คุณภาพสูง ไม่มี conflicting evidence", color: "var(--green)" },
            { level: "MEDIUM", desc: "หลักฐาน 1-2 แหล่ง หรือมีบางส่วนที่ยังไม่ยืนยัน", color: "var(--yellow)" },
            { level: "LOW", desc: "หลักฐานเบื้องต้น แหล่งเดียว หรือมี significant uncertainty", color: "var(--red)" },
          ].map((l) => (
            <div key={l.level} className="flex items-start gap-3">
              <span className="text-xs font-mono font-bold w-14 shrink-0 mt-0.5" style={{ color: l.color }}>{l.level}</span>
              <p className="text-xs text-[var(--text-2)] leading-relaxed">{l.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
