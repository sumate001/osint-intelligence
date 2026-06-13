import { apiFetch } from "./client";

export interface SimConfig {
  agents: number;
  timeframe: number;
  groups: string;
  model: string;
}

export interface SimJob {
  id: string;
  case_id: string | null;
  status: string;
  config: Record<string, unknown>;
  seed_data: Record<string, unknown>;
  result: Record<string, unknown> | null;
  progress_step: number;
  error: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export function startSimulation(case_id: string | null, config: SimConfig, seed_data?: Record<string, unknown>) {
  return apiFetch<SimJob>("/api/v1/simulation", { method: "POST", body: { case_id, config, seed_data: seed_data ?? {} } });
}

export function getSimulation(jobId: string) {
  return apiFetch<SimJob>(`/api/v1/simulation/${jobId}`);
}

export function listSimulations(case_id?: string) {
  return apiFetch<SimJob[]>("/api/v1/simulation", { params: case_id ? { case_id } : undefined });
}
