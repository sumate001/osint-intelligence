"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAdminSettings, useSaveSettings, useAdminUsers, useCreateUser, useUpdateUser, useDeleteUser, useServiceHealth, useSystemLogs, useSystemVersion, useCheckForUpdates } from "@/lib/hooks/useAdmin";
import { Topbar } from "@/components/layout/Topbar";
import { cn } from "@/lib/utils/cn";
import type { AdminSettings, SettingsPatch, AdminUser, UserCreate } from "@/lib/api/admin";
import { Save, RefreshCw, Plus, Trash2, Pencil, CheckCircle2, XCircle, AlertCircle, Download, Eye, EyeOff, ExternalLink, Globe } from "lucide-react";
import { useT } from "@/lib/hooks/useT";
import { useLocaleStore } from "@/lib/stores/locale";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { UpdateModal } from "@/components/admin/UpdateModal";

// ─── shared primitives ──────────────────────────────────────────────────────
const inputCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-3)]";
const labelCls = "block text-xs text-[var(--text-3)] mb-1";
const sectionTitle = "text-sm font-semibold text-[var(--text)] mb-4";
const divider = "border-t border-[var(--border)] my-6";
const saveBtn = "flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50";
const dangerBtn = "flex items-center gap-2 px-3 py-1.5 border border-[var(--red)]/40 text-[var(--red)] rounded text-xs hover:bg-[var(--red)]/10 transition-colors";
const ghostBtn = "flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] text-[var(--text-2)] rounded text-xs hover:border-[var(--border-2)] transition-colors";

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {note && <p className="text-[10px] text-[var(--text-3)] mt-1">{note}</p>}
    </div>
  );
}

function Row({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0">
      <div>
        <span className="text-sm text-[var(--text)]">{label}</span>
        {note && <p className="text-[10px] text-[var(--text-3)] mt-0.5">{note}</p>}
      </div>
      <div className="ml-4 shrink-0">{children}</div>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} className={cn(inputCls, "pr-9")} />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text-2)]">
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function SaveBar({ onSave, saving, saved }: { onSave: () => void; saving: boolean; saved: boolean }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 pt-6">
      <button onClick={onSave} disabled={saving} className={saveBtn}>
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? t("common.saving") : t("common.save")}
      </button>
      {saved && <span className="text-xs text-[var(--green)] flex items-center gap-1"><CheckCircle2 size={12} />{t("common.saved")}</span>}
    </div>
  );
}

function LanguageSection() {
  const t = useT();
  const { locale, setLocale } = useLocaleStore();
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-2)]">{t("settings.language_select")}</p>
      <div className="flex gap-2">
        {LOCALES.map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors",
              locale === l
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border)] hover:border-[var(--border-2)]"
            )}
          >
            <Globe size={14} />
            {LOCALE_LABELS[l]}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-3)]">
        {t("settings.language")} — {LOCALE_LABELS[locale]}
      </p>
    </div>
  );
}

// ─── TAB DEFINITIONS ────────────────────────────────────────────────────────
const TABS = [
  { id: "ai",            icon: "🤖", label: "AI Endpoints" },
  { id: "model-routing", icon: "🔀", label: "Model Routing" },
  { id: "triage",        icon: "⚖",  label: "Triage Weights" },
  { id: "searxng",       icon: "🔎", label: "SearXNG + Perplexica" },
  { id: "tools",         icon: "🕸",  label: "SpiderFoot + MiroFish" },
  { id: "databases",     icon: "🗄",  label: "Databases" },
  { id: "storage",       icon: "📦", label: "Storage & Cache" },
  { id: "n8n",           icon: "⚡", label: "n8n Automation" },
  { id: "notifications", icon: "🔔", label: "Notifications" },
  { id: "adapters",      icon: "📡", label: "Adapters / Sources", href: "/admin/settings/adapters" },
  { id: "users",         icon: "👥", label: "Users" },
  { id: "roles",         icon: "🔑", label: "Roles & Permissions" },
  { id: "health",        icon: "💚", label: "Service Health" },
  { id: "logs",          icon: "📜", label: "System Logs" },
  { id: "language",      icon: "🌐", label: "Language" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── SECTION: AI Endpoints ───────────────────────────────────────────────────
function AISection({ s, set }: { s: AdminSettings["ai"]; set: (v: AdminSettings["ai"]) => void }) {
  const f = (k: keyof typeof s) => (v: string | number) => set({ ...s, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Ollama Base URL">
          <input value={s.ollama_base_url} onChange={e => f("ollama_base_url")(e.target.value)} className={inputCls} placeholder="http://host.docker.internal:11434" />
        </Field>
        <Field label="Default Model">
          <input value={s.ollama_default_model} onChange={e => f("ollama_default_model")(e.target.value)} className={inputCls} placeholder="qwen3:8b" />
        </Field>
        <Field label="Vision Model">
          <input value={s.vision_model} onChange={e => f("vision_model")(e.target.value)} className={inputCls} placeholder="gemma3:27b" />
        </Field>
        <Field label="Embed Model">
          <input value={s.embed_model} onChange={e => f("embed_model")(e.target.value)} className={inputCls} placeholder="nomic-embed-text" />
        </Field>
        <Field label="Max Concurrent Requests">
          <input type="number" min={1} max={16} value={s.max_concurrent} onChange={e => f("max_concurrent")(+e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className={divider} />
      <p className={sectionTitle}>Cloud Fallback (OpenAI-compatible)</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="API Base URL">
          <input value={s.cloud_fallback_url} onChange={e => f("cloud_fallback_url")(e.target.value)} className={inputCls} placeholder="https://api.openai.com/v1" />
        </Field>
        <Field label="API Key">
          <PasswordInput value={s.cloud_fallback_key} onChange={v => f("cloud_fallback_key")(v)} placeholder="sk-..." />
        </Field>
      </div>
    </div>
  );
}

// ─── SECTION: Model Routing ───────────────────────────────────────────────────
function ModelRoutingSection({ s, set }: { s: AdminSettings["model_routing"]; set: (v: AdminSettings["model_routing"]) => void }) {
  const f = (k: keyof typeof s) => (v: string) => set({ ...s, [k]: v });
  const rows = [
    { key: "triage_model" as const,     label: "Triage / Feed Scoring",    note: "ประมวลผล feed ทุกชิ้น — ใช้ model เล็กเร็ว" },
    { key: "brief_model" as const,      label: "Brief Builder",             note: "สร้างรายงาน — ใช้ model ใหญ่กว่า" },
    { key: "vision_model" as const,     label: "Vision / UGC Verify",       note: "วิเคราะห์รูปภาพและวิดีโอ" },
    { key: "simulation_model" as const, label: "Scenario Simulation",       note: "MiroFish fallback LLM" },
  ];
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.key} className="grid grid-cols-[1fr_220px] items-center gap-6 py-3 border-b border-[var(--border)] last:border-0">
          <div>
            <p className="text-sm text-[var(--text)]">{r.label}</p>
            <p className="text-[10px] text-[var(--text-3)] mt-0.5">{r.note}</p>
          </div>
          <input value={s[r.key]} onChange={e => f(r.key)(e.target.value)} className={inputCls} placeholder="qwen3:8b" />
        </div>
      ))}
    </div>
  );
}

