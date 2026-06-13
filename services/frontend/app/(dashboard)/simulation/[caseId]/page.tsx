"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Play, RefreshCw, Target, Users, Calendar,
  Cpu, CheckCircle2, Circle, AlertCircle, TrendingUp,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { useSimulations, useSimulation, useStartSimulation } from "@/lib/hooks/useSimulation";
import { useCase, useEvidence, useCaseGraph, useScans } from "@/lib/hooks/useCase";
import { cn } from "@/lib/utils/cn";
import type { SimConfig } from "@/lib/api/simulation";

const STEPS = [
  "สกัด ontology จาก seed",
  "สร้าง knowledge graph",
  "สร้าง agents",
  "รัน simulation",
  "ReportAgent วิเคราะห์ผล",
];

const AGENT_OPTIONS = [
  { value: 500, label: "500 (เร็ว ~3 นาที)" },
  { value: 1000, label: "1,000 (แนะนำ ~7 นาที)" },
  { value: 3000, label: "3,000 (ละเอียด ~20 นาที)" },
];
const TIMEFRAME_OPTIONS = [
  { value: 7, label: "7 วัน" },
  { value: 30, label: "30 วัน" },
  { value: 90, label: "90 วัน" },
];
const GROUPS_OPTIONS = [
  { value: "general", label: "สังคมทั่วไป" },
  { value: "politics_biz", label: "การเมือง + ธุรกิจ" },
  { value: "social", label: "โซเชียลมีเดีย" },
];

type ResultTab = "scenarios" | "timeline" | "signals" | "coverage";

