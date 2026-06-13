"use client";

import { Bell } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";

interface TopbarProps {
  title: string;
  subtitle?: string;
  breadcrumb?: React.ReactNode;
  badge?: { text: string; variant?: "warning" | "info" };
}

export function Topbar({ title, subtitle, breadcrumb, badge }: TopbarProps) {
  const { role } = useAuthStore();

  return (
    <header className="h-14 flex items-center justify-between px-5 bg-[var(--surface)] border-b border-[var(--border)] shrink-0">
      <div className="flex flex-col justify-center">
        {breadcrumb && <div className="mb-0.5">{breadcrumb}</div>}
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-[var(--text)] leading-tight">{title}</h1>
          {subtitle && <span className="text-xs text-[var(--text-3)]">· {subtitle}</span>}
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              badge.variant === "warning" ? "text-[var(--yellow)] bg-[var(--yellow)]/10 border border-[var(--yellow)]/20" : "text-[var(--accent)] bg-[var(--accent)]/10"
            }`}>{badge.text}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="p-1.5 rounded hover:bg-[var(--surface-3)] text-[var(--text-2)] relative">
          <Bell size={16} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[var(--accent)]/20 flex items-center justify-center">
            <span className="text-xs text-[var(--accent)] font-medium uppercase">
              {role?.charAt(0) ?? "A"}
            </span>
          </div>
          <span className="text-xs text-[var(--text-2)] capitalize">{role}</span>
        </div>
      </div>
    </header>
  );
}
