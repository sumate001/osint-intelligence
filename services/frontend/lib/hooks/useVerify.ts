import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/verify";

export function useVerifyJobs(params?: { page?: number }) {
  return useQuery({
    queryKey: ["verify-jobs", params],
    queryFn: () => api.getVerifyJobs(params),
    refetchInterval: 5_000,
  });
}

export function useVerifyJob(jobId: string) {
  return useQuery({
    queryKey: ["verify-job", jobId],
    queryFn: () => api.getVerifyJob(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "DONE" || status === "FAILED" ? false : 3_000;
    },
  });
}

export function useUploadForVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadForVerify(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["verify-jobs"] }),
  });
}
