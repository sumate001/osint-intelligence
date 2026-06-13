"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderOpen, Clock, CheckCircle, Archive } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { useCases, useCreateCase } from "@/lib/hooks/useCase";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import type { CaseStatus } from "@/lib/types/investigation";
import { useT } from "@/lib/hooks/useT";

const STATUS_COLORS: Record<CaseStatus, string> = {
  ACTIVE: "text-[var(--accent)]",
  CLOSED: "text-[var(--green)]",
  ARCHIVED: "text-[var(--text-3)]",
};

const STATUS_ICONS: Record<CaseStatus, React.ReactNode> = {
  ACTIVE: <FolderOpen size={14} />,
  CLOSED: <CheckCircle size={14} />,
  ARCHIVED: <Archive size={14} />,
};

export default function InvestigationPage() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const t = useT();

  const { data, isLoading } = useCases();
  const createCase = useCreateCase();

  async function handleCreate() {
    if (!title.trim()) return;
    const c = await createCase.mutateAsync({ title: title.trim(), description });
    setShowCreate(false);
    setTitle("");
    setDescription("");
    router.push(`/investigation/${c.id}`);
  }

  const cases = data?.items ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title={t("investigation.title")} />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Create button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-[var(--accent)] text-white text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              <Plus size={15} />
              {t("investigation.new_case")}
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--text)]">{t("investigation.new_case")}</p>
              <input
                autoFocus
                placeholder={t("investigation.case_name_placeholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
              />
              <textarea
                placeholder={t("common.none")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!title.trim() || createCase.isPending}
                  className="flex-1 bg-[var(--accent)] text-white text-sm rounded-lg py-2 hover:opacity-90 disabled:opacity-50"
                >
                  {createCase.isPending ? t("common.saving") : t("common.create")}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 bg-[var(--surface-2)] text-[var(--text-2)] text-sm rounded-lg py-2 hover:bg-[var(--surface-3)]"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}

          {/* Case list */}
          {isLoading ? (
            <div className="text-center py-12 text-[var(--text-3)] text-sm">{t("common.loading")}</div>
          ) : cases.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-3)]">
              <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t("investigation.no_cases")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/investigation/${c.id}`)}
                  className="w-full text-left bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-2)] hover:bg-[var(--surface-2)] rounded-xl p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate">{c.title}</p>
                      {c.description && (
                        <p className="text-xs text-[var(--text-2)] mt-0.5 line-clamp-1">{c.description}</p>
                      )}
                    </div>
                    <div className={cn("flex items-center gap-1 text-xs shrink-0", STATUS_COLORS[c.status])}>
                      {STATUS_ICONS[c.status]}
                      {c.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-[10px] text-[var(--text-3)]">
                    <Clock size={9} />
                    {formatDate(c.created_at)}
                    {c.tags.length > 0 && (
                      <span className="ml-2 flex gap-1">
                        {c.tags.map((tag) => (
                          <span key={tag} className="bg-[var(--surface-3)] px-1.5 py-0.5 rounded text-[9px]">
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
