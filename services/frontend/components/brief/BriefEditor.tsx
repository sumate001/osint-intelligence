"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2, CheckCircle2, AlertTriangle, XCircle, Link2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Brief, BriefSection, BriefItem, BriefMode, SectionType } from "@/lib/types/brief";
import { useUpdateBrief } from "@/lib/hooks/useBrief";
const uuid = () => crypto.randomUUID();

interface Props {
  brief: Brief;
}

const SECTION_DEFAULTS: { type: SectionType; title: string }[] = [
  { type: "findings_verified", title: "FINDINGS — VERIFIED ✓" },
  { type: "findings_unverified", title: "UNVERIFIED — ห้าม PUBLISH" },
  { type: "missing_links", title: "MISSING LINKS" },
];

const SECTION_ICONS: Record<SectionType, React.ReactNode> = {
  findings_verified: <CheckCircle2 size={13} className="text-[var(--green)]" />,
  findings_unverified: <AlertTriangle size={13} className="text-[var(--yellow)]" />,
  missing_links: <Link2 size={13} className="text-[var(--text-2)]" />,
  methodology: <CheckCircle2 size={13} className="text-[var(--text-2)]" />,
};

function SectionBlock({
  section,
  publicMode,
  onChange,
  onDelete,
}: {
  section: BriefSection;
  publicMode: boolean;
  onChange: (s: BriefSection) => void;
  onDelete: () => void;
}) {
  const [newText, setNewText] = useState("");

  const addItem = () => {
    if (!newText.trim()) return;
    const item: BriefItem = {
      id: uuid(),
      text: newText.trim(),
      verified: section.type === "findings_verified",
      sources: [],
    };
    onChange({ ...section, items: [...section.items, item] });
    setNewText("");
  };

  const removeItem = (id: string) =>
    onChange({ ...section, items: section.items.filter((i) => i.id !== id) });

  const toggleVerified = (id: string) =>
    onChange({
      ...section,
      items: section.items.map((i) => (i.id === id ? { ...i, verified: !i.verified } : i)),
    });

  const visibleItems = publicMode && section.type === "findings_unverified"
    ? []
    : publicMode
    ? section.items.filter((i) => i.verified)
    : section.items;

  if (publicMode && (section.type === "findings_unverified" || section.type === "missing_links")) {
    return null;
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          {SECTION_ICONS[section.type]}
          <p className="text-[10px] font-mono font-semibold text-[var(--text-3)] tracking-widest">{section.title}</p>
        </div>
        {!publicMode && (
          <button onClick={onDelete} className="text-[var(--text-3)] hover:text-[var(--red)]">
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {visibleItems.map((item) => (
          <div key={item.id} className="flex items-start gap-2 group">
            <button
              onClick={() => toggleVerified(item.id)}
              disabled={publicMode}
              className={cn(
                "shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] transition-colors",
                item.verified ? "bg-[var(--green)]/20 text-[var(--green)]" : "bg-[var(--yellow)]/20 text-[var(--yellow)]"
              )}
            >
              {item.verified ? "✓" : "⚠"}
            </button>
            <p className="flex-1 text-xs text-[var(--text-2)] leading-relaxed">{item.text}</p>
            {!publicMode && (
              <button onClick={() => removeItem(item.id)} className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-3)] hover:text-[var(--red)] transition-opacity">
                <XCircle size={12} />
              </button>
            )}
          </div>
        ))}

        {publicMode && section.items.filter((i) => !i.verified).length > 0 && (
          <p className="text-[10px] text-[var(--text-3)] italic">
            {section.items.filter((i) => !i.verified).length} claim(s) ถูกซ่อน — pending verification
          </p>
        )}
      </div>

      {!publicMode && (
        <div className="flex gap-2 pt-1">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="เพิ่มรายการ..."
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2.5 py-1 text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
          />
          <button
            onClick={addItem}
            className="flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--text)] px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded transition-colors"
          >
            <Plus size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

export function BriefEditor({ brief }: Props) {
  const [sections, setSections] = useState<BriefSection[]>(brief.sections);
  const [summary, setSummary] = useState(brief.summary ?? "");
  const [dirty, setDirty] = useState(false);
  const publicMode = brief.mode === "PUBLIC";
  const update = useUpdateBrief(brief.id);

  const handleSectionChange = useCallback((idx: number, s: BriefSection) => {
    setSections((prev) => prev.map((sec, i) => (i === idx ? s : sec)));
    setDirty(true);
  }, []);

  const handleSectionDelete = useCallback((idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }, []);

  const addSection = (type: SectionType) => {
    const def = SECTION_DEFAULTS.find((d) => d.type === type);
    if (!def) return;
    setSections((prev) => [
      ...prev,
      { id: uuid(), type: def.type, title: def.title, items: [] },
    ]);
    setDirty(true);
  };

  const save = async () => {
    await update.mutateAsync({ sections, summary: summary || undefined });
    setDirty(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary */}
      <div className="px-5 pt-4 pb-2 shrink-0">
        {publicMode && (
          <div className="flex items-center gap-2 text-xs text-[var(--yellow)] border border-[var(--yellow)]/30 bg-[var(--yellow)]/5 rounded-lg px-3 py-2 mb-3">
            <AlertTriangle size={12} />
            Public mode — verified ≥ 3 แหล่งเท่านั้น
          </div>
        )}
        <textarea
          value={summary}
          onChange={(e) => { setSummary(e.target.value); setDirty(true); }}
          readOnly={publicMode}
          rows={2}
          placeholder="สรุป brief..."
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none"
        />
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
        {sections.map((s, i) => (
          <SectionBlock
            key={s.id}
            section={s}
            publicMode={publicMode}
            onChange={(updated) => handleSectionChange(i, updated)}
            onDelete={() => handleSectionDelete(i)}
          />
        ))}

        {!publicMode && (
          <div className="flex gap-2 flex-wrap">
            {SECTION_DEFAULTS.map((d) => (
              <button
                key={d.type}
                onClick={() => addSection(d.type)}
                className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-[var(--text-2)] border border-dashed border-[var(--border)] rounded-lg px-3 py-1.5 transition-colors"
              >
                <Plus size={10} />
                {d.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Save bar */}
      {dirty && !publicMode && (
        <div className="px-5 py-2 border-t border-[var(--border)] shrink-0 flex justify-end gap-2">
          <button
            onClick={() => { setSections(brief.sections); setSummary(brief.summary ?? ""); setDirty(false); }}
            className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] px-3 py-1.5"
          >
            ยกเลิก
          </button>
          <button
            onClick={save}
            disabled={update.isPending}
            className="text-xs bg-[var(--accent)] text-white px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {update.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      )}
    </div>
  );
}
