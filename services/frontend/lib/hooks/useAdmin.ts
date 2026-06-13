"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/admin";

export function useAdminSettings() {
  return useQuery({ queryKey: ["admin-settings"], queryFn: api.getAdminSettings });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: api.SettingsPatch) => api.patchAdminSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-settings"] }),
  });
}

export function useAdminUsers() {
  return useQuery({ queryKey: ["admin-users"], queryFn: api.listAdminUsers });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: api.UserCreate) => api.createAdminUser(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.UserUpdate }) => api.updateAdminUser(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAdminUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useServiceHealth() {
  return useQuery({
    queryKey: ["admin-health"],
    queryFn: api.getServiceHealth,
    refetchInterval: 30_000,
  });
}

export function useSystemLogs(params?: { service?: string; level?: string }) {
  return useQuery({
    queryKey: ["admin-logs", params],
    queryFn: () => api.getSystemLogs(params),
    refetchInterval: 15_000,
  });
}

export function useSystemVersion() {
  return useQuery({
    queryKey: ["system-version"],
    queryFn: () => api.getSystemVersion(false),
    staleTime: 5 * 60_000,
  });
}

export function useCheckForUpdates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.getSystemVersion(true),
    onSuccess: (data) => qc.setQueryData(["system-version"], data),
  });
}
