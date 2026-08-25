"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Radar, TrendingUp } from "lucide-react";

import { Topbar } from "@/components/layout/Topbar";
import { useT } from "@/lib/hooks/useT";
import {
  useAcceptSignal,
  useDismissSignal,
  useSignals,
} from "@/lib/hooks/useSignals";
import type { DismissKind } from "@/lib/api/signals";
import type { ExternalSignal, SignalStatus } from "@/lib/types/signals";

const TABS: { key: SignalStatus | "all"; labelKey: string }[] = [
  { key: "pending_review", labelKey: "signals.tab_pending" },
  { key: "accepted", labelKey: "signals.tab_accepted" },
  { key: "dismissed", labelKey: "signals.tab_dismissed" },
  { key: "closed", labelKey: "signals.tab_closed" },
  { key: "all", labelKey: "signals.tab_all" },
];

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TypeBadge({ type }: { type: string }) {
  const weak = type === "weak_signal";
  const Icon = weak ? Radar : TrendingUp;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium ${
        weak ? "bg-amber-500/15 text-amber-400" : "bg-rose-500/15 text-rose-400"
      }`}
    >
      <Icon size={11} />
      {weak ? "สัญญาณอ่อน" : "แนวโน้มพุ่งผิดปกติ"}
    </span>
  );
}

function SignalRow({ signal }: { signal: ExternalSignal }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  // Defaults to off_topic: most dismissals are "not our beat", and sending
  // those as false_signal trains Horizon against detections that were right.
  const [dismissKind, setDismissKind] = useState<DismissKind>("off_topic");
  const accept = useAcceptSignal();
  const dismiss = useDismissSignal();

  const p = signal.payload ?? ({} as ExternalSignal["payload"]);
  const isWeak = signal.signal_type === "weak_signal";
  const score = isWeak ? p.combined_score : p.trend_score;
  const pending = signal.status === "pending_review";

  async function handleAccept() {
    const created = await accept.mutateAsync({ id: signal.id });
    router.push(`/investigation/${created.id}`);
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-[var(--surface-2)] transition-colors"
      >
        {open ? (
          <ChevronDown size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" />
        ) : (
          <ChevronRight size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" />
        )}

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={signal.signal_type} />
            {(p.categories ?? []).map((c) => (
              <span
                key={c}
                className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--text-2)]"
              >
                {c}
              </span>
            ))}
            {signal.verdict && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--text-2)]">
                {t(`signals.verdict_${signal.verdict}` as never)}
              </span>
            )}
            {signal.callback_status === "failed" && (
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
                <AlertTriangle size={10} />
                {t("signals.callback_failed")}
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text)] line-clamp-2">{signal.title}</p>
          <p className="text-[11px] text-[var(--text-3)]">{fmt(signal.received_at)}</p>
        </div>

        <span className="font-mono text-lg text-[var(--accent)] shrink-0">
          {typeof score === "number" ? score.toFixed(2) : "—"}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--border-2)] p-4 space-y-4">
          {p.summary && <p className="text-sm text-[var(--text-2)]">{p.summary}</p>}

          {(p.top_events ?? []).length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)] mb-1.5">
                {t("signals.top_events")}
              </p>
              <ul className="space-y-1.5">
                {p.top_events.map((e, i) => (
                  <li key={i} className="text-sm text-[var(--text-2)] flex gap-2">
                    <span className="font-mono text-[11px] text-[var(--text-3)] shrink-0 mt-0.5">
                      {e.credibility_weight.toFixed(2)}
                    </span>
                    <span className="flex-1">
                      {e.summary}
                      {e.url && (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 ml-1.5 text-[var(--accent)] hover:underline"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          {e.source_name} <ExternalLink size={10} />
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(p.force_assessments ?? []).length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)] mb-1.5">
                {t("signals.forces")}
              </p>
              <div className="space-y-1">
                {p.force_assessments.map((f) => (
                  <div key={f.force} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-[var(--text-2)]">{f.force}</span>
                    <span className="h-1.5 w-24 rounded bg-[var(--surface-3)] overflow-hidden">
                      <span
                        className="block h-full bg-[var(--accent)]"
                        style={{ width: `${f.impact * 100}%` }}
                      />
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-3)] w-20 text-right">
                      {f.impact.toFixed(2)} / {f.uncertainty.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {signal.analyst_note && (
            <p className="text-sm text-[var(--text-3)] italic">
              {t("signals.note")}: {signal.analyst_note}
            </p>
          )}

          {pending && !dismissing && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAccept}
                disabled={accept.isPending}
                className="flex-1 bg-[var(--accent)] text-white text-sm rounded-lg py-2 hover:opacity-90 disabled:opacity-50"
              >
                {accept.isPending ? t("common.saving") : t("signals.accept")}
              </button>
              <button
                onClick={() => setDismissing(true)}
                className="px-4 bg-[var(--surface-2)] text-[var(--text-2)] text-sm rounded-lg py-2 hover:bg-[var(--surface-3)]"
              >
                {t("signals.dismiss")}
              </button>
            </div>
          )}

          {pending && dismissing && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-[var(--text-2)]">{t("signals.dismiss_kind")}</p>
              <div className="grid gap-1.5">
                {(
                  [
                    ["off_topic", "signals.dismiss_off_topic", "signals.dismiss_off_topic_hint"],
                    ["false_signal", "signals.dismiss_false", "signals.dismiss_false_hint"],
                  ] as const
                ).map(([kind, label, hint]) => (
                  <button
                    key={kind}
                    onClick={() => setDismissKind(kind)}
                    className={`rounded-lg border px-3 py-2 text-left ${
                      dismissKind === kind
                        ? "border-[var(--accent)] bg-[var(--surface-3)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)]"
                    }`}
                  >
                    <span className="block text-sm text-[var(--text)]">{t(label)}</span>
                    <span className="block text-[11px] text-[var(--text-3)]">{t(hint)}</span>
                  </button>
                ))}
              </div>
              <input
                autoFocus
                placeholder={t("signals.dismiss_reason_placeholder")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => dismiss.mutate({ id: signal.id, reason, verdict: dismissKind })}
                  disabled={!reason.trim() || dismiss.isPending}
                  className="flex-1 bg-red-500/80 text-white text-sm rounded-lg py-2 hover:bg-red-500 disabled:opacity-50"
                >
                  {dismiss.isPending ? t("common.saving") : t("signals.confirm_dismiss")}
                </button>
                <button
                  onClick={() => setDismissing(false)}
                  className="px-4 bg-[var(--surface-2)] text-[var(--text-2)] text-sm rounded-lg py-2 hover:bg-[var(--surface-3)]"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}

          {signal.investigation_case_id && (
            <button
              onClick={() => router.push(`/investigation/${signal.investigation_case_id}`)}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              {t("signals.open_case")} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SignalsInboxPage() {
  const t = useT();
  const [tab, setTab] = useState<SignalStatus | "all">("pending_review");
  const { data, isLoading } = useSignals(tab === "all" ? undefined : tab);
  const signals = data?.items ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title={t("signals.title")} />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-3xl mx-auto space-y-4">
          <p className="text-[11px] text-[var(--text-3)]">{t("signals.subtitle")}</p>

          <div className="flex gap-1">
            {TABS.map(({ key, labelKey }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  tab === key
                    ? "bg-[var(--surface-3)] text-[var(--text)]"
                    : "text-[var(--text-3)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {t(labelKey as never)}
              </button>
            ))}
          </div>

          {isLoading && <p className="text-sm text-[var(--text-3)]">{t("common.loading")}</p>}

          {!isLoading && signals.length === 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-10 text-center">
              <p className="text-sm text-[var(--text-2)]">{t("signals.empty")}</p>
              <p className="text-[11px] text-[var(--text-3)] mt-1">{t("signals.empty_hint")}</p>
            </div>
          )}

          <div className="space-y-2">
            {signals.map((s) => (
              <SignalRow key={s.id} signal={s} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
