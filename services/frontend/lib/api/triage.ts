import { apiFetch } from "./client";
import type { FeedItem, FeedItemList, FeedStats } from "@/lib/types/triage";

export interface ListItemsParams {
  verdict?: string;
  source_id?: string;
  is_archived?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

export function getFeedItems(params: ListItemsParams = {}): Promise<FeedItemList> {
  return apiFetch<FeedItemList>("/api/v1/triage/items", {
    params: params as Record<string, string | number | boolean | undefined>,
  });
}

export function getFeedItem(id: string): Promise<FeedItem> {
  return apiFetch<FeedItem>(`/api/v1/triage/items/${id}`);
}

export function getFeedStats(): Promise<FeedStats> {
  return apiFetch<FeedStats>("/api/v1/triage/stats");
}

export function updateFeedItem(
  id: string,
  patch: { is_read?: boolean; is_archived?: boolean; case_id?: string }
): Promise<FeedItem> {
  return apiFetch<FeedItem>(`/api/v1/triage/items/${id}`, {
    method: "PATCH",
    body: patch,
  });
}
