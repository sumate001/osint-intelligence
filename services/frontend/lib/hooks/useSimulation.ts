import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/simulation";
import type { SimConfig } from "../api/simulation";

export function useSimulations(caseId?: string) {
  return useQuery({
    queryKey: ["simulations", caseId],
    queryFn: () => api.listSimulations(caseId),
  });
}

export function useSimulation(jobId: string | null) {
  return useQuery({
    queryKey: ["simulation", jobId],
    queryFn: () => api.getSimulation(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "RUNNING" || status === "PENDING" ? 3000 : false;
    },
  });
}

export function useStartSimulation(caseId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ config, seed_data }: { config: SimConfig; seed_data?: Record<string, unknown> }) =>
      api.startSimulation(caseId, config, seed_data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["simulations", caseId] }),
  });
}
