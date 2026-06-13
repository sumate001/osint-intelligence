"use client";

import { useFeedStats } from "@/lib/hooks/useFeedItems";
import { AlertTriangle, Eye, Zap, CheckCircle } from "lucide-react";

const STATS_CONFIG = [
  {
    key: "priority" as const,
    label: "Priority",
    icon: AlertTriangle,
    color: "var(--red)",
    bg: "var(--red)",
  },
  {
    key: "investigate" as const,
    label: "Investigate",
    icon: Eye,
    color: "var(--yellow)",
    bg: "var(--yellow)",
  },
  {
    key: "fast_track" as const,
    label: "Fast Track",
    icon: Zap,
    color: "var(--accent)",
    bg: "var(--accent)",
  },
  {
    key: "pass" as const,
    label: "Pass",
    icon: CheckCircle,
    color: "var(--green)",
    bg: "var(--green)",
  },
];

export function StatusBar() {
  const { data: stats, isLoading } = useFeedStats();

  return (
    <div className="flex gap-3 flex-wrap">
      {STATS_CONFIG.map(({ key, label, icon: Icon, color, bg }) => (
        <div
          key={key}
          className="flex items-center gap-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 min-w-[120px]"
        >
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${bg}18` }}
          >
            <Icon size={16} style={{ color }} />
          </div>
          <div>
            <div className="text-xl font-bold font-mono" style={{ color }}>
              {isLoading ? "—" : (stats?.[key] ?? 0)}
            </div>
            <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wide">{label}</div>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 min-w-[120px]">
        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-[var(--surface-2)]">
          <span className="text-[var(--text-2)] text-sm font-bold">Σ</span>
        </div>
        <div>
          <div className="text-xl font-bold font-mono text-[var(--text)]">
            {isLoading ? "—" : (stats?.total ?? 0)}
          </div>
          <div className="text-[10px] text-[var(--text-3)] uppercase tracking-wide">Total</div>
        </div>
      </div>
    </div>
  );
}
