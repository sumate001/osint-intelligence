import { apiFetch } from "./client";
import type { VerifyJob, VerifyJobListOut } from "../types/verify";

export function getVerifyJobs(params?: { page?: number; page_size?: number }) {
  return apiFetch<VerifyJobListOut>("/api/v1/verify/jobs", { params });
}

export function getVerifyJob(jobId: string) {
  return apiFetch<VerifyJob>(`/api/v1/verify/jobs/${jobId}`);
}

export async function uploadForVerify(file: File): Promise<VerifyJob> {
  const formData = new FormData();
  formData.append("file", file);

  // Use raw fetch — apiFetch sets Content-Type: application/json which breaks multipart
  const stored = typeof window !== "undefined" ? localStorage.getItem("osintdesk-auth") : null;
  const token = stored ? (JSON.parse(stored)?.state?.token ?? null) : null;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch("/api/v1/verify/upload", {
    method: "POST",
    headers,
    body: formData,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }
  return resp.json();
}
