export type BriefMode = "INTERNAL" | "PUBLIC";
export type BriefStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export type SectionType = "findings_verified" | "findings_unverified" | "missing_links" | "methodology";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type ACHLikelihood = "VERY_LIKELY" | "LIKELY" | "UNLIKELY" | "VERY_UNLIKELY";
export type ACHConsistency = "CONSISTENT" | "INCONSISTENT" | "NEUTRAL" | "NA";

export interface BriefItem {
  id: string;
  text: string;
  verified: boolean;
  sources: string[];
}

export interface BriefSection {
  id: string;
  type: SectionType;
  title: string;
  items: BriefItem[];
}

export interface Brief {
  id: string;
  case_id: string | null;
  title: string;
  mode: BriefMode;
  status: BriefStatus;
  sections: BriefSection[];
  summary: string | null;
  methodology: string | null;
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface BriefListItem {
  id: string;
  title: string;
  mode: BriefMode;
  status: BriefStatus;
  case_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BriefCreate {
  title: string;
  case_id?: string;
  sections?: BriefSection[];
  summary?: string;
  methodology?: string;
}

export interface BriefUpdate {
  title?: string;
  mode?: BriefMode;
  sections?: BriefSection[];
  summary?: string;
  methodology?: string;
}

export interface ConfidenceRecord {
  id: string;
  brief_id: string;
  level: ConfidenceLevel;
  rationale: string | null;
  dissent: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ACHEvidenceEntry {
  evidence_id: string;
  text: string;
  consistency: ACHConsistency;
}

export interface ACHHypothesis {
  id: string;
  brief_id: string;
  hypothesis: string;
  evidence_matrix: ACHEvidenceEntry[];
  likelihood: ACHLikelihood;
  created_by: string;
  created_at: string;
}
