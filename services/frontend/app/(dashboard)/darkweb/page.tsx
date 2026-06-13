"use client";

import { useState } from "react";
import { Shield, Play, RefreshCw, CheckCircle, XCircle, AlertCircle, Eye } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { useDWStats, useDWResults, useLegalQueue, useAuditLog, useStartQuery, useReviewResult } from "@/lib/hooks/useDarkweb";
import { cn } from "@/lib/utils/cn";
import { useT } from "@/lib/hooks/useT";

type Tab = "results" | "legal" | "audit";
const METHOD_OPTIONS = [
  { value: "ahmia", label: "Ahmia only" },
  { value: "torbot_ahmia", label: "TorBot + Ahmia" },
  { value: "seed", label: "Seed list only" },
];

export default function DarkWebPage() {
  const [tab, setTab] = useState<Tab>("results");
  const [queryText, setQueryText] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("ahmia");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const t = useT();

  const { data: stats } = useDWStats();
  const { data: results = [], isLoading: resultsLoading } = useDWResults();
  const { data: legalQueue = [] } = useLegalQueue();
  const { data: auditLog = [] } = useAuditLog();
  const startQuery = useStartQuery();
  const reviewResult = useReviewResult();

  async function handleQuery() {
    if (!queryText.trim()) { setQueryError(t("darkweb.query_placeholder")); return; }
    if (!reason.trim()) { setQueryError(t("darkweb.purpose_label")); return; }
    setQueryError(null);
    try {
      await startQuery.mutateAsync({ query_text: queryText, reason, method });
      setQueryText("");
      setReason("");
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title={t("darkweb.title")}
        badge={{ text: "⚠ editorial purpose only", variant: "warning" }}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r border-[var(--border)] flex flex-col shrink-0 bg-[var(--surface)]">
          {/* Tor status */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
              <span className="text-[10px] text-[var(--green)]">Tor connected</span>
            </div>
          </div>

          {/* Stats */}
          <div className="px-3 py-3 border-b border-[var(--border)] space-y-1">
            {[
              { label: t("common.total"),       value: stats?.total ?? 0,         color: "" },
              { label: "Flagged",                value: stats?.flagged ?? 0,       color: "text-[var(--yellow)]" },
              { label: "Blocked",                value: stats?.blocked ?? 0,       color: "text-[var(--red)]" },
              { label: t("darkweb.legal_review"),value: stats?.legal_pending ?? 0, color: "text-[var(--accent)]" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-3)]">{s.label}</span>
                <span className={cn("text-xs font-mono font-bold", s.color || "text-[var(--text)]")}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Nav */}
          <nav className="flex-1 p-2 space-y-0.5">
            {([
              { id: "results" as Tab, label: "🌑 Results",            badge: stats?.total },
              { id: "legal"   as Tab, label: `⚖ ${t("darkweb.legal_review")}`, badge: stats?.legal_pending },
              { id: "audit"   as Tab, label: "📋 Chain of Custody",   badge: null },
            ]).map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-1.5 rounded text-xs transition-colors",
                  tab === item.id
                    ? "bg-[var(--surface-3)] text-[var(--text)]"
                    : "text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-2)]"
                )}
              >
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="text-[9px] bg-[var(--red)] text-white rounded-full px-1 min-w-[16px] text-center">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Query box */}
          {tab === "results" && (
            <div className="border-b border-[var(--border)] bg-[var(--surface)] p-4 space-y-3 shrink-0">
              <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wider font-medium flex items-center gap-1">
                <Shield size={10} className="text-[var(--darkweb-s)]" />
                Targeted Query
              </p>

              <div className="flex gap-2">
                <input
                  placeholder={t("darkweb.query_placeholder")}
                  value={queryText}
                  onChange={(e) => { setQueryText(e.target.value); setQueryError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                  className={cn(
                    "flex-1 bg-[var(--surface-2)] border rounded px-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none",
                    queryError && !reason ? "border-[var(--red)]" : "border-[var(--border)]"
                  )}
                />
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-2 text-xs text-[var(--text)] outline-none"
                >
                  {METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  onClick={handleQuery}
                  disabled={startQuery.isPending}
                  className="flex items-center gap-1.5 bg-[var(--darkweb)] text-[var(--darkweb-s)] text-xs px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 border border-[var(--darkweb-s)]/20"
                >
                  {startQuery.isPending ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
                  {startQuery.isPending ? t("darkweb.crawling") : t("darkweb.start")}
                </button>
              </div>

              <div>
                <p className="text-[10px] text-[var(--red)] mb-1 flex items-center gap-1">
                  <AlertCircle size={10} /> {t("darkweb.purpose_label")}
                </p>
                <textarea
                  placeholder={t("darkweb.purpose_placeholder")}
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setQueryError(null); }}
                  rows={2}
                  className={cn(
                    "w-full bg-[var(--surface-2)] border rounded px-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none",
                    queryError && !reason.trim() ? "border-[var(--red)]" : "border-[var(--border)]"
                  )}
                />
                {queryError && (
                  <p className="text-[10px] text-[var(--red)] mt-1 flex items-center gap-1">
                    <AlertCircle size={10} /> {queryError}
                  </p>
                )}
              </div>

              <p className="text-[10px] text-[var(--text-3)]">⚠ {t("darkweb.warning")}</p>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Results tab */}
            {tab === "results" && (
              resultsLoading ? (
                <div className="flex justify-center py-12">
                  <RefreshCw size={18} className="animate-spin text-[var(--text-3)]" />
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-3)] text-sm">
                  {t("darkweb.no_results")}
                </div>
              ) : (
                results.map((r) => (
                  <div
                    key={r.id}
                    className={cn(
                      "border rounded-xl overflow-hidden",
                      r.classification === "FLAGGED" ? "border-[var(--yellow)]/40 bg-[var(--yellow)]/5" :
                      r.classification === "BLOCKED" ? "border-[var(--red)]/30 bg-[var(--red)]/5" :
                      "border-[var(--border)] bg-[var(--surface-2)]"
                    )}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-2 justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider",
                              r.classification === "FLAGGED" ? "text-[var(--yellow)] bg-[var(--yellow)]/15" :
                              r.classification === "BLOCKED" ? "text-[var(--red)] bg-[var(--red)]/15" :
                              "text-[var(--green)] bg-[var(--green)]/15"
                            )}>{r.classification}</span>
                            {r.legal_status === "PENDING" && (
                              <span className="text-[9px] text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded">
                                {t("darkweb.legal_review")}
                              </span>
                            )}
                            {r.legal_status === "APPROVED" && (
                              <span className="text-[9px] text-[var(--green)] bg-[var(--green)]/10 px-1.5 py-0.5 rounded">
                                {t("brief.approved")}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-[var(--text)]">
                            {r.classification === "BLOCKED" ? "[blocked]" : r.title || r.onion_url.slice(0, 40) + "..."}
                          </p>
                          {r.classification !== "BLOCKED" && (
                            <p className="text-[10px] text-[var(--text-3)] font-mono mt-0.5">
                              {r.onion_url.slice(0, 35)}... · {new Date(r.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                        {r.classification !== "BLOCKED" && (
                          <button
                            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                            className="text-[var(--text-3)] hover:text-[var(--text-2)] shrink-0"
                          >
                            <Eye size={14} />
                          </button>
                        )}
                      </div>

                      {expandedId === r.id && r.classification !== "BLOCKED" && (
                        <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1.5">
                          <p className="text-xs text-[var(--text-2)] leading-relaxed">{r.summary}</p>
                          {r.entities.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {r.entities.map((e) => (
                                <span key={e} className="text-[9px] bg-[var(--surface-3)] text-[var(--text-2)] px-1.5 py-0.5 rounded">
                                  {e}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-[10px] text-[var(--text-3)]">
                            <span>confidence: {Math.round(r.confidence * 100)}%</span>
                            {r.value && <span>value: {r.value}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )
            )}

            {/* Legal Review tab */}
            {tab === "legal" && (
              <div className="space-y-3">
                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3 mb-4">
                  <p className="text-[10px] text-[var(--text-2)] leading-relaxed">
                    <span className="text-[var(--accent)] font-medium">⚖ {t("darkweb.legal_review")}</span>
                  </p>
                </div>

                {legalQueue.length === 0 ? (
                  <div className="text-center py-12 text-[var(--text-3)] text-sm">{t("common.none")}</div>
                ) : (
                  legalQueue.map((r) => (
                    <div key={r.id} className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface-2)] space-y-3">
                      <div>
                        <p className="text-xs font-medium text-[var(--text)]">{r.title}</p>
                        <p className="text-[10px] text-[var(--text-3)] font-mono">{r.onion_url.slice(0, 40)}...</p>
                      </div>
                      <p className="text-xs text-[var(--text-2)] leading-relaxed">{r.summary}</p>
                      <div className="flex items-center gap-3 text-[10px] text-[var(--text-3)]">
                        <span>confidence: {Math.round(r.confidence * 100)}%</span>
                        <span>value: {r.value}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => reviewResult.mutate({ id: r.id, action: "approve" })}
                          disabled={reviewResult.isPending}
                          className="flex items-center gap-1 text-xs bg-[var(--green)]/10 text-[var(--green)] border border-[var(--green)]/30 px-3 py-1.5 rounded hover:bg-[var(--green)]/20 disabled:opacity-50"
                        >
                          <CheckCircle size={11} /> {t("brief.approve")}
                        </button>
                        <button
                          onClick={() => reviewResult.mutate({ id: r.id, action: "reject" })}
                          disabled={reviewResult.isPending}
                          className="flex items-center gap-1 text-xs bg-[var(--red)]/10 text-[var(--red)] border border-[var(--red)]/30 px-3 py-1.5 rounded hover:bg-[var(--red)]/20 disabled:opacity-50"
                        >
                          <XCircle size={11} /> {t("brief.reject")}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Audit log tab */}
            {tab === "audit" && (
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-[var(--text-2)] font-medium">
                    📋 Chain of Custody — Audit Log (append-only)
                  </p>
                  <span className="text-[10px] text-[var(--text-3)]">{t("common.no")} delete</span>
                </div>
                {auditLog.length === 0 ? (
                  <div className="text-center py-12 text-[var(--text-3)] text-sm">{t("common.none")}</div>
                ) : (
                  auditLog.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0">
                      <span className="text-[10px] text-[var(--text-3)] font-mono shrink-0 mt-0.5">
                        {new Date(entry.timestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className="text-[10px] text-[var(--accent)] shrink-0 min-w-[60px]">{entry.username}</span>
                      <span className="text-xs text-[var(--text-2)]">{entry.action}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
