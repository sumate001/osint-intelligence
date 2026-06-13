"use client";

import { useState } from "react";
import { MessageSquare, AlertTriangle, Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCaseActivity, useAddComment } from "@/lib/hooks/useIntelligence";
import { useCases } from "@/lib/hooks/useCase";
import type { CaseActivity } from "@/lib/types/intelligence";
import type { Case } from "@/lib/types/investigation";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  evidence_added: <Plus size={11} className="text-[var(--green)]" />,
  evidence_updated: <Clock size={11} className="text-[var(--yellow)]" />,
  evidence_deleted: <AlertTriangle size={11} className="text-[var(--red)]" />,
  comment_added: <MessageSquare size={11} className="text-[var(--accent)]" />,
  scan_started: <Clock size={11} className="text-[var(--purple)]" />,
  scan_done: <Plus size={11} className="text-[var(--green)]" />,
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)} วินาทีที่แล้ว`;
  if (diff < 3600) return `${Math.round(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.round(diff / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.round(diff / 86400)} วันที่แล้ว`;
}

function ActivityItem({ act }: { act: CaseActivity }) {
  const icon = ACTION_ICONS[act.action_type] ?? <Clock size={11} className="text-[var(--text-3)]" />;
  const initials = (act.actor_name || "?").slice(0, 1).toUpperCase();
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="w-6 h-6 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center text-[10px] font-bold shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[var(--text)]">
          <span className="font-medium">{act.actor_name || act.actor_id.slice(0, 8)}</span>{" "}
          {act.description}
        </p>
        <p className="text-[10px] text-[var(--text-3)] mt-0.5">{timeAgo(act.created_at)}</p>
      </div>
      <div className="shrink-0 mt-0.5">{icon}</div>
    </div>
  );
}

export function CollaborationTab() {
  const { data: casesData } = useCases();
  const cases: Case[] = casesData?.items ?? [];
  const [selectedCase, setSelectedCase] = useState<string>("");
  const [noteText, setNoteText] = useState("");
  const [isDissent, setIsDissent] = useState(false);
  const { data: activity = [] } = useCaseActivity(selectedCase);
  const addComment = useAddComment();

  const activeCases = cases.filter((c) => c.status === "ACTIVE");

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      {/* Case selector */}
      <div className="flex items-center gap-3">
        <select
          value={selectedCase}
          onChange={(e) => setSelectedCase(e.target.value)}
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none"
        >
          <option value="">เลือก Case...</option>
          {activeCases.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      {selectedCase ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Activity feed */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
              <p className="text-[10px] font-mono text-[var(--text-3)] tracking-widest">ACTIVITY FEED</p>
              <span className="flex items-center gap-1 text-[10px] text-[var(--green)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
                live
              </span>
            </div>
            <div className="divide-y divide-[var(--border)] max-h-80 overflow-y-auto px-4">
              {activity.length === 0 && (
                <p className="text-xs text-[var(--text-3)] py-6 text-center">ยังไม่มี activity ใน case นี้</p>
              )}
              {activity.map((act) => <ActivityItem key={act.id} act={act} />)}
            </div>
          </div>

          {/* Quick note / dissent */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)]">
              <p className="text-[10px] font-mono text-[var(--text-3)] tracking-widest">ADD NOTE / DISSENT</p>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="เพิ่ม note หรือความเห็นแย้ง..."
                rows={4}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDissent}
                    onChange={(e) => setIsDissent(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[var(--red)]"
                  />
                  <span className={cn("text-xs", isDissent ? "text-[var(--red)]" : "text-[var(--text-2)]")}>
                    Dissenting view
                  </span>
                </label>
                <button
                  onClick={async () => {
                    if (!noteText.trim() || !selectedCase) return;
                    await addComment.mutateAsync({
                      evidenceId: selectedCase,
                      caseId: selectedCase,
                      text: noteText.trim(),
                      isDissent,
                    });
                    setNoteText("");
                  }}
                  disabled={addComment.isPending || !noteText.trim()}
                  className="ml-auto bg-[var(--accent)] text-white text-xs px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-3)]">
          <MessageSquare size={32} className="opacity-30 mb-3" />
          <p className="text-sm">เลือก Case เพื่อดู activity feed</p>
        </div>
      )}
    </div>
  );
}
