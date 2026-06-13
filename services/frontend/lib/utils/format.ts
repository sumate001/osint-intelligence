import { formatDistanceToNow, format } from "date-fns";
import { th } from "date-fns/locale";

export function timeAgo(date: string | Date | null): string {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: th });
}

export function formatDate(date: string | Date | null, fmt = "dd MMM yyyy HH:mm"): string {
  if (!date) return "—";
  return format(new Date(date), fmt, { locale: th });
}

export function scoreColor(score: number | null): string {
  if (score === null) return "var(--text-3)";
  if (score >= 7.5) return "var(--red)";
  if (score >= 5.5) return "var(--yellow)";
  return "var(--text-2)";
}

export const VERDICT_LABELS: Record<string, string> = {
  PRIORITY: "Priority",
  INVESTIGATE: "Investigate",
  FAST_TRACK: "Fast Track",
  PASS: "Pass",
};
