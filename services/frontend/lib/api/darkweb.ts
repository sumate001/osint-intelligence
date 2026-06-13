import { apiFetch } from "./client";

export interface DWQuery {
  id: string;
  query_text: string;
  reason: string;
  method: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface DWResult {
  id: string;
  query_id: string;
  onion_url: string;
  title: string;
  summary: string;
  classification: "PASS" | "FLAGGED" | "BLOCKED";
  confidence: number;
  entities: string[];
  legal_status: "NA" | "PENDING" | "APPROVED" | "REJECTED";
  value: string;
  created_at: string;
}

export interface DWStats {
  total: number;
  flagged: number;
  blocked: number;
  legal_pending: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user_id: string | null;
  username: string;
  action: string;
  details: Record<string, unknown>;
}

export function startQuery(query_text: string, reason: string, method: string) {
  return apiFetch<DWQuery>("/api/v1/darkweb/queries", {
    method: "POST",
    body: { query_text, reason, method },
  });
}

export function getResults(query_id?: string) {
  return apiFetch<DWResult[]>("/api/v1/darkweb/results", {
    params: query_id ? { query_id } : undefined,
  });
}

export function getLegalQueue() {
  return apiFetch<DWResult[]>("/api/v1/darkweb/legal-queue");
}

export function reviewResult(result_id: string, action: "approve" | "reject") {
  return apiFetch<DWResult>(`/api/v1/darkweb/results/${result_id}/review`, {
    method: "POST",
    body: { action },
  });
}

export function getAuditLog() {
  return apiFetch<AuditEntry[]>("/api/v1/darkweb/audit-log");
}

export function getStats() {
  return apiFetch<DWStats>("/api/v1/darkweb/stats");
}
