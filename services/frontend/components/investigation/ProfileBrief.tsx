"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin, Sparkles } from "lucide-react";

import { apiFetch } from "@/lib/api/client";
import { useT } from "@/lib/hooks/useT";

/**
 * What has been happening on one beat.
 *
 * A filtered list answers "what arrived". Someone following a running story
 * needs "what happened, where, and what moved" — which is why clicking a profile
 * lands here rather than on a narrower list of the same cards.
 *
 * The timeline is assembled from the signals themselves and can be checked
 * against them. The reading underneath is the model's, and is labelled so, kept
 * visually apart from the part that is simply true.
 */

/** One move in the story, written by the model, citing the reports under it. */
type SituationStep = {
  when: string;
  change: string;
  /** Indices into `timeline` — what this sentence rests on. */
  refs: number[];
};

type BriefEvent = {
  when: string | null;
  summary: string;
  source_name: string;
  url: string;
  signal_id: string;
};

type Brief = {
  profile: { id: string; name: string; description: string };
  signals_total: number;
  timeline: BriefEvent[];
  situation: SituationStep[];
  places: string[];
  developments: string | null;
  sources: string[];
};

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProfileBrief({ profileId }: { profileId: string }) {
  const t = useT();
  const { data, isLoading } = useQuery<Brief>({
    queryKey: ["profile-brief", profileId],
    queryFn: () => apiFetch<Brief>(`/api/v1/signals/profiles/${profileId}/brief`),
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <p className="text-sm text-[var(--text-3)]">{t("common.loading")}</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div>
        <h2 className="text-sm text-[var(--text)]">{data.profile.name}</h2>
        <p className="mt-0.5 text-[11px] text-[var(--text-3)]">{data.profile.description}</p>
      </div>

      {data.places.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <MapPin size={12} className="text-[var(--text-3)]" />
          {data.places.map((place) => (
            <span
              key={place}
              className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--text-2)]"
            >
              {place}
            </span>
          ))}
        </div>
      )}

      {data.developments && (
        <div className="rounded-lg border-l-2 border-[var(--accent)] bg-[var(--surface-2)] px-3 py-2">
          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
            <Sparkles size={10} />
            {t("signals.brief_reading")}
          </p>
          <p className="text-sm text-[var(--text-2)]">{data.developments}</p>
        </div>
      )}

      {/* The reading comes first and the reports sit under it. Before this the
          page led with the reports in date order, which is a reading list — the
          editor still had to work out what had changed between one and the
          next, which is the whole job. */}
      {data.situation?.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
            <Sparkles size={10} />
            {t("signals.brief_situation")}
          </p>
          <ol className="space-y-2 border-l-2 border-[var(--accent)]/40 pl-3">
            {data.situation.map((step, i) => (
              <li key={i}>
                <p className="font-mono text-[10px] text-[var(--text-3)]">{step.when}</p>
                <p className="text-sm text-[var(--text)]">{step.change}</p>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {step.refs.map((ref) => {
                    const event = data.timeline[ref];
                    if (!event) return null;
                    return (
                      <a
                        key={ref}
                        href={event.url || undefined}
                        target="_blank"
                        rel="noreferrer"
                        title={event.summary}
                        className="text-[10px] text-[var(--accent)] hover:underline"
                      >
                        {event.source_name || t("signals.brief_source")}
                        <ExternalLink size={9} className="ml-0.5 inline" />
                      </a>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {data.timeline.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
            {t("signals.brief_timeline")}
          </p>
          <ul className="space-y-1.5 border-l border-[var(--border-2)] pl-3">
            {data.timeline.map((event, i) => (
              <li key={`${event.url}-${i}`} className="text-sm">
                <span className="font-mono text-[10px] text-[var(--text-3)]">
                  {when(event.when)}
                </span>
                <span className="ml-2 text-[var(--text-2)]">{event.summary}</span>
                {event.url && (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 inline-block text-[var(--accent)]"
                  >
                    <ExternalLink size={10} />
                  </a>
                )}
                {event.source_name && (
                  <span className="ml-1 text-[10px] text-[var(--text-3)]">
                    {event.source_name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[11px] text-[var(--text-3)]">{t("signals.brief_empty")}</p>
      )}

      {data.sources.length > 0 && (
        <p className="text-[10px] text-[var(--text-3)]">
          {t("signals.brief_sources")} {data.sources.join(" · ")}
        </p>
      )}
    </div>
  );
}
