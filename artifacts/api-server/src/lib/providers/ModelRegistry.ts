/**
 * ModelRegistry.ts — Phase 2: Model registry (used by ZaiDriver)
 *
 * The authoritative registry for model descriptors across all providers.
 * Each driver registers its model catalog here.
 *
 * ── Phase 2 state (current) ──────────────────────────────────────────────────
 *
 * ZaiDriver.ts imports registerAll and deregisterProvider from this file and
 * calls them during probe/connect operations to populate the registry with
 * Z.AI model descriptors.
 *
 * zaiCapabilities.ts remains the primary model metadata source until Phase 6.
 * This registry mirrors what ZaiDriver registers from zaiCapabilities.ts.
 *
 * ── Relationship to zaiCapabilities.ts ───────────────────────────────────────
 *
 * zaiCapabilities.ts: Z.AI-specific model metadata (lanes, fallback chains,
 *   capability hints). The primary source of truth for Z.AI models. NOT replaced
 *   by this registry until Phase 6.
 *
 * ModelRegistry.ts (THIS FILE): Provider-agnostic registry of ModelDescriptors.
 *   Populated by ZaiDriver (and future drivers). Intended to eventually replace
 *   scattered model lists across zaiCapabilities.ts and frontend code.
 *
 * ── Replacement plan (deferred) ──────────────────────────────────────────────
 *
 * Phase 3 (deferred): OpenAICodexDriver.listModels() adds Codex models when
 *   the Codex driver is implemented.
 * Phase 6 (deferred): zaiCapabilities.ts is retired; this registry becomes the
 *   sole authoritative model source. The UI queries this registry via an API
 *   endpoint rather than using its own model lists.
 *
 * ── ModelDescriptor shape ─────────────────────────────────────────────────────
 *
 * ModelDescriptor is declared in ProviderContract.ts and re-exported here
 * so callers can import it from ModelRegistry without knowing its origin.
 */

import type { ProviderPath, ModelDescriptor } from "./ProviderContract.js";

// Re-export ModelDescriptor so callers can import it from ModelRegistry
// without needing to know it is declared in ProviderContract.
export type { ModelDescriptor };

// ─── Registry store ───────────────────────────────────────────────────────────

// Keyed by `${providerPath}::${modelId}` for O(1) deduplication.
const _registry = new Map<string, ModelDescriptor>();

function _key(providerPath: ProviderPath, modelId: string): string {
  return `${providerPath}::${modelId}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a model descriptor.
 * If a descriptor with the same providerPath + modelId already exists,
 * it is silently replaced (last write wins — drivers may re-register on reconnect).
 */
export function register(descriptor: ModelDescriptor): void {
  _registry.set(_key(descriptor.providerPath, descriptor.modelId), descriptor);
}

/**
 * Register multiple descriptors at once.
 */
export function registerAll(descriptors: ModelDescriptor[]): void {
  for (const d of descriptors) {
    register(d);
  }
}

/**
 * List all registered models, optionally filtered by provider-path.
 * Returns a stable-order array (insertion order).
 */
export function list(providerPath?: ProviderPath): ModelDescriptor[] {
  const all = Array.from(_registry.values());
  if (providerPath === undefined) return all;
  return all.filter((d) => d.providerPath === providerPath);
}

/**
 * Look up a specific model by provider-path and model ID.
 * Returns undefined if not registered.
 */
export function getModel(providerPath: ProviderPath, modelId: string): ModelDescriptor | undefined {
  return _registry.get(_key(providerPath, modelId));
}

/**
 * Remove all models for a given provider-path.
 * Called when a driver disconnects or its model list is refreshed.
 */
export function deregisterProvider(providerPath: ProviderPath): void {
  for (const [key] of _registry) {
    if (key.startsWith(`${providerPath}::`)) {
      _registry.delete(key);
    }
  }
}

/**
 * Returns the total number of registered models across all providers.
 */
export function size(): number {
  return _registry.size;
}

/**
 * Returns all provider-paths that have at least one registered model.
 */
export function registeredProviders(): ProviderPath[] {
  const paths = new Set<ProviderPath>();
  for (const d of _registry.values()) {
    paths.add(d.providerPath);
  }
  return Array.from(paths);
}
