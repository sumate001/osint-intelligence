"use client";

import { cn } from "@/lib/utils/cn";
import { useT } from "@/lib/hooks/useT";

type Verdict = "PRIORITY" | "INVESTIGATE" | "FAST_TRACK" | "PASS" | "VERIFIED" | "SUSPICIOUS" | "BLOCKED";

const VERDICT_STYLES: Record<Verdict, string> = {
  PRIORITY:    "bg-[var(--red)]/15 text-[var(--red)] border-[var(--red)]/30",
  INVESTIGATE: "bg-[var(--yellow)]/15 text-[var(--yellow)] border-[var(--yellow)]/30",
  FAST_TRACK:  "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30",
  PASS:        "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/30",
  VERIFIED:    "bg-[var(--green)]/15 text-[var(--green)] border-[var(--green)]/30",
  SUSPICIOUS:  "bg-[var(--yellow)]/15 text-[var(--yellow)] border-[var(--yellow)]/30",
  BLOCKED:     "bg-[var(--red)]/15 text-[var(--red)] border-[var(--red)]/30",
};

interface VerdictBadgeProps {
  verdict: Verdict | string;
  className?: string;
  size?: "sm" | "md";
}

export function VerdictBadge({ verdict, className, size = "sm" }: VerdictBadgeProps) {
  const t = useT();
  const v = verdict as Verdict;
  const style = VERDICT_STYLES[v] ?? "bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border)]";

  // Translate triage verdicts; keep verify verdicts (VERIFIED/SUSPICIOUS/BLOCKED) from translation too
  const label = (() => {
    if (v === "PRIORITY")    return t("verdict.PRIORITY");
    if (v === "INVESTIGATE") return t("verdict.INVESTIGATE");
    if (v === "FAST_TRACK")  return t("verdict.FAST_TRACK");
    if (v === "PASS")        return t("verdict.PASS");
    if (v === "VERIFIED")    return t("verify.result.VERIFIED");
    if (v === "SUSPICIOUS")  return t("verify.result.SUSPICIOUS");
    if (v === "BLOCKED")     return t("darkweb.risk.HIGH");
    return verdict;
  })();

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
