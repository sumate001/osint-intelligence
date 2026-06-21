"use client";

import { useState } from "react";
import { Plus, Trash2, CheckCircle2, ChevronDown, ChevronUp, Pencil, Check, Zap, Search, Brain } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { usePIRs, useCreatePIR, useUpdatePIR, useDeletePIR } from "@/lib/hooks/useIntelligence";
import type { PIR, EEI, PIRPriority } from "@/lib/types/intelligence";

function isGeneratingEEI(pir: PIR): boolean {
  if (pir.eei_list.length > 0) return false;
  return Date.now() - new Date(pir.created_at).getTime() < 8 * 60 * 1000;
}

const PRIORITY_COLOR: Record<PIRPriority, string> = {
  P1: "var(--red)",
  P2: "var(--yellow)",
  P3: "var(--text-3)",
};

const PRIORITY_LABEL_STYLE: Record<PIRPriority, string> = {
  P1: "text-[var(--red)]",
  P2: "text-[var(--yellow)]",
  P3: "text-[var(--text-3)]",
};

function Waveform({ color = "var(--purple)", bars = 9 }: { color?: string; bars?: number }) {
  return (
    <div className="flex items-center gap-[2px]" style={{ height: 14 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full animate-pulse"
          style={{
            background: color,
            height: `${[4, 7, 10, 12, 10, 12, 8, 10, 6][i % 9]}px`,
            animationDuration: `${0.8 + (i % 3) * 0.2}s`,
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

function PingDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: color }} />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: color }} />
    </span>
  );
}

