import { apiFetch } from "./client";
import type { FeedCounts, FeedResponse } from "../types/feed";

/** Read-through to Horizon, which is the only thing ingesting now. */
export function getFeed(params?: {
  verdict?: string;
  limit?: number;
  offset?: number;
  order?: "recent" | "score";
}) {
  return apiFetch<FeedResponse>("/api/v1/signals/feed", { params });
}

export function getFeedCounts() {
  return apiFetch<FeedCounts>("/api/v1/signals/feed/counts");
}
