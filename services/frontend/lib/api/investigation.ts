import { apiFetch } from "./client";
import type {
  Case, CaseCreate, CaseListOut,
  Evidence, EvidenceCreate,
  CaseScan, GraphOut,
} from "../types/investigation";

export function getCases(params?: { status?: string; page?: number; page_size?: number }) {
  return apiFetch<CaseListOut>("/api/v1/investigation/cases", { params });
}

export function getCase(caseId: string) {
  return apiFetch<Case>(`/api/v1/investigation/cases/${caseId}`);
}

export function createCase(data: CaseCreate) {
  return apiFetch<Case>("/api/v1/investigation/cases", {
    method: "POST",
    body: data,
  });
}

export function updateCase(caseId: string, data: Partial<Case>) {
  return apiFetch<Case>(`/api/v1/investigation/cases/${caseId}`, {
    method: "PATCH",
    body: data,
  });
}

export function deleteCase(caseId: string) {
  return apiFetch<void>(`/api/v1/investigation/cases/${caseId}`, { method: "DELETE" });
}

// Evidence

export function getEvidence(caseId: string) {
  return apiFetch<Evidence[]>(`/api/v1/investigation/cases/${caseId}/evidence`);
}

export function addEvidence(caseId: string, data: EvidenceCreate) {
  return apiFetch<Evidence>(`/api/v1/investigation/cases/${caseId}/evidence`, {
    method: "POST",
    body: data,
  });
}

export function updateEvidence(caseId: string, evidenceId: string, data: Partial<Evidence>) {
  return apiFetch<Evidence>(`/api/v1/investigation/cases/${caseId}/evidence/${evidenceId}`, {
    method: "PATCH",
    body: data,
  });
}

export function deleteEvidence(caseId: string, evidenceId: string) {
  return apiFetch<void>(
    `/api/v1/investigation/cases/${caseId}/evidence/${evidenceId}`,
    { method: "DELETE" }
  );
}

// Scans

export function triggerScan(caseId: string, target: string) {
  return apiFetch<CaseScan>(`/api/v1/investigation/cases/${caseId}/scans`, {
    method: "POST",
    body: { target, scan_type: "spiderfoot" },
  });
}

export function getScans(caseId: string) {
  return apiFetch<CaseScan[]>(`/api/v1/investigation/cases/${caseId}/scans`);
}

export function cancelScan(caseId: string, scanId: string) {
  return apiFetch<CaseScan>(`/api/v1/investigation/cases/${caseId}/scans/${scanId}/cancel`, {
    method: "POST",
  });
}

// Graph

export function getCaseGraph(caseId: string) {
  return apiFetch<GraphOut>(`/api/v1/investigation/cases/${caseId}/graph`);
}
