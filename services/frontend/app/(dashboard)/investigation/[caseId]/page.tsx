"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Network, Clock4, Kanban, Search, Activity, Zap,
  ChevronLeft, RefreshCw, XCircle, AlertCircle, CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { NetworkGraph } from "@/components/investigation/NetworkGraph";
import { EvidenceBoard } from "@/components/investigation/EvidenceBoard";
import { Timeline } from "@/components/investigation/Timeline";
import { ResearchPanel } from "@/components/investigation/ResearchPanel";
import { useCase, useEvidence, useCaseGraph, useScans, useTriggerScan, useCancelScan, useAddEvidence, useUpdateEvidence, useDeleteEvidence } from "@/lib/hooks/useCase";
import { cn } from "@/lib/utils/cn";
import type { EvidenceStatus, EvidenceCreate } from "@/lib/types/investigation";

type Tab = "graph" | "timeline" | "evidence";
type SidePanel = "research" | "scans";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "graph", label: "Network Map", icon: <Network size={14} /> },
  { id: "timeline", label: "Timeline", icon: <Clock4 size={14} /> },
  { id: "evidence", label: "Evidence Board", icon: <Kanban size={14} /> },
];

export default function CasePage() {
  const params = useParams();
  const caseId = params.caseId as string;

  const [activeTab, setActiveTab] = useState<Tab>("graph");
  const [sidePanel, setSidePanel] = useState<SidePanel>("research");
  const [scanTarget, setScanTarget] = useState("");
  const [showScanInput, setShowScanInput] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const { data: caseData, isLoading: caseLoading } = useCase(caseId);
  const { data: evidence = [] } = useEvidence(caseId);
  const { data: graph = { nodes: [], edges: [] } } = useCaseGraph(caseId);
  const { data: scans = [] } = useScans(caseId);

  const triggerScan = useTriggerScan(caseId);
  const cancelScan = useCancelScan(caseId);
  const addEvidence = useAddEvidence(caseId);
  const updateEvidence = useUpdateEvidence(caseId);
  const deleteEvidence = useDeleteEvidence(caseId);

  if (caseLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-[var(--text-3)]" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-3)]">
        <p>ไม่พบ case</p>
        <Link href="/investigation" className="text-[var(--accent)] text-sm hover:underline">
          กลับ
        </Link>
      </div>
    );
  }

  const perplexicaUrl = process.env.NEXT_PUBLIC_PERPLEXICA_URL ?? "";

  async function handleScan() {
    if (!scanTarget.trim()) return;
    setScanError(null);
    try {
      await triggerScan.mutateAsync(scanTarget.trim());
      setScanTarget("");
      setShowScanInput(false);
      setSidePanel("scans");
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  }

  async function handleAddEvidence(data: { title: string; content: string; url: string }) {
    await addEvidence.mutateAsync({
      title: data.title,
      content: data.content,
      url: data.url || undefined,
    } as EvidenceCreate);
  }

  async function handleStatusChange(evidenceId: string, status: EvidenceStatus) {
    await updateEvidence.mutateAsync({ evidenceId, data: { status } });
  }

  async function handleDeleteEvidence(evidenceId: string) {
    await deleteEvidence.mutateAsync(evidenceId);
  }

  const runningScans = scans.filter((s) => s.status === "RUNNING" || s.status === "PENDING");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title={caseData.title}
        breadcrumb={
          <Link
            href="/investigation"
            className="flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text-2)] text-xs"
          >
            <ChevronLeft size={12} />
            Investigation
          </Link>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main panel */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors",
                  activeTab === tab.id
                    ? "bg-[var(--surface-2)] text-[var(--text)]"
                    : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-2">
              {runningScans.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-[var(--yellow)]">
                  <Activity size={10} className="animate-pulse" />
                  scanning {runningScans.length}
                </span>
              )}
              <button
                onClick={() => setShowScanInput((v) => !v)}
                className="flex items-center gap-1 bg-[var(--purple)] text-white text-xs px-3 py-1.5 rounded hover:opacity-90"
              >
                <Zap size={12} />
                SpiderFoot
              </button>
            </div>
          </div>

          {/* SpiderFoot input */}
          {showScanInput && (
            <div className="flex flex-col gap-1.5 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  placeholder="domain, IP, name, phone, email..."
                  value={scanTarget}
                  onChange={(e) => { setScanTarget(e.target.value); setScanError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  className={cn(
                    "flex-1 bg-[var(--surface)] border rounded px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none",
                    scanError ? "border-[var(--red)]" : "border-[var(--border)]"
                  )}
                />
                <button
                  onClick={handleScan}
                  disabled={triggerScan.isPending}
                  className="bg-[var(--purple)] text-white text-xs px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                >
                  {triggerScan.isPending && <RefreshCw size={10} className="animate-spin" />}
                  Scan
                </button>
                <button
                  onClick={() => { setShowScanInput(false); setScanError(null); }}
                  className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] px-2 py-1.5"
                >
                  ยกเลิก
                </button>
              </div>
              {scanError && (
                <p className="flex items-center gap-1 text-[10px] text-[var(--red)]">
                  <AlertCircle size={10} />
                  {scanError}
                </p>
              )}
            </div>
          )}

          {/* Tab content */}
          <div className="flex-1 overflow-hidden p-4">
            {activeTab === "graph" && (
              <div className="h-full rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
                <NetworkGraph graph={graph} />
              </div>
            )}
            {activeTab === "timeline" && (
              <div className="h-full overflow-y-auto">
                <Timeline evidence={evidence} />
              </div>
            )}
            {activeTab === "evidence" && (
              <div className="h-full">
                <EvidenceBoard
                  evidence={evidence}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDeleteEvidence}
                  onAdd={handleAddEvidence}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right side panel */}
        <div className="w-80 border-l border-[var(--border)] flex flex-col shrink-0">
          {/* Side panel tabs */}
          <div className="flex border-b border-[var(--border)] shrink-0">
            {[
              { id: "research" as SidePanel, label: "Research", icon: <Search size={12} /> },
              { id: "scans" as SidePanel, label: "Scans", icon: <Activity size={12} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSidePanel(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors",
                  sidePanel === tab.id
                    ? "text-[var(--text)] border-b-2 border-[var(--accent)] -mb-px"
                    : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {sidePanel === "research" && (
              <ResearchPanel
                perplexicaUrl={perplexicaUrl}
                caseTitle={caseData.title}
                caseId={caseId}
              />
            )}
            {sidePanel === "scans" && (
              <div className="overflow-y-auto h-full p-3 space-y-2">
                {scans.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-3)] text-xs">
                    ยังไม่มี scan — กด SpiderFoot เพื่อเริ่ม
                  </div>
                ) : (
                  scans.map((scan) => {
                    const errMsg = typeof scan.results?.error === "string" ? scan.results.error : null;
                    const entityCount = Array.isArray(scan.results?.entities) ? (scan.results.entities as unknown[]).length : null;
                    return (
                      <div
                        key={scan.id}
                        className={cn(
                          "border rounded-lg p-3 space-y-1.5",
                          scan.status === "FAILED"
                            ? "bg-[var(--red)]/5 border-[var(--red)]/30"
                            : "bg-[var(--surface-2)] border-[var(--border)]"
                        )}
                      >
                        {/* header row */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {scan.status === "RUNNING" && (
                              <RefreshCw size={11} className="animate-spin text-[var(--yellow)] shrink-0" />
                            )}
                            {scan.status === "PENDING" && (
                              <Activity size={11} className="animate-pulse text-[var(--text-3)] shrink-0" />
                            )}
                            {scan.status === "DONE" && (
                              <CheckCircle2 size={11} className="text-[var(--green)] shrink-0" />
                            )}
                            {scan.status === "FAILED" && (
                              <AlertCircle size={11} className="text-[var(--red)] shrink-0" />
                            )}
                            <p className="text-xs font-medium text-[var(--text)] truncate">{scan.target}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-mono",
                                scan.status === "DONE" && "text-[var(--green)] bg-[var(--green)]/10",
                                scan.status === "RUNNING" && "text-[var(--yellow)] bg-[var(--yellow)]/10",
                                scan.status === "PENDING" && "text-[var(--text-3)] bg-[var(--surface-3)]",
                                scan.status === "FAILED" && "text-[var(--red)] bg-[var(--red)]/10",
                                scan.status === "CANCELLED" && "text-[var(--text-3)] bg-[var(--surface-3)] line-through"
                              )}
                            >
                              {scan.status}
                            </span>
                            {(scan.status === "PENDING" || scan.status === "RUNNING") && (
                              <button
                                onClick={() => cancelScan.mutate(scan.id)}
                                disabled={cancelScan.isPending}
                                title="หยุด scan"
                                className="text-[var(--red)] hover:opacity-80 disabled:opacity-40"
                              >
                                <XCircle size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* progress bar for RUNNING */}
                        {scan.status === "RUNNING" && (
                          <div className="w-full h-0.5 bg-[var(--border)] rounded overflow-hidden">
                            <div
                              className="h-full bg-[var(--yellow)] rounded"
                              style={{ animation: "scan-progress 2s ease-in-out infinite" }}
                            />
                          </div>
                        )}

                        {/* sub-line */}
                        <p className="text-[10px] text-[var(--text-3)]">
                          {scan.scan_type}
                          {scan.status === "RUNNING" && " · กำลังสแกน..."}
                          {scan.status === "PENDING" && " · รอเริ่ม..."}
                          {scan.status === "DONE" && entityCount !== null && ` · พบ ${entityCount} entities`}
                        </p>

                        {/* error message */}
                        {scan.status === "FAILED" && errMsg && (
                          <p className="text-[10px] text-[var(--red)] break-words leading-relaxed">
                            {errMsg}
                          </p>
                        )}
                        {scan.status === "FAILED" && !errMsg && (
                          <p className="text-[10px] text-[var(--red)]">
                            สแกนล้มเหลว — ตรวจสอบ SpiderFoot หรือ target
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
