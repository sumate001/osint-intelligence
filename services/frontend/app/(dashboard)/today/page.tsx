"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, Layers, RefreshCw } from "lucide-react";

import { Topbar } from "@/components/layout/Topbar";
import { useT } from "@/lib/hooks/useT";
import { useHorizonFeed, useHorizonFeedCounts } from "@/lib/hooks/useHorizonFeed";
import type { HorizonEvent, TriageVerdict } from "@/lib/types/feed";

/**
 * The inbound stream, read from Horizon.
 *
 * OSINT//DESK used to poll RSS and score each article itself. Horizon owns all
 * of that now, so this page displays *events* — stories already deduplicated
 * across outlets — rather than a raw article list. That is why a row can say
 * "confirmed by 4 sources": in the old feed those were four separate rows.
 */

const TABS: (TriageVerdict | "ALL")[] = [
  "ALL",
  "PRIORITY",
  "FAST_TRACK",
  "INVESTIGATE",
  "PASS",
];

const VERDICT_TONE: Record<TriageVerdict, string> = {
  PRIORITY: "bg-red-500/15 text-red-400",
  FAST_TRACK: "bg-amber-500/15 text-amber-400",
  INVESTIGATE: "bg-blue-500/15 text-blue-400",
  PASS: "bg-[var(--surface-3)] text-[var(--text-3)]",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EventRow({ event }: { event: HorizonEvent }) {
  const t = useT();
  const verdict = event.triage.verdict;

  return (
    <article className="rounded-xl border border-[var(--border-2)] bg-[var(--surface)] p-4">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {verdict && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${VERDICT_TONE[verdict]}`}>
            {verdict}
          </span>
        )}
        {event.categories.map((c) => (
          <span
            key={c}
            className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px] text-[var(--text-2)]"
          >
            {c}
          </span>
        ))}

        {/* The number that separates this from a raw RSS list: how many
            independent outlets carried the same story. */}
        {event.source_count > 1 && (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-400">
            <Layers size={10} />
            {event.source_count} แหล่งยืนยัน
          </span>
        )}
        {event.updates > 0 && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-400">
            อัปเดต {event.updates} ครั้ง
          </span>
        )}
        {event.incomplete && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-3)]">
            <AlertTriangle size={10} />
            ข้อมูลไม่ครบ
          </span>
        )}

        <span className="ml-auto font-mono text-sm text-[var(--text-2)]">
          {event.triage.total?.toFixed(2) ?? "—"}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text)]">{event.summary}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-3)]">
        {event.url ? (
          <a
            href={event.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
          >
            {event.source_name || "-"} <ExternalLink size={10} />
          </a>
        ) : (
          <span>{event.source_name || "-"}</span>
        )}
        {event.location && <span>{event.location}</span>}
        <span>เวลาเหตุการณ์: {fmt(event.event_time)}</span>
        {event.cluster_id && <span className="text-[var(--accent)]">อยู่ในกลุ่มเรื่อง</span>}
      </div>
    </article>
  );
}

export default function TodayPage() {
  const t = useT();
  const [verdict, setVerdict] = useState<TriageVerdict | "ALL">("ALL");
  const [order, setOrder] = useState<"recent" | "score">("recent");

  const { data, isLoading, isFetching, refetch } = useHorizonFeed({
    verdict: verdict === "ALL" ? undefined : verdict,
    order,
  });
  const { data: counts } = useHorizonFeedCounts();

  const items = data?.items ?? [];
  const unavailable = data && !data.available;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar title={t("today.title")} />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-3xl space-y-4">
          <p className="text-[11px] text-[var(--text-3)]">
            กระแสข่าวขาเข้าจาก Horizon — รวมข่าวซ้ำแล้ว หนึ่งแถวคือหนึ่งเหตุการณ์ ไม่ใช่หนึ่งบทความ
          </p>

          <div className="flex flex-wrap items-center gap-1">
            {TABS.map((v) => (
              <button
                key={v}
                onClick={() => setVerdict(v)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  verdict === v
                    ? "bg-[var(--surface-3)] text-[var(--text)]"
                    : "text-[var(--text-3)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {v === "ALL" ? t("common.all") : v}
                {counts?.counts?.[v] != null && (
                  <span className="ml-1.5 font-mono text-[11px] opacity-60">
                    {counts.counts[v]}
                  </span>
                )}
              </button>
            ))}

            <button
              onClick={() => setOrder(order === "recent" ? "score" : "recent")}
              className="ml-auto rounded-lg px-3 py-1.5 text-sm text-[var(--text-3)] hover:bg-[var(--surface-2)]"
            >
              {order === "recent" ? "เรียงตามเวลา" : "เรียงตามคะแนน"}
            </button>
            <button
              onClick={() => refetch()}
              className="rounded-lg p-2 text-[var(--text-3)] hover:bg-[var(--surface-2)]"
              title={t("common.refresh")}
            >
              <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Horizon being down is an empty state, not an error page — the rest
              of the workspace keeps working without it. */}
          {unavailable && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200/90">
              ยังไม่ได้รับข้อมูลจาก Horizon — ตรวจว่า HORIZON_BASE_URL ตั้งค่าไว้และระบบทำงานอยู่
            </div>
          )}

          {isLoading && <p className="text-sm text-[var(--text-3)]">{t("common.loading")}</p>}

          {!isLoading && !unavailable && items.length === 0 && (
            <div className="rounded-xl border border-[var(--border-2)] bg-[var(--surface)] p-10 text-center">
              <p className="text-sm text-[var(--text-2)]">ยังไม่มีเหตุการณ์ในกระแสนี้</p>
            </div>
          )}

          <div className="space-y-2">
            {items.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
