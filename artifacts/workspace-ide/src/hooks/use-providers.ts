/**
 * use-providers.ts — React Query hooks for VenomGPT Provider Registry API
 *
 * Wraps GET /api/providers using TanStack Query.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type ProviderConnectionState = "connected" | "disconnected" | "error" | "unknown";
export type ProviderId = "zai";

export type ProviderIssueCategory =
  | "auth_failed"
  | "session_expired"
  | "token_refresh_failed"
  | "subscription_invalid"
  | "model_unavailable"
  | "usage_limit"
  | "entitlement_mismatch"
  | "wrong_api_path";

export interface ProviderIssue {
  category: ProviderIssueCategory;
  message: string;
  action: string;
  detectedAt: string;
}

export interface ProviderStatusView {
  id: ProviderId;
  displayName: string;
  connectionState: ProviderConnectionState;
  lastUpdatedAt: string | null;
  availableModels: string[];
  errorState: string | null;
  issue: ProviderIssue | null;
  usageNote: string | null;
  zaiMeta?: {
    hasApiKey: boolean;
    paasEndpoint: string;
    anthropicEndpoint: string;
    totalModelCount: number;
    paasModelCount: number;
    anthropicModelCount: number;
  };
}

export interface ProvidersResponse {
  providers: ProviderStatusView[];
}

async function fetchProviders(): Promise<ProvidersResponse> {
  const r = await fetch(`${BASE}/api/providers`);
  if (!r.ok) throw new Error(`Providers fetch failed: ${r.status}`);
  return r.json() as Promise<ProvidersResponse>;
}

export const PROVIDERS_QUERY_KEY = ["vgpt-providers"] as const;

export function useGetProviders() {
  return useQuery({
    queryKey: PROVIDERS_QUERY_KEY,
    queryFn: fetchProviders,
    staleTime: 15_000,
  });
}

export function useSimulateProviderIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      category,
    }: {
      id: ProviderId;
      category: ProviderIssueCategory;
    }) => {
      const r = await fetch(`${BASE}/api/providers/${id}/simulate-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!r.ok) throw new Error(`Simulate issue failed: ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
    },
  });
}

export function useClearProviderIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: ProviderId }) => {
      const r = await fetch(`${BASE}/api/providers/${id}/clear-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error(`Clear issue failed: ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
    },
  });
}
