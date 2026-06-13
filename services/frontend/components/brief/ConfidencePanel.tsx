"use client";

import { useState } from "react";
import { ShieldCheck, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfidence, useSetConfidence, useACH, useAddHypothesis, useDeleteHypothesis } from "@/lib/hooks/useBrief";
import type { ConfidenceLevel, ACHLikelihood } from "@/lib/types/brief";

const LEVELS: { value: ConfidenceLevel; label: string; color: string }[] = [
  { value: "HIGH", label: "HIGH", color: "var(--green)" },
  { value: "MEDIUM", label: "MED", color: "var(--yellow)" },
  { value: "LOW", label: "LOW", color: "var(--red)" },
];

const LIKELIHOOD_LABELS: Record<ACHLikelihood, string> = {
  VERY_LIKELY: "Very Likely",
  LIKELY: "Likely",
  UNLIKELY: "Unlikely",
  VERY_UNLIKELY: "Very Unlikely",
};

interface Props {
  briefId: string;
}

export function ConfidencePanel({ briefId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [newHyp, setNewHyp] = useState("");
  const [newLikelihood, setNewLikelihood] = useState<ACHLikelihood>("LIKELY");

  const { data: conf } = useConfidence(briefId);
  const { data: hyps = [] } = useACH(briefId);
  const setConf = useSetConfidence(briefId);
  const addHyp = useAddHypothesis(briefId);
  const delHyp = useDeleteHypothesis(briefId);

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors"
      >
        <ShieldCheck size={13} className="text-[var(--text-2)]" />
        <span className="text-xs font-medium text-[var(--text)] flex-1 text-left">Analytic Confidence</span>
        {conf && (
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ color: LEVELS.find((l) => l.value === conf.level)?.color, background: `color-mix(in srgb, ${LEVELS.find((l) => l.value === conf.level)?.color} 15%, transparent)` }}
          >
            {conf.level}
          </span>
        )}
        {expanded ? <ChevronUp size={12} className="text-[var(--text-3)]" /> : <ChevronDown size={12} className="text-[var(--text-3)]" />}
      </button>

      {expanded && (
        <div className="p-3 space-y-4">
          {/* Confidence level selector */}
          <div>
            <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mb-2">CONFIDENCE LEVEL</p>
            <div className="flex gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setConf.mutate({ level: l.value, rationale: conf?.rationale ?? undefined, dissent: conf?.dissent ?? undefined })}
                  className={cn(
                    "flex-1 py-1.5 rounded text-[11px] font-mono transition-colors",
                    conf?.level === l.value
                      ? "text-white"
                      : "text-[var(--text-3)] bg-[var(--surface-3)]"
                  )}
                  style={conf?.level === l.value ? { background: l.color } : {}}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dissent note */}
          {conf && (
            <div>
              <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mb-1.5">DISSENT NOTE</p>
              <textarea
                defaultValue={conf.dissent ?? ""}
                onBlur={(e) => setConf.mutate({ level: conf.level, rationale: conf.rationale ?? undefined, dissent: e.target.value || undefined })}
                rows={2}
                placeholder="บันทึกความเห็นแย้ง..."
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none"
              />
            </div>
          )}

          {/* ACH */}
          <div>
            <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mb-2">COMPETING HYPOTHESES (ACH)</p>
            <div className="space-y-1.5 mb-2">
              {hyps.map((h) => (
                <div key={h.id} className="flex items-start gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2.5 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text)] leading-snug">{h.hypothesis}</p>
                    <p className="text-[10px] text-[var(--text-3)] mt-0.5">{LIKELIHOOD_LABELS[h.likelihood]}</p>
                  </div>
                  <button onClick={() => delHyp.mutate(h.id)} className="text-[var(--text-3)] hover:text-[var(--red)] shrink-0 mt-0.5">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <input
                value={newHyp}
                onChange={(e) => setNewHyp(e.target.value)}
                placeholder="เพิ่ม hypothesis..."
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
              />
              <div className="flex gap-1.5">
                <select
                  value={newLikelihood}
                  onChange={(e) => setNewLikelihood(e.target.value as ACHLikelihood)}
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] outline-none"
                >
                  {(Object.keys(LIKELIHOOD_LABELS) as ACHLikelihood[]).map((k) => (
                    <option key={k} value={k}>{LIKELIHOOD_LABELS[k]}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!newHyp.trim()) return;
                    addHyp.mutate({ hypothesis: newHyp.trim(), likelihood: newLikelihood });
                    setNewHyp("");
                  }}
                  className="flex items-center gap-1 bg-[var(--surface-3)] text-[var(--text-2)] hover:text-[var(--text)] text-xs px-2.5 py-1 rounded transition-colors"
                >
                  <Plus size={11} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
