import { apiFetch } from "./client";
import type { Brief, BriefListItem, BriefCreate, BriefUpdate, ConfidenceRecord, ACHHypothesis } from "../types/brief";

export const getBriefs = (caseId?: string) =>
  apiFetch<BriefListItem[]>("/api/v1/briefs", { params: caseId ? { case_id: caseId } : undefined });

export const getBrief = (briefId: string) =>
  apiFetch<Brief>(`/api/v1/briefs/${briefId}`);

export const createBrief = (data: BriefCreate) =>
  apiFetch<Brief>("/api/v1/briefs", { method: "POST", body: data });

export const updateBrief = (briefId: string, data: BriefUpdate) =>
  apiFetch<Brief>(`/api/v1/briefs/${briefId}`, { method: "PATCH", body: data });

export const submitBrief = (briefId: string) =>
  apiFetch<Brief>(`/api/v1/briefs/${briefId}/submit`, { method: "POST" });

export const reviewBrief = (briefId: string, action: "approve" | "reject", note?: string) =>
  apiFetch<Brief>(`/api/v1/briefs/${briefId}/review`, { method: "POST", body: { action, note } });

export const draftWithLLM = (briefId: string) =>
  apiFetch<Brief>(`/api/v1/briefs/${briefId}/draft-llm`, { method: "POST" });

export const deleteBrief = (briefId: string) =>
  apiFetch<void>(`/api/v1/briefs/${briefId}`, { method: "DELETE" });

export const getConfidence = (briefId: string) =>
  apiFetch<ConfidenceRecord | null>(`/api/v1/briefs/${briefId}/confidence`);

export const setConfidence = (briefId: string, level: string, rationale?: string, dissent?: string) =>
  apiFetch<ConfidenceRecord>(`/api/v1/briefs/${briefId}/confidence`, {
    method: "PUT",
    body: { level, rationale, dissent },
  });

export const getACH = (briefId: string) =>
  apiFetch<ACHHypothesis[]>(`/api/v1/briefs/${briefId}/ach`);

export const addHypothesis = (briefId: string, hypothesis: string, likelihood: string) =>
  apiFetch<ACHHypothesis>(`/api/v1/briefs/${briefId}/ach`, {
    method: "POST",
    body: { hypothesis, likelihood, evidence_matrix: [] },
  });

export const deleteHypothesis = (briefId: string, hypId: string) =>
  apiFetch<void>(`/api/v1/briefs/${briefId}/ach/${hypId}`, { method: "DELETE" });

export const exportUrl = (briefId: string, format: "pdf" | "csv" | "gexf", publicMode = false) => {
  const base = `/api/v1/briefs/${briefId}/export/${format}`;
  return format === "pdf" && publicMode ? `${base}?public=true` : base;
};
