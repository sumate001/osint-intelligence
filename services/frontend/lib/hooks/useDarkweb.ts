import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/darkweb";

export function useDWStats() {
  return useQuery({ queryKey: ["dw-stats"], queryFn: api.getStats, refetchInterval: 15_000 });
}

export function useDWResults(queryId?: string) {
  return useQuery({
    queryKey: ["dw-results", queryId],
    queryFn: () => api.getResults(queryId),
    refetchInterval: 10_000,
  });
}

export function useLegalQueue() {
  return useQuery({ queryKey: ["dw-legal"], queryFn: api.getLegalQueue, refetchInterval: 15_000 });
}

export function useAuditLog() {
  return useQuery({ queryKey: ["dw-audit"], queryFn: api.getAuditLog });
}

export function useStartQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ query_text, reason, method }: { query_text: string; reason: string; method: string }) =>
      api.startQuery(query_text, reason, method),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dw-results"] });
      qc.invalidateQueries({ queryKey: ["dw-stats"] });
    },
  });
}

export function useReviewResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      api.reviewResult(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dw-legal"] });
      qc.invalidateQueries({ queryKey: ["dw-results"] });
      qc.invalidateQueries({ queryKey: ["dw-audit"] });
    },
  });
}
