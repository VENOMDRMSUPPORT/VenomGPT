/**
 * providerRegistry.ts — LEGACY provider registry (Z.AI only)
 *
 * ── Ownership boundary (Z.AI-only baseline) ─────────────────────────────────
 *
 * This is the LEGACY registry — it owns all runtime provider state as of the
 * Z.AI-only baseline (Phase 2 closeout). It is the ONLY registry that is
 * active at runtime. ProviderStateStore.ts is the FUTURE replacement (Phase 6).
 *
 * ── Coexistence with ProviderStateStore.ts ──────────────────────────────────
 *
 * Two registry modules exist on disk simultaneously:
 *
 *   providerRegistry.ts (THIS FILE)
 *     - ACTIVE at runtime. Owns Z.AI connection state, model list, issues.
 *     - Persisted at <data-dir>/provider-registry.json.
 *     - Imported by: routes/providerRegistry.ts, index.ts, ZaiDriver.ts.
 *     - Has Codex-specific field semantics baked in (ProviderConnectionState,
 *       ProviderId). Cleaned up to Z.AI only, but shape retains legacy naming.
 *
 *   providers/ProviderStateStore.ts
 *     - NOT active at runtime for state persistence. Used by ZaiDriver.ts for
 *       in-memory lifecycle state tracking (probe results, authenticated state).
 *     - Provider-agnostic: no Codex-specific fields, no Z.AI-specific fields.
 *     - Will absorb this file's responsibilities in Phase 6.
 *     - Does NOT replace this file until Phase 6 is executed.
 *
 * ── Migration plan ──────────────────────────────────────────────────────────
 *
 * Phase 6 (deferred, pending future decision): Delete this file after all
 * call sites (routes/providerRegistry.ts, index.ts) are updated to use
 * ProviderStateStore directly. See docs/provider-layer-reset-roadmap.md §Phase 6.
 *
 * ── What this file owns today ───────────────────────────────────────────────
 *   - provider ID and display name
 *   - connection state (connected / disconnected / error / unknown)
 *   - last-updated timestamp
 *   - available models list
 *   - error state (free-text for legacy compat)
 *   - structured issue: typed category + human message + recommended action
 *
 * State is persisted at <data-dir>/provider-registry.json alongside
 * the existing settings.json. Read at server startup.
 *
 * Design rule: this module ONLY manages registry state.
 * It does NOT touch Z.AI routing logic, model adapter, or agentLoop.
 *
 * NOTE: OpenAI Codex / CodexConnectionState removed in Z.AI-only cleanup.
 * The openai-codex-auth/ library files remain on disk (DEFERRED).
 */

import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "./settingsStore.js";
import { logger } from "./logger.js";
import { ZAI_MODEL_REGISTRY, getImplementedModels } from "./zaiCapabilities.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderConnectionState = "connected" | "disconnected" | "error" | "unknown";

export type ProviderId = "zai";

/**
 * Typed provider issue categories. These map to distinct error conditions
 * visible in the Integrations provider card.
 *
 * auth_failed            — credentials rejected or OAuth flow returned an error
 * session_expired        — token is past its expiry and refresh was not attempted
 * token_refresh_failed   — automatic refresh was attempted but failed
 * subscription_invalid   — provider returned an account-level rejection
 * model_unavailable      — requested model not accessible for the user's plan/tier
 * usage_limit            — rate limit or quota exhaustion (temporarily blocked)
 * entitlement_mismatch   — token/account does not have execution entitlement
 *                          (e.g. ChatGPT OAuth token used against API endpoint)
 * wrong_api_path         — the integration is using an endpoint that requires a
 *                          different auth credential than what is configured
 */
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
  /** Human-readable description of the issue. */
  message: string;
  /** Recommended action for the operator to take. */
  action: string;
  /** ISO timestamp when the issue was first recorded. */
  detectedAt: string;
}

export interface ProviderRegistryEntry {
  id: ProviderId;
  displayName: string;
  connectionState: ProviderConnectionState;
  lastUpdatedAt: string | null;
  availableModels: string[];
  /** Legacy free-text error field — use `issue` for structured data. */
  errorState: string | null;
  /** Structured provider issue — null when provider is healthy. */
  issue: ProviderIssue | null;
}

