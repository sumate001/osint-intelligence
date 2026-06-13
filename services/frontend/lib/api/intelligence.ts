import { apiFetch } from "./client";
import type { PIR, CaseActivity, EvidenceComment, DeceptionCheck, EntityRecord, Pattern } from "../types/intelligence";

// PIR
export const getPIRs = (status?: string) =>
  apiFetch<PIR[]>("/api/v1/pirs", { params: status ? { status } : undefined });

export const createPIR = (data: { question: string; priority: string; deadline?: string; notes?: string }) =>
  apiFetch<PIR>("/api/v1/pirs", { method: "POST", body: data });

export const updatePIR = (id: string, data: Partial<{ status: string; eei_list: unknown[]; notes: string }>) =>
  apiFetch<PIR>(`/api/v1/pirs/${id}`, { method: "PATCH", body: data });

export const deletePIR = (id: string) =>
  apiFetch<void>(`/api/v1/pirs/${id}`, { method: "DELETE" });

// Collaboration
export const getCaseActivity = (caseId: string) =>
  apiFetch<CaseActivity[]>(`/api/v1/collaboration/cases/${caseId}/activity`);

export const getComments = (evidenceId: string) =>
  apiFetch<EvidenceComment[]>(`/api/v1/collaboration/evidence/${evidenceId}/comments`);

export const addComment = (evidenceId: string, caseId: string, text: string, isDissent = false) =>
  apiFetch<EvidenceComment>(`/api/v1/collaboration/evidence/${evidenceId}/comments?case_id=${caseId}`, {
    method: "POST",
    body: { text, is_dissent: isDissent },
  });

export const deleteComment = (commentId: string) =>
  apiFetch<void>(`/api/v1/collaboration/comments/${commentId}`, { method: "DELETE" });

// Deception
export const getDeceptionChecks = (caseId?: string) =>
  apiFetch<DeceptionCheck[]>("/api/v1/deception", { params: caseId ? { case_id: caseId } : undefined });

export const runDeceptionCheck = (data: { target_title: string; target_url?: string; content?: string; case_id?: string }) =>
  apiFetch<DeceptionCheck>("/api/v1/deception", { method: "POST", body: data });

// Knowledge
export const searchEntities = (q: string) =>
  apiFetch<EntityRecord[]>("/api/v1/knowledge/search", { params: { q } });

export const getPatterns = (minCases = 2) =>
  apiFetch<Pattern[]>("/api/v1/knowledge/patterns", { params: { min_cases: minCases } });
