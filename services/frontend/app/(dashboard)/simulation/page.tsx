"use client";

import Link from "next/link";
import { Zap, RefreshCw } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { useSimulations } from "@/lib/hooks/useSimulation";
import { useCases } from "@/lib/hooks/useCase";
import { cn } from "@/lib/utils/cn";

export default function SimulationListPage() {
  const { data: jobs = [], isLoading } = useSimulations();
  const { data: casesData } = useCases();
  const cases = casesData?.items ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Scenario Simulation" subtitle="MiroFish Engine" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Start from a case */}
        <div>
          <p className="text-xs text-[var(--text-3)] uppercase tracking-wider font-medium mb-3">เลือก Case เพื่อเริ่ม Simulation</p>
          {cases.length === 0 ? (
            <p className="text-sm text-[var(--text-3)]">ยังไม่มี case — ไปที่ Investigation เพื่อสร้าง case ก่อน</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-w-2xl">
              {cases.map((c) => (
                <Link
                  key={c.id}
                  href={`/simulation/${c.id}`}
                  className="flex items-center gap-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--purple)] hover:bg-[var(--surface-3)] transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--purple)]/10 flex items-center justify-center shrink-0 group-hover:bg-[var(--purple)]/20">
                    <Zap size={14} className="text-[var(--purple)]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--text)] truncate">{c.title}</p>
                    <p className="text-[10px] text-[var(--text-3)]">{c.status}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent jobs */}
        {jobs.length > 0 && (
          <div>
            <p className="text-xs text-[var(--text-3)] uppercase tracking-wider font-medium mb-3">Simulation ล่าสุด</p>
            <div className="space-y-2 max-w-2xl">
              {isLoading ? (
                <RefreshCw size={16} className="animate-spin text-[var(--text-3)]" />
              ) : (
                jobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/simulation/${j.case_id ?? j.id}`}
                    className="flex items-center justify-between bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-2.5 hover:border-[var(--border-2)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        j.status === "DONE" ? "text-[var(--green)] bg-[var(--green)]/10" :
                        j.status === "RUNNING" ? "text-[var(--yellow)] bg-[var(--yellow)]/10" :
                        j.status === "FAILED" ? "text-[var(--red)] bg-[var(--red)]/10" :
                        "text-[var(--text-3)] bg-[var(--surface-3)]"
                      )}>{j.status}</span>
                      <span className="text-xs text-[var(--text)]">
                        {(j.config as Record<string, unknown>)?.agents?.toString()} agents ·{" "}
                        {(j.config as Record<string, unknown>)?.timeframe?.toString()}d
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--text-3)]">
                      {new Date(j.created_at).toLocaleDateString("th-TH")}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
