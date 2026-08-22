"use client";

import { useState } from "react";
import { Radar } from "lucide-react";

import { useT } from "@/lib/hooks/useT";
import { useCloseSignal, useSignalForCase } from "@/lib/hooks/useSignals";
import type { SignalVerdict } from "@/lib/types/signals";

const VERDICTS: SignalVerdict[] = ["true_signal", "false_signal", "inconclusive"];

/**
 * Origin badge plus the close-with-verdict flow for a case that came from a
 * Horizon signal.
 *
 * Renders nothing for a case opened by hand — the lookup 404s and that is the
 * normal answer, not an error. Keeping this in one component means the case
 * page gains a line rather than a branch.
 */
export function SignalOrigin({ caseId }: { caseId: string }) {
  const t = useT();
  const { data: signal } = useSignalForCase(caseId);
  const closeSignal = useCloseSignal();
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<SignalVerdict | null>(null);
  const [note, setNote] = useState("");

  if (!signal) return null;

  const alreadyClosed = signal.status === "closed";

  return (
    <div className="mb-3 rounded-xl border border-[var(--border-2)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
          <Radar size={11} />
          {t("signals.from_horizon")}
        </span>
        <a
          href="/investigation/signals"
          className="text-[11px] text-[var(--accent)] hover:underline"
        >
          {t("signals.title")} →
        </a>

        {alreadyClosed && signal.verdict && (
          <span className="ml-auto text-[11px] text-[var(--text-3)]">
            {t("signals.close_verdict_label")}:{" "}
            <span className="text-[var(--text-2)]">
              {t(`signals.verdict_${signal.verdict}` as never)}
            </span>
          </span>
        )}

        {!alreadyClosed && !open && (
          <button
            onClick={() => setOpen(true)}
            className="ml-auto rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--text-2)] hover:bg-[var(--surface-3)]"
          >
            {t("signals.close_title")}
          </button>
        )}
      </div>

      {open && !alreadyClosed && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-[var(--text-3)]">{t("signals.close_hint")}</p>

          <div className="flex gap-2">
            {VERDICTS.map((v) => (
              <button
                key={v}
                onClick={() => setVerdict(v)}
                className={`flex-1 rounded-lg py-2 text-sm transition-colors ${
                  verdict === v
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
                }`}
              >
                {t(`signals.verdict_${v}` as never)}
              </button>
            ))}
          </div>

          <input
            placeholder={t("signals.close_note_placeholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
          />

          <div className="flex gap-2">
            <button
              // Verdict is required: closing without one tells Horizon nothing,
              // and the feedback loop is the point of the integration.
              disabled={!verdict || closeSignal.isPending}
              onClick={() =>
                verdict &&
                closeSignal.mutate(
                  { id: signal.id, verdict, note: note || undefined },
                  { onSuccess: () => setOpen(false) },
                )
              }
              className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {closeSignal.isPending ? t("common.saving") : t("signals.close_submit")}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--text-2)] hover:bg-[var(--surface-3)]"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SignalOrigin;
