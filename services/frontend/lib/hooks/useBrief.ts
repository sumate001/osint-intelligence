import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/brief";
import type { BriefCreate, BriefUpdate } from "../types/brief";

export const useBriefs = (caseId?: string) =>
  useQuery({
    queryKey: ["briefs", caseId],
    queryFn: () => api.getBriefs(caseId),
  });

export const useBrief = (briefId: string) =>
  useQuery({
    queryKey: ["brief", briefId],
    queryFn: () => api.getBrief(briefId),
    enabled: !!briefId,
  });

export const useCreateBrief = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BriefCreate) => api.createBrief(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["briefs"] }),
  });
};

export const useUpdateBrief = (briefId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BriefUpdate) => api.updateBrief(briefId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brief", briefId] });
      qc.invalidateQueries({ queryKey: ["briefs"] });
    },
  });
};

export const useSubmitBrief = (briefId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.submitBrief(briefId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brief", briefId] }),
  });
};

export const useReviewBrief = (briefId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, note }: { action: "approve" | "reject"; note?: string }) =>
      api.reviewBrief(briefId, action, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brief", briefId] }),
  });
};

export const useDraftWithLLM = (briefId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.draftWithLLM(briefId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brief", briefId] }),
  });
};

export const useDeleteBrief = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (briefId: string) => api.deleteBrief(briefId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["briefs"] }),
  });
};

export const useConfidence = (briefId: string) =>
  useQuery({
    queryKey: ["confidence", briefId],
    queryFn: () => api.getConfidence(briefId),
    enabled: !!briefId,
  });

export const useSetConfidence = (briefId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ level, rationale, dissent }: { level: string; rationale?: string; dissent?: string }) =>
      api.setConfidence(briefId, level, rationale, dissent),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["confidence", briefId] }),
  });
};

export const useACH = (briefId: string) =>
  useQuery({
    queryKey: ["ach", briefId],
    queryFn: () => api.getACH(briefId),
    enabled: !!briefId,
  });

export const useAddHypothesis = (briefId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hypothesis, likelihood }: { hypothesis: string; likelihood: string }) =>
      api.addHypothesis(briefId, hypothesis, likelihood),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ach", briefId] }),
  });
};

export const useDeleteHypothesis = (briefId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hypId: string) => api.deleteHypothesis(briefId, hypId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ach", briefId] }),
  });
};
