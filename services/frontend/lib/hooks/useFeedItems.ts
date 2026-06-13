"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFeedItems, getFeedStats, updateFeedItem, type ListItemsParams } from "@/lib/api/triage";

export function useFeedItems(params: ListItemsParams = {}) {
  return useQuery({
    queryKey: ["feed-items", params],
    queryFn: () => getFeedItems(params),
    refetchInterval: 30_000,
  });
}

export function useFeedStats() {
  return useQuery({
    queryKey: ["feed-stats"],
    queryFn: getFeedStats,
    refetchInterval: 30_000,
  });
}

export function useUpdateFeedItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateFeedItem>[1] }) =>
      updateFeedItem(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feed-items"] });
      qc.invalidateQueries({ queryKey: ["feed-stats"] });
    },
  });
}
