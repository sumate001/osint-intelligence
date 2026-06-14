"use client";

import { useState } from "react";
import {
  ShieldCheck, RefreshCw, CheckCircle, AlertTriangle, HelpCircle,
  ChevronDown, ChevronUp, Rss, Loader2,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { DropZone } from "@/components/verify/DropZone";
import { VerifyResultCard } from "@/components/verify/VerifyResultCard";
import { useVerifyJobs, useUploadForVerify } from "@/lib/hooks/useVerify";
import { useT } from "@/lib/hooks/useT";

export default function VerifyPage() {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [feedSectionOpen, setFeedSectionOpen] = useState(false);
  const t = useT();

  const { data, isLoading, refetch } = useVerifyJobs();
  const upload = useUploadForVerify();

  const jobs = data?.items ?? [];
  const manualJobs = jobs.filter((j) => !j.feed_item_id);
  const feedJobs = jobs.filter((j) => !!j.feed_item_id);

  // Show persistent upload banner while mutation is in flight
  const isUploading = upload.isPending;

  const stats = {
    verified: jobs.filter((j) => j.verdict === "VERIFIED").length,
    suspicious: jobs.filter((j) => j.verdict === "SUSPICIOUS").length,
    unverified: jobs.filter((j) => j.verdict === "UNVERIFIED" || j.verdict === null).length,
  };

  async function handleUpload(file: File) {
    setUploadError(null);
    try {
      await upload.mutateAsync(file);
    } catch (err) {
      setUploadError((err as Error).message || t("common.error"));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title={t("verify.title")} />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Stats bar — counts all jobs */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t("verify.result.VERIFIED"), count: stats.verified, icon: CheckCircle, color: "text-[var(--green)]" },
              { label: t("verify.result.SUSPICIOUS"), count: stats.suspicious, icon: AlertTriangle, color: "text-[var(--yellow)]" },
              { label: t("investigation.evidence.unverified"), count: stats.unverified, icon: HelpCircle, color: "text-[var(--text-3)]" },
            ].map(({ label, count, icon: Icon, color }) => (
              <div
                key={label}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <Icon size={18} className={color} />
                <div>
                  <p className="text-lg font-bold text-[var(--text)]">{count}</p>
                  <p className="text-[10px] text-[var(--text-3)]">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Manual upload section ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[var(--text-3)] uppercase tracking-widest font-semibold">
                อัปโหลดเอง
                {manualJobs.length > 0 && (
                  <span className="ml-2 font-normal normal-case tracking-normal">{manualJobs.length} รายการ</span>
                )}
              </p>
              <button
                onClick={() => refetch()}
                className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-2)]"
                title={t("common.refresh")}
              >
                <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {/* Upload progress banner — stays visible even while navigating */}
            {isUploading && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border-2)] text-xs text-[var(--text-2)]">
                <Loader2 size={12} className="animate-spin text-[var(--accent)] shrink-0" />
                กำลังอัปโหลดและสร้างงาน...
              </div>
            )}

            <DropZone onUpload={handleUpload} isUploading={isUploading} />

            {uploadError && (
              <p className="text-sm text-[var(--red)] text-center">{uploadError}</p>
            )}

            {/* Job list — use data from cache while refetching (isFetching vs isLoading) */}
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[var(--text-3)] text-sm">
                <Loader2 size={16} className="animate-spin" />
                {t("common.loading")}
              </div>
            ) : manualJobs.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-3)]">
                <ShieldCheck size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">{t("verify.no_jobs")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {manualJobs.map((job) => (
                  <VerifyResultCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </section>

          {/* ── Auto-verify from feed section ── */}
          {feedJobs.length > 0 && (
            <section className="space-y-2">
              <button
                onClick={() => setFeedSectionOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Rss size={13} className="text-[var(--accent)]" />
                  <span className="text-[11px] text-[var(--text-3)] uppercase tracking-widest font-semibold">
                    ตรวจสอบอัตโนมัติจาก Feed
                  </span>
                  <span className="text-xs text-[var(--text-3)]">{feedJobs.length} รายการ</span>
                </div>
                {feedSectionOpen
                  ? <ChevronUp size={14} className="text-[var(--text-3)]" />
                  : <ChevronDown size={14} className="text-[var(--text-3)]" />}
              </button>

              {feedSectionOpen && (
                <div className="space-y-2 pt-1">
                  {feedJobs.map((job) => (
                    <VerifyResultCard key={job.id} job={job} />
                  ))}
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
