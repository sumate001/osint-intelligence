"use client";

import { useState } from "react";
import { Plus, Trash2, CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { usePIRs, useCreatePIR, useUpdatePIR, useDeletePIR } from "@/lib/hooks/useIntelligence";
import type { PIR, EEI, PIRPriority } from "@/lib/types/intelligence";

const PRIORITY_STYLES: Record<PIRPriority, string> = {
  P1: "text-[var(--red)] bg-[var(--red)]/10",
  P2: "text-[var(--yellow)] bg-[var(--yellow)]/10",
  P3: "text-[var(--text-3)] bg-[var(--surface-3)]",
};

function PIRCard({ pir }: { pir: PIR }) {
  const [expanded, setExpanded] = useState(false);
  const updatePIR = useUpdatePIR();
  const deletePIR = useDeletePIR();

  const toggleEEI = (eeiId: string) => {
    const updated = pir.eei_list.map((e) =>
      e.id === eeiId ? { ...e, answered: !e.answered } : e
    );
    updatePIR.mutate({ id: pir.id, data: { eei_list: updated } });
  };

  const markAnswered = () => updatePIR.mutate({ id: pir.id, data: { status: "ANSWERED" } });

  const daysLeft = pir.deadline
    ? Math.ceil((new Date(pir.deadline).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 mt-0.5", PRIORITY_STYLES[pir.priority])}>
          {pir.priority}
        </span>
        <p className="flex-1 text-sm text-[var(--text)] leading-snug">{pir.question}</p>
        <div className="flex gap-1 shrink-0">
          {pir.status === "ACTIVE" && (
            <button onClick={markAnswered} title="Mark answered" className="text-[var(--text-3)] hover:text-[var(--green)]">
              <CheckCircle2 size={13} />
            </button>
          )}
          <button onClick={() => deletePIR.mutate(pir.id)} className="text-[var(--text-3)] hover:text-[var(--red)]">
            <Trash2 size={13} />
          </button>
          <button onClick={() => setExpanded((v) => !v)} className="text-[var(--text-3)] hover:text-[var(--text-2)]">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {pir.eei_list.length > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pir.progress}%`,
                background: pir.progress >= 80 ? "var(--green)" : pir.progress >= 40 ? "var(--yellow)" : "var(--red)",
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-[var(--text-3)]">
            <span>{pir.progress}% answered · {pir.eei_list.filter((e) => e.answered).length}/{pir.eei_list.length} EEI</span>
            {daysLeft !== null && (
              <span className={daysLeft <= 3 ? "text-[var(--yellow)]" : ""}>
                deadline: {daysLeft > 0 ? `${daysLeft} วัน` : "เลย deadline"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* EEI list */}
      {expanded && pir.eei_list.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
          <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest">ESSENTIAL ELEMENTS OF INFORMATION</p>
          {pir.eei_list.map((eei) => (
            <button
              key={eei.id}
              onClick={() => toggleEEI(eei.id)}
              className="flex items-start gap-2 w-full text-left group"
            >
              <div className={cn(
                "shrink-0 mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center",
                eei.answered ? "bg-[var(--green)] border-[var(--green)]" : "border-[var(--border-2)]"
              )}>
                {eei.answered && <CheckCircle2 size={9} className="text-white" />}
              </div>
              <p className={cn("text-xs leading-snug", eei.answered ? "line-through text-[var(--text-3)]" : "text-[var(--text-2)]")}>
                {eei.question}
              </p>
            </button>
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
  const [eeiText, setEEIText] = useState("");

  const active = pirs.filter((p) => p.status === "ACTIVE");
  const answered = pirs.filter((p) => p.status === "ANSWERED");
  const nearDeadline = active.filter((p) => {
    if (!p.deadline) return false;
    return Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86400000) <= 3;
  });

  async function handleCreate() {
    if (!question.trim()) return;
    await createPIR.mutateAsync({ question: question.trim(), priority });
    setQuestion(""); setShowForm(false);
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
          <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
            <p className="text-2xl font-mono font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Create */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-[var(--purple)] text-white text-sm px-4 py-2 rounded-lg hover:opacity-90">
          <Plus size={14} /> สร้าง PIR ใหม่
        </button>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
          <textarea
            autoFocus value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="คำถาม PIR เช่น บริษัท X มีความเชื่อมโยงกับเจ้าหน้าที่รัฐหรือไม่..."
            rows={2}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none"
          />
          <div className="flex gap-2">
            {(["P1", "P2", "P3"] as PIRPriority[]).map((p) => (
              <button key={p} onClick={() => setPriority(p)}
                className={cn("px-3 py-1 rounded text-xs font-mono", priority === p ? PRIORITY_STYLES[p] : "text-[var(--text-3)] bg-[var(--surface-3)]")}>
                {p}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button onClick={() => setShowForm(false)} className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] px-3 py-1">ยกเลิก</button>
              <button onClick={handleCreate} disabled={createPIR.isPending}
                className="bg-[var(--purple)] text-white text-xs px-4 py-1 rounded-lg hover:opacity-90 disabled:opacity-50">
                สร้าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIR list */}
      <div className="space-y-2">
        <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest">ACTIVE REQUIREMENTS</p>
        {active.map((pir) => <PIRCard key={pir.id} pir={pir} />)}
        {active.length === 0 && !isLoading && (
          <p className="text-sm text-[var(--text-3)] text-center py-8">ยังไม่มี PIR — กด "สร้าง PIR ใหม่"</p>
        )}
        {answered.length > 0 && (
          <>
            <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest pt-4">ANSWERED</p>
            {answered.map((pir) => <PIRCard key={pir.id} pir={pir} />)}
          </>
        )}
      </div>
    </div>
  );
}
