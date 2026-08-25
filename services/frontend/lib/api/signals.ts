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

/** What kind of "no" a dismissal is. Relevance and accuracy are different
 * answers and Horizon reads them differently: `off_topic` says the detection
 * was right and the story is simply not this newsroom's beat, while
 * `false_signal` says the radar was wrong. Every dismissal used to be sent as
 * the second one. */
export type DismissKind = "off_topic" | "false_signal";

export function dismissSignal(id: string, reason: string, verdict: DismissKind = "off_topic") {
  return apiFetch<ExternalSignal>(`/api/v1/signals/${id}/dismiss`, {
    method: "POST",
    body: { reason, verdict },
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
