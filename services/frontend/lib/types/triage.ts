export type Verdict = "PRIORITY" | "INVESTIGATE" | "FAST_TRACK" | "PASS";

export interface FeedItem {
  id: string;
  external_id: string;
  source_id: string;
  source_type: string;
  title: string;
  body: string;
  url: string | null;
  language: string;
  published_at: string | null;
  ingested_at: string;
  scored_at: string | null;

  score_relevance: number | null;
  score_urgency: number | null;
  score_impact: number | null;
  score_novelty: number | null;
  score_reliability: number | null;
  score_sensitivity: number | null;
  score_actionability: number | null;
  total_score: number | null;

  verdict: Verdict | null;
  verdict_reason: string | null;

  admiralty_source: string;
  admiralty_info: string;

  entities: {
    persons?: string[];
    organizations?: string[];
    locations?: string[];
    events?: string[];
  };

  source_weight: number;
  verified_source: boolean;
  is_read: boolean;
  is_archived: boolean;
  case_id: string | null;
  media: Array<{ url: string; media_type: string; caption?: string }>;
}

export interface FeedItemList {
  items: FeedItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface FeedStats {
  priority: number;
  investigate: number;
  fast_track: number;
  pass: number;
  total: number;
}
