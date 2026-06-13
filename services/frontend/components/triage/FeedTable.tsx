"use client";

import type { FeedItem } from "@/lib/types/triage";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { timeAgo, scoreColor } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

interface FeedTableProps {
  items: FeedItem[];
  onSelect?: (item: FeedItem) => void;
  selectedId?: string | null;
}

const SCORE_COLS: Array<{ key: keyof FeedItem; label: string }> = [
  { key: "score_relevance", label: "Rel" },
  { key: "score_urgency", label: "Urg" },
  { key: "score_impact", label: "Imp" },
];

export function FeedTable({ items, onSelect, selectedId }: FeedTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[var(--text-3)] text-sm">
        ไม่มีรายการ
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left px-3 py-2 text-[10px] text-[var(--text-3)] uppercase tracking-wide font-medium">
              Verdict
            </th>
            <th className="text-left px-3 py-2 text-[10px] text-[var(--text-3)] uppercase tracking-wide font-medium">
              Title
            </th>
            <th className="text-left px-3 py-2 text-[10px] text-[var(--text-3)] uppercase tracking-wide font-medium">
              Source
            </th>
            {SCORE_COLS.map(({ key, label }) => (
              <th
                key={key}
                className="text-right px-2 py-2 text-[10px] text-[var(--text-3)] uppercase tracking-wide font-medium w-10"
              >
                {label}
              </th>
            ))}
            <th className="text-right px-3 py-2 text-[10px] text-[var(--text-3)] uppercase tracking-wide font-medium">
              Score
            </th>
            <th className="text-right px-3 py-2 text-[10px] text-[var(--text-3)] uppercase tracking-wide font-medium">
              Time
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onSelect?.(item)}
              className={cn(
                "border-b border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--surface-3)]",
                selectedId === item.id && "bg-[var(--surface-2)]",
                item.is_read && "opacity-50"
              )}
            >
              <td className="px-3 py-2.5">
                {item.verdict && <VerdictBadge verdict={item.verdict} />}
              </td>
              <td className="px-3 py-2.5 max-w-[360px]">
                <p className="line-clamp-1 text-[var(--text)] text-sm">{item.title}</p>
              </td>
              <td className="px-3 py-2.5">
                <span className="text-xs font-mono text-[var(--text-2)]">{item.source_id.slice(0, 12)}</span>
              </td>
              {SCORE_COLS.map(({ key }) => {
                const v = item[key] as number | null;
                return (
                  <td key={key} className="px-2 py-2.5 text-right">
                    <span
                      className="font-mono text-xs"
                      style={{ color: v !== null ? scoreColor(v) : "var(--text-3)" }}
                    >
                      {v !== null ? v.toFixed(1) : "—"}
                    </span>
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-right">
                <span
                  className="font-mono text-sm font-bold"
                  style={{ color: scoreColor(item.total_score) }}
                >
                  {item.total_score !== null ? item.total_score.toFixed(1) : "—"}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right">
                <span className="text-xs text-[var(--text-3)]">
                  {timeAgo(item.published_at || item.ingested_at)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
