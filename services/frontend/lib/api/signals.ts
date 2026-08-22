import { apiFetch } from "./client";
import type {
  ExternalSignal,
  SignalCountOut,
  SignalListOut,
  SignalVerdict,
} from "../types/signals";
import type { Case } from "../types/investigation";

export function getSignals(params?: {
  status?: string;
  page?: number;
  page_size?: number;
}) {
  return apiFetch<SignalListOut>("/api/v1/signals", { params });
}

export function getSignalCount() {
  return apiFetch<SignalCountOut>("/api/v1/signals/count");
}

export function getSignal(id: string) {
  return apiFetch<ExternalSignal>(`/api/v1/signals/${id}`);
}

/** Creates an investigation case pre-filled from the signal. */
export function acceptSignal(id: string, data?: { title?: string; assigned_to?: string }) {
  return apiFetch<Case>(`/api/v1/signals/${id}/accept`, {
    method: "POST",
    body: data ?? {},
  });
}

/** Rejects the signal; Horizon is told immediately that it was a false lead. */
export function dismissSignal(id: string, reason: string) {
  return apiFetch<ExternalSignal>(`/api/v1/signals/${id}/dismiss`, {
    method: "POST",
    body: { reason },
  });
}

/** Closes a signal-originated case with the verdict that trains the radar. */
export function closeSignal(id: string, verdict: SignalVerdict, analyst_note?: string) {
  return apiFetch<ExternalSignal>(`/api/v1/signals/${id}/close`, {
    method: "POST",
    body: { verdict, analyst_note: analyst_note ?? null },
  });
}

/** Backs the origin badge — 404 simply means the case was opened by hand. */
export function getSignalForCase(caseId: string) {
  return apiFetch<ExternalSignal>(`/api/v1/signals/by-case/${caseId}`);
}
