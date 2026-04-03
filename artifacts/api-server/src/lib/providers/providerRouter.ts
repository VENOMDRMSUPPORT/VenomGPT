/**
 * providerRouter.ts — Phase 2: Provider router (Z.AI wired)
 *
 * The single dispatch entry point for provider selection.
 * All execution requests flow through here.
 *
 * ── Phase 2 state ────────────────────────────────────────────────────────────
 *
 * getDriver("zai") returns the real ZaiDriver singleton.
 * All other provider paths remain stubs — they throw on any method call.
 *
 * ── Target behavior (Phase 3+) ───────────────────────────────────────────────
 *
 * getDriver("openai-codex")      → OpenAICodexDriver     (Phase 3)
 * getDriver("openai-platform")   → OpenAIPlatformDriver  (Phase 4, if decided)
 * getDriver("openai-compatible") → OpenAICompatibleDriver (Phase 4+)
 * getDriver("qwen")              → QwenDriver            (Phase 5, if decided)
 *
 * ── Design rules ─────────────────────────────────────────────────────────────
 *
 * 1. All provider-selection conditional logic lives HERE — nowhere else.
 * 2. No driver-specific logic belongs in this file. The router dispatches;
 *    drivers implement.
 * 3. Non-Z.AI paths remain stubs with explicit not-implemented messages.
 */

import type {
  ProviderPath,
  ProviderDriver,
  ProviderConfig,
  ProbeResult,
  ModelDescriptor,
  ExecutionRequest,
  ExecutionResult,
  ProviderState,
  NormalizedProviderError,
} from "./ProviderContract.js";

import { zaiDriver } from "./drivers/ZaiDriver.js";
import { logger } from "../logger.js";

// ─── Stub driver ──────────────────────────────────────────────────────────────
//
// A clearly-marked unimplemented placeholder. Every method throws with an
// explicit message identifying the phase in which it will be implemented.

class StubDriver implements ProviderDriver {
  constructor(private readonly _path: ProviderPath) {}

  private _notImplemented(method: string): never {
    throw new Error(
      `[providerRouter] ProviderDriver.${method}() is not implemented for provider-path "${this._path}". ` +
      `Implementation is planned for a future phase of the Provider Layer Reset.`
    );
  }

  connect(_config: ProviderConfig): Promise<void> {
    return this._notImplemented("connect");
  }

  probe(): Promise<ProbeResult> {
    return this._notImplemented("probe");
  }

  listModels(): Promise<ModelDescriptor[]> {
    return this._notImplemented("listModels");
  }

  execute(_request: ExecutionRequest): Promise<ExecutionResult> {
    return this._notImplemented("execute");
  }

  getState(): ProviderState {
    return this._notImplemented("getState");
  }

  normalizeError(_raw: unknown): NormalizedProviderError {
    return this._notImplemented("normalizeError");
  }
}

// ─── Driver registry ──────────────────────────────────────────────────────────
//
// Phase 2: "zai" maps to the real ZaiDriver singleton.
// All other paths remain stubs until their phase is implemented.

const _drivers: Record<ProviderPath, ProviderDriver> = {
  "zai":               zaiDriver,                            // Phase 2 — LIVE (Z.AI dual-lane, the only active provider)

  // ── DEFERRED provider slots ───────────────────────────────────────────────
  // These stubs exist so the router type-checks cleanly against all ProviderPath
  // values. None of them are wired to real drivers or reachable from any active
  // runtime path. Re-enabling any of these requires implementing the corresponding
  // driver file AND removing it from this stub list — do not do that without
  // an explicit phase decision.

  "openai-codex":      new StubDriver("openai-codex"),
  // DEFERRED — Phase 3. Requires OpenAICodexDriver.ts targeting chatgpt.com/backend-api/codex
  // (NOT api.openai.com). See docs/provider-layer-reset-roadmap.md §Phase 3.

  "openai-platform":   new StubDriver("openai-platform"),
  // DEFERRED — Phase 4, if decided. Requires OpenAIPlatformDriver.ts targeting api.openai.com.
  // Only implement if explicitly decided after Phase 3. Not needed for Z.AI-only runtime.

  "openai-compatible": new StubDriver("openai-compatible"),
  // DEFERRED — Phase 4+. Generic OpenAI-SDK-compatible driver (parameterized base URL + key).
  // Could subsume Z.AI PAAS lane in a future consolidation pass.

  "qwen":              new StubDriver("qwen"),
  // DEFERRED — Phase 5, if decided. Qwen's actual integration mode (API key, OAuth, compatible)
  // is unknown. Do not implement until the integration mode is confirmed.
};

// Emit a startup log confirming the live driver is wired for "zai".
// This satisfies the Phase 2 requirement for an explicit router-level
// indication that the real ZaiDriver is active (not a stub).
logger.info(
  { providerPath: "zai", driverPhase: 2, live: true },
  "[providerRouter] Phase 2 — ZaiDriver is live for provider-path \"zai\". All other paths are stubs."
);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the driver for the given provider-path key.
 *
 * Phase 2: "zai" returns the real ZaiDriver.
 * All other paths return a StubDriver that throws on any method call.
 */
export function getDriver(providerPath: ProviderPath): ProviderDriver {
  return _drivers[providerPath];
}

/**
 * Returns all registered provider-path keys.
 */
export function listProviderPaths(): ProviderPath[] {
  return Object.keys(_drivers) as ProviderPath[];
}

export type { ProviderPath, ProviderDriver };
