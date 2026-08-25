"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";

import { useDeleteSignalProfile, useSignalProfiles } from "@/lib/hooks/useSignals";
import { useT } from "@/lib/hooks/useT";
import type { SignalProfile } from "@/lib/types/signals";

/**
 * The beats this newsroom follows, as a row of boxes to open.
 *
 * Only shown inside the "what we are following" view — the other view is what
 * arrived that nobody asked for, and a beat selector there would mean nothing.
 * Defining a beat is a different act from browsing them, so it is a button here
 * and a panel of its own, not a form stapled to the end of this list.
 */

export function BeatBar({
  selected,
  onSelect,
  onNew,
  onEdit,
}: {
  selected: string;
  onSelect: (profileId: string) => void;
  onNew: () => void;
  onEdit: (profile: SignalProfile) => void;
}) {
  const t = useT();
  const { data: profiles = [] } = useSignalProfiles();
  const remove = useDeleteSignalProfile();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {profiles.map((profile) => {
        const on = selected === profile.id;
        return (
          <span
            key={profile.id}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${
              on
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/15"
                : "border-[var(--border)] bg-[var(--surface-2)]"
            }`}
          >
            <button
              onClick={() => onSelect(profile.id)}
              className={`text-sm ${on ? "text-[var(--accent)]" : "text-[var(--text-2)]"}`}
            >
              {profile.name}
              {profile.pending > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-[var(--text-3)]">
                  {profile.pending}
                </span>
              )}
            </button>
            {/* Editing and deleting appear only on the beat being looked at:
                they act on it, and offering them on every chip invites the
                wrong one being clicked. */}
            {on && (
              <>
                <button
                  onClick={() => onEdit(profile)}
                  title={t("signals.profile_edit")}
                  className="text-[var(--text-3)] hover:text-[var(--text)]"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => remove.mutate(profile.id)}
                  title={t("signals.profile_delete_hint")}
                  className="text-[var(--text-3)] hover:text-[var(--red)]"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </span>
        );
      })}

      <button
        onClick={onNew}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[var(--border-2)] px-3 py-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text-2)]"
      >
        <Plus size={13} />
        {t("signals.profile_new")}
      </button>
    </div>
  );
}
