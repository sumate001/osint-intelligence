export type VerifyStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";
export type VerifyVerdict = "VERIFIED" | "SUSPICIOUS" | "UNVERIFIED";

export interface VerifyJob {
  id: string;
  filename: string;
  file_type: string;
  status: VerifyStatus;
  file_size: number | null;

  exif_data: Record<string, unknown>;
  gps_lat: number | null;
  gps_lon: number | null;
  gps_timestamp: string | null;
  camera_make: string | null;
  camera_model: string | null;

  wayback_url: string | null;
  wayback_first_seen: string | null;
  duplicate_hits: Array<{ title: string; url: string; thumbnail: string }>;
  transcript: string | null;
  feed_item_id: string | null;

  verdict: VerifyVerdict | null;
  verdict_notes: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface VerifyJobListOut {
  items: VerifyJob[];
  total: number;
}
