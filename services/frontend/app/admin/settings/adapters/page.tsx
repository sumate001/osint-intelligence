"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Topbar } from "@/components/layout/Topbar";
import {
  listSources,
  createSource,
  updateSource,
  deleteSource,
  triggerSource,
  type Source,
  type SourceCreate,
} from "@/lib/api/admin";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { Plus, Play, Trash2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const rssSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อ"),
  feed_url: z.string().url("URL ไม่ถูกต้อง"),
  source_weight: z.number().min(0.1).max(2).default(1.0),
  verified_source: z.boolean().default(false),
  admiralty_source_code: z.enum(["A", "B", "C", "D", "E", "F"]).default("C"),
  poll_interval_seconds: z.number().min(60).max(86400).default(300),
});

type RSSFormData = z.infer<typeof rssSchema>;

const ADMIRALTY_CODES = ["A", "B", "C", "D", "E", "F"] as const;
const ADMIRALTY_LABELS = {
  A: "A — Completely reliable",
  B: "B — Usually reliable",
  C: "C — Fairly reliable",
  D: "D — Not usually reliable",
  E: "E — Unreliable",
  F: "F — Cannot be judged",
};

function SourceHealthIcon({ source }: { source: Source }) {
  if (!source.is_active) return <XCircle size={14} className="text-[var(--text-3)]" />;
  if (source.last_error) return <AlertCircle size={14} className="text-[var(--yellow)]" />;
  if (source.last_fetched_at) return <CheckCircle size={14} className="text-[var(--green)]" />;
  return <AlertCircle size={14} className="text-[var(--text-3)]" />;
}

function AddSourceModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: SourceCreate) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RSSFormData>({
    resolver: zodResolver(rssSchema),
    defaultValues: {
      source_weight: 1.0,
      verified_source: false,
      admiralty_source_code: "C",
      poll_interval_seconds: 300,
    },
  });

  const onSubmit = (data: RSSFormData) => {
    onSave({
      name: data.name,
      adapter_type: "rss",
      config: { feed_url: data.feed_url },
      source_weight: data.source_weight,
      verified_source: data.verified_source,
      admiralty_source_code: data.admiralty_source_code,
      poll_interval_seconds: data.poll_interval_seconds,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 className="text-base font-semibold text-[var(--text)] mb-4">เพิ่ม RSS Feed</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="ชื่อแหล่งข่าว" error={errors.name?.message}>
            <input {...register("name")} placeholder="เช่น Bangkok Post RSS" className={inputCls} />
          </Field>

          <Field label="Feed URL" error={errors.feed_url?.message}>
            <input
              {...register("feed_url")}
              placeholder="https://example.com/rss"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Source Weight (0.1-2.0)" error={errors.source_weight?.message}>
              <input
                {...register("source_weight", { valueAsNumber: true })}
                type="number"
                step="0.1"
                min="0.1"
                max="2"
                className={inputCls}
              />
            </Field>

            <Field label="Poll Interval (วินาที)" error={errors.poll_interval_seconds?.message}>
              <input
                {...register("poll_interval_seconds", { valueAsNumber: true })}
                type="number"
                min="60"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Admiralty Source Code" error={errors.admiralty_source_code?.message}>
            <select {...register("admiralty_source_code")} className={inputCls}>
              {ADMIRALTY_CODES.map((c) => (
                <option key={c} value={c}>
                  {ADMIRALTY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              {...register("verified_source")}
              type="checkbox"
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-2)]">Verified source (เชื่อถือได้)</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>
              ยกเลิก
            </button>
            <button type="submit" className={primaryBtn}>
              บันทึก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--text-2)] mb-1">{label}</label>
      {children}
      {error && <p className="text-[var(--red)] text-xs mt-0.5">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";
const primaryBtn =
  "px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-medium hover:opacity-90 transition-opacity";
const secondaryBtn =
  "px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-2)] rounded text-sm hover:border-[var(--border-2)] transition-colors";

export default function AdaptersPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: listSources,
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const createMut = useMutation({
    mutationFn: createSource,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      setShowAdd(false);
      showToast("เพิ่ม source สำเร็จ");
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateSource(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteSource,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      showToast("ลบ source แล้ว");
    },
  });

  const triggerMut = useMutation({
    mutationFn: triggerSource,
    onSuccess: () => showToast("Triggered — กำลัง fetch..."),
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Admin — Adapter Settings" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">Ingestion Sources</h2>
              <p className="text-xs text-[var(--text-2)] mt-0.5">
                จัดการ adapter ที่ดึงข้อมูลเข้าระบบ
              </p>
            </div>
            <button onClick={() => setShowAdd(true)} className={cn(primaryBtn, "flex items-center gap-2")}>
              <Plus size={14} />
              เพิ่ม RSS Feed
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-[var(--text-3)]">กำลังโหลด...</div>
          ) : sources.length === 0 ? (
            <div className="text-center py-12 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
              <p className="text-[var(--text-3)] text-sm">ยังไม่มี source — คลิก "เพิ่ม RSS Feed" เพื่อเริ่ม</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onToggle={() =>
                    toggleMut.mutate({ id: source.id, is_active: !source.is_active })
                  }
                  onDelete={() => deleteMut.mutate(source.id)}
                  onTrigger={() => triggerMut.mutate(source.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddSourceModal
          onClose={() => setShowAdd(false)}
          onSave={(data) => createMut.mutate(data)}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text)] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function SourceRow({
  source,
  onToggle,
  onDelete,
  onTrigger,
}: {
  source: Source;
  onToggle: () => void;
  onDelete: () => void;
  onTrigger: () => void;
}) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const successRate =
    source.success_count + source.error_count > 0
      ? Math.round((source.success_count / (source.success_count + source.error_count)) * 100)
      : null;

  return (
    <div
      className={cn(
        "bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4",
        !source.is_active && "opacity-60"
      )}
    >
      <div className="flex items-start gap-4">
        <SourceHealthIcon source={source} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm text-[var(--text)]">{source.name}</span>
            <span className="text-[10px] font-mono border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-3)]">
              {source.adapter_type}
            </span>
            <span className="text-[10px] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-3)]">
              {source.admiralty_source_code}
            </span>
            {source.verified_source && (
              <span className="text-[10px] text-[var(--green)]">✓ Verified</span>
            )}
          </div>

          <div className="text-xs text-[var(--text-3)] font-mono truncate mb-2">
            {(source.config?.feed_url as string) || JSON.stringify(source.config).slice(0, 80)}
          </div>

          <div className="flex items-center gap-4 text-[10px] text-[var(--text-3)]">
            <span>Weight: <span className="text-[var(--text-2)]">{source.source_weight}</span></span>
            <span>Interval: <span className="text-[var(--text-2)]">{source.poll_interval_seconds}s</span></span>
            {source.last_fetched_at && (
              <span>Last fetch: <span className="text-[var(--text-2)]">{formatDate(source.last_fetched_at, "dd MMM HH:mm")}</span></span>
            )}
            {successRate !== null && (
              <span>
                Success:{" "}
                <span
                  className={cn(
                    successRate >= 80 ? "text-[var(--green)]" : successRate >= 50 ? "text-[var(--yellow)]" : "text-[var(--red)]"
                  )}
                >
                  {successRate}%
                </span>
              </span>
            )}
          </div>

          {source.last_error && (
            <div className="mt-2 text-[10px] text-[var(--red)] bg-[var(--red)]/5 rounded px-2 py-1 truncate">
              Error: {source.last_error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onTrigger}
            className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--accent)]"
            title="Fetch now"
          >
            <Play size={14} />
          </button>

          <button
            onClick={onToggle}
            className={cn(
              "px-2 py-1 rounded text-xs font-medium border transition-colors",
              source.is_active
                ? "border-[var(--border)] text-[var(--text-2)] hover:border-[var(--red)] hover:text-[var(--red)]"
                : "border-[var(--green)]/30 text-[var(--green)]"
            )}
          >
            {source.is_active ? "Pause" : "Resume"}
          </button>

          {showConfirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onDelete();
                  setShowConfirmDelete(false);
                }}
                className="px-2 py-1 bg-[var(--red)]/20 border border-[var(--red)]/30 rounded text-xs text-[var(--red)]"
              >
                ยืนยัน
              </button>
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-2 py-1 rounded text-xs text-[var(--text-3)] hover:text-[var(--text)]"
              >
                ยกเลิก
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmDelete(true)}
              className="p-1.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--red)]"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
