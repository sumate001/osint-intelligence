export type SignalType = "weak_signal" | "trend_breakout";
export type SignalStatus = "pending_review" | "accepted" | "dismissed" | "closed";
export type SignalVerdict = "true_signal" | "false_signal" | "inconclusive";
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
