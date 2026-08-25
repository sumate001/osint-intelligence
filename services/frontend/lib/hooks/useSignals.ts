import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/signals";
import type { SignalProfileInput, SignalVerdict } from "../types/signals";

export function useSignals(status?: string, profile?: string) {
  return useQuery({
    queryKey: ["signals", status ?? "all", profile ?? "any"],
    queryFn: () =>
      api.getSignals({ ...(status ? { status } : {}), ...(profile ? { profile } : {}) }),
    refetchInterval: 30_000,
  });
}

/** Drives the inbox badge. Polled so a new signal shows up without a reload. */
export function useSignalCount() {
  return useQuery({
    queryKey: ["signal-count"],
    queryFn: api.getSignalCount,
    refetchInterval: 30_000,
  });
}

/** 404 here is the normal answer for a case that was opened by hand. */
export function useSignalForCase(caseId?: string) {
  return useQuery({
    queryKey: ["signal-for-case", caseId],
    queryFn: () => api.getSignalForCase(caseId!),
    enabled: Boolean(caseId),
    retry: false,
  });
}

/** Shared invalidation for every signal action.
 *
 * Generic over the result too, not just the arguments: callers need the created
 * case back from `accept` to navigate to it, and a `Promise<unknown>` here would
 * erase that at the call site.
 */
function useSignalMutation<TResult, TArgs>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation<TResult, Error, TArgs>({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signals"] });
      qc.invalidateQueries({ queryKey: ["signal-count"] });
      // Accepting creates a case, so the case list is stale too.
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function useAcceptSignal() {
  return useSignalMutation(({ id, title }: { id: string; title?: string }) =>
    api.acceptSignal(id, title ? { title } : undefined),
  );
}

export function useDismissSignal() {
  return useSignalMutation(
    ({ id, reason, verdict }: { id: string; reason: string; verdict: api.DismissKind }) =>
      api.dismissSignal(id, reason, verdict),
  );
}

export function useCloseSignal() {
  return useSignalMutation(
    ({ id, verdict, note }: { id: string; verdict: SignalVerdict; note?: string }) =>
      api.closeSignal(id, verdict, note),
  );
}


export function useSignalProfiles() {
  return useQuery({
    queryKey: ["signal-profiles"],
    queryFn: api.getSignalProfiles,
    refetchInterval: 60_000,
  });
}

export function useCreateSignalProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createSignalProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signal-profiles"] });
      qc.invalidateQueries({ queryKey: ["signals"] });
    },
  });
}

export function useUpdateSignalProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SignalProfileInput }) =>
      api.updateSignalProfile(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signal-profiles"] });
      qc.invalidateQueries({ queryKey: ["signals"] });
    },
  });
}

export function useDeleteSignalProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteSignalProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signal-profiles"] });
      qc.invalidateQueries({ queryKey: ["signals"] });
    },
  });
}
