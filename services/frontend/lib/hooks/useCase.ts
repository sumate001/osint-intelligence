import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/investigation";
import type { CaseCreate, CaseStatus, EvidenceCreate, EvidenceStatus } from "../types/investigation";

export function useCases(params?: { status?: string; page?: number }) {
  return useQuery({
    queryKey: ["cases", params],
    queryFn: () => api.getCases(params),
    refetchInterval: 30_000,
  });
}

export function useCase(caseId: string) {
  return useQuery({
    queryKey: ["case", caseId],
    queryFn: () => api.getCase(caseId),
    enabled: !!caseId,
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CaseCreate) => api.createCase(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });
}

export function useUpdateCase(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<{ title: string; description: string; status: CaseStatus }>) =>
      api.updateCase(caseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function useEvidence(caseId: string) {
  return useQuery({
    queryKey: ["evidence", caseId],
    queryFn: () => api.getEvidence(caseId),
    enabled: !!caseId,
    refetchInterval: 15_000,
  });
}

export function useAddEvidence(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: EvidenceCreate) => api.addEvidence(caseId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence", caseId] }),
  });
}

export function useUpdateEvidence(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ evidenceId, data }: { evidenceId: string; data: { status: EvidenceStatus } }) =>
      api.updateEvidence(caseId, evidenceId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence", caseId] }),
  });
}

export function useDeleteEvidence(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceId: string) => api.deleteEvidence(caseId, evidenceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence", caseId] }),
  });
}

export function useScans(caseId: string) {
  return useQuery({
    queryKey: ["scans", caseId],
    queryFn: () => api.getScans(caseId),
    enabled: !!caseId,
    refetchInterval: 10_000,
  });
}

export function useTriggerScan(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: string) => api.triggerScan(caseId, target),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scans", caseId] }),
  });
}

export function useCancelScan(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scanId: string) => api.cancelScan(caseId, scanId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scans", caseId] }),
  });
}

export function useCaseGraph(caseId: string) {
  return useQuery({
    queryKey: ["graph", caseId],
    queryFn: () => api.getCaseGraph(caseId),
    enabled: !!caseId,
    refetchInterval: 30_000,
  });
}
