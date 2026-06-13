// PIR / Requirements
export type PIRPriority = "P1" | "P2" | "P3";
export type PIRStatus = "ACTIVE" | "ANSWERED" | "CANCELLED";

export interface EEI {
  id: string;
  question: string;
  answered: boolean;
}

export interface PIR {
  id: string;
  question: string;
  priority: PIRPriority;
  status: PIRStatus;
  deadline: string | null;
  eei_list: EEI[];
  progress: number;
  assigned_to: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Collaboration
export interface CaseActivity {
  id: string;
  case_id: string;
  action_type: string;
  actor_id: string;
  actor_name: string;
  description: string;
  entity_id: string | null;
  created_at: string;
}

export interface EvidenceComment {
  id: string;
  evidence_id: string;
  case_id: string;
  author_id: string;
  author_name: string;
  text: string;
  is_dissent: boolean;
  created_at: string;
  updated_at: string;
}

// Deception
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface DeceptionCheck {
  id: string;
  case_id: string | null;
  target_title: string;
  target_url: string | null;
  cui_bono: string | null;
  timing_analysis: string | null;
  source_motivation: string | null;
  bot_indicators: string[];
  risk_level: RiskLevel;
  flagged: boolean;
  flag_reason: string | null;
  created_by: string;
  created_at: string;
}

// Knowledge
export interface CaseRef {
  case_id: string;
  case_title: string;
  role: string;
  first_seen: string;
  last_seen: string;
}

export interface EntityRecord {
  id: string;
  entity_name: string;
  entity_type: string;
  cases_involved: CaseRef[];
  notes: string | null;
  first_seen: string;
  last_seen: string;
}

export interface Pattern {
  entity_name: string;
  entity_type: string;
  case_count: number;
  cases: string[];
}
