"use client";

import type { FeedItem } from "@/lib/types/triage";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { timeAgo, scoreColor } from "@/lib/utils/format";
import { ExternalLink, Eye } from "lucide-react";
import { useUpdateFeedItem } from "@/lib/hooks/useFeedItems";
import { cn } from "@/lib/utils/cn";

interface AlertCardProps {
  item: FeedItem;
  onClick?: (item: FeedItem) => void;
}

export function AlertCard({ item, onClick }: AlertCardProps) {
  const { mutate: updateItem } = useUpdateFeedItem();

  const handleMarkRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.is_read) {
      updateItem({ id: item.id, patch: { is_read: true } });
    }
  };

  const scoreDisplay = item.total_score !== null ? item.total_score.toFixed(1) : "—";
  const admiraltyLabel = `${item.admiralty_source}${item.admiralty_info}`;

  return (
    <div
      onClick={() => onClick?.(item)}
      className={cn(
        "bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 cursor-pointer transition-colors hover:border-[var(--border-2)] hover:bg-[var(--surface-3)]",
        item.is_read && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {item.verdict && <VerdictBadge verdict={item.verdict} />}
          <span className="font-mono text-[10px] text-[var(--text-3)] border border-[var(--border)] rounded px-1.5 py-0.5">
            {admiraltyLabel}
          </span>
          {item.verified_source && (
            <span className="text-[10px] text-[var(--green)] font-medium">✓ Verified source</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className="font-mono text-sm font-bold"
            style={{ color: scoreColor(item.total_score) }}
          >
            {scoreDisplay}
          </span>
          <button
            onClick={handleMarkRead}
            className={cn(
              "p-1 rounded hover:bg-[var(--surface-2)]",
              item.is_read ? "text-[var(--text-3)]" : "text-[var(--accent)]"
            )}
            title="Mark as read"
          >
            <Eye size={14} />
          </button>
        </div>
      </div>

      <h3 className="text-sm font-medium text-[var(--text)] leading-snug line-clamp-2 mb-2">
        {item.title}
      </h3>

      {item.body && (
        <p className="text-xs text-[var(--text-2)] line-clamp-2 mb-3 leading-relaxed">{item.body}</p>
      )}

      <div className="flex items-center justify-between text-[10px] text-[var(--text-3)]">
        <div className="flex items-center gap-2">
          <span className="font-mono">{item.source_id}</span>
          <span>·</span>
          <span>{timeAgo(item.published_at || item.ingested_at)}</span>
        </div>

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
          >
            <ExternalLink size={10} />
            <span>Source</span>
          </a>
        )}
      </div>

      {/* Score mini-bar */}
      {item.total_score !== null && (
        <div className="mt-3 h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(item.total_score / 10) * 100}%`,
              backgroundColor: scoreColor(item.total_score),
            }}
          />
        </div>
      )}
    </div>
  );
}
