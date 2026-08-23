import { useQuery } from "@tanstack/react-query";

import * as api from "../api/feed";

export function useHorizonFeed(params?: {
  verdict?: string;
  order?: "recent" | "score";
  limit?: number;
}) {
  return useQuery({
    queryKey: ["horizon-feed", params?.verdict ?? "ALL", params?.order ?? "recent"],
    queryFn: () => api.getFeed(params),
    // Horizon polls sources every 15 minutes, so anything faster than this
    // just re-renders the same rows.
    refetchInterval: 60_000,
  });
}

export function useHorizonFeedCounts() {
  return useQuery({
    queryKey: ["horizon-feed-counts"],
    queryFn: api.getFeedCounts,
    refetchInterval: 60_000,
  });
}
