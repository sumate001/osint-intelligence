import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/intelligence";

// PIR — poll every 8s so auto-match updates appear without manual refresh
export const usePIRs = (status?: string) =>
  useQuery({
    queryKey: ["pirs", status],
    queryFn: () => api.getPIRs(status),
    refetchInterval: 8000,
  });

export const useCreatePIR = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createPIR,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pirs"] }),
  });
};

export const useUpdatePIR = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updatePIR>[1] }) =>
      api.updatePIR(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pirs"] }),
  });
};

export const useDeletePIR = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deletePIR,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pirs"] }),
  });
};

// Activity
export const useCaseActivity = (caseId: string) =>
  useQuery({
    queryKey: ["activity", caseId],
    queryFn: () => api.getCaseActivity(caseId),
    enabled: !!caseId,
    refetchInterval: 15000,
  });

// Comments
export const useComments = (evidenceId: string) =>
  useQuery({
    queryKey: ["comments", evidenceId],
    queryFn: () => api.getComments(evidenceId),
    enabled: !!evidenceId,
  });

export const useAddComment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ evidenceId, caseId, text, isDissent }: { evidenceId: string; caseId: string; text: string; isDissent?: boolean }) =>
      api.addComment(evidenceId, caseId, text, isDissent),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["comments", vars.evidenceId] });
      qc.invalidateQueries({ queryKey: ["activity", vars.caseId] });
    },
  });
};

// Deception
export const useDeceptionChecks = (caseId?: string) =>
  useQuery({ queryKey: ["deception", caseId], queryFn: () => api.getDeceptionChecks(caseId) });

export const useRunDeceptionCheck = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.runDeceptionCheck,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deception"] }),
  });
};

// Knowledge
export const useSearchEntities = (q: string) =>
  useQuery({
    queryKey: ["knowledge-search", q],
    queryFn: () => api.searchEntities(q),
    enabled: q.length >= 2,
  });

export const usePatterns = () =>
  useQuery({ queryKey: ["patterns"], queryFn: () => api.getPatterns() });
