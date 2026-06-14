"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Topbar } from "@/components/layout/Topbar";
import { useFeedStats } from "@/lib/hooks/useFeedItems";
import { useCases } from "@/lib/hooks/useCase";
import { useServiceHealth } from "@/lib/hooks/useAdmin";
import { useAdminSettings } from "@/lib/hooks/useAdmin";
import { useSystemLogs } from "@/lib/hooks/useAdmin";
import { useBriefs } from "@/lib/hooks/useBrief";
import { useSimulations } from "@/lib/hooks/useSimulation";
import { cn } from "@/lib/utils/cn";
import {
  Newspaper, Search, ShieldCheck, FileText, Zap,
  Globe, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  TrendingUp, Activity, Clock, ArrowRight, ChevronDown,
  Cpu, Database,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ที่แล้ว`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ที่แล้ว`;
  return `${Math.floor(h / 24)}d ที่แล้ว`;
}

// ─── Stat chip ───────────────────────────────────────────────────────────────

interface StatChipProps {
  label: string;
  value: React.ReactNode;
  color?: "red" | "yellow" | "accent" | "green" | "purple" | "default";
  href?: string;
}

function StatChip({ label, value, color = "default", href }: StatChipProps) {
  const colorMap = {
    red:     "bg-[var(--red)]/8    border-[var(--red)]/30    text-[var(--red)]",
    yellow:  "bg-[var(--yellow)]/8  border-[var(--yellow)]/30  text-[var(--yellow)]",
    accent:  "bg-[var(--accent)]/8  border-[var(--accent)]/30  text-[var(--accent)]",
    green:   "bg-[var(--green)]/8   border-[var(--green)]/30   text-[var(--green)]",
    purple:  "bg-[var(--purple)]/8  border-[var(--purple)]/30  text-[var(--purple)]",
    default: "bg-[var(--surface-2)] border-[var(--border)]     text-[var(--text)]",
  };
  const inner = (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
      colorMap[color],
      href && "hover:opacity-80 cursor-pointer"
    )}>
      <div>
        <p className="text-2xl font-bold font-mono leading-none">{value}</p>
        <p className="text-[10px] text-[var(--text-3)] mt-1 uppercase tracking-wide">{label}</p>
      </div>
      {href && <ArrowRight size={12} className="ml-auto opacity-40" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ─── Module card ─────────────────────────────────────────────────────────────

interface ModuleCardProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  metric: React.ReactNode;
  meta?: string;
  accent?: string;
  status?: "ok" | "warn" | "idle";
}

function ModuleCard({ icon, label, href, metric, meta, accent = "var(--accent)", status = "idle" }: ModuleCardProps) {
  const statusDot = {
    ok:   "bg-[var(--green)]",
    warn: "bg-[var(--yellow)] animate-pulse",
    idle: "bg-[var(--border-2)]",
  }[status];
  return (
    <Link href={href} className="group flex flex-col gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--border-2)] hover:bg-[var(--surface-2)] transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent }}>
            {icon}
          </div>
          <span className="text-xs font-medium text-[var(--text-2)]">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot)} />
          <ArrowRight size={12} className="text-[var(--text-3)] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <div>
        <div className="text-xl font-bold font-mono text-[var(--text)] leading-none">{metric}</div>
        {meta && <p className="text-[10px] text-[var(--text-3)] mt-1">{meta}</p>}
      </div>
    </Link>
  );
}

// ─── Service row (clickable) ──────────────────────────────────────────────────

function ServiceRow({ name, status, latency }: { name: string; status: "ok" | "error" | "unknown"; latency?: number | null }) {
  return (
    <Link
      href="/admin/settings?tab=health"
      className="flex items-center gap-2 py-1.5 hover:bg-[var(--surface-2)] -mx-4 px-4 rounded transition-colors group"
    >
      {status === "ok"
        ? <CheckCircle2 size={12} className="text-[var(--green)] shrink-0" />
        : status === "error"
        ? <XCircle size={12} className="text-[var(--red)] shrink-0" />
        : <AlertCircle size={12} className="text-[var(--text-3)] shrink-0" />}
      <span className={cn(
        "text-xs flex-1 truncate",
        status === "ok" ? "text-[var(--text-2)]" : status === "error" ? "text-[var(--red)]" : "text-[var(--text-3)]"
      )}>{name}</span>
      {latency != null && (
        <span className="text-[10px] font-mono text-[var(--text-3)]">{latency}ms</span>
      )}
      <ArrowRight size={10} className="text-[var(--text-3)] opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
    </Link>
  );
}

// ─── Autopilot pipeline strip (clickable) ────────────────────────────────────

