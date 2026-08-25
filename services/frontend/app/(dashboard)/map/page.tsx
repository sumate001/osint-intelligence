"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, RefreshCw } from "lucide-react";

import { Topbar } from "@/components/layout/Topbar";
import { apiFetch } from "@/lib/api/client";
import { useSignalProfiles } from "@/lib/hooks/useSignals";
import { useT } from "@/lib/hooks/useT";
import type { MapOut } from "@/lib/types/map";

/**
 * The newsroom map.
 *
 * Horizon has extracted a place for four out of five events since the beginning
 * and it reached nobody until the field was added to the shared contract. This
 * is what that data is for: one view across every beat, or one beat at a time.
 */

// Leaflet reaches for `window` at import time, so it cannot be server-rendered.
const NewsroomMap = dynamic(
  () => import("@/components/map/NewsroomMap").then((m) => m.NewsroomMap),
  { ssr: false, loading: () => <div className="h-[520px] rounded-xl bg-[var(--surface-2)]" /> },
);

const RANGES = [7, 30, 90] as const;

export default function MapPage() {
  const t = useT();
  const [beat, setBeat] = useState<string>("");
  const [days, setDays] = useState<number>(30);
  const { data: profiles = [] } = useSignalProfiles();

  const { data, isLoading, refetch, isFetching } = useQuery<MapOut>({
    queryKey: ["map", beat, days],
    queryFn: () =>
      apiFetch<MapOut>("/api/v1/map", {
        params: { days, ...(beat ? { profile_id: beat } : {}) },
      }),
  });

  const points = data?.points ?? [];
  const located = points.reduce((n, p) => n + p.count, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar title={t("map.title")} />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-5xl space-y-4">
          <p className="text-[11px] text-[var(--text-3)]">{t("map.subtitle")}</p>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setBeat("")}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                beat === ""
                  ? "border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]"
              }`}
            >
              {t("map.all_beats")}
            </button>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setBeat(profile.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  beat === profile.id
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]"
                }`}
              >
                {profile.name}
              </button>
            ))}

            <span className="mx-1 h-4 w-px bg-[var(--border)]" />
            {RANGES.map((range) => (
              <button
                key={range}
                onClick={() => setDays(range)}
                className={`rounded-lg px-2.5 py-1.5 text-sm ${
                  days === range
                    ? "bg-[var(--surface-3)] text-[var(--text)]"
                    : "text-[var(--text-3)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {t("map.days").replace("{n}", String(range))}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="h-[520px] rounded-xl bg-[var(--surface-2)]" />
          ) : points.length > 0 ? (
            <NewsroomMap points={points} />
          ) : (
            <div className="rounded-xl border border-[var(--border-2)] bg-[var(--surface)] p-10 text-center">
              <MapPin size={20} className="mx-auto text-[var(--text-3)]" />
              <p className="mt-2 text-sm text-[var(--text-2)]">{t("map.empty")}</p>
              <p className="mt-1 text-[11px] text-[var(--text-3)]">{t("map.empty_hint")}</p>
            </div>
          )}

          {/* What the map is not showing, and why. A map quietly missing a third
              of the reporting is worse than one that says how much it is
              missing — the reader cannot tell the difference from the pins. */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-3)]">
            <span>
              {t("map.located")
                .replace("{events}", String(located))
                .replace("{places}", String(points.length))}
            </span>
            {(data?.unresolved_events ?? 0) > 0 && (
              <span title={data?.unresolved.join(" · ")}>
                {t("map.unlocated")
                  .replace("{events}", String(data?.unresolved_events))
                  .replace("{places}", String(data?.unresolved.length))}
              </span>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 hover:text-[var(--text-2)] disabled:opacity-40"
            >
              <RefreshCw size={11} />
              {t("common.refresh")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
