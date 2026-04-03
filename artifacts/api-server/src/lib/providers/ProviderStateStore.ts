/**
 * ProviderStateStore.ts — Phase 2: Generic provider state (in-memory, Z.AI wired)
 *
 * Holds the five-state lifecycle model for any provider-path driver.
 * This is the provider-agnostic FUTURE replacement for providerRegistry.ts.
 *
 * ── Phase 2 state (current) ──────────────────────────────────────────────────
 *
 * This store is imported and used by ZaiDriver.ts for in-memory lifecycle
 * state tracking (probe results, authenticated state transitions).
 * It does NOT replace providerRegistry.ts yet — that is Phase 6 work.
 *
 * ── Coexistence with providerRegistry.ts ─────────────────────────────────────
 *
 * Two registry modules exist on disk simultaneously:
 *
 *   providerRegistry.ts (LEGACY)
 *     - ACTIVE for persisted runtime state (provider-registry.json).
 *     - Imported by routes/providerRegistry.ts, index.ts.
 *     - Has legacy field naming (ProviderConnectionState, ProviderId).
 *     - Owns the state shown in the Integrations UI card.
 *
 *   ProviderStateStore.ts (THIS FILE — FUTURE)
 *     - Used by ZaiDriver.ts for in-memory lifecycle tracking only.
 *     - No disk persistence yet. State resets on server restart.
 *     - Provider-agnostic: no Codex-specific fields, no Z.AI-specific fields.
 *     - Will absorb providerRegistry.ts's responsibilities in Phase 6.
 *
 * ── Key difference from providerRegistry.ts ──────────────────────────────────
 *
 * providerRegistry.ts has Codex-specific fields baked in (ProviderConnectionState,
 * ProviderId). This store is provider-agnostic: every driver uses the same
 * ProviderLifecycleState without special-casing.
 *
 * ── Persistence plan ─────────────────────────────────────────────────────────
 *
 * Phase 6 (deferred): Add disk persistence and replace providerRegistry.ts.
 * Until Phase 6 is executed, this store is in-memory only and does not
 * replace the persisted state in providerRegistry.ts.
 */

import type {
  ProviderPath,
  ProviderLifecycleState,
  ProbeResult,
  NormalizedProviderError,
} from "./ProviderContract.js";

// ─── Provider state entry ─────────────────────────────────────────────────────
//
// One entry per provider-path. Completely provider-agnostic:
// no Codex-specific fields, no Z.AI-specific fields.

export interface ProviderStateEntry {
  /** The provider-path this entry represents. */
  providerPath: ProviderPath;
  /** Current lifecycle state. */
  lifecycle: ProviderLifecycleState;
  /** ISO timestamp of the last state change. */
  lastUpdatedAt: string;
  /** ISO timestamp of the last successful probe (null if never probed). */
  lastProbedAt: string | null;
  /** Result of the most recent probe run (null if never probed). */
  lastProbeResult: ProbeResult | null;
  /** Models available on this provider (populated after successful probe). */
  availableModelIds: string[];
  /** Structured error when lifecycle is authenticated_blocked (null when healthy). */
  issue: NormalizedProviderError | null;
}

// ─── Transition helpers ───────────────────────────────────────────────────────

/**
 * Returns true if the given lifecycle state indicates execution is viable.
 * Only `verified` is viable — all other states will fail at execution time.
 */
export function isExecutionViable(state: ProviderLifecycleState): boolean {
  return state === "verified";
}

/**
 * Returns true if the given lifecycle state has credentials but cannot execute.
 * These states have credentials stored but need further action before execution.
 */
export function isBlockedWithCredentials(state: ProviderLifecycleState): boolean {
  return state === "authenticated_blocked" || state === "authenticated_unverified";
}

// ─── In-memory store ──────────────────────────────────────────────────────────
//
// Phase 1: simple Map, no disk persistence.
// Phase 2+: persistence will be added alongside the existing registry.

const _store = new Map<ProviderPath, ProviderStateEntry>();

function _now(): string {
  return new Date().toISOString();
}