function AutopilotStrip({ enabled, steps, mode }: {
  enabled: boolean;
  steps: { auto_triage: boolean; auto_investigate: boolean; auto_scan: boolean; auto_verify: boolean; auto_brief: boolean };
  mode: string;
}) {
  const PIPE = [
    { key: "auto_triage" as const,      short: "Triage" },
    { key: "auto_investigate" as const, short: "Case" },
    { key: "auto_scan" as const,        short: "Scan" },
    { key: "auto_verify" as const,      short: "Verify" },
    { key: "auto_brief" as const,       short: "Brief" },
  ];
  return (
    <Link
      href="/admin/settings?tab=autopilot"
      className={cn(
        "block rounded-xl border p-4 transition-colors hover:border-opacity-80 group",
        enabled ? "border-[var(--yellow)]/40 bg-[var(--yellow)]/5 hover:bg-[var(--yellow)]/8" : "border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)]"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className={enabled ? "text-[var(--yellow)]" : "text-[var(--text-3)]"} />
          <span className="text-xs font-semibold text-[var(--text)]">Autopilot</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-mono px-2 py-0.5 rounded font-bold",
            enabled ? "bg-[var(--yellow)]/15 text-[var(--yellow)]" : "bg-[var(--surface-3)] text-[var(--text-3)]"
          )}>
            {enabled ? "ON" : "OFF"}
          </span>
          <ArrowRight size={11} className="text-[var(--text-3)] opacity-0 group-hover:opacity-60 transition-opacity" />
        </div>
      </div>

      {enabled && (
        <>
          <div className="flex items-center gap-1 mb-3">
            {PIPE.map((p, i) => (
              <div key={p.key} className="flex items-center gap-1 flex-1 min-w-0">
                <div className={cn(
                  "flex-1 text-center text-[9px] py-1 px-1 rounded font-medium truncate",
                  steps[p.key]
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "bg-[var(--surface-3)] text-[var(--text-3)] opacity-50"
                )}>
                  {p.short}
                </div>
                {i < PIPE.length - 1 && (
                  <div className={cn("text-[8px] shrink-0", steps[p.key] ? "text-[var(--accent)]" : "text-[var(--text-3)] opacity-30")}>›</div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--text-3)]">
            Engine: <span className="text-[var(--text-2)] font-mono">{mode}</span>
          </p>
        </>
      )}

      {!enabled && (
        <p className="text-[10px] text-[var(--text-3)]">กดเพื่อตั้งค่า Autopilot →</p>
      )}
    </Link>
  );
}

// ─── Activity log row (expandable) ───────────────────────────────────────────

function LogRow({ log, expanded, onToggle }: {
  log: { id: number; timestamp: string; level: string; service: string; message: string; detail: Record<string, unknown> | null };
  expanded: boolean;
  onToggle: () => void;
}) {
  const levelCls = log.level === "ERROR" ? "text-[var(--red)]"
    : log.level === "WARN" ? "text-[var(--yellow)]"
    : "text-[var(--text-3)]";

  const hasDetail = log.detail && Object.keys(log.detail).length > 0;

  return (
    <div className={cn("border-b border-[var(--border)] last:border-0", expanded && "bg-[var(--surface-2)]")}>
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left group"
      >
        <span className={cn("text-[10px] font-mono font-bold w-10 shrink-0 pt-0.5", levelCls)}>{log.level}</span>
        <span className="text-[10px] text-[var(--text-3)] shrink-0 w-14 font-mono pt-0.5">{log.service}</span>
        <span className="text-xs text-[var(--text-2)] flex-1 leading-relaxed text-left">{log.message}</span>
        <span className="text-[10px] text-[var(--text-3)] shrink-0 font-mono">{relativeTime(log.timestamp)}</span>
        {hasDetail && (
          <ChevronDown size={12} className={cn(
            "text-[var(--text-3)] shrink-0 transition-transform mt-0.5",
            expanded ? "rotate-180" : "opacity-0 group-hover:opacity-100"
          )} />
        )}
      </button>
      {expanded && hasDetail && (
        <div className="px-4 pb-3">
          <pre className="text-[10px] font-mono text-[var(--text-2)] bg-[var(--surface-3)] rounded p-3 overflow-x-auto leading-relaxed">
            {JSON.stringify(log.detail, null, 2)}
          </pre>
          <Link
            href="/admin/settings?tab=logs"
            className="inline-flex items-center gap-1 mt-2 text-[10px] text-[var(--accent)] hover:underline"
            onClick={e => e.stopPropagation()}
          >
            ดู logs ทั้งหมด <ArrowRight size={9} />
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: feedStats }    = useFeedStats();
  const { data: casesData }    = useCases({ status: "ACTIVE", page: 1 });
  const { data: services = [], isFetching: healthLoading } = useServiceHealth();
  const { data: settings }     = useAdminSettings();
  const { data: logs = [] }    = useSystemLogs();
  const { data: briefs = [] }  = useBriefs();
  const { data: sims = [] }    = useSimulations();

  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const activeCases   = casesData?.total ?? 0;
  const servicesOk    = services.filter(s => s.status === "ok").length;
  const servicesTotal = services.length;
  const pendingBriefs = briefs.filter(b => b.status === "DRAFT" || b.status === "PENDING").length;
  const STALE_MS = 30 * 60 * 1000;
  const runningSims = sims.filter(s =>
    (s.status === "RUNNING" || s.status === "PENDING") &&
    Date.now() - new Date(s.created_at).getTime() < STALE_MS
  ).length;
  const errorServices = services.filter(s => s.status === "error");

  const recentLogs = useMemo(() => logs.slice(0, 12), [logs]);

  const autopilot = settings?.automation;
  const autoEnabled = autopilot?.enabled ?? false;

  const systemStatus: "ok" | "warn" | "error" =
    errorServices.length >= 3 ? "error"
    : errorServices.length >= 1 ? "warn"
    : "ok";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Dashboard" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* ── Stats row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatChip
              label="Priority"
              value={feedStats?.priority ?? "—"}
              color={(feedStats?.priority ?? 0) > 0 ? "red" : "default"}
              href="/today?verdict=PRIORITY"
            />
            <StatChip
              label="Investigate"
              value={feedStats?.investigate ?? "—"}
              color={(feedStats?.investigate ?? 0) > 0 ? "yellow" : "default"}
              href="/today?verdict=INVESTIGATE"
            />
            <StatChip
              label="Fast Track"
              value={feedStats?.fast_track ?? "—"}
              color={(feedStats?.fast_track ?? 0) > 0 ? "accent" : "default"}
              href="/today?verdict=FAST_TRACK"
            />
            <StatChip
              label="Active Cases"
              value={activeCases}
              color={activeCases > 0 ? "accent" : "default"}
              href="/investigation"
            />
            <StatChip
              label="Services"
              value={servicesTotal > 0 ? `${servicesOk}/${servicesTotal}` : "—"}
              color={systemStatus === "ok" ? "green" : systemStatus === "warn" ? "yellow" : "red"}
              href="/admin/settings?tab=health"
            />
            <StatChip
              label="Autopilot"
              value={autoEnabled ? "ON" : "OFF"}
              color={autoEnabled ? "yellow" : "default"}
              href="/admin/settings?tab=autopilot"
            />
          </div>

          {/* ── Main 2-column ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

            {/* LEFT: module cards + activity */}
            <div className="space-y-6">

              {/* Module cards */}
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">Modules</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <ModuleCard
                    icon={<Newspaper size={14} />}
                    label="Feed Triage"
                    href="/today"
                    metric={feedStats ? feedStats.total : "—"}
                    meta={`${feedStats?.priority ?? 0} priority · ${feedStats?.investigate ?? 0} investigate`}
                    accent="var(--accent)"
                    status={(feedStats?.priority ?? 0) > 0 ? "warn" : feedStats ? "ok" : "idle"}
                  />
                  <ModuleCard
                    icon={<Search size={14} />}
                    label="Investigation"
                    href="/investigation"
                    metric={activeCases}
                    meta={`${activeCases} case${activeCases !== 1 ? "s" : ""} กำลังดำเนินการ`}
                    accent="var(--accent)"
                    status={activeCases > 0 ? "ok" : "idle"}
                  />
                  <ModuleCard
                    icon={<ShieldCheck size={14} />}
                    label="UGC Verify"
                    href="/verify"
                    metric="—"
                    meta="ตรวจสอบสื่อ UGC"
                    accent="var(--green)"
                    status="idle"
                  />
                  <ModuleCard
                    icon={<FileText size={14} />}
                    label="Brief"
                    href="/brief"
                    metric={pendingBriefs}
                    meta={`${pendingBriefs} รอ · ${briefs.length} ทั้งหมด`}
                    accent="var(--teal)"
                    status={pendingBriefs > 0 ? "warn" : briefs.length > 0 ? "ok" : "idle"}
                  />
                  <ModuleCard
                    icon={<Zap size={14} />}
                    label="Simulation"
                    href="/simulation"
                    metric={runningSims > 0 ? `${runningSims} running` : sims.length}
                    meta={runningSims > 0 ? "กำลังจำลองสถานการณ์" : `${sims.length} งานทั้งหมด`}
                    accent="var(--purple)"
                    status={runningSims > 0 ? "warn" : "idle"}
                  />
                  <ModuleCard
                    icon={<Globe size={14} />}
                    label="Dark Web"
                    href="/darkweb"
                    metric="—"
                    meta="Dark web monitoring"
                    accent="var(--darkweb-s)"
                    status="idle"
                  />
                </div>
              </div>

              {/* Activity log */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest">Recent Activity</p>
                  <div className="flex items-center gap-2">
                    {healthLoading && <RefreshCw size={10} className="animate-spin text-[var(--text-3)]" />}
                    <Link href="/admin/settings?tab=logs" className="text-[10px] text-[var(--accent)] hover:underline">
                      ดูทั้งหมด →
                    </Link>
                  </div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                  {recentLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-[var(--text-3)]">
                      <Activity size={20} />
                      <p className="text-xs">ไม่มี activity log</p>
                    </div>
                  ) : (
                    <div>
                      {recentLogs.map(log => (
                        <LogRow
                          key={log.id}
                          log={log}
                          expanded={expandedLog === log.id}
                          onToggle={() => setExpandedLog(prev => prev === log.id ? null : log.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: health + autopilot */}
            <div className="space-y-4">

              {/* System health summary */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest">Service Health</p>
                  <Link href="/admin/settings?tab=health" className="text-[10px] text-[var(--accent)] hover:underline">รายละเอียด →</Link>
                </div>

                {errorServices.length > 0 && (
                  <Link
                    href="/admin/settings?tab=health"
                    className="flex items-center gap-2 px-3 py-2 mb-3 bg-[var(--red)]/8 border border-[var(--red)]/30 rounded-lg text-xs text-[var(--red)] hover:bg-[var(--red)]/12 transition-colors"
                  >
                    <AlertCircle size={12} />
                    {errorServices.length} service ผิดพลาด — กดเพื่อดูรายละเอียด
                    <ArrowRight size={11} className="ml-auto" />
                  </Link>
                )}

                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2">
                  {services.length === 0 ? (
                    <div className="py-6 text-center">
                      <RefreshCw size={14} className="animate-spin text-[var(--text-3)] mx-auto" />
                    </div>
                  ) : (
                    services.map(svc => (
                      <ServiceRow key={svc.name} name={svc.name} status={svc.status} latency={svc.latency_ms} />
                    ))
                  )}
                </div>

                {services.length > 0 && (
                  <Link
                    href="/admin/settings?tab=health"
                    className={cn(
                      "mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors",
                      systemStatus === "ok"
                        ? "bg-[var(--green)]/8 border-[var(--green)]/30 text-[var(--green)] hover:bg-[var(--green)]/12"
                        : systemStatus === "warn"
                        ? "bg-[var(--yellow)]/8 border-[var(--yellow)]/30 text-[var(--yellow)] hover:bg-[var(--yellow)]/12"
                        : "bg-[var(--red)]/8 border-[var(--red)]/30 text-[var(--red)] hover:bg-[var(--red)]/12"
                    )}
                  >
                    {systemStatus === "ok"
                      ? <><CheckCircle2 size={12} /> ระบบทำงานปกติ</>
                      : systemStatus === "warn"
                      ? <><AlertCircle size={12} /> บางส่วนมีปัญหา</>
                      : <><XCircle size={12} /> ระบบมีปัญหา</>}
                    <span className="ml-auto font-mono">{servicesOk}/{servicesTotal}</span>
                    <ArrowRight size={11} />
                  </Link>
                )}
              </div>

              {/* Autopilot */}
              {autopilot && (
                <div>
                  <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">Autopilot</p>
                  <AutopilotStrip
                    enabled={autopilot.enabled}
                    steps={autopilot.steps}
                    mode={autopilot.decision_mode}
                  />
                  {autopilot.enabled && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-[10px] text-[var(--text-3)] px-1">
                        <span>Min score</span>
                        <span className="font-mono text-[var(--text-2)]">{autopilot.min_score}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-[var(--text-3)] px-1">
                        <span>Max cases/hr</span>
                        <span className="font-mono text-[var(--text-2)]">{autopilot.max_cases_per_hour}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quick links */}
              <div>
                <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest mb-3">Quick Links</p>
                <div className="space-y-1">
                  {[
                    { href: "/admin/settings?tab=ai",      icon: <Cpu size={12} />,       label: "AI Endpoints" },
                    { href: "/admin/settings?tab=health",  icon: <Activity size={12} />,  label: "Service Health" },
                    { href: "/admin/settings?tab=logs",    icon: <Database size={12} />,  label: "System Logs" },
                    { href: "/today",                      icon: <Clock size={12} />,     label: "Today's Intel" },
                    { href: "/intelligence",               icon: <TrendingUp size={12}/>, label: "Intelligence" },
                  ].map(item => (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors group"
                    >
                      <span className="text-[var(--text-3)] group-hover:text-[var(--text-2)]">{item.icon}</span>
                      {item.label}
                      <ArrowRight size={10} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
