/**
 * The inbound stream as Horizon scores it.
 *
 * Horizon owns ingestion, editorial triage, dedup and clustering; this side
 * reads. An "event" here is already deduplicated — one story, however many
 * outlets carried it, which is why `source_count` matters.
 */

export type TriageVerdict = "PRIORITY" | "FAST_TRACK" | "INVESTIGATE" | "PASS";

export interface TriageScores {
  verdict: TriageVerdict | null;
  total: number | null;
  relevance: number | null;
  urgency: number | null;
  impact: number | null;
  novelty: number | null;
  reliability: number | null;
  sensitivity: number | null;
  actionability: number | null;
}

export interface HorizonEvent {
  id: string;
  summary: string | null;
  actors: string[];
  action: string | null;
  location: string | null;
  event_time: string | null;
  categories: string[];
  /** How many outlets carried this story. > 1 means independently confirmed. */
  source_count: number;
  source_name: string | null;
  url: string | null;
  credibility_weight: number;
  incomplete: boolean;
  /** Times the story was revised with new facts after first being seen. */
  updates: number;
  cluster_id: string | null;
  created_at: string;
  triage: TriageScores;
}

export interface FeedResponse {
  /** False when Horizon is unreachable — an empty state, not an error. */
  available: boolean;
  items: HorizonEvent[];
  error?: string;
}

export interface FeedCounts {
  available: boolean;
  /**
   * ALL is every event, not the sum of the verdicts. UNSCORED is the gap —
   * events ingested before editorial scoring existed. It shrinks to zero as
   * they age out; it is not a backlog anyone has to clear.
   */
  counts: Partial<Record<TriageVerdict | "ALL" | "UNSCORED", number>>;
  error?: string;
}
