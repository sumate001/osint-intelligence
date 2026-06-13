"use client";

import { useState } from "react";
import { FileText, Newspaper, Network, Table2, Loader2 } from "lucide-react";
import { exportUrl } from "@/lib/api/brief";
import type { BriefMode, BriefStatus } from "@/lib/types/brief";

function getToken(): string | null {
  try {
    const stored = localStorage.getItem("osintdesk-auth");
    if (!stored) return null;
    return JSON.parse(stored)?.state?.token ?? null;
  } catch {
    return null;
  }
}

async function downloadExport(href: string, filename: string) {
  const token = getToken();
  const res = await fetch(href, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  briefId: string;
  mode: BriefMode;
  status: BriefStatus;
  onSubmit: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  isSubmitting?: boolean;
  userRole: string;
}

const EXPORTS = [
  { label: "Internal PDF", desc: "ทุก claim", icon: FileText, format: "pdf" as const, public: false },
  { label: "Public Report", desc: "Bellingcat format", icon: Newspaper, format: "pdf" as const, public: true },
  { label: "Network GEXF", desc: "→ Gephi", icon: Network, format: "gexf" as const, public: false },
  { label: "Evidence CSV", desc: "รายการ evidence", icon: Table2, format: "csv" as const, public: false },
];

const STATUS_STYLES: Record<BriefStatus, string> = {
  DRAFT: "text-[var(--text-3)] bg-[var(--surface-3)]",
  PENDING: "text-[var(--yellow)] bg-[var(--yellow)]/10",
  APPROVED: "text-[var(--green)] bg-[var(--green)]/10",
  REJECTED: "text-[var(--red)] bg-[var(--red)]/10",
};

const STATUS_LABEL: Record<BriefStatus, string> = {
  DRAFT: "Draft",
  PENDING: "รอ editor อนุมัติ",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const EXT: Record<string, string> = { pdf: "pdf", csv: "csv", gexf: "gexf" };

export function ExportPanel({ briefId, mode, status, onSubmit, onApprove, onReject, isSubmitting, userRole }: Props) {
  const isEditor = userRole === "admin" || userRole === "editor";
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleExport(ex: (typeof EXPORTS)[number]) {
    const href = exportUrl(briefId, ex.format, ex.public);
    const suffix = ex.public ? "-public" : "-internal";
    const filename = `brief-${briefId}${ex.format === "pdf" ? suffix : ""}.${EXT[ex.format]}`;
    setDownloading(ex.label);
    try {
      await downloadExport(href, filename);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Status */}
      <div>
        <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mb-2">STATUS</p>
        <div className={`text-xs px-3 py-2 rounded-lg ${STATUS_STYLES[status]}`}>
          {STATUS_LABEL[status]}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {status === "DRAFT" && (
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] text-white text-xs py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            ส่ง Editor
          </button>
        )}
        {status === "PENDING" && isEditor && (
          <>
            <button
              onClick={onApprove}
              className="w-full bg-[var(--green)] text-white text-xs py-2 rounded-lg hover:opacity-90"
            >
              Approve
            </button>
            <button
              onClick={onReject}
              className="w-full bg-[var(--red)]/20 text-[var(--red)] text-xs py-2 rounded-lg hover:bg-[var(--red)]/30"
            >
              Reject
            </button>
          </>
        )}
      </div>

      {/* Exports */}
      <div>
        <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest mb-2">EXPORT</p>
        <div className="space-y-1.5">
          {EXPORTS.map((ex) => {
            if (ex.public && mode === "INTERNAL") return null;
            const Icon = ex.icon;
            const isLoading = downloading === ex.label;
            return (
              <button
                key={ex.label}
                onClick={() => handleExport(ex)}
                disabled={!!downloading}
                className="w-full flex items-center gap-2.5 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-2)] rounded-lg cursor-pointer transition-colors group disabled:opacity-50 text-left"
              >
                <Icon size={16} className="text-[var(--text-2)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--text)]">{ex.label}</p>
                  <p className="text-[10px] text-[var(--text-2)]">{ex.desc}</p>
                </div>
                {isLoading && <Loader2 size={11} className="animate-spin text-[var(--text-3)] shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
