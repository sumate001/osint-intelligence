"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, RefreshCw, Sparkles } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { BriefEditor } from "@/components/brief/BriefEditor";
import { ModeToggle } from "@/components/brief/ModeToggle";
import { ExportPanel } from "@/components/brief/ExportPanel";
import { ConfidencePanel } from "@/components/brief/ConfidencePanel";
import { useBrief, useUpdateBrief, useSubmitBrief, useReviewBrief, useDraftWithLLM } from "@/lib/hooks/useBrief";
import type { BriefMode } from "@/lib/types/brief";

export default function BriefDetailPage() {
  const params = useParams();
  const briefId = params.briefId as string;

  const { data: brief, isLoading } = useBrief(briefId);
  const updateBrief = useUpdateBrief(briefId);
  const submitBrief = useSubmitBrief(briefId);
  const reviewBrief = useReviewBrief(briefId);
  const draftLLM = useDraftWithLLM(briefId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = (typeof window !== "undefined" ? (window as any).__USER_ROLE__ : null) ?? "analyst";

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-[var(--text-3)]" />
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-3)]">
        <p>ไม่พบ brief</p>
        <Link href="/brief" className="text-[var(--accent)] text-sm hover:underline">กลับ</Link>
      </div>
    );
  }

  const handleModeChange = (mode: BriefMode) => updateBrief.mutate({ mode });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title={brief.title}
        breadcrumb={
          <Link href="/brief" className="flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text-2)] text-xs">
            <ChevronLeft size={12} />
            Brief Builder
          </Link>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main editor area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Mode toggle + LLM draft bar */}
          <div className="px-5 pt-3 pb-2 shrink-0 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <ModeToggle
                  mode={brief.mode}
                  onChange={handleModeChange}
                  disabled={brief.status !== "DRAFT"}
                />
              </div>
              {brief.status === "DRAFT" && brief.case_id && (
                <button
                  onClick={() => draftLLM.mutate()}
                  disabled={draftLLM.isPending}
                  className="flex items-center gap-1.5 text-xs bg-[var(--purple)]/20 text-[var(--purple)] border border-[var(--purple)]/30 px-3 py-2 rounded-lg hover:bg-[var(--purple)]/30 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <Sparkles size={12} />
                  {draftLLM.isPending ? "กำลัง draft..." : "LLM Draft"}
                </button>
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <BriefEditor brief={brief} />
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-64 border-l border-[var(--border)] flex flex-col shrink-0 overflow-y-auto">
          <ExportPanel
            briefId={brief.id}
            mode={brief.mode}
            status={brief.status}
            onSubmit={() => submitBrief.mutate()}
            onApprove={() => reviewBrief.mutate({ action: "approve" })}
            onReject={() => reviewBrief.mutate({ action: "reject" })}
            isSubmitting={submitBrief.isPending}
            userRole={userRole}
          />
          <div className="px-4 pb-4">
            <ConfidencePanel briefId={brief.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
