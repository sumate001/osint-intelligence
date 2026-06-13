export type CaseStatus = "ACTIVE" | "CLOSED" | "ARCHIVED";
export type EvidenceStatus = "VERIFIED" | "PARTIAL" | "UNVERIFIED";
export type ScanStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

export interface Case {
  id: string;
  title: string;
  description: string;
  status: CaseStatus;
  feed_item_id: string | null;
  created_by: string;
  assigned_to: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CaseListOut {
  items: Case[];
  total: number;
}

export interface Evidence {
  id: string;
  case_id: string;
  title: string;
  content: string;
  url: string | null;
  status: EvidenceStatus;
  source_type: string;
  media: string[];
  created_at: string;
  updated_at: string;
}

export interface CaseScan {
  id: string;
  case_id: string;
  target: string;
  scan_type: string;
  external_id: string | null;
  status: ScanStatus;
  results: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from_: string;
  to: string;
  label: string;
}

export interface GraphOut {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CaseCreate {
  title: string;
  description?: string;
  feed_item_id?: string;
  tags?: string[];
}

export interface EvidenceCreate {
  title: string;
  content?: string;
  url?: string;
  status?: EvidenceStatus;
  source_type?: string;
}
