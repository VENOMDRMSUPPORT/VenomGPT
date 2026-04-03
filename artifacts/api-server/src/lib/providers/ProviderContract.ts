/**
 * ProviderContract.ts — Provider architecture contract (stable, Phase 2+)
 *
 * This file defines the shared TypeScript interface that all provider drivers
 * must implement. It is the authoritative contract for the Provider Layer Reset
 * (see docs/provider-layer-reset-roadmap.md).
 *
 * ── Design rules ─────────────────────────────────────────────────────────────
 *
 * 1. This file has NO imports from existing provider files (modelAdapter.ts,
 *    providerRegistry.ts, zaiCapabilities.ts, settingsStore.ts, etc.).
 *    It is a standalone type definition module.
 *
 * 2. Do not add provider-specific logic here. This contract is provider-agnostic.
 *    Provider-specific types (ZaiErrorCategory, lane names) belong in their
 *    respective driver files, not here.
 *
 * ── Current phase status ─────────────────────────────────────────────────────
 *
 *   Phase 1 (completed): Contract types defined — no driver implementations.
 *   Phase 2 (completed, Z.AI-only baseline): ZaiDriver.ts implements ProviderDriver.
 *     providerRouter.ts returns ZaiDriver for "zai". All other paths are stubs.
 *   Phase 3 (DEFERRED): OpenAICodexDriver — not started. Pending future decision.
 *   Phase 6 (DEFERRED): modelAdapter.ts and providerRegistry.ts deleted/replaced.
 *
 * See docs/provider-layer-reset-roadmap.md §Z.AI-Only Baseline Closeout Record.
 */

// ─── Provider-path key space ──────────────────────────────────────────────────
//
// A provider-path key uniquely identifies one execution path.
// This is NOT the same as "provider company" — OpenAI as a company has
// multiple distinct paths (platform API, Codex subscription, compatible).
// Each path has its own auth mechanism, endpoint, and error semantics.

export type ProviderPath =
  | "zai"               // Z.AI dual-lane (PAAS + Anthropic) — primary
  | "openai-codex"      // ChatGPT Subscription Codex — chatgpt.com/backend-api/codex
  | "openai-platform"   // OpenAI Platform API — api.openai.com (platform API key)
  | "openai-compatible" // Generic OpenAI-SDK-compatible host (parameterized base URL)
  | "qwen";             // Qwen — integration mode TBD before Phase 5

// ─── Provider configuration ───────────────────────────────────────────────────
//
// Passed to connect() to establish credentials. Each driver validates only
// the fields it needs — extra fields are ignored.

export interface ProviderConfig {
  /** The provider-path key this config targets. */
  providerPath: ProviderPath;
  /** API key, if applicable. */
  apiKey?: string;
  /** Base URL override, if applicable (e.g. for openai-compatible hosts). */
  baseUrl?: string;
  /** Additional driver-specific config. */
  extra?: Record<string, unknown>;
}

// ─── Probe result ──────────────────────────────────────────────────────────────
//
// Returned by probe(). A probe must make an actual network call to the real
// execution endpoint. Token/credential presence alone is NEVER sufficient for
// `verified` — that conflation is the root cause of the current drift.

export type ProbeStatus =
  | "verified"              // Probe call succeeded — execution is viable
  | "authenticated_blocked" // Credentials valid, execution blocked (entitlement/quota)
  | "inconclusive"          // Probe failed for non-auth reasons (network, etc.)
  | "unauthenticated";      // No credentials available to probe with

export interface ProbeResult {
  status: ProbeStatus;
  /** ISO timestamp when this probe ran. */
  probedAt: string;
  /** HTTP status from the probe call, if applicable. */
  httpStatus?: number;
  /** Normalized failure reason, if probe did not succeed. */
  failureReason?: NormalizedErrorCategory;
  /** Human-readable explanation of the probe outcome. */
  message: string;
  /** Raw driver-specific detail (not shown in UI; used for diagnostics). */
  rawDetail?: string;
}

// ─── Model descriptor ─────────────────────────────────────────────────────────
//
// Returned by listModels(). Replaces scattered model lists in
// zaiCapabilities.ts and Codex probe logic. Minimal shape for Phase 1;
// richer metadata (pricing, context windows) added per-driver in Phase 2+.

export interface ModelDescriptor {
  /** Provider-canonical model ID (e.g. "glm-5.1", "codex-mini-latest"). */
  modelId: string;
  /** Human-readable name. */
  displayName: string;
  /** Provider-path this model belongs to. */
  providerPath: ProviderPath;
  /** Capability tags (open-ended — drivers define their own). */
  capabilities: string[];
  /** Whether this model can process image inputs. */
  supportsVision: boolean;
  /** Optional descriptive note. */
  notes?: string;
}

// ─── Execution request / result ───────────────────────────────────────────────
//
// The only execution entry point on a driver is execute().
// Streaming is communicated via the onChunk callback — the result is always
// the assembled full response.

export interface ExecutionMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}

