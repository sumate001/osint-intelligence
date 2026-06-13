"use client";

import { useState } from "react";
import { AlertTriangle, Drama, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useDeceptionChecks, useRunDeceptionCheck } from "@/lib/hooks/useIntelligence";
import type { DeceptionCheck, RiskLevel } from "@/lib/types/intelligence";

const RISK_STYLES: Record<RiskLevel, string> = {
  LOW: "text-[var(--green)] bg-[var(--green)]/10",
  MEDIUM: "text-[var(--yellow)] bg-[var(--yellow)]/10",
  HIGH: "text-[var(--red)] bg-[var(--red)]/10",
};

function CheckCard({ check }: { check: DeceptionCheck }) {
  const [open, setOpen] = useState(check.flagged);
  return (
    <div className={cn(
      "bg-[var(--surface)] border rounded-xl overflow-hidden",
      check.flagged ? "border-[var(--red)]/50" : "border-[var(--border)]"
    )}>
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)}>
        <Drama size={14} className={check.flagged ? "text-[var(--red)]" : "text-[var(--text-3)]"} />
        <p className="flex-1 text-sm text-[var(--text)] truncate">{check.target_title}</p>
        <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded shrink-0", RISK_STYLES[check.risk_level])}>
          {check.risk_level}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]">
          {check.flagged && check.flag_reason && (
            <div className="flex items-start gap-2 text-xs text-[var(--red)] bg-[var(--red)]/10 rounded-lg px-3 py-2 mt-3">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{check.flag_reason}</span>
            </div>
          )}
          {[
            { label: "ใครได้ประโยชน์ (Cui Bono)", value: check.cui_bono },
            { label: "จังหวะเวลา", value: check.timing_analysis },
            { label: "แรงจูงใจซ่อนเร้น", value: check.source_motivation },
          ].map((item) => item.value && (
            <div key={item.label} className="mt-2">
              <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mb-1">{item.label.toUpperCase()}</p>
              <p className="text-xs text-[var(--text-2)] leading-relaxed">{item.value}</p>
            </div>
          ))}
          {check.bot_indicators.length > 0 && (
            <div>
              <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mb-1.5">BOT INDICATORS</p>
              <div className="flex flex-wrap gap-1.5">
                {check.bot_indicators.map((ind, i) => (
                  <span key={i} className="text-[10px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-0.5 text-[var(--text-2)]">
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DeceptionTab() {
  const { data: checks = [] } = useDeceptionChecks();
  const runCheck = useRunDeceptionCheck();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");

  const flagged = checks.filter((c) => c.flagged);

  async function handleRun() {
    if (!title.trim()) return;
    await runCheck.mutateAsync({ target_title: title.trim(), target_url: url || undefined, content: content || undefined });
    setTitle(""); setUrl(""); setContent("");
  }

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
          <p className="text-2xl font-mono font-bold text-[var(--red)]">{flagged.length}</p>
          <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mt-0.5">FLAGGED</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
          <p className="text-2xl font-mono font-bold text-[var(--text)]">{checks.length}</p>
          <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mt-0.5">CHECKED</p>
        </div>
      </div>

      {/* Run check form */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
        <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest">COUNTER-INTELLIGENCE CHECK</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="ชื่อหัวข้อ / ชื่อข่าว..."
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none" />
        <input value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (optional)"
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="เนื้อหาย่อ (optional — ให้ LLM วิเคราะห์ได้ละเอียดขึ้น)"
          rows={3}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none" />
        <button onClick={handleRun} disabled={runCheck.isPending || !title.trim()}
          className="flex items-center gap-2 bg-[var(--red)]/20 text-[var(--red)] border border-[var(--red)]/30 text-sm px-4 py-2 rounded-lg hover:bg-[var(--red)]/30 disabled:opacity-50">
          {runCheck.isPending ? <Loader2 size={14} className="animate-spin" /> : <Drama size={14} />}
          {runCheck.isPending ? "กำลังวิเคราะห์..." : "Run CI Check"}
        </button>
      </div>

      {/* Results */}
      {checks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest">RESULTS</p>
          {checks.map((c) => <CheckCard key={c.id} check={c} />)}
        </div>
      )}
    </div>
  );
}
