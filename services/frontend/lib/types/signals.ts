export type SignalType = "weak_signal" | "trend_breakout";
export type SignalStatus = "pending_review" | "accepted" | "dismissed" | "closed";
/** What the newsroom told Horizon. `off_topic` is feedback about relevance,
 * not accuracy — the detection was right and the story is simply not our beat —
 * and Horizon must not count it as a detection error. */
export type SignalVerdict = "true_signal" | "false_signal" | "inconclusive" | "off_topic";
export type CallbackStatus = "pending" | "delivered" | "failed" | "disabled";

/** The body Horizon sent, kept verbatim on the signal row. */
export interface SignalPayload {
  signal_id: string;
  signal_type: SignalType;
  title: string;
  combined_score: number;
  trend_score: number;
  categories: string[];
  summary: string;
  top_events: {
    summary: string;
    url: string;
    source_name: string;
    credibility_weight: number;
    event_time: string | null;
  }[];
  force_assessments: { force: string; impact: number; uncertainty: number }[];
  scenario_id: string | null;
  created_at: string;
}

export interface ExternalSignal {
  id: string;
  source_system: string;
  signal_id: string;
  signal_type: SignalType;
  title: string;
  payload: SignalPayload;
  status: SignalStatus;
  investigation_case_id: string | null;
  verdict: SignalVerdict | null;
  analyst_note: string | null;
  callback_status: CallbackStatus | null;
  /** Which standing interest it landed in; null means nobody asked for it. */
  profile_id: string | null;
  /** Why it landed there, in the words of whatever decided — a category overlap
   * or the model reading the profile description. Shown so an editor can see
   * whether a profile is doing what they meant it to. */
  profile_reason: string | null;
  received_at: string;
  closed_at: string | null;
}

export interface SignalListOut {
  items: ExternalSignal[];
  total: number;
}

export interface SignalCountOut {
  pending_review: number;
}


/** A standing statement of what this newsroom follows. Matching happens on the
 * DESK side on purpose: editorial priorities change weekly and belong here, not
 * in the engine that finds the stories. */
export type SignalProfileInput = {
  name: string;
  description: string;
  /** Horizon's own labels. An overlap decides on its own, with no model call. */
  categories: string[];
  active: boolean;
};

export type SignalProfile = SignalProfileInput & {
  id: string;
  /** Signals sitting in this box awaiting review. */
  pending: number;
};
