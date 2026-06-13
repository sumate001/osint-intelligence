import { cn } from "@/lib/utils/cn";

type Verdict = "PRIORITY" | "INVESTIGATE" | "FAST_TRACK" | "PASS" | "VERIFIED" | "SUSPICIOUS" | "BLOCKED";

const VERDICT_STYLES: Record<Verdict, string> = {
  PRIORITY: "bg-[var(--red)]/15 text-[var(--red)] border-[var(--red)]/30",
  INVESTIGATE: "bg-[var(--yellow)]/15 text-[var(--yellow)] border-[var(--yellow)]/30",
  FAST_TRACK: "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30",
  PASS: "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/30",
  VERIFIED: "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/30",
  SUSPICIOUS: "bg-[var(--yellow)]/15 text-[var(--yellow)] border-[var(--yellow)]/30",
  BLOCKED: "bg-[var(--red)]/15 text-[var(--red)] border-[var(--red)]/30",
};

const VERDICT_LABELS: Record<Verdict, string> = {
  PRIORITY: "Priority",
  INVESTIGATE: "Investigate",
  FAST_TRACK: "Fast Track",
  PASS: "Pass",
  VERIFIED: "Verified",
  SUSPICIOUS: "Suspicious",
  BLOCKED: "Blocked",
};

interface VerdictBadgeProps {
  verdict: Verdict | string;
  className?: string;
  size?: "sm" | "md";
}

export function VerdictBadge({ verdict, className, size = "sm" }: VerdictBadgeProps) {
  const v = verdict as Verdict;
  const style = VERDICT_STYLES[v] ?? "bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border)]";
  const label = VERDICT_LABELS[v] ?? verdict;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
        style,
        className
      )}
    >
      {label}
    </span>
  );
}
