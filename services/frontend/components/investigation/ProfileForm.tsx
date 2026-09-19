"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useCreateSignalProfile, useUpdateSignalProfile } from "@/lib/hooks/useSignals";
import { useT } from "@/lib/hooks/useT";
import type { SignalProfile } from "@/lib/types/signals";

/**
 * Defining a beat, as its own panel.
 *
 * This used to be a form appended to the bottom of the list of profiles, which
 * read as one more profile rather than as a way to make one. It is a different
 * act from browsing beats, so it gets its own surface and is dismissed when done.
 */

/** Horizon's closed label set. Toggles rather than free text: a typo here would
 * silently never match anything. */
const CATEGORIES = [
  "การเมือง",
  "เศรษฐกิจ",
  "ความมั่นคง",
  "เทคโนโลยี",
  "สังคม",
  "สิ่งแวดล้อม",
  "ต่างประเทศ",
  "พลังงาน",
  "บันเทิง/กีฬา",
];

export function ProfileForm({
  editing,
  onClose,
}: {
  /** The profile being changed, or null when defining a new one. */
  editing: SignalProfile | null;
  onClose: () => void;
}) {
  const t = useT();
  const create = useCreateSignalProfile();
  const update = useUpdateSignalProfile();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setCategories(editing?.categories ?? []);
  }, [editing]);

  const canSave = name.trim().length > 0 && description.trim().length > 0;
  const busy = create.isPending || update.isPending;
  // Saving used to fail in silence: the panel stayed open with the text still in
  // it and nothing said why, which is indistinguishable from a dead button.
  const error = (create.error ?? update.error)?.message ?? null;

  function save() {
    if (!canSave) return;
    const data = { name: name.trim(), description: description.trim(), categories, active: true };
    if (editing) update.mutate({ id: editing.id, data }, { onSuccess: onClose });
    else create.mutate(data, { onSuccess: onClose });
  }

  return (
    <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--surface)] p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm text-[var(--text)]">
            {editing ? t("signals.profile_edit") : t("signals.profile_new")}
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">{t("signals.profiles_hint")}</p>
        </div>
        <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)]">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-[var(--text-2)]">{t("signals.profile_name")}</label>
        <input
          autoFocus
          placeholder={t("signals.profile_name_placeholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-[var(--text-2)]">{t("signals.profile_question")}</label>
        <textarea
          rows={3}
          placeholder={t("signals.profile_question_placeholder")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
        />
        <p className="text-[10px] text-[var(--text-3)]">{t("signals.profile_question_hint")}</p>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-[var(--text-2)]">{t("signals.profile_categories")}</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((category) => {
            const on = categories.includes(category);
            return (
              <button
                key={category}
                onClick={() =>
                  setCategories(
                    on ? categories.filter((c) => c !== category) : [...categories, category],
                  )
                }
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  on
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text-2)]"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--text-3)]">{t("signals.profile_categories_hint")}</p>
      </div>

      {error && (
        <p className="rounded-lg bg-[var(--red)]/10 px-3 py-2 text-[11px] text-[var(--red)]">
          {t("signals.profile_save_failed")} {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={!canSave || busy}
          className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {busy ? t("common.saving") : editing ? t("signals.profile_save") : t("signals.profile_add")}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-3)] hover:text-[var(--text)]"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
