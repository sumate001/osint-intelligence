"use client";

import { useState } from "react";
import { ShieldCheck, RefreshCw, CheckCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { DropZone } from "@/components/verify/DropZone";
import { VerifyResultCard } from "@/components/verify/VerifyResultCard";
import { useVerifyJobs, useUploadForVerify } from "@/lib/hooks/useVerify";

export default function VerifyPage() {
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data, isLoading, refetch } = useVerifyJobs();
  const upload = useUploadForVerify();

  const jobs = data?.items ?? [];

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
      setUploadError((err as Error).message || "อัปโหลดไม่สำเร็จ");
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="UGC Verify" />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Verified", count: stats.verified, icon: CheckCircle, color: "text-[var(--green)]" },
              { label: "Suspicious", count: stats.suspicious, icon: AlertTriangle, color: "text-[var(--yellow)]" },
              { label: "Unverified", count: stats.unverified, icon: HelpCircle, color: "text-[var(--text-3)]" },
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

          {/* Drop zone */}
          <DropZone onUpload={handleUpload} isUploading={upload.isPending} />

          {uploadError && (
            <p className="text-sm text-[var(--red)] text-center">{uploadError}</p>
          )}

          {/* Results */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">
                ผลล่าสุด {jobs.length} ชิ้น
              </p>
              <button
                onClick={() => refetch()}
                className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-2)]"
              >
                <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {isLoading && jobs.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-3)] text-sm">กำลังโหลด...</div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-3)]">
                <ShieldCheck size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">ยังไม่มีไฟล์ — อัปโหลดเพื่อเริ่มตรวจสอบ</p>
              </div>
            ) : (
              jobs.map((job) => <VerifyResultCard key={job.id} job={job} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
