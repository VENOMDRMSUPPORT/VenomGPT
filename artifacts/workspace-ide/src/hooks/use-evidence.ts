/**
 * use-evidence.ts — React Query hooks for the /evidence and /actions endpoints.
 *
 * These endpoints are not generated via OpenAPI codegen, so we provide
 * hand-written hooks following the same patterns as @workspace/api-client-react.
 */

import { useQuery } from '@tanstack/react-query';
import type {
  TaskEvidence,
  TaskEvidenceExecutionSummary,
  TaskEvidencePlan,
  TaskEvidenceRouteProfile,
  TaskEvidenceCheckpointSummary,
  ContinuationLineage,
} from '../lib/evidenceTypes';
import type { ActionRecord } from '@/lib/actionSelectors';

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

export type {
  TaskEvidence,
  TaskEvidenceExecutionSummary,
  TaskEvidencePlan,
  TaskEvidenceRouteProfile,
  TaskEvidenceCheckpointSummary,
  ContinuationLineage,
};

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface EvidenceResponse {
  taskId: string;
  status: string;
  taskEvidence: TaskEvidence | null;
  reason?: string;
  /** Present when the task is a resumed continuation of a prior run. */
  continuationLineage?: ContinuationLineage;
}

export interface ActionsResponse {
  taskId: string;
  count: number;
  actions: ActionRecord[];
}

// ─── Query key factories ──────────────────────────────────────────────────────

export function getTaskEvidenceQueryKey(taskId: string) {
  return [`/api/agent/tasks/${taskId}/evidence`] as const;
}

export function getTaskActionsQueryKey(taskId: string) {
  return [`/api/agent/runs/${taskId}/actions`] as const;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch structured evidence for a completed task.
 * Only enabled when a taskId is provided and the task is not live/running.
 */
export function useTaskEvidence(taskId: string | null, enabled = true) {
  return useQuery<EvidenceResponse>({
    queryKey: getTaskEvidenceQueryKey(taskId ?? ''),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/agent/tasks/${taskId}/evidence`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<EvidenceResponse>;
    },
    enabled: !!taskId && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Fetch action records for a task.
 * Only enabled when a taskId is provided.
 */
export function useTaskActions(taskId: string | null, enabled = true) {
  return useQuery<ActionsResponse>({
    queryKey: getTaskActionsQueryKey(taskId ?? ''),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/agent/runs/${taskId}/actions`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<ActionsResponse>;
    },
    enabled: !!taskId && enabled,
    staleTime: 60_000,
    retry: false,
  });
}
