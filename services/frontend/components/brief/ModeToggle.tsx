"use client";

import { cn } from "@/lib/utils/cn";
import type { BriefMode } from "@/lib/types/brief";

interface Props {
  mode: BriefMode;
  onChange: (mode: BriefMode) => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg">
      <span className="text-xs text-[var(--text-2)]">โหมด:</span>
      <div className="flex gap-2">
        {(["INTERNAL", "PUBLIC"] as BriefMode[]).map((m) => (
          <button
            key={m}
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors",
              mode === m
                ? m === "INTERNAL"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--green)] text-white"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            )}
          >
            {m === "INTERNAL" ? "Internal" : "Public"}
          </button>
        ))}
      </div>
      <span
        className={cn(
          "ml-auto text-[9px] font-mono px-2 py-0.5 rounded",
          mode === "INTERNAL"
            ? "bg-[var(--accent)]/10 text-[var(--accent)]"
            : "bg-[var(--green)]/10 text-[var(--green)]"
        )}
      >
        {mode}
      </span>
    </div>
  );
}