// ─── SECTION: Triage Weights ─────────────────────────────────────────────────
function TriageSection({ s, set }: { s: AdminSettings["triage"]; set: (v: AdminSettings["triage"]) => void }) {
  const f = (k: keyof typeof s) => (v: number) => set({ ...s, [k]: v });
  const sliders = [
    { key: "freshness" as const,          label: "ความสด (Freshness)" },
    { key: "source_reliability" as const, label: "ความน่าเชื่อถือของแหล่งข่าว" },
    { key: "topic_relevance" as const,    label: "ความเกี่ยวข้องกับหัวข้อ" },
    { key: "virality" as const,           label: "การแพร่กระจาย (Virality)" },
    { key: "geo_priority" as const,       label: "ภูมิภาคสำคัญ (Geo Priority)" },
    { key: "exclusivity" as const,        label: "ความพิเศษของข่าว (Exclusivity)" },
    { key: "sentiment" as const,          label: "ความรุนแรงของ Sentiment" },
  ];
  return (
    <div className="space-y-4">
      <p className={sectionTitle}>Weight ของแต่ละปัจจัย (1–5)</p>
      <div className="space-y-3">
        {sliders.map(r => (
          <div key={r.key} className="grid grid-cols-[1fr_200px_40px] items-center gap-4">
            <span className="text-sm text-[var(--text-2)]">{r.label}</span>
            <input type="range" min={1} max={5} value={s[r.key]} onChange={e => f(r.key)(+e.target.value)}
              className="w-full accent-[var(--accent)]" />
            <span className="text-sm font-mono text-[var(--accent)] text-right">{s[r.key]}</span>
          </div>
        ))}
      </div>
      <div className={divider} />
      <p className={sectionTitle}>Score Thresholds</p>
      <div className="grid grid-cols-3 gap-4">
        <Field label="🔴 PRIORITY (≥)" note="ส่งแจ้งเตือนทันที">
          <input type="number" value={s.priority_threshold} onChange={e => f("priority_threshold")(+e.target.value)} className={inputCls} />
        </Field>
        <Field label="🟡 INVESTIGATE (≥)" note="เข้า investigation queue">
          <input type="number" value={s.investigate_threshold} onChange={e => f("investigate_threshold")(+e.target.value)} className={inputCls} />
        </Field>
        <Field label="🔵 FAST TRACK (≥)" note="ส่ง brief อัตโนมัติ">
          <input type="number" value={s.fast_track_threshold} onChange={e => f("fast_track_threshold")(+e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="mt-4 p-3 bg-[var(--surface-2)] rounded-lg text-xs text-[var(--text-3)]">
        Max score ปัจจุบัน: <span className="text-[var(--text)] font-mono font-bold">
          {(s.freshness + s.source_reliability + s.topic_relevance + s.virality + s.geo_priority + s.exclusivity + s.sentiment) * 3}
        </span> คะแนน (จาก {sliders.length} ปัจจัย × 3 ระดับ)
      </div>
    </div>
  );
}

// ─── SECTION: SearXNG + Perplexica ──────────────────────────────────────────
function SearxngSection({ s, p, setS, setP }: {
  s: AdminSettings["searxng"]; p: AdminSettings["perplexica"];
  setS: (v: AdminSettings["searxng"]) => void; setP: (v: AdminSettings["perplexica"]) => void;
}) {
  const engines = [
    { key: "google" as const, label: "Google" },
    { key: "bing" as const, label: "Bing" },
    { key: "ddg" as const, label: "DuckDuckGo" },
    { key: "brave" as const, label: "Brave" },
    { key: "yandex" as const, label: "Yandex" },
    { key: "startpage" as const, label: "Startpage" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <p className={sectionTitle}>SearXNG</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="URL">
            <input value={s.url} onChange={e => setS({ ...s, url: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Max Results">
            <select value={s.max_results} onChange={e => setS({ ...s, max_results: +e.target.value })} className={inputCls}>
              {[20, 40, 60, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Refresh Interval">
            <select value={s.refresh_interval} onChange={e => setS({ ...s, refresh_interval: e.target.value })} className={inputCls}>
              {["1h","4h","12h","24h"].map(v => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Safe Search">
            <label className="flex items-center gap-2 h-[38px] cursor-pointer">
              <input type="checkbox" checked={s.safe_search} onChange={e => setS({ ...s, safe_search: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent)]" />
              <span className="text-sm text-[var(--text-2)]">เปิด Safe Search</span>
            </label>
          </Field>
        </div>
        <div className="mt-4">
          <p className="text-xs text-[var(--text-3)] mb-2">Search Engines</p>
          <div className="flex flex-wrap gap-2">
            {engines.map(eng => (
              <label key={eng.key} className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs cursor-pointer transition-colors",
                s.engines[eng.key]
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] text-[var(--text-3)] hover:border-[var(--border-2)]"
              )}>
                <input type="checkbox" checked={s.engines[eng.key]}
                  onChange={e => setS({ ...s, engines: { ...s.engines, [eng.key]: e.target.checked } })}
                  className="sr-only" />
                {eng.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className={divider} />
      <div>
        <p className={sectionTitle}>Perplexica</p>
        <Field label="URL" note="AI research assistant — ใช้ใน Investigation Research Panel">
          <input value={p.url} onChange={e => setP({ url: e.target.value })} className={inputCls} />
        </Field>
      </div>
    </div>
  );
}

// ─── SECTION: SpiderFoot + MiroFish ─────────────────────────────────────────
function ToolsSection({ sf, mf, setSf, setMf }: {
  sf: AdminSettings["spiderfoot"]; mf: AdminSettings["mirofish"];
  setSf: (v: AdminSettings["spiderfoot"]) => void; setMf: (v: AdminSettings["mirofish"]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className={sectionTitle}>SpiderFoot OSINT Scanner</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="URL">
            <input value={sf.url} onChange={e => setSf({ ...sf, url: e.target.value })} className={inputCls} />
          </Field>
          <Field label="API Key">
            <PasswordInput value={sf.api_key} onChange={v => setSf({ ...sf, api_key: v })} />
          </Field>
          <Field label="Scan Timeout (นาที)">
            <input type="number" min={1} value={sf.scan_timeout} onChange={e => setSf({ ...sf, scan_timeout: +e.target.value })} className={inputCls} />
          </Field>
          <Field label="Max Concurrent Scans">
            <input type="number" min={1} max={10} value={sf.max_concurrent_scans} onChange={e => setSf({ ...sf, max_concurrent_scans: +e.target.value })} className={inputCls} />
          </Field>
        </div>
      </div>
      <div className={divider} />
      <div>
        <p className={sectionTitle}>MiroFish Simulation Engine</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="URL" note="ถ้าว่าง ระบบใช้ LLM fallback อัตโนมัติ">
            <input value={mf.url} onChange={e => setMf({ ...mf, url: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Default Agents">
            <select value={mf.default_agents} onChange={e => setMf({ ...mf, default_agents: +e.target.value })} className={inputCls}>
              {[500, 1000, 3000].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

// ─── SECTION: Databases ──────────────────────────────────────────────────────
function DatabasesSection({ s, set }: { s: AdminSettings["databases"]; set: (v: AdminSettings["databases"]) => void }) {
  const f = (k: keyof typeof s) => (v: string) => set({ ...s, [k]: v });
  return (
    <div className="space-y-6">
      <div>
        <p className={sectionTitle}>PostgreSQL</p>
        <p className="text-xs text-[var(--yellow)] mb-3">⚠ ต้องรีสตาร์ท service หลังเปลี่ยน</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Host:Port"><input value={s.postgres_host} onChange={e => f("postgres_host")(e.target.value)} className={inputCls} /></Field>
          <Field label="Database"><input value={s.postgres_db} onChange={e => f("postgres_db")(e.target.value)} className={inputCls} /></Field>
          <Field label="User"><input value={s.postgres_user} onChange={e => f("postgres_user")(e.target.value)} className={inputCls} /></Field>
          <Field label="Password"><PasswordInput value={s.postgres_password} onChange={f("postgres_password")} /></Field>
        </div>
      </div>
      <div className={divider} />
      <div>
        <p className={sectionTitle}>Neo4j</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bolt URI"><input value={s.neo4j_uri} onChange={e => f("neo4j_uri")(e.target.value)} className={inputCls} /></Field>
          <Field label="User"><input value={s.neo4j_user} onChange={e => f("neo4j_user")(e.target.value)} className={inputCls} /></Field>
          <Field label="Password" note=""><PasswordInput value={s.neo4j_password} onChange={f("neo4j_password")} /></Field>
        </div>
      </div>
      <div className={divider} />
      <div>
        <p className={sectionTitle}>Meilisearch</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="URL"><input value={s.meilisearch_url} onChange={e => f("meilisearch_url")(e.target.value)} className={inputCls} /></Field>
          <Field label="Master Key"><PasswordInput value={s.meilisearch_key} onChange={f("meilisearch_key")} /></Field>
        </div>
      </div>
    </div>
  );
}

// ─── SECTION: Storage & Cache ────────────────────────────────────────────────
function StorageSection({ s, set }: { s: AdminSettings["storage"]; set: (v: AdminSettings["storage"]) => void }) {
  const f = (k: keyof typeof s) => (v: string) => set({ ...s, [k]: v });
  return (
    <div className="space-y-6">
      <div>
        <p className={sectionTitle}>MinIO Object Storage</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Endpoint"><input value={s.minio_endpoint} onChange={e => f("minio_endpoint")(e.target.value)} className={inputCls} /></Field>
          <Field label="Bucket"><input value={s.minio_bucket} onChange={e => f("minio_bucket")(e.target.value)} className={inputCls} /></Field>
          <Field label="Access Key"><input value={s.minio_user} onChange={e => f("minio_user")(e.target.value)} className={inputCls} /></Field>
          <Field label="Secret Key"><PasswordInput value={s.minio_password} onChange={f("minio_password")} /></Field>
        </div>
      </div>
      <div className={divider} />
      <div>
        <p className={sectionTitle}>Redis Cache & Queue</p>
        <p className="text-xs text-[var(--yellow)] mb-3">⚠ ต้องรีสตาร์ท service หลังเปลี่ยน</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="URL"><input value={s.redis_url} onChange={e => f("redis_url")(e.target.value)} className={inputCls} /></Field>
          <Field label="Password (ถ้ามี)"><PasswordInput value={s.redis_password} onChange={f("redis_password")} placeholder="(ไม่มี)" /></Field>
        </div>
      </div>
    </div>
  );
}

// ─── SECTION: n8n ────────────────────────────────────────────────────────────
function N8nSection({ s, set }: { s: AdminSettings["n8n"]; set: (v: AdminSettings["n8n"]) => void }) {
  const f = (k: keyof typeof s) => (v: string) => set({ ...s, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="n8n URL">
          <input value={s.url} onChange={e => f("url")(e.target.value)} className={inputCls} />
        </Field>
        <Field label="API Key">
          <PasswordInput value={s.api_key} onChange={f("api_key")} />
        </Field>
        <Field label="Webhook Base URL" note="URL prefix สำหรับ webhook ที่ n8n รับ">
          <input value={s.webhook_base} onChange={e => f("webhook_base")(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="mt-2">
        <a href={s.url || "#"} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline">
          <ExternalLink size={12} /> เปิด n8n →
        </a>
      </div>
    </div>
  );
}

// ─── SECTION: Notifications ──────────────────────────────────────────────────
function NotificationsSection({ s, set }: { s: AdminSettings["notifications"]; set: (v: AdminSettings["notifications"]) => void }) {
  const alertRows = [
    { key: "priority" as const,          label: "PRIORITY Alert",           note: "เมื่อมี item ระดับ PRIORITY" },
    { key: "environment_surge" as const, label: "Environment Surge",        note: "เมื่อ feed เพิ่มขึ้นผิดปกติ" },
    { key: "watchlist_hit" as const,     label: "Watchlist Hit",            note: "เมื่อพบ entity ใน watchlist" },
    { key: "daily_digest" as const,      label: "Daily Digest",             note: "สรุปรายวัน" },
    { key: "brief_approved" as const,    label: "Brief Approved",           note: "เมื่อ brief ผ่านการอนุมัติ" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <p className={sectionTitle}>ตั้งเวลาตรวจสอบ</p>
        <div className="w-48">
          <Field label="Interval">
            <select value={s.check_interval_minutes} onChange={e => set({ ...s, check_interval_minutes: +e.target.value })} className={inputCls}>
              {[5, 10, 15, 30].map(n => <option key={n} value={n}>ทุก {n} นาที</option>)}
            </select>
          </Field>
        </div>
      </div>
      <div className={divider} />
      <div>
        <p className={sectionTitle}>เงื่อนไขแจ้งเตือน</p>
        <div className="space-y-1">
          {alertRows.map(r => (
            <Row key={r.key} label={r.label} note={r.note}>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={s.alerts[r.key]}
                  onChange={e => set({ ...s, alerts: { ...s.alerts, [r.key]: e.target.checked } })}
                  className="sr-only peer" />
                <div className="w-9 h-5 bg-[var(--border-2)] peer-focus:outline-none rounded-full peer
                  peer-checked:after:translate-x-full peer-checked:bg-[var(--accent)]
                  after:content-[''] after:absolute after:top-0.5 after:left-[2px]
                  after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SECTION: Users ──────────────────────────────────────────────────────────
const ROLES = ["admin", "editor", "analyst", "reporter", "viewer"] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: "System Admin", editor: "Editor", analyst: "Analyst", reporter: "Reporter", viewer: "Viewer",
};
const ROLE_COLORS: Record<string, string> = {
  admin: "text-[var(--purple)]", editor: "text-[var(--accent)]",
  analyst: "text-[var(--green)]", reporter: "text-[var(--teal)]", viewer: "text-[var(--text-3)]",
};

function UsersSection() {
  const { data: users = [], isLoading } = useAdminUsers();
  const createMut = useCreateUser();
  const updateMut = useUpdateUser();
  const deleteMut = useDeleteUser();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<UserCreate>({ email: "", full_name: "", role: "analyst", password: "" });
  const [editRole, setEditRole] = useState("");
  const [toast, setToast] = useState("");

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(form);
      setShowAdd(false);
      setForm({ email: "", full_name: "", role: "analyst", password: "" });
      flash("เพิ่มผู้ใช้แล้ว");
    } catch (e) { flash(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-3)]">{users.length} ผู้ใช้ในระบบ</p>
        <button onClick={() => setShowAdd(s => !s)} className={cn(saveBtn, "text-xs py-1.5")}>
          <Plus size={13} /> เพิ่มผู้ใช้
        </button>
      </div>

      {showAdd && (
        <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--text)]">ผู้ใช้ใหม่</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ชื่อ"><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} /></Field>
            <Field label="Email"><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></Field>
            <Field label="Role">
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
            <Field label="Password"><PasswordInput value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} /></Field>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate} disabled={createMut.isPending} className={cn(saveBtn, "text-xs py-1.5")}>
              {createMut.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />} บันทึก
            </button>
            <button onClick={() => setShowAdd(false)} className={cn(ghostBtn, "text-xs")}>ยกเลิก</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-[var(--text-3)] text-sm">กำลังโหลด...</div>
      ) : (
        <div className="space-y-1">
          {users.map(user => (
            <div key={user.id} className="flex items-center gap-4 px-4 py-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg">
              <div className="w-8 h-8 rounded-full bg-[var(--surface-3)] flex items-center justify-center text-xs font-semibold text-[var(--text-2)] shrink-0">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)]">{user.full_name}</p>
                <p className="text-[10px] text-[var(--text-3)]">{user.email}</p>
              </div>
              {editId === user.id ? (
                <div className="flex items-center gap-2">
                  <select value={editRole} onChange={e => setEditRole(e.target.value)}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)]">
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button onClick={async () => {
                    await updateMut.mutateAsync({ id: user.id, patch: { role: editRole } });
                    setEditId(null); flash("อัปเดตแล้ว");
                  }} className="text-[var(--green)] hover:opacity-80">
                    <CheckCircle2 size={15} />
                  </button>
                  <button onClick={() => setEditId(null)} className="text-[var(--text-3)] hover:text-[var(--text)]">
                    <XCircle size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className={cn("text-xs font-medium", ROLE_COLORS[user.role] || "text-[var(--text-2)]")}>
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                  {!user.is_active && <span className="text-[10px] text-[var(--red)]">Disabled</span>}
                  <button onClick={() => { setEditId(user.id); setEditRole(user.role); }} className="text-[var(--text-3)] hover:text-[var(--text)]">
                    <Pencil size={13} />
                  </button>
                  <button onClick={async () => {
                    if (confirm(`ลบ ${user.full_name}?`)) { await deleteMut.mutateAsync(user.id); flash("ลบผู้ใช้แล้ว"); }
                  }} className="text-[var(--text-3)] hover:text-[var(--red)]">
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {toast && <div className="fixed bottom-5 right-5 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text)] shadow-xl">{toast}</div>}
    </div>
  );
}

// ─── SECTION: Roles & Permissions ────────────────────────────────────────────
const MODULES = [
  { label: "Feed Triage",      perms: ["อ่าน", "จัดการ verdict"] },
  { label: "Investigation",    perms: ["อ่าน", "สร้าง/แก้ไข", "ลบ"] },
  { label: "UGC Verify",       perms: ["อ่าน", "รัน verify"] },
  { label: "Brief Builder",    perms: ["อ่าน", "เขียน", "อนุมัติ"] },
  { label: "Simulation",       perms: ["อ่าน", "รัน"] },
  { label: "Dark Web",         perms: ["อ่าน", "สืบค้น", "Legal review"] },
  { label: "Admin Settings",   perms: ["อ่าน", "แก้ไข"] },
  { label: "User Management",  perms: ["อ่าน", "จัดการ"] },
];
const ROLE_ACCESS: Record<string, Record<string, string[]>> = {
  "Feed Triage":     { admin: ["อ่าน","จัดการ verdict"], editor: ["อ่าน","จัดการ verdict"], analyst: ["อ่าน","จัดการ verdict"], reporter: ["อ่าน"], viewer: ["อ่าน"] },
  "Investigation":   { admin: ["อ่าน","สร้าง/แก้ไข","ลบ"], editor: ["อ่าน","สร้าง/แก้ไข","ลบ"], analyst: ["อ่าน","สร้าง/แก้ไข"], reporter: ["อ่าน"], viewer: [] },
  "UGC Verify":      { admin: ["อ่าน","รัน verify"], editor: ["อ่าน","รัน verify"], analyst: ["อ่าน","รัน verify"], reporter: ["อ่าน"], viewer: [] },
  "Brief Builder":   { admin: ["อ่าน","เขียน","อนุมัติ"], editor: ["อ่าน","เขียน","อนุมัติ"], analyst: ["อ่าน","เขียน"], reporter: ["อ่าน","เขียน"], viewer: ["อ่าน"] },
  "Simulation":      { admin: ["อ่าน","รัน"], editor: ["อ่าน","รัน"], analyst: ["อ่าน","รัน"], reporter: ["อ่าน"], viewer: [] },
  "Dark Web":        { admin: ["อ่าน","สืบค้น","Legal review"], editor: ["อ่าน","สืบค้น","Legal review"], analyst: ["อ่าน","สืบค้น"], reporter: [], viewer: [] },
  "Admin Settings":  { admin: ["อ่าน","แก้ไข"], editor: [], analyst: [], reporter: [], viewer: [] },
  "User Management": { admin: ["อ่าน","จัดการ"], editor: [], analyst: [], reporter: [], viewer: [] },
};

function RolesSection() {
  const cols = ["admin", "editor", "analyst", "reporter", "viewer"];
  const colLabels: Record<string, string> = { admin: "Admin", editor: "Editor", analyst: "Analyst", reporter: "Reporter", viewer: "Viewer" };
  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-[var(--text-3)] mb-4">Matrix สิทธิ์การเข้าถึงแต่ละ module (read-only — แก้ไขได้ใน code)</p>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left py-2 pr-4 text-[var(--text-3)] font-medium w-40">Module</th>
            {cols.map(c => (
              <th key={c} className="text-center py-2 px-3 text-[var(--text-3)] font-medium">
                <span className={ROLE_COLORS[c]}>{colLabels[c]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map(mod => (
            <tr key={mod.label} className="border-t border-[var(--border)]">
              <td className="py-2.5 pr-4 text-[var(--text-2)] font-medium">{mod.label}</td>
              {cols.map(role => {
                const perms = ROLE_ACCESS[mod.label]?.[role] ?? [];
                return (
                  <td key={role} className="py-2.5 px-3 text-center">
                    {perms.length === 0 ? (
                      <span className="text-[var(--border-2)]">—</span>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        {perms.map(p => (
                          <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-2)]">{p}</span>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SECTION: Service Health ─────────────────────────────────────────────────
function VersionCard({ onUpdate }: { onUpdate: () => void }) {
  const { data: ver, isLoading } = useSystemVersion();
  const checkMut = useCheckForUpdates();

  const behind = ver?.commits_behind ?? null;
  const upToDate = ver?.is_up_to_date;
  const checked = ver?.is_up_to_date !== null && ver?.remote_commit !== null;

  const statusColor = !checked ? "text-[var(--text-3)]"
    : upToDate ? "text-[var(--green)]"
    : "text-[var(--red)]";

  const statusLabel = !checked ? "—"
    : upToDate ? "✓ Up to date"
    : `${behind} commit${behind === 1 ? "" : "s"} behind`;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)]">
        <span className="text-xs font-semibold text-[var(--text)] uppercase tracking-wide">System Version</span>
        <div className="flex items-center gap-2">
          {checked && (
            <span className={cn("text-xs font-medium", statusColor)}>{statusLabel}</span>
          )}
          <button
            onClick={() => checkMut.mutate()}
            disabled={checkMut.isPending}
            className={cn(ghostBtn, "text-[10px] py-1")}
          >
            <RefreshCw size={11} className={checkMut.isPending ? "animate-spin" : ""} />
            {checkMut.isPending ? "Checking..." : "Check for updates"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
        {/* Local */}
        <div className="p-4 space-y-1">
          <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wide mb-2">Current (local)</p>
          {isLoading ? (
            <div className="text-[var(--text-3)] text-xs">Loading...</div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[var(--accent)]">{ver?.local_commit ?? "—"}</span>
              </div>
              <p className="text-xs text-[var(--text-2)] line-clamp-1">{ver?.local_message}</p>
              <p className="text-[10px] text-[var(--text-3)] font-mono">
                {ver?.local_date ? new Date(ver.local_date).toLocaleDateString("th-TH", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—"}
              </p>
            </>
          )}
        </div>

        {/* Remote */}
        <div className="p-4 space-y-1">
          <p className="text-[10px] text-[var(--text-3)] uppercase tracking-wide mb-2">Latest on GitHub</p>
          {!checked ? (
            <p className="text-xs text-[var(--text-3)] italic">Click "Check for updates"</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className={cn("font-mono text-sm font-bold", upToDate ? "text-[var(--green)]" : "text-[var(--yellow)]")}>
                  {ver?.remote_commit ?? "—"}
                </span>
                {!upToDate && (
                  <span className="text-[9px] bg-[var(--yellow)]/15 text-[var(--yellow)] px-1.5 py-0.5 rounded font-medium">
                    NEW
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-2)] line-clamp-1">{ver?.remote_message}</p>
              <p className="text-[10px] text-[var(--text-3)] font-mono">
                {ver?.remote_date ? new Date(ver.remote_date).toLocaleDateString("th-TH", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Update button shown only when behind */}
      {checked && !upToDate && (
        <div className="px-4 py-3 bg-[var(--yellow)]/5 border-t border-[var(--yellow)]/20 flex items-center justify-between">
          <p className="text-xs text-[var(--yellow)]">
            {behind} new commit{behind === 1 ? "" : "s"} available on GitHub
          </p>
          <button
            onClick={onUpdate}
            className="flex items-center gap-2 bg-[var(--accent)] text-white text-xs px-3 py-1.5 rounded-lg hover:opacity-90"
          >
            <Download size={12} />
            Update Now
          </button>
        </div>
      )}
    </div>
  );
}

function HealthSection() {
  const { data: services = [], isLoading, refetch, isFetching } = useServiceHealth();
  const [showUpdate, setShowUpdate] = useState(false);
  return (
    <div className="space-y-4">
      <VersionCard onUpdate={() => setShowUpdate(true)} />

      {showUpdate && <UpdateModal onClose={() => setShowUpdate(false)} />}

      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-3)]">ตรวจสอบทุก 30 วินาที</p>
        <button onClick={() => refetch()} disabled={isFetching} className={cn(ghostBtn)}>
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      {isLoading ? (
        <div className="text-center py-8 text-[var(--text-3)] text-sm">กำลังตรวจสอบ...</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {services.map(svc => (
            <div key={svc.name} className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border",
              svc.status === "ok" ? "border-[var(--green)]/30 bg-[var(--green)]/5"
                : svc.status === "error" ? "border-[var(--red)]/30 bg-[var(--red)]/5"
                : "border-[var(--border)] bg-[var(--surface-2)]"
            )}>
              {svc.status === "ok" ? <CheckCircle2 size={16} className="text-[var(--green)] shrink-0" />
                : svc.status === "error" ? <XCircle size={16} className="text-[var(--red)] shrink-0" />
                : <AlertCircle size={16} className="text-[var(--text-3)] shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)]">{svc.name}</p>
                {svc.detail && <p className="text-[10px] text-[var(--text-3)] truncate">{svc.detail}</p>}
              </div>
              {svc.latency_ms != null && (
                <span className="text-[10px] font-mono text-[var(--text-3)]">{svc.latency_ms}ms</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SECTION: System Logs ────────────────────────────────────────────────────
const LEVEL_COLORS: Record<string, string> = {
  INFO: "text-[var(--accent)]", WARN: "text-[var(--yellow)]", ERROR: "text-[var(--red)]",
};
function LogsSection() {
  const [svc, setSvc] = useState("all");
  const [level, setLevel] = useState("all");
  const { data: logs = [], isLoading, isFetching } = useSystemLogs({ service: svc, level });

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "system-logs.json"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={svc} onChange={e => setSvc(e.target.value)} className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-xs text-[var(--text)]">
          {["all","api","celery","adapters"].map(v => <option key={v} value={v}>{v === "all" ? "All services" : v}</option>)}
        </select>
        <select value={level} onChange={e => setLevel(e.target.value)} className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-1.5 text-xs text-[var(--text)]">
          {["all","ERROR","WARN","INFO"].map(v => <option key={v} value={v}>{v === "all" ? "All levels" : v}</option>)}
        </select>
        {isFetching && <RefreshCw size={12} className="animate-spin text-[var(--text-3)]" />}
        <div className="ml-auto">
          <button onClick={exportLogs} className={ghostBtn}><Download size={12} /> Export</button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-[var(--text-3)] text-sm">กำลังโหลด...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-3)] text-sm bg-[var(--surface-2)] rounded-lg border border-[var(--border)]">
          ไม่มี log ที่ตรงกัน
        </div>
      ) : (
        <div className="space-y-0.5 font-mono text-xs">
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 px-3 py-2 rounded hover:bg-[var(--surface-2)] group">
              <span className="text-[var(--text-3)] shrink-0 w-36 truncate">
                {new Date(log.timestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={cn("w-12 shrink-0 font-bold", LEVEL_COLORS[log.level] || "text-[var(--text-3)]")}>{log.level}</span>
              <span className="w-16 shrink-0 text-[var(--text-3)]">{log.service}</span>
              <span className="text-[var(--text-2)] flex-1">{log.message}</span>
              {log.detail && (
                <span className="text-[var(--text-3)] hidden group-hover:inline truncate max-w-[200px]">
                  {JSON.stringify(log.detail)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
export default function AdminSettingsPage() {
  const { data: remote, isLoading } = useAdminSettings();
  const save = useSaveSettings();
  const t = useT();

  // local draft per section
  const [draft, setDraft] = useState<Partial<AdminSettings>>({});
  const [savedTab, setSavedTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("ai");

  useEffect(() => {
    if (remote && Object.keys(draft).length === 0) setDraft(remote);
  }, [remote]);

  const s = { ...remote, ...draft } as AdminSettings;
  const setSection = <K extends keyof AdminSettings>(k: K) => (v: AdminSettings[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const handleSave = async (section?: keyof AdminSettings) => {
    const patch: SettingsPatch = section ? { [section]: draft[section] } : draft;
    await save.mutateAsync(patch);
    setSavedTab(section || "all");
    setTimeout(() => setSavedTab(null), 2000);
  };

  // map tab id → which section key to save
  const tabSectionMap: Partial<Record<TabId, keyof AdminSettings>> = {
    "ai": "ai", "model-routing": "model_routing", "triage": "triage",
    "searxng": "searxng", "tools": "spiderfoot",
    "databases": "databases", "storage": "storage", "n8n": "n8n", "notifications": "notifications",
  };

  const currentSection = tabSectionMap[activeTab];
  const saved = savedTab === currentSection || savedTab === "all";

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Topbar title="Admin Settings" />
        <div className="flex-1 flex items-center justify-center text-[var(--text-3)]">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Admin Settings" />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left tab list ── */}
        <div className="w-52 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] overflow-y-auto">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const cls = cn(
              "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-l-2",
              isActive
                ? "bg-[var(--surface-3)] border-l-[var(--accent)] text-[var(--text)]"
                : "border-l-transparent text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            );
            const inner = (
              <>
                <span className="text-base leading-none">{tab.icon}</span>
                <span className="text-xs">{tab.label}</span>
                {"href" in tab && <ExternalLink size={10} className="ml-auto opacity-40" />}
              </>
            );
            return "href" in tab ? (
              <Link key={tab.id} href={(tab as { href: string }).href} className={cls}>{inner}</Link>
            ) : (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as TabId)} className={cls}>{inner}</button>
            );
          })}
        </div>

        {/* ── Content panel ── */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-base font-semibold text-[var(--text)] mb-6">
              {TABS.find(t => t.id === activeTab)?.icon}{" "}
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>

            {activeTab === "ai" && s.ai && (
              <>
                <AISection s={s.ai} set={setSection("ai")} />
                <SaveBar onSave={() => handleSave("ai")} saving={save.isPending} saved={saved} />
              </>
            )}
            {activeTab === "model-routing" && s.model_routing && (
              <>
                <ModelRoutingSection s={s.model_routing} set={setSection("model_routing")} />
                <SaveBar onSave={() => handleSave("model_routing")} saving={save.isPending} saved={saved} />
              </>
            )}
            {activeTab === "triage" && s.triage && (
              <>
                <TriageSection s={s.triage} set={setSection("triage")} />
                <SaveBar onSave={() => handleSave("triage")} saving={save.isPending} saved={saved} />
              </>
            )}
            {activeTab === "searxng" && s.searxng && s.perplexica && (
              <>
                <SearxngSection s={s.searxng} p={s.perplexica} setS={setSection("searxng")} setP={setSection("perplexica")} />
                <SaveBar onSave={async () => { await save.mutateAsync({ searxng: draft.searxng, perplexica: draft.perplexica }); setSavedTab("searxng"); setTimeout(() => setSavedTab(null), 2000); }} saving={save.isPending} saved={saved} />
              </>
            )}
            {activeTab === "tools" && s.spiderfoot && s.mirofish && (
              <>
                <ToolsSection sf={s.spiderfoot} mf={s.mirofish} setSf={setSection("spiderfoot")} setMf={setSection("mirofish")} />
                <SaveBar onSave={async () => { await save.mutateAsync({ spiderfoot: draft.spiderfoot, mirofish: draft.mirofish }); setSavedTab("spiderfoot"); setTimeout(() => setSavedTab(null), 2000); }} saving={save.isPending} saved={saved} />
              </>
            )}
            {activeTab === "databases" && s.databases && (
              <>
                <DatabasesSection s={s.databases} set={setSection("databases")} />
                <SaveBar onSave={() => handleSave("databases")} saving={save.isPending} saved={saved} />
              </>
            )}
            {activeTab === "storage" && s.storage && (
              <>
                <StorageSection s={s.storage} set={setSection("storage")} />
                <SaveBar onSave={() => handleSave("storage")} saving={save.isPending} saved={saved} />
              </>
            )}
            {activeTab === "n8n" && s.n8n && (
              <>
                <N8nSection s={s.n8n} set={setSection("n8n")} />
                <SaveBar onSave={() => handleSave("n8n")} saving={save.isPending} saved={saved} />
              </>
            )}
            {activeTab === "notifications" && s.notifications && (
              <>
                <NotificationsSection s={s.notifications} set={setSection("notifications")} />
                <SaveBar onSave={() => handleSave("notifications")} saving={save.isPending} saved={saved} />
              </>
            )}
            {activeTab === "users" && <UsersSection />}
            {activeTab === "roles" && <RolesSection />}
            {activeTab === "health" && <HealthSection />}
            {activeTab === "logs" && <LogsSection />}
            {activeTab === "language" && <LanguageSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
