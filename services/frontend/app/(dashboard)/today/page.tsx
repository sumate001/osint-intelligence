"use client";

import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { StatusBar } from "@/components/triage/StatusBar";
import { AlertCard } from "@/components/triage/AlertCard";
import { FeedTable } from "@/components/triage/FeedTable";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { useFeedItems } from "@/lib/hooks/useFeedItems";
import type { FeedItem } from "@/lib/types/triage";
import { LayoutGrid, List, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate, scoreColor } from "@/lib/utils/format";

type ViewMode = "cards" | "table";
type VerdictFilter = "ALL" | "PRIORITY" | "INVESTIGATE" | "FAST_TRACK" | "PASS";

const VERDICT_FILTERS: VerdictFilter[] = ["ALL", "PRIORITY", "INVESTIGATE", "FAST_TRACK", "PASS"];

export default function TodayPage() {
  const [view, setView] = useState<ViewMode>("cards");
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useFeedItems({
    verdict: verdictFilter !== "ALL" ? verdictFilter : undefined,
    search: search || undefined,
    page: 1,
    page_size: 50,
  });

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Today's Intel" />

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden p-5 gap-4">
          {/* Status bar */}
          <StatusBar />

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Verdict filter tabs */}
            <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
              {VERDICT_FILTERS.map((v) => (
                <button
                  key={v}
                  onClick={() => setVerdictFilter(v)}
                  className={cn(
                    "px-3 py-1 rounded text-xs font-medium transition-colors",
                    verdictFilter === v
                      ? "bg-[var(--surface-2)] text-[var(--text)]"
                      : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                  )}
                >
                  {v === "ALL" ? "All" : v.replace("_", " ")}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 flex-1 max-w-xs">
              <Search size={13} className="text-[var(--text-3)] shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหา..."
                className="bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none w-full"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Refresh */}
              <button
                onClick={() => refetch()}
                className="p-1.5 rounded hover:bg-[var(--surface)] text-[var(--text-2)]"
                title="Refresh"
              >
                <RefreshCw size={14} className={cn(isFetching && "animate-spin")} />
              </button>

              {/* View toggle */}
              <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded p-0.5">
                <button
                  onClick={() => setView("cards")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    view === "cards"
                      ? "bg-[var(--surface-2)] text-[var(--text)]"
                      : "text-[var(--text-3)]"
                  )}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setView("table")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    view === "table"
                      ? "bg-[var(--surface-2)] text-[var(--text)]"
                      : "text-[var(--text-3)]"
                  )}
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto">
            {isError ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <p className="text-[var(--red)] text-sm">
                  {(error as Error)?.message || "ไม่สามารถโหลดข้อมูลได้"}
                </p>
                <button
                  onClick={() => refetch()}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  ลองใหม่
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="flex gap-2 text-[var(--text-3)] text-sm">
                  <RefreshCw size={16} className="animate-spin" />
                  <span>กำลังโหลด...</span>
                </div>
              </div>
            ) : view === "cards" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {items.map((item) => (
                  <AlertCard
                    key={item.id}
                    item={item}
                    onClick={setSelectedItem}
                  />
                ))}
                {items.length === 0 && (
                  <div className="col-span-full flex items-center justify-center h-40 text-[var(--text-3)] text-sm">
                    ไม่มีข่าวในขณะนี้
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
                <FeedTable
                  items={items}
                  onSelect={setSelectedItem}
                  selectedId={selectedItem?.id}
                />
              </div>
            )}
          </div>

          {data && (
            <div className="text-xs text-[var(--text-3)] text-right">
              แสดง {items.length} จาก {data.total} รายการ
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedItem && (
          <div className="w-96 border-l border-[var(--border)] bg-[var(--surface)] overflow-y-auto p-5 flex flex-col gap-4 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {selectedItem.verdict && <VerdictBadge verdict={selectedItem.verdict} size="md" />}
                <span className="font-mono text-xs text-[var(--text-3)]">
                  {selectedItem.admiralty_source}{selectedItem.admiralty_info}
                </span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-[var(--text-3)] hover:text-[var(--text)] text-lg leading-none"
              >
                ×
              </button>
            </div>

            <h2 className="text-base font-semibold text-[var(--text)] leading-snug">
              {selectedItem.title}
            </h2>

            <p className="text-sm text-[var(--text-2)] leading-relaxed">{selectedItem.body}</p>

            {selectedItem.verdict_reason && (
              <div className="bg-[var(--surface-2)] rounded-lg p-3">
                <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wide mb-1">
                  Triage Reason
                </div>
                <p className="text-xs text-[var(--text-2)]">{selectedItem.verdict_reason}</p>
              </div>
            )}

            {/* Scores breakdown */}
            <div className="space-y-2">
              <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wide">Scores</div>
              {[
                { label: "Relevance", v: selectedItem.score_relevance },
                { label: "Urgency", v: selectedItem.score_urgency },
                { label: "Impact", v: selectedItem.score_impact },
                { label: "Novelty", v: selectedItem.score_novelty },
                { label: "Reliability", v: selectedItem.score_reliability },
                { label: "Sensitivity", v: selectedItem.score_sensitivity },
                { label: "Actionability", v: selectedItem.score_actionability },
              ].map(({ label, v }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-2)] w-24 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: v !== null ? `${(v / 10) * 100}%` : "0%",
                        backgroundColor: scoreColor(v),
                      }}
                    />
                  </div>
                  <span
                    className="font-mono text-xs w-8 text-right"
                    style={{ color: scoreColor(v) }}
                  >
                    {v !== null ? v.toFixed(1) : "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Entities */}
            {Object.entries(selectedItem.entities).some(([, v]) => (v as string[]).length > 0) && (
              <div className="space-y-2">
                <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wide">Entities</div>
                {Object.entries(selectedItem.entities).map(([type, values]) =>
                  (values as string[]).length > 0 ? (
                    <div key={type}>
                      <div className="text-[10px] text-[var(--text-3)] mb-1 capitalize">{type}</div>
                      <div className="flex flex-wrap gap-1">
                        {(values as string[]).map((v) => (
                          <span
                            key={v}
                            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs text-[var(--text-2)]"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            )}

            {/* Meta */}
            <div className="border-t border-[var(--border)] pt-3 space-y-1.5 text-xs text-[var(--text-3)]">
              <div>
                <span className="text-[var(--text-2)]">Source:</span> {selectedItem.source_id}
              </div>
              <div>
                <span className="text-[var(--text-2)]">Type:</span> {selectedItem.source_type}
              </div>
              <div>
                <span className="text-[var(--text-2)]">Published:</span>{" "}
                {formatDate(selectedItem.published_at)}
              </div>
              <div>
                <span className="text-[var(--text-2)]">Ingested:</span>{" "}
                {formatDate(selectedItem.ingested_at)}
              </div>
              {selectedItem.url && (
                <a
                  href={selectedItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[var(--accent)] hover:underline truncate"
                >
                  {selectedItem.url}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