function _buildDefault(providerPath: ProviderPath): ProviderStateEntry {
  return {
    providerPath,
    lifecycle: "disconnected",
    lastUpdatedAt: _now(),
    lastProbedAt: null,
    lastProbeResult: null,
    availableModelIds: [],
    issue: null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the current state entry for a provider-path.
 * Returns a default disconnected entry if the provider has not been registered.
 */
export function getState(providerPath: ProviderPath): Readonly<ProviderStateEntry> {
  return _store.get(providerPath) ?? _buildDefault(providerPath);
}

/**
 * Update the state for a provider-path.
 * Merges the patch into the existing entry (or into a default entry).
 * Always stamps `lastUpdatedAt`.
 */
export function setState(
  providerPath: ProviderPath,
  patch: Partial<Omit<ProviderStateEntry, "providerPath" | "lastUpdatedAt">>
): ProviderStateEntry {
  const current = _store.get(providerPath) ?? _buildDefault(providerPath);
  const updated: ProviderStateEntry = {
    ...current,
    ...patch,
    providerPath, // always authoritative
    lastUpdatedAt: _now(),
  };
  _store.set(providerPath, updated);
  return updated;
}

/**
 * Apply a probe result to a provider's state.
 * Updates lifecycle, lastProbedAt, lastProbeResult, and issue atomically.
 *
 * Maps ProbeStatus to ProviderLifecycleState:
 *   verified              → verified
 *   authenticated_blocked → authenticated_blocked
 *   inconclusive          → state unchanged (probe did not produce a verdict)
 *   unauthenticated       → disconnected
 */
export function applyProbeResult(
  providerPath: ProviderPath,
  result: ProbeResult,
  availableModelIds: string[] = []
): ProviderStateEntry {
  const probeAt = result.probedAt;

  let lifecycle: ProviderLifecycleState | undefined;
  let issue: NormalizedProviderError | null = null;

  switch (result.status) {
    case "verified":
      lifecycle = "verified";
      issue = null;
      break;

    case "authenticated_blocked":
      lifecycle = "authenticated_blocked";
      if (result.failureReason) {
        issue = {
          category: result.failureReason,
          message: result.message,
          action: "Resolve the blocking condition and re-probe.",
          detectedAt: probeAt,
          rawDetail: result.rawDetail,
        };
      }
      break;

    case "unauthenticated":
      lifecycle = "disconnected";
      issue = null;
      break;

    case "inconclusive":
      // Do not change lifecycle — probe was inconclusive (e.g. network error).
      // Keep the current state; update timestamps and result only.
      lifecycle = undefined;
      break;
  }

  const patch: Partial<Omit<ProviderStateEntry, "providerPath" | "lastUpdatedAt">> = {
    lastProbedAt: probeAt,
    lastProbeResult: result,
    ...(lifecycle !== undefined ? { lifecycle } : {}),
    ...(lifecycle === "verified" ? { availableModelIds, issue: null } : {}),
    ...(lifecycle === "authenticated_blocked" ? { availableModelIds: [], issue } : {}),
    ...(lifecycle === "disconnected" ? { availableModelIds: [], issue: null } : {}),
  };

  return setState(providerPath, patch);
}

/**
 * Set a provider to awaiting_callback state (OAuth flow started).
 */
export function setAwaitingCallback(providerPath: ProviderPath): ProviderStateEntry {
  return setState(providerPath, { lifecycle: "awaiting_callback", issue: null });
}

/**
 * Set a provider to authenticated_unverified (credentials received, not probed yet).
 */
export function setAuthenticatedUnverified(providerPath: ProviderPath): ProviderStateEntry {
  return setState(providerPath, { lifecycle: "authenticated_unverified", issue: null });
}

/**
 * Disconnect a provider — clear all state back to defaults.
 */
export function disconnect(providerPath: ProviderPath): ProviderStateEntry {
  return setState(providerPath, {
    lifecycle: "disconnected",
    lastProbedAt: null,
    lastProbeResult: null,
    availableModelIds: [],
    issue: null,
  });
}

/**
 * List all provider-paths that have been set in the store.
 */
export function listTrackedProviders(): ProviderPath[] {
  return Array.from(_store.keys());
}
