"use client";

import { useState } from "react";
import { FileText, Plus, Clock, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { useBriefs, useCreateBrief } from "@/lib/hooks/useBrief";
import { cn } from "@/lib/utils/cn";
import type { BriefStatus, BriefMode } from "@/lib/types/brief";

const STATUS_CONFIG: Record<BriefStatus, { label: string; icon: React.ReactNode; cls: string }> = {
  DRAFT: { label: "Draft", icon: <Clock size={11} />, cls: "text-[var(--text-3)] bg-[var(--surface-3)]" },
  PENDING: { label: "Pending", icon: <AlertTriangle size={11} />, cls: "text-[var(--yellow)] bg-[var(--yellow)]/10" },
  APPROVED: { label: "Approved", icon: <CheckCircle2 size={11} />, cls: "text-[var(--green)] bg-[var(--green)]/10" },
  REJECTED: { label: "Rejected", icon: <XCircle size={11} />, cls: "text-[var(--red)] bg-[var(--red)]/10" },
};

export default function BriefListPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const { data: briefs = [], isLoading } = useBriefs();
  const createBrief = useCreateBrief();

  const stats = {
    draft: briefs.filter((b) => b.status === "DRAFT").length,
    pending: briefs.filter((b) => b.status === "PENDING").length,
    approved: briefs.filter((b) => b.status === "APPROVED").length,
  };

  async function handleCreate() {
    if (!title.trim()) return;
    const brief = await createBrief.mutateAsync({ title: title.trim() });
    setTitle("");
    setShowCreate(false);
    window.location.href = `/brief/${brief.id}`;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Brief Builder" />

      {/* Stats */}
      <div className="px-6 pt-4 pb-2 shrink-0">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Draft", value: stats.draft, color: "var(--text-3)" },
            { label: "Pending", value: stats.pending, color: "var(--yellow)" },
            { label: "Approved", value: stats.approved, color: "var(--green)" },
          ].map((s) => (
            <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3">
              <p className="text-2xl font-mono font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] text-[var(--text-3)] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[var(--accent)] text-white text-sm px-4 py-2 rounded-lg hover:opacity-90"
        >
          <Plus size={14} />
          สร้าง Brief ใหม่
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 w-full max-w-md space-y-4">
            <p className="text-sm font-medium text-[var(--text)]">สร้าง Brief ใหม่</p>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="ชื่อ brief..."
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="text-sm text-[var(--text-3)] hover:text-[var(--text-2)] px-3 py-1.5">
                ยกเลิก
              </button>
              <button
                onClick={handleCreate}
                disabled={createBrief.isPending}
                className="bg-[var(--accent)] text-white text-sm px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                สร้าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
        {isLoading && (
          <div className="flex justify-center py-12">
            <RefreshCw size={20} className="animate-spin text-[var(--text-3)]" />
          </div>
        )}

        {!isLoading && briefs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-3)]">
            <FileText size={32} className="opacity-30" />
            <p className="text-sm">ยังไม่มี brief — กด "สร้าง Brief ใหม่"</p>
          </div>
        )}

        {briefs.map((b) => {
          const sc = STATUS_CONFIG[b.status];
          return (
            <Link
              key={b.id}
              href={`/brief/${b.id}`}
              className="flex items-center gap-4 bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-2)] rounded-xl px-4 py-3 transition-colors group"
            >
              <FileText size={16} className="text-[var(--text-3)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text)] group-hover:text-white truncate">{b.title}</p>
                <p className="text-[11px] text-[var(--text-3)] mt-0.5">
                  {new Date(b.updated_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded", b.mode === "PUBLIC" ? "text-[var(--green)] bg-[var(--green)]/10" : "text-[var(--accent)] bg-[var(--accent)]/10")}>
                  {b.mode}
                </span>
                <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded", sc.cls)}>
                  {sc.icon}
                  {sc.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