export default function SimulationPage() {
  const params = useParams();
  const caseId = params.caseId as string;

  const [config, setConfig] = useState<SimConfig>({
    agents: 1000,
    timeframe: 30,
    groups: "general",
    model: "qwen3:8b",
  });
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("scenarios");
  const [simError, setSimError] = useState<string | null>(null);

  const { data: caseData } = useCase(caseId);
  const { data: evidence = [] } = useEvidence(caseId);
  const { data: graph = { nodes: [], edges: [] } } = useCaseGraph(caseId);
  const { data: scans = [] } = useScans(caseId);
  const { data: jobs = [] } = useSimulations(caseId);
  const { data: activeJob } = useSimulation(activeJobId ?? jobs[0]?.id ?? null);
  const startSim = useStartSimulation(caseId);

  const job = activeJob ?? jobs[0] ?? null;
  const isRunning = job?.status === "RUNNING" || job?.status === "PENDING";
  const isDone = job?.status === "DONE";
  const result = job?.result as Record<string, unknown> | null;

  // Derived seed stats from real case data
  const verifiedEvidence = evidence.filter((e) => e.status === "VERIFIED");
  const doneScans = scans.filter((s) => s.status === "DONE");
  const entityCount = graph.nodes.length;
  const relationCount = graph.edges.length;

  function buildSeedData() {
    return {
      case_title: caseData?.title ?? "",
      case_description: caseData?.description ?? "",
      verified_findings: verifiedEvidence.map((e) => ({
        title: e.title,
        content: e.content,
        url: e.url ?? "",
        status: e.status,
      })),
      entities: graph.nodes.map((n) => ({ id: n.id, label: n.label })),
      relationships: graph.edges.map((e) => ({ from: e.from_, to: e.to, label: e.label ?? "" })),
      scan_entities: doneScans.flatMap((s) =>
        (Array.isArray((s.results as Record<string, unknown>)?.entities)
          ? ((s.results as Record<string, unknown>).entities as Array<unknown>).slice(0, 20)
          : [])
      ),
    };
  }

  async function handleStart() {
    setSimError(null);
    try {
      const j = await startSim.mutateAsync({ config, seed_data: buildSeedData() });
      setActiveJobId(j.id);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  }

  const scenarios = (result?.scenarios as unknown[]) ?? [];
  const signals = (result?.signals as unknown[]) ?? [];
  const timeline = (result?.timeline as unknown[]) ?? [];
  const pivotPoints = (result?.pivot_points as unknown[]) ?? [];
  const coverageStrategy = (result?.coverage_strategy as string) ?? "";
  const confidence = (result?.confidence as string) ?? "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Scenario Simulation"
        subtitle="MiroFish Engine"
        breadcrumb={
          <Link
            href="/investigation"
            className="flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text-2)] text-xs"
          >
            <ChevronLeft size={12} />
            Investigation
          </Link>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — setup */}
        <div className="w-72 border-r border-[var(--border)] flex flex-col overflow-y-auto shrink-0 bg-[var(--surface)]">
          {/* Case header */}
          <div className="p-4 border-b border-[var(--border)]">
            <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wider mb-1">กำลังจำลองสถานการณ์จาก</p>
            {caseData ? (
              <>
                <p className="text-sm font-semibold text-[var(--text)] leading-snug">{caseData.title}</p>
                {caseData.description && (
                  <p className="text-[10px] text-[var(--text-3)] mt-1 line-clamp-2 leading-relaxed">{caseData.description}</p>
                )}
              </>
            ) : (
              <p className="text-xs text-[var(--text-3)]">กำลังโหลด...</p>
            )}
          </div>

          {/* Seed materials — ข้อมูลจริงจาก case */}
          <div className="p-4 border-b border-[var(--border)] space-y-3">
            <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wider font-medium">Seed Materials</p>

            {/* Verified evidence */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text)] flex items-center gap-1">
                  📋 verified findings
                </span>
                <span className={cn(
                  "text-[9px] px-1 py-0.5 rounded",
                  verifiedEvidence.length > 0 ? "text-[var(--green)] bg-[var(--green)]/10" : "text-[var(--yellow)] bg-[var(--yellow)]/10"
                )}>
                  {verifiedEvidence.length > 0 ? `✓ ${verifiedEvidence.length} items` : "ยังไม่มี verified"}
                </span>
              </div>
              {verifiedEvidence.slice(0, 2).map((e) => (
                <p key={e.id} className="text-[9px] text-[var(--text-3)] pl-4 truncate">· {e.title}</p>
              ))}
              {verifiedEvidence.length > 2 && (
                <p className="text-[9px] text-[var(--text-3)] pl-4">+{verifiedEvidence.length - 2} รายการ</p>
              )}
            </div>

            {/* Entity graph */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text)] flex items-center gap-1">
                  🕸 entity graph
                </span>
                <span className={cn(
                  "text-[9px] px-1 py-0.5 rounded",
                  entityCount > 0 ? "text-[var(--green)] bg-[var(--green)]/10" : "text-[var(--text-3)] bg-[var(--surface-3)]"
                )}>
                  {entityCount > 0 ? `✓ ${entityCount} nodes · ${relationCount} edges` : "ว่างเปล่า"}
                </span>
              </div>
              {graph.nodes.slice(0, 3).map((n) => (
                <p key={n.id} className="text-[9px] text-[var(--text-3)] pl-4 truncate">· {n.label}</p>
              ))}
              {graph.nodes.length > 3 && (
                <p className="text-[9px] text-[var(--text-3)] pl-4">+{graph.nodes.length - 3} entities</p>
              )}
            </div>

            {/* Scans */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text)] flex items-center gap-1">
                🔍 SpiderFoot scans
              </span>
              <span className={cn(
                "text-[9px] px-1 py-0.5 rounded",
                doneScans.length > 0 ? "text-[var(--green)] bg-[var(--green)]/10" : "text-[var(--text-3)] bg-[var(--surface-3)]"
              )}>
                {doneScans.length > 0 ? `✓ ${doneScans.length} scans` : "opt"}
              </span>
            </div>

            {/* Warning if no seed */}
            {verifiedEvidence.length === 0 && entityCount === 0 && (
              <div className="bg-[var(--yellow)]/10 border border-[var(--yellow)]/30 rounded p-2">
                <p className="text-[9px] text-[var(--yellow)] leading-relaxed">
                  ⚠ ยังไม่มีข้อมูลพอ — ผลลัพธ์จะอิงจาก LLM ล้วน แนะนำให้เพิ่ม evidence ก่อน
                </p>
              </div>
            )}
          </div>

          {/* Config */}
          <div className="p-4 border-b border-[var(--border)] space-y-3">
            <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wider font-medium">Config</p>

            <div>
              <label className="text-[10px] text-[var(--text-3)] flex items-center gap-1 mb-1">
                <Users size={10} /> จำนวน agents
              </label>
              <select
                value={config.agents}
                onChange={(e) => setConfig((c) => ({ ...c, agents: Number(e.target.value) }))}
                disabled={isRunning}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text)] outline-none"
              >
                {AGENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-[var(--text-3)] flex items-center gap-1 mb-1">
                <Calendar size={10} /> ช่วงเวลาจำลอง
              </label>
              <select
                value={config.timeframe}
                onChange={(e) => setConfig((c) => ({ ...c, timeframe: Number(e.target.value) }))}
                disabled={isRunning}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text)] outline-none"
              >
                {TIMEFRAME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-[var(--text-3)] flex items-center gap-1 mb-1">
                <Target size={10} /> กลุ่ม agents
              </label>
              <select
                value={config.groups}
                onChange={(e) => setConfig((c) => ({ ...c, groups: e.target.value }))}
                disabled={isRunning}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text)] outline-none"
              >
                {GROUPS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-[var(--text-3)] flex items-center gap-1 mb-1">
                <Cpu size={10} /> LLM model
              </label>
              <select
                value={config.model}
                onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                disabled={isRunning}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text)] outline-none"
              >
                <option value="qwen3:8b">qwen3:8b (local)</option>
                <option value="qwen3:14b">qwen3:14b (local)</option>
              </select>
            </div>
          </div>

          {/* Run button */}
          <div className="p-4">
            <button
              onClick={handleStart}
              disabled={isRunning || startSim.isPending}
              className="w-full flex items-center justify-center gap-2 bg-[var(--purple)] text-white text-sm py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
            >
              {isRunning ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {isRunning ? "กำลังประมวลผล..." : "จำลองสถานการณ์"}
            </button>
            {simError && (
              <p className="mt-2 text-[10px] text-[var(--red)] flex items-center gap-1">
                <AlertCircle size={10} /> {simError}
              </p>
            )}
          </div>

          {/* Progress */}
          {(isRunning || isDone) && job && (
            <div className="px-4 pb-4 space-y-2">
              <div className="w-full h-1 bg-[var(--border)] rounded overflow-hidden">
                <div
                  className="h-full bg-[var(--purple)] rounded transition-all duration-500"
                  style={{ width: `${Math.round((job.progress_step / 5) * 100)}%` }}
                />
              </div>
              <div className="space-y-1">
                {STEPS.map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    {i < job.progress_step ? (
                      <CheckCircle2 size={11} className="text-[var(--green)] shrink-0" />
                    ) : i === job.progress_step && isRunning ? (
                      <RefreshCw size={11} className="animate-spin text-[var(--purple)] shrink-0" />
                    ) : (
                      <Circle size={11} className="text-[var(--border-2)] shrink-0" />
                    )}
                    <span className={cn(
                      "text-[10px]",
                      i < job.progress_step ? "text-[var(--text-2)]" : "text-[var(--text-3)]"
                    )}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — results */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!isDone ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--text-3)]">
              <span className="text-4xl">🌐</span>
              <p className="text-sm">พร้อมจำลองสถานการณ์</p>
              <p className="text-xs max-w-xs text-center leading-relaxed">
                ระบบเตรียม seed materials จากการสืบสวนครบแล้ว<br />
                กด &quot;จำลองสถานการณ์&quot; เพื่อให้ MiroFish ประเมินผลกระทบ
              </p>
            </div>
          ) : (
            <>
              {/* Result header */}
              <div className="px-6 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Impact Assessment</p>
                  <p className="text-[10px] text-[var(--text-3)]">
                    ความเชื่อมั่น:&nbsp;
                    <span className={cn(
                      "font-medium",
                      confidence === "HIGH" ? "text-[var(--green)]" :
                      confidence === "MEDIUM" ? "text-[var(--yellow)]" : "text-[var(--text-3)]"
                    )}>{confidence}</span>
                    &nbsp;· {config.agents.toLocaleString()} agents · {config.timeframe}d simulation
                  </p>
                </div>
                <div className="flex gap-1">
                  {(["scenarios", "timeline", "signals", "coverage"] as ResultTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setResultTab(t)}
                      className={cn(
                        "text-[10px] px-2.5 py-1 rounded transition-colors",
                        resultTab === t ? "bg-[var(--purple)] text-white" : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                      )}
                    >
                      {t === "scenarios" ? "🎯 Scenarios" :
                       t === "timeline" ? "📅 Timeline" :
                       t === "signals" ? "📡 Signals" : "📻 Coverage"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                {resultTab === "scenarios" && (
                  <div className="space-y-4">
                    {(scenarios as Array<{
                      type: string; label: string; probability: number;
                      timeline_weeks: string; bullets: string[];
                    }>).map((s) => (
                      <div
                        key={s.type}
                        className={cn(
                          "border rounded-xl p-4 space-y-2",
                          s.type === "BASE"
                            ? "border-[var(--accent)] bg-[var(--accent)]/5"
                            : "border-[var(--border)] bg-[var(--surface-2)]"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className={cn(
                              "text-[10px] font-bold tracking-wider",
                              s.type === "BEST" ? "text-[var(--green)]" :
                              s.type === "BASE" ? "text-[var(--accent)]" : "text-[var(--red)]"
                            )}>
                              {s.type === "BEST" ? "BEST CASE" : s.type === "BASE" ? "BASE CASE · น่าจะเป็นที่สุด" : "WORST CASE"}
                            </span>
                            <p className="text-sm font-semibold text-[var(--text)] mt-0.5">{s.label}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-[var(--text)]">{s.probability}%</p>
                            <p className="text-[10px] text-[var(--text-3)]">ใน {s.timeline_weeks} สัปดาห์</p>
                          </div>
                        </div>
                        <ul className="space-y-1">
                          {s.bullets.map((b, i) => (
                            <li key={i} className="text-xs text-[var(--text-2)] flex items-start gap-1.5">
                              <span className="text-[var(--text-3)] mt-0.5 shrink-0">·</span>{b}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}

                    {/* Pivot points */}
                    {pivotPoints.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-[var(--text-2)] flex items-center gap-1.5">
                          <TrendingUp size={12} /> จุดเปลี่ยน (Pivot Points)
                        </p>
                        {(pivotPoints as Array<{ condition: string; consequence: string; type: string }>).map((p, i) => (
                          <div
                            key={i}
                            className={cn(
                              "border-l-2 pl-3 py-1 text-xs",
                              p.type === "KEY" ? "border-[var(--accent)] text-[var(--text)]" : "border-[var(--red)] text-[var(--red)]"
                            )}
                          >
                            <span className="font-medium">{p.condition}</span>
                            <br />{p.consequence}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {resultTab === "timeline" && (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-px bg-[var(--border)]" />
                    <div className="space-y-4 pl-10">
                      {(timeline as Array<{ day: string; description: string }>).map((t, i) => (
                        <div key={i} className="relative">
                          <div className="absolute -left-6 top-1 w-2 h-2 rounded-full bg-[var(--accent)]" />
                          <p className="text-[10px] text-[var(--accent)] font-mono font-bold">{t.day}</p>
                          <p className="text-sm text-[var(--text-2)] mt-0.5">{t.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resultTab === "signals" && (
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--text-3)]">📡 Signals ที่ต้องเฝ้าดู</p>
                    {(signals as Array<{ icon: string; description: string; priority: string }>).map((s, i) => (
                      <div key={i} className="flex items-start gap-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                        <span className="text-lg shrink-0">{s.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--text-2)]">{s.description}</p>
                        </div>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                          s.priority === "HIGH" ? "text-[var(--red)] bg-[var(--red)]/10" :
                          s.priority === "MED" ? "text-[var(--yellow)] bg-[var(--yellow)]/10" :
                          "text-[var(--text-3)] bg-[var(--surface-3)]"
                        )}>{s.priority}</span>
                      </div>
                    ))}
                  </div>
                )}

                {resultTab === "coverage" && (
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-5">
                    <p className="text-xs font-semibold text-[var(--text-2)] mb-3">📻 Recommended Coverage Strategy</p>
                    <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">{coverageStrategy}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