export interface ProviderRegistry {
  entries: Record<ProviderId, ProviderRegistryEntry>;
  lastPersistedAt: string | null;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const REGISTRY_FILE = path.join(DATA_DIR, "provider-registry.json");

// ─── In-memory singleton ──────────────────────────────────────────────────────

function buildInitialRegistry(): ProviderRegistry {
  return {
    entries: {
      "zai": {
        id: "zai",
        displayName: "Z.AI",
        connectionState: "unknown",
        lastUpdatedAt: null,
        availableModels: [],
        errorState: null,
        issue: null,
      },
    },
    lastPersistedAt: null,
  };
}

let _registry: ProviderRegistry = buildInitialRegistry();

export function getRegistry(): Readonly<ProviderRegistry> {
  return _registry;
}

export function getProviderEntry(id: ProviderId): Readonly<ProviderRegistryEntry> | undefined {
  return _registry.entries[id];
}

// ─── Disk I/O ─────────────────────────────────────────────────────────────────

async function persistRegistry(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    _registry.lastPersistedAt = new Date().toISOString();
    await fs.writeFile(REGISTRY_FILE, JSON.stringify(_registry, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err, file: REGISTRY_FILE }, "Failed to persist provider registry");
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

/**
 * Load persisted registry from disk. Falls back to defaults if missing/invalid.
 * Then reconciles live environment state for both providers.
 * Call once at server start, after env is loaded.
 */
export async function loadRegistry(): Promise<void> {
  // Attempt to restore persisted state
  try {
    const raw = await fs.readFile(REGISTRY_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProviderRegistry>;
    if (parsed.entries) {
      // Merge persisted entries, preserving defaults for any missing fields
      const initial = buildInitialRegistry();
      for (const id of ["zai"] as ProviderId[]) {
        const persisted = parsed.entries[id];
        if (persisted) {
          initial.entries[id] = {
            ...initial.entries[id],
            ...persisted,
            id, // always authoritative
          };
        }
      }
      _registry = initial;
      logger.info({ file: REGISTRY_FILE }, "Loaded provider registry from disk");
    }
  } catch {
    // Missing or corrupt — start fresh (normal on first run)
    _registry = buildInitialRegistry();
    logger.info("No provider registry file found — using defaults");
  }

  // Always reconcile live environment state on startup
  await reconcileFromEnvironment();
}

// ─── Live environment reconciliation ─────────────────────────────────────────

/**
 * Reconciles provider state from environment variables at startup.
 *
 * NOTE: This only checks for key PRESENCE, not validity. It does NOT make network calls.
 * A missing key sets the provider to "disconnected" state — this is intentional degraded mode.
 * Actual key validation happens at request-time in modelAdapter.ts (see resolveProviderConfig).
 *
 * This runs at startup and reflects what's actually configured right now.
 */
export async function reconcileFromEnvironment(): Promise<void> {
  const now = new Date().toISOString();
  const hasZaiKey = !!process.env["ZAI_API_KEY"];
  const zaiEntry = _registry.entries["zai"];

  if (hasZaiKey) {
    const implementedModels = getImplementedModels();
    zaiEntry.connectionState = "connected";
    zaiEntry.availableModels = implementedModels.map((m) => m.modelId);
    zaiEntry.errorState = null;
    zaiEntry.issue = null;
    zaiEntry.lastUpdatedAt = now;
  } else {
    zaiEntry.connectionState = "disconnected";
    zaiEntry.availableModels = [];
    zaiEntry.errorState = null;
    zaiEntry.issue = null;
    zaiEntry.lastUpdatedAt = now;
  }

  await persistRegistry();
  logger.info({ zai: zaiEntry.connectionState }, "Provider registry reconciled from environment");
}

// ─── State mutations ──────────────────────────────────────────────────────────

/**
 * Update a provider's connection state. Used by connect/disconnect flows.
 */
export async function setProviderState(
  id: ProviderId,
  state: ProviderConnectionState,
  opts: {
    availableModels?: string[];
    errorState?: string | null;
    issue?: ProviderIssue | null;
  } = {}
): Promise<ProviderRegistryEntry> {
  const entry = _registry.entries[id];
  if (!entry) throw new Error(`Unknown provider: ${id}`);

  entry.connectionState = state;
  entry.lastUpdatedAt = new Date().toISOString();
  if (opts.availableModels !== undefined) entry.availableModels = opts.availableModels;
  if (opts.errorState !== undefined) entry.errorState = opts.errorState;
  if (opts.issue !== undefined) entry.issue = opts.issue;

  await persistRegistry();
  logger.info({ id, state, issueCategory: opts.issue?.category ?? null }, "Provider state updated");
  return { ...entry };
}

/**
 * Record a structured issue against a provider.
 * Sets connectionState to "error" and populates the structured issue field.
 * The errorState free-text field is kept in sync for backward compat.
 */
export async function recordProviderIssue(
  id: ProviderId,
  issue: ProviderIssue
): Promise<ProviderRegistryEntry> {
  const entry = _registry.entries[id];
  if (!entry) throw new Error(`Unknown provider: ${id}`);

  entry.connectionState = "error";
  entry.lastUpdatedAt = new Date().toISOString();
  entry.errorState = issue.message;
  entry.issue = issue;

  await persistRegistry();
  logger.warn({ id, category: issue.category, message: issue.message }, "Provider issue recorded");
  return { ...entry };
}

/**
 * Clear a provider's issue state (called after successful reconnect or recovery).
 */
export async function clearProviderIssue(
  id: ProviderId,
  newState: ProviderConnectionState = "connected"
): Promise<ProviderRegistryEntry> {
  const entry = _registry.entries[id];
  if (!entry) throw new Error(`Unknown provider: ${id}`);

  entry.connectionState = newState;
  entry.lastUpdatedAt = new Date().toISOString();
  entry.errorState = null;
  entry.issue = null;

  await persistRegistry();
  logger.info({ id, newState }, "Provider issue cleared");
  return { ...entry };
}

// ─── Read view — safe for API response ───────────────────────────────────────

export interface ProviderStatusView {
  id: ProviderId;
  displayName: string;
  connectionState: ProviderConnectionState;
  lastUpdatedAt: string | null;
  availableModels: string[];
  errorState: string | null;
  issue: ProviderIssue | null;
  usageNote: string | null;
  /** Additional metadata surfaced from Z.AI config (only for Z.AI) */
  zaiMeta?: {
    hasApiKey: boolean;
    paasEndpoint: string;
    anthropicEndpoint: string;
    totalModelCount: number;
    paasModelCount: number;
    anthropicModelCount: number;
  };
}

const ZAI_PAAS_ENDPOINT        = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const ZAI_ANTHROPIC_ENDPOINT   = "https://api.z.ai/api/anthropic/v1/messages";

export function buildProviderStatusView(id: ProviderId): ProviderStatusView {
  const entry = _registry.entries[id];
  if (!entry) throw new Error(`Unknown provider: ${id}`);

  const base: ProviderStatusView = {
    id: entry.id,
    displayName: entry.displayName,
    connectionState: entry.connectionState,
    lastUpdatedAt: entry.lastUpdatedAt,
    availableModels: entry.availableModels,
    errorState: entry.errorState,
    issue: entry.issue,
    usageNote: null,
  };

  if (id === "zai") {
    const hasApiKey = !!process.env["ZAI_API_KEY"];
    const allModels = ZAI_MODEL_REGISTRY;
    const paasModels = allModels.filter((m) => m.preferredLane === "paas");
    const anthropicModels = allModels.filter((m) => m.preferredLane === "anthropic");
    base.zaiMeta = {
      hasApiKey,
      paasEndpoint: ZAI_PAAS_ENDPOINT,
      anthropicEndpoint: ZAI_ANTHROPIC_ENDPOINT,
      totalModelCount: allModels.length,
      paasModelCount: paasModels.length,
      anthropicModelCount: anthropicModels.length,
    };
  }

  return base;
}

export function getAllProviderStatusViews(): ProviderStatusView[] {
  return (["zai"] as ProviderId[]).map(buildProviderStatusView);
}