export interface ExecutionRequest {
  messages: ExecutionMessage[];
  /** Preferred model. Driver may override if not available. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Task-level identifier for diagnostic logging. */
  taskId?: string;
  /**
   * Task hint for model / lane selection.
   * Drivers use this to pick the appropriate fallback chain.
   * The concrete hint type is provider-specific; the contract uses string
   * so callers do not need to import provider-specific types.
   */
  taskHint?: string;
  /** Streaming chunk callback. If provided, driver MUST stream. */
  onChunk?: (text: string) => void;
}

export interface ExecutionResult {
  /** Full assembled response text. */
  content: string;
  /** The model that actually handled the request (may differ from requested). */
  modelUsed: string;
  /** Provider-path that handled the request. */
  providerPath: ProviderPath;
  /** Token usage, if reported by the provider. */
  usage?: { promptTokens: number; completionTokens: number };
  /**
   * Provider-specific lane identifier (e.g. "paas" | "anthropic" for Z.AI).
   * Optional — only populated by drivers that have a lane concept.
   * Preserved in ModelResponse.laneUsed by the modelAdapter bridge.
   */
  laneUsed?: string;
}

// ─── Provider state ────────────────────────────────────────────────────────────
//
// Returned by getState(). Represents the driver's current readiness level.
// All states except `verified` mean execution will fail.
// The five-state lifecycle is:
//
//   disconnected → awaiting_callback → authenticated_unverified → verified
//                                                                ↘ authenticated_blocked

export type ProviderLifecycleState =
  | "disconnected"           // No credentials. connect() has not been called.
  | "awaiting_callback"      // Auth flow started; waiting for browser redirect.
  | "authenticated_unverified" // Credentials received; probe not yet run.
  | "verified"               // Probe confirmed execution is viable.
  | "authenticated_blocked"; // Probe ran; execution is blocked (quota/entitlement).

export interface ProviderState {
  providerPath: ProviderPath;
  lifecycle: ProviderLifecycleState;
  /** ISO timestamp of the last probe run (null if never probed). */
  lastProbedAt: string | null;
  /** ISO timestamp of the last state change. */
  lastUpdatedAt: string;
  /** Last probe result (null if never probed). */
  lastProbeResult: ProbeResult | null;
  /** Structured issue for blocked/error states (null when healthy). */
  issue: NormalizedProviderError | null;
}

// ─── Normalized error taxonomy ────────────────────────────────────────────────
//
// normalizeError() maps any driver-specific error to this taxonomy.
// The UI and orchestrator consume ONLY NormalizedProviderError — never
// raw driver errors. This prevents provider-specific error shapes from
// leaking into shared code.

export type NormalizedErrorCategory =
  | "auth_invalid"       // Credentials rejected (401, invalid token)
  | "quota_exhausted"    // Billing credits exhausted (provider-specific billing error)
  | "entitlement_mismatch" // Token/account lacks execution entitlement for this endpoint
  | "model_unavailable"  // Requested model not accessible on this account/tier
  | "rate_limited"       // Temporary rate limit (retry after delay)
  | "network_error"      // Cannot reach provider endpoint
  | "unknown";           // Does not match any known category

export interface NormalizedProviderError {
  category: NormalizedErrorCategory;
  /** Human-readable description (shown in UI). */
  message: string;
  /** Recommended action for the operator. */
  action: string;
  /** ISO timestamp when the error was recorded. */
  detectedAt: string;
  /** Raw driver-specific detail (diagnostics only, not shown in UI). */
  rawDetail?: string;
}

// ─── ProviderDriver interface ─────────────────────────────────────────────────
//
// The contract all future drivers must implement.
// Implemented by: ZaiDriver (Phase 2), OpenAICodexDriver (Phase 3), etc.
//
// No driver implementations exist yet in Phase 1. The interface exists so
// Phase 2+ driver files have a concrete target to satisfy, and so the
// providerRouter can declare its return type correctly.

export interface ProviderDriver {
  /**
   * Establish credentials/session for this provider.
   * For API-key providers (Z.AI): validates key presence.
   * For OAuth providers (Codex): starts the PKCE flow.
   * For compatible providers: accepts base URL + key.
   */
  connect(config: ProviderConfig): Promise<void>;

  /**
   * Run an active readiness probe against the real execution endpoint.
   * MUST make a network call. Token/credential presence alone NEVER returns
   * `verified`. The probe is the only path to `verified` state.
   */
  probe(): Promise<ProbeResult>;

  /**
   * Return the authoritative model list for this driver.
   * Source of truth for ModelRegistry registration.
   * Returns an empty array if the driver is not connected.
   */
  listModels(): Promise<ModelDescriptor[]>;

  /**
   * Execute a request. The only execution entry point.
   * If onChunk is provided in the request, MUST stream.
   * Returns the assembled result regardless of streaming mode.
   */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;

  /**
   * Return the current readiness state for this driver.
   * State must reflect actual probe results, not credential presence alone.
   */
  getState(): ProviderState;

  /**
   * Map any raw driver-specific error to the normalized taxonomy.
   * The orchestrator and UI consume ONLY this normalized form.
   */
  normalizeError(raw: unknown): NormalizedProviderError;
}
