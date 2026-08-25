"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { useCreateSignalProfile, useDeleteSignalProfile, useSignalProfiles } from "@/lib/hooks/useSignals";
import { useT } from "@/lib/hooks/useT";

/**
 * What this newsroom has said it is watching.
 *
 * Horizon pushes every signal its detectors surface, because it has no idea
 * what any particular newsroom covers — and it should not: editorial priorities
 * change weekly and belong on this side. Without somewhere to say so, the inbox
 * mixed the story an editor was waiting for with a football final, and the only
 * way to clear the football was to dismiss it.
 *
 * The description is the load-bearing field. Categories are Horizon's own labels
 * and settle most signals for free, but a subject like "เหตุการณ์ไม่สงบในภาคใต้"
 * is not a category — a clash in Narathiwat arrived labelled ต่างประเทศ and only
 * the description put it in the right box.
 */

/** Horizon's closed label set. Offered as toggles rather than free text because
 * a typo here would silently never match anything. */
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

export function SignalProfiles() {
  const t = useT();
  const { data: profiles = [] } = useSignalProfiles();
  const create = useCreateSignalProfile();
  const remove = useDeleteSignalProfile();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  const canSave = name.trim().length > 0 && description.trim().length > 0;

  function save() {
    if (!canSave) return;
    create.mutate(
      { name: name.trim(), description: description.trim(), categories, active: true },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          setCategories([]);
        },
      },
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm text-[var(--text)]">{t("signals.profiles_title")}</span>
        <span className="text-[11px] text-[var(--text-3)]">
          {profiles.length > 0
            ? t("signals.profiles_count").replace("{n}", String(profiles.length))
            : t("signals.profiles_none")}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-[var(--border)] px-4 py-3">
          <p className="text-[11px] text-[var(--text-3)]">{t("signals.profiles_hint")}</p>

          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-start gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text)]">{profile.name}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-2)]">{profile.description}</p>
                {profile.categories.length > 0 && (
                  <p className="mt-1 text-[10px] text-[var(--text-3)]">
                    {profile.categories.join(" · ")}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-mono text-[11px] text-[var(--text-3)]">
                {profile.pending}
              </span>
              <button
                onClick={() => remove.mutate(profile.id)}
                title={t("signals.profile_delete_hint")}
                className="shrink-0 text-[var(--text-3)] hover:text-[var(--red)]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <div className="space-y-2 rounded-lg border border-dashed border-[var(--border-2)] px-3 py-3">
            <input
              placeholder={t("signals.profile_name_placeholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
            />
            <textarea
              rows={3}
              placeholder={t("signals.profile_question_placeholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
            />
            <p className="text-[10px] text-[var(--text-3)]">{t("signals.profile_question_hint")}</p>

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

            <button
              onClick={save}
              disabled={!canSave || create.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              <Plus size={14} />
              {create.isPending ? t("common.saving") : t("signals.profile_add")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
