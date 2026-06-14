"use client";

import { useEffect } from "react";
import { Loader2, CheckCircle2, AlertCircle, X, Sparkles, ScanSearch, ShieldCheck } from "lucide-react";
import { useTaskStore, type BackgroundTask } from "@/lib/stores/tasks";
import { cn } from "@/lib/utils/cn";

const TYPE_ICON = {
  "ai-search": Sparkles,
  "scan":      ScanSearch,
  "verify":    ShieldCheck,
} as const;

const TYPE_COLOR: Record<string, string> = {
  "ai-search": "var(--accent)",
  "scan":      "var(--green)",
  "verify":    "var(--yellow)",
};

function TaskChip({ task }: { task: BackgroundTask }) {
  const { update, remove } = useTaskStore();
  const Icon = TYPE_ICON[task.type] ?? Sparkles;
  const color = TYPE_COLOR[task.type] ?? "var(--accent)";

  const cancel = () => {
    task.abort?.();
    update(task.id, { status: "cancelled", finishedAt: Date.now() });
  };

  const dismiss = () => remove(task.id);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono",
        "bg-[var(--surface)] backdrop-blur shadow-lg transition-all",
        task.status === "running"   && "border-[var(--border-2)]",
        task.status === "done"      && "border-[var(--green)]/40",
        task.status === "error"     && "border-[var(--red)]/40",
        task.status === "cancelled" && "border-[var(--border)] opacity-60",
      )}
      style={{ maxWidth: 280 }}
    >
      {/* Status icon */}
      <span className="shrink-0">
        {task.status === "running" && (
          <Loader2 size={13} className="animate-spin" style={{ color }} />
        )}
        {task.status === "done" && (
          <CheckCircle2 size={13} className="text-[var(--green)]" />
        )}
        {task.status === "error" && (
          <AlertCircle size={13} className="text-[var(--red)]" />
        )}
        {task.status === "cancelled" && (
          <Icon size={13} className="text-[var(--text-3)]" />
        )}
      </span>

      {/* Label */}
      <span
        className={cn(
          "flex-1 truncate",
          task.status === "running"   && "text-[var(--text-2)]",
          task.status === "done"      && "text-[var(--text)]",
          task.status === "error"     && "text-[var(--red)]",
          task.status === "cancelled" && "text-[var(--text-3)]",
        )}
      >
        {task.status === "error" ? (task.error ?? "เกิดข้อผิดพลาด") : task.label}
      </span>

      {/* Action button */}
      {task.status === "running" ? (
        <button
          onClick={cancel}
          title="ยกเลิก"
          className="shrink-0 text-[var(--text-3)] hover:text-[var(--red)] transition-colors"
        >
          <X size={12} />
        </button>
      ) : (
        <button
          onClick={dismiss}
          title="ปิด"
          className="shrink-0 text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function TaskBar() {
  const { tasks, remove } = useTaskStore();

  // Auto-dismiss finished tasks after 10 s
  useEffect(() => {
    const finished = tasks.filter(
      (t) =>
        t.finishedAt &&
        (t.status === "done" || t.status === "error" || t.status === "cancelled") &&
        Date.now() - t.finishedAt > 10_000,
    );
    finished.forEach((t) => remove(t.id));
  });

  const visible = tasks.filter((t) => t.status !== "cancelled" || (t.finishedAt && Date.now() - t.finishedAt < 4_000));

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {visible.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <TaskChip task={t} />
        </div>
      ))}
    </div>
  );
}
