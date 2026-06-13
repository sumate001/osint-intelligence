import { apiFetch } from "./client";

// ─── Sources ───────────────────────────────────────────────────────────────
export interface Source {
  id: string;
  name: string;
  adapter_type: string;
  config: Record<string, unknown>;
  source_weight: number;
  verified_source: boolean;
  is_active: boolean;
  admiralty_source_code: string;
  poll_interval_seconds: number;
  last_fetched_at: string | null;
  last_error: string | null;
  success_count: number;
  error_count: number;
}
export interface SourceCreate {
  name: string;
  adapter_type: string;
  config: Record<string, unknown>;
  source_weight?: number;
  verified_source?: boolean;
  admiralty_source_code?: string;
  poll_interval_seconds?: number;
}
export const listSources = () => apiFetch<Source[]>("/api/v1/sources");
export const createSource = (body: SourceCreate) => apiFetch<Source>("/api/v1/sources", { method: "POST", body });
export const updateSource = (id: string, patch: Partial<Source>) => apiFetch<Source>(`/api/v1/sources/${id}`, { method: "PATCH", body: patch });
export const deleteSource = (id: string) => apiFetch<void>(`/api/v1/sources/${id}`, { method: "DELETE" });
export const triggerSource = (id: string) => apiFetch<{ status: string }>(`/api/v1/sources/${id}/trigger`, { method: "POST" });

// ─── Settings ──────────────────────────────────────────────────────────────
export interface AISettings {
  ollama_base_url: string;
  ollama_default_model: string;
  vision_model: string;
  embed_model: string;
  max_concurrent: number;
  cloud_fallback_url: string;
  cloud_fallback_key: string;
}
export interface ModelRoutingSettings {
  triage_model: string;
  brief_model: string;
  vision_model: string;
  simulation_model: string;
}
export interface TriageWeightSettings {
  freshness: number;
  source_reliability: number;
  topic_relevance: number;
  virality: number;
  geo_priority: number;
  exclusivity: number;
  sentiment: number;
  priority_threshold: number;
  investigate_threshold: number;
  fast_track_threshold: number;
}
export interface SearchEngines {
  google: boolean; bing: boolean; ddg: boolean; brave: boolean; yandex: boolean; startpage: boolean;
}
export interface SearxngSettings {
  url: string; max_results: number; engines: SearchEngines; safe_search: boolean; refresh_interval: string;
}
export interface PerplexicaSettings { url: string; }
export interface SpiderFootSettings {
  url: string; api_key: string; scan_timeout: number; max_concurrent_scans: number;
}
export interface MiroFishSettings { url: string; default_agents: number; }
export interface DatabaseSettings {
  postgres_host: string; postgres_db: string; postgres_user: string; postgres_password: string;
  neo4j_uri: string; neo4j_user: string; neo4j_password: string;
  meilisearch_url: string; meilisearch_key: string;
}
export interface StorageSettings {
  minio_endpoint: string; minio_user: string; minio_password: string; minio_bucket: string;
  redis_url: string; redis_password: string;
}
export interface N8nSettings { url: string; api_key: string; webhook_base: string; }
export interface NotificationAlerts {
  priority: boolean; environment_surge: boolean; watchlist_hit: boolean; daily_digest: boolean; brief_approved: boolean;
}
export interface NotificationSettings { check_interval_minutes: number; alerts: NotificationAlerts; }

export interface AdminSettings {
  ai: AISettings;
  model_routing: ModelRoutingSettings;
  triage: TriageWeightSettings;
  searxng: SearxngSettings;
  perplexica: PerplexicaSettings;
  spiderfoot: SpiderFootSettings;
  mirofish: MiroFishSettings;
  databases: DatabaseSettings;
  storage: StorageSettings;
  n8n: N8nSettings;
  notifications: NotificationSettings;
}
export type SettingsPatch = Partial<AdminSettings>;

export const getAdminSettings = () => apiFetch<AdminSettings>("/api/v1/admin/settings");
export const patchAdminSettings = (patch: SettingsPatch) =>
  apiFetch<AdminSettings>("/api/v1/admin/settings", { method: "PATCH", body: patch });

// ─── Users ─────────────────────────────────────────────────────────────────
export interface AdminUser {
  id: string; email: string; full_name: string; role: string; is_active: boolean; created_at: string;
}
export interface UserCreate { email: string; full_name: string; role: string; password: string; }
export interface UserUpdate { full_name?: string; role?: string; is_active?: boolean; password?: string; }

export const listAdminUsers = () => apiFetch<AdminUser[]>("/api/v1/admin/users");
export const createAdminUser = (body: UserCreate) => apiFetch<AdminUser>("/api/v1/admin/users", { method: "POST", body });
export const updateAdminUser = (id: string, patch: UserUpdate) => apiFetch<AdminUser>(`/api/v1/admin/users/${id}`, { method: "PATCH", body: patch });
export const deleteAdminUser = (id: string) => apiFetch<void>(`/api/v1/admin/users/${id}`, { method: "DELETE" });

// ─── Health ────────────────────────────────────────────────────────────────
export interface ServiceHealth {
  name: string; status: "ok" | "error" | "unknown"; latency_ms: number | null; detail: string;
}
export const getServiceHealth = () => apiFetch<ServiceHealth[]>("/api/v1/admin/health");

// ─── Logs ──────────────────────────────────────────────────────────────────
export interface LogEntry {
  id: number; timestamp: string; level: string; service: string; message: string;
  detail: Record<string, unknown> | null;
}
export const getSystemLogs = (params?: { service?: string; level?: string; limit?: number }) => {
  const qs = new URLSearchParams();
  if (params?.service && params.service !== "all") qs.set("service", params.service);
  if (params?.level && params.level !== "all") qs.set("level", params.level);
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<LogEntry[]>(`/api/v1/admin/logs${qs.toString() ? "?" + qs : ""}`);
};