function EEISegments({ eei_list, phase }: { eei_list: EEI[]; phase: "research" | "done" }) {
  return (
    <div className="flex gap-[3px]">
      {eei_list.map((e, i) => (
        <div key={e.id} className="relative flex-1 h-[4px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          {e.answered ? (
            <div
              className="absolute inset-0 rounded-full transition-all duration-700"
              style={{ background: phase === "done" ? "var(--green)" : "var(--accent)" }}
            />
          ) : phase === "research" ? (
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{ background: "var(--accent)", opacity: 0.2, animationDelay: `${i * 250}ms` }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PIRStatusSection({ pir, daysLeft }: { pir: PIR; daysLeft: number | null }) {
  const answered = pir.eei_list.filter((e) => e.answered).length;
  const total = pir.eei_list.length;
  const isComplete = pir.status === "ANSWERED" || (total > 0 && answered === total);

  if (isGeneratingEEI(pir)) {
    return (
      <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ background: "rgba(125,60,152,0.08)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Waveform color="var(--purple)" />
            <span className="text-[9px] font-mono tracking-[0.18em] text-[var(--purple)]">GENERATING EEI</span>
          </div>
          <span className="text-[9px] font-mono" style={{ color: "rgba(125,60,152,0.5)" }}>AI · qwen3.5</span>
        </div>
        <div className="h-px rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div
            className="h-full rounded-full animate-pulse"
            style={{ width: "60%", background: "linear-gradient(90deg, transparent, var(--purple), transparent)" }}
          />
        </div>
      </div>
    );
  }

  if (total === 0) return null;

  if (isComplete) {
    return (
      <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ background: "rgba(30,132,73,0.07)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={10} className="text-[var(--green)]" />
            <span className="text-[9px] font-mono tracking-[0.18em] text-[var(--green)]">INTELLIGENCE COMPLETE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono" style={{ color: "rgba(30,132,73,0.7)" }}>{total}/{total} EEI</span>
            {daysLeft !== null && (
              <span className={cn("text-[9px] font-mono", daysLeft <= 3 ? "text-[var(--yellow)]" : "text-[var(--text-3)]")}>
                {daysLeft > 0 ? `T-${daysLeft}D` : "OVERDUE"}
              </span>
            )}
          </div>
        </div>
        <EEISegments eei_list={pir.eei_list} phase="done" />
      </div>
    );
  }

  return (
    <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ background: "rgba(75,123,236,0.07)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PingDot color="var(--accent)" />
          <Search size={9} className="text-[var(--accent)]" />
          <span className="text-[9px] font-mono tracking-[0.18em] text-[var(--accent)]">INTEL GATHERING</span>
        </div>
        <div className="flex items-center gap-2">
          {answered > 0 && <span className="text-[9px] font-mono text-[var(--green)]">{answered} OK</span>}
          <span className="text-[9px] font-mono text-[var(--text-3)]">{total - answered} PENDING</span>
        </div>
      </div>
      <EEISegments eei_list={pir.eei_list} phase="research" />
      <div className="flex items-center gap-1">
        <Brain size={8} className="text-[var(--text-3)]" />
        <span className="text-[8px] font-mono text-[var(--text-3)] tracking-wide">PERPLEXICA DEEP RESEARCH · AUTO-ANSWERING</span>
      </div>
    </div>
  );
}

function EEIRow({ eei, onSave, index }: { eei: EEI; onSave: (updated: EEI) => void; index: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(eei.answer ?? "");

  const save = () => {
    const trimmed = draft.trim();
    onSave({ ...eei, answer: trimmed || null, answered: trimmed.length > 0 });
    setEditing(false);
  };

  const cancel = () => {
    setDraft(eei.answer ?? "");
    setEditing(false);
  };

  return (
    <div className={cn(
      "rounded-lg p-2.5 space-y-1.5 transition-colors",
      eei.answered
        ? "border-l-2 border-[var(--green)] pl-3"
        : "border-l-2 border-[var(--border-2)] pl-3"
    )} style={{ background: eei.answered ? "rgba(30,132,73,0.06)" : "rgba(255,255,255,0.025)" }}>
      <div className="flex items-start gap-2">
        <div className={cn(
          "shrink-0 w-5 h-5 rounded flex items-center justify-center text-[9px] font-mono font-bold mt-0.5",
          eei.answered
            ? "text-[var(--green)]"
            : "text-[var(--text-3)]"
        )}>
          {eei.answered ? <CheckCircle2 size={12} /> : String(index + 1).padStart(2, "0")}
        </div>

        <p className={cn(
          "flex-1 text-xs leading-snug",
          eei.answered ? "text-[var(--text-2)]" : "text-[var(--text-3)]"
        )}>
          {eei.question}
        </p>

        <button
          onClick={() => setEditing((v) => !v)}
          className="shrink-0 text-[var(--text-3)] hover:text-[var(--accent)] mt-0.5 transition-colors"
        >
          <Pencil size={10} />
        </button>
      </div>

      {!editing && eei.answer && (
        <div className="ml-7 text-[11px] text-[var(--text-2)] leading-relaxed pl-2" style={{ borderLeft: "2px solid rgba(30,132,73,0.3)" }}>
          {eei.answer.slice(0, 300)}{eei.answer.length > 300 ? "…" : ""}
        </div>
      )}
      {!editing && !eei.answer && (
        <button
          onClick={() => setEditing(true)}
          className="ml-7 text-[9px] font-mono text-[var(--text-3)] hover:text-[var(--accent)] tracking-wide flex items-center gap-1 transition-colors"
        >
          <Plus size={8} /> ADD INTEL
        </button>
      )}

      {editing && (
        <div className="ml-7 space-y-1.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="บันทึกข้อมูลข่าวกรอง..."
            rows={3}
            className="w-full rounded px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{ background: "rgba(255,255,255,0.04)" }}
          />
          <div className="flex gap-2">
            <button onClick={save} className="flex items-center gap-1 text-white text-[9px] font-mono px-2.5 py-1 rounded hover:opacity-90 tracking-wide transition-opacity" style={{ background: "var(--green)" }}>
              <Check size={9} /> CONFIRM
            </button>
            <button onClick={cancel} className="text-[var(--text-3)] hover:text-[var(--text-2)] text-[9px] font-mono px-2 py-1 tracking-wide transition-colors">
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PIRCard({ pir }: { pir: PIR }) {
  const [expanded, setExpanded] = useState(false);
  const updatePIR = useUpdatePIR();
  const deletePIR = useDeletePIR();

  const saveEEI = (updated: EEI) => {
    const newList = pir.eei_list.map((e) => (e.id === updated.id ? updated : e));
    const allAnswered = newList.every((e) => e.answered);
    updatePIR.mutate({
      id: pir.id,
      data: {
        eei_list: newList,
        ...(allAnswered && pir.status === "ACTIVE" ? { status: "ANSWERED" } : {}),
      },
    });
  };

  const markAnswered = () => updatePIR.mutate({ id: pir.id, data: { status: "ANSWERED" } });

  const daysLeft = pir.deadline
    ? Math.ceil((new Date(pir.deadline).getTime() - Date.now()) / 86400000)
    : null;

  const priorityColor = PRIORITY_COLOR[pir.priority];
  const isComplete = pir.status === "ANSWERED" || (pir.eei_list.length > 0 && pir.eei_list.every((e) => e.answered));

  return (
    <div className="relative rounded-xl overflow-hidden transition-all" style={{ background: "var(--surface)" }}>
      {/* Priority accent strip */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: priorityColor, opacity: isComplete ? 0.3 : 0.7 }}
      />

      <div className="pl-5 pr-4 pt-3.5 pb-3 space-y-3">
        <div className="flex items-start gap-2.5">
          <span className={cn("text-[9px] font-mono shrink-0 mt-[3px] tracking-wide", PRIORITY_LABEL_STYLE[pir.priority])}>
            {pir.priority}
          </span>
          <p className="flex-1 text-sm text-[var(--text)] leading-snug font-medium">{pir.question}</p>
          <div className="flex gap-1.5 shrink-0 mt-0.5">
            {pir.status === "ACTIVE" && (
              <button onClick={markAnswered} title="Mark answered" className="text-[var(--text-3)] hover:text-[var(--green)] transition-colors">
                <CheckCircle2 size={13} />
              </button>
            )}
            <button onClick={() => deletePIR.mutate(pir.id)} className="text-[var(--text-3)] hover:text-[var(--red)] transition-colors">
              <Trash2 size={13} />
            </button>
            <button onClick={() => setExpanded((v) => !v)} className="text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        <PIRStatusSection pir={pir} daysLeft={daysLeft} />
      </div>

      {expanded && pir.eei_list.length > 0 && (
        <div className="pl-5 pr-4 pb-3 space-y-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-2 pt-3 pb-1">
            <Zap size={9} className="text-[var(--text-3)]" />
            <span className="text-[8px] font-mono text-[var(--text-3)] tracking-[0.2em]">ESSENTIAL ELEMENTS OF INFORMATION</span>
          </div>
          {pir.eei_list.map((eei, i) => (
            <EEIRow key={eei.id} eei={eei} onSave={saveEEI} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PIRTab() {
  const { data: pirs = [], isLoading } = usePIRs();
  const createPIR = useCreatePIR();
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [priority, setPriority] = useState<PIRPriority>("P2");
  const [createError, setCreateError] = useState<string | null>(null);

  const active = pirs.filter((p) => p.status === "ACTIVE");
  const answered = pirs.filter((p) => p.status === "ANSWERED");
  const nearDeadline = active.filter((p) => {
    if (!p.deadline) return false;
    return Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86400000) <= 3;
  });

  async function handleCreate() {
    if (!question.trim()) { setCreateError("กรุณากรอกคำถาม PIR"); return; }
    setCreateError(null);
    try {
      await createPIR.mutateAsync({ question: question.trim(), priority });
      setQuestion("");
      setShowForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
  }

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "ACTIVE PIR", value: active.length, color: "var(--purple)" },
          { label: "ANSWERED", value: answered.length, color: "var(--green)" },
          { label: "NEAR DEADLINE", value: nearDeadline.length, color: "var(--yellow)" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl px-4 py-3" style={{ background: "var(--surface)" }}>
            <p className="text-2xl font-mono font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[8px] font-mono text-[var(--text-3)] tracking-[0.2em] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Create */}
      {!showForm ? (
        <button
          onClick={() => { setShowForm(true); setCreateError(null); }}
          className="flex items-center gap-2 text-white text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          style={{ background: "var(--purple)" }}
        >
          <Plus size={14} /> สร้าง PIR ใหม่
        </button>
      ) : (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)" }}>
          <textarea
            autoFocus
            value={question}
            onChange={(e) => { setQuestion(e.target.value); if (createError) setCreateError(null); }}
            placeholder="คำถาม PIR เช่น บริษัท X มีความเชื่อมโยงกับเจ้าหน้าที่รัฐหรือไม่..."
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none focus:ring-1 focus:ring-[var(--accent)] transition-shadow"
            style={{ background: "rgba(255,255,255,0.04)" }}
          />
          {createError && <p className="text-xs text-[var(--red)]">{createError}</p>}
          <div className="flex gap-2">
            {(["P1", "P2", "P3"] as PIRPriority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={cn(
                  "px-3 py-1 rounded text-xs font-mono transition-all",
                  priority === p ? PRIORITY_LABEL_STYLE[p] : "text-[var(--text-3)]"
                )}
                style={priority === p ? { background: `${PRIORITY_COLOR[p]}18` } : { background: "rgba(255,255,255,0.04)" }}
              >
                {p}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button onClick={() => { setShowForm(false); setCreateError(null); }} className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] px-3 py-1 transition-colors">
                ยกเลิก
              </button>
              <button
                onClick={handleCreate}
                disabled={createPIR.isPending}
                className="text-white text-xs px-4 py-1 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ background: "var(--purple)" }}
              >
                {createPIR.isPending ? "กำลังสร้าง..." : "สร้าง"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIR list */}
      <div className="space-y-2">
        <p className="text-[8px] font-mono text-[var(--text-3)] tracking-[0.2em]">ACTIVE REQUIREMENTS</p>
        {active.map((pir) => <PIRCard key={pir.id} pir={pir} />)}
        {active.length === 0 && !isLoading && (
          <p className="text-sm text-[var(--text-3)] text-center py-8">ยังไม่มี PIR — กด "สร้าง PIR ใหม่"</p>
        )}
        {answered.length > 0 && (
          <>
            <p className="text-[8px] font-mono text-[var(--text-3)] tracking-[0.2em] pt-4">ANSWERED</p>
            {answered.map((pir) => <PIRCard key={pir.id} pir={pir} />)}
          </>
        )}
      </div>
    </div>
  );
}
