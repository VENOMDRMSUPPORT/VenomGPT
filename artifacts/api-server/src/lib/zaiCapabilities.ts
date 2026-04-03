/**
 * Z.AI Provider Capability Registry
 *
 * Source of truth: https://docs.z.ai/guides/overview/pricing
 *                  https://docs.z.ai/api-reference/introduction
 *
 * Z.AI has TWO distinct API lanes that are separately entitled on the account:
 *
 *   PAAS lane     — /api/coding/paas/v4/chat/completions  (OpenAI-compatible)
 *                   Works for:  glm-4.7-flash, glm-4.5-flash, glm-4.5v, glm-4.5-air, vision models
 *                   Free-tier and cost-optimized models live here.
 *
 *   Anthropic lane — /api/anthropic/v1/messages     (Anthropic-compatible)
 *                   Works for:  glm-5, glm-5.1, glm-4.7 and the broader paid GLM-5 family
 *                   Uses Anthropic SDK request/response schema.
 *
 * Models CANNOT be used on a lane they are not entitled for — the API returns
 * error code 1113 ("Insufficient balance or no resource package"). This is NOT
 * the same as running out of credits; it is a model/lane entitlement mismatch.
 *
 * The registry marks each model's preferred lane and supported lanes so the
 * provider can pick the correct endpoint and fall back intelligently.
 *
 * ─── SCOPE BOUNDARY ──────────────────────────────────────────────────────────
 *
 * VenomGPT is a text/coding + screenshot-analysis product.
 *
 * Only two capability families are in scope right now:
 *   1. text_coding / text_general / agentic  — the coding agent loop
 *   2. vision                                — screenshot input → visual analysis
 *
 * Image generation, video generation, and audio transcription are
 * NOT in scope.  Those Z.AI models are documented in ZAI_OUT_OF_SCOPE_MODELS
 * below and are explicitly excluded from ZAI_MODEL_REGISTRY so they do not
 * appear as actionable in diagnostics or capability reporting.
 */

// ─── Lane types ───────────────────────────────────────────────────────────────

/** The two Z.AI API endpoint families. */
export type ZaiLane = "paas" | "anthropic";

// ─── Capability types — in-scope only ────────────────────────────────────────
//
// Only capabilities that VenomGPT actually uses are listed here.
// image_gen, video_gen, audio_stt are deliberately absent — those belong to
// out-of-scope Z.AI models and must not appear in the current product surface.

export type ZaiCapabilityType =
  | "text_coding"
  | "text_general"
  | "vision"
  | "tools"
  | "structured"
  | "long_context"
  | "agentic"
  | "web_search"
  | "cache";

// ─── Call patterns ───────────────────────────────────────────────────────────

export type ZaiCallPattern =
  | "sync"
  | "streaming";

// ─── Implementation status ───────────────────────────────────────────────────

export type ZaiImplementationStatus =
  | "implemented"   // wired and active in the agent loop
  | "deferred";     // known to be possible but not wired yet (still in-scope)

// ─── Model spec ──────────────────────────────────────────────────────────────

export interface ZaiModelSpec {
  modelId: string;
  displayName: string;
  description: string;
  capabilities: ZaiCapabilityType[];
  callPatterns: ZaiCallPattern[];
  contextWindow: number;
  maxOutput: number;
  priceInputPer1M: number | null;
  priceOutputPer1M: number | null;
  implementationStatus: ZaiImplementationStatus;
  /** Primary lane to use when calling this model. */
  preferredLane: ZaiLane;
  /** All lanes this model is available on (in preference order). */
  supportedLanes: ZaiLane[];
  notes?: string;
}

// ─── Z.AI Model Registry (in-scope) ──────────────────────────────────────────
//
// Contains ONLY models that are wired or deferred within VenomGPT's current
// product scope (text/coding + screenshot vision).
//
// Out-of-scope Z.AI models (image gen, video gen, audio) are in
// ZAI_OUT_OF_SCOPE_MODELS below and are never surfaced to routing logic.

export const ZAI_MODEL_REGISTRY: ZaiModelSpec[] = [

  // ═══ Text / Coding models — Anthropic lane ══════════════════════════════════
  // Verified: glm-5 and glm-4.7 work on /api/anthropic/v1/messages
  // glm-5.1 assumed same entitlement as glm-5 (same product family)

  {
    modelId: "glm-5.1",
    displayName: "GLM-5.1",
    description: "Latest Z.AI flagship (2025). Strongest agentic + coding vs GLM-5.",
    capabilities: ["text_coding", "text_general", "tools", "structured", "long_context", "agentic", "cache"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 200_000,
    maxOutput: 128_000,
    priceInputPer1M: 1.0,
    priceOutputPer1M: 3.2,
    implementationStatus: "implemented",
    preferredLane: "anthropic",
    supportedLanes: ["anthropic"],
    notes: "Primary VenomGPT model. Auto-selected for coding and agentic tasks. Anthropic lane only.",
  },

  {
    modelId: "glm-5",
    displayName: "GLM-5",
    description: "Z.AI flagship agentic model. 200K context. Verified on Anthropic lane.",
    capabilities: ["text_coding", "text_general", "tools", "structured", "long_context", "agentic", "cache"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 200_000,
    maxOutput: 128_000,
    priceInputPer1M: 1.0,
    priceOutputPer1M: 3.2,
    implementationStatus: "implemented",
    preferredLane: "anthropic",
    supportedLanes: ["anthropic"],
    notes: "First fallback when GLM-5.1 is rejected. Anthropic lane only.",
  },

  {
    modelId: "glm-5-code",
    displayName: "GLM-5-Code",
    description: "Code-specialized variant of GLM-5.",
    capabilities: ["text_coding", "tools", "structured", "cache"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 128_000,
    maxOutput: 32_000,
    priceInputPer1M: 1.2,
    priceOutputPer1M: 5.0,
    implementationStatus: "implemented",
    preferredLane: "anthropic",
    supportedLanes: ["anthropic"],
  },

  {
    modelId: "glm-5-turbo",
    displayName: "GLM-5-Turbo",
    description: "Faster GLM-5 variant.",
    capabilities: ["text_coding", "text_general", "tools", "structured", "long_context", "cache"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 200_000,
    maxOutput: 128_000,
    priceInputPer1M: 1.2,
    priceOutputPer1M: 4.0,
    implementationStatus: "implemented",
    preferredLane: "anthropic",
    supportedLanes: ["anthropic"],
  },

  {
    modelId: "glm-4.7",
    displayName: "GLM-4.7",
    description: "Balanced mid-tier model. Verified working on Anthropic lane.",
    capabilities: ["text_coding", "text_general", "tools", "structured", "cache"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 128_000,
    maxOutput: 32_000,
    priceInputPer1M: 0.6,
    priceOutputPer1M: 2.2,
    implementationStatus: "implemented",
    preferredLane: "anthropic",
    supportedLanes: ["anthropic"],
    notes: "Mid-tier fallback. Anthropic lane only.",
  },

  // ═══ Text / Coding models — PAAS lane (free tier) ══════════════════════════
  // Verified: glm-4.7-flash works on /api/coding/paas/v4/chat/completions

  {
    modelId: "glm-4.7-flash",
    displayName: "GLM-4.7-Flash",
    description: "FREE model. Verified working on PAAS lane. Good for dev/testing.",
    capabilities: ["text_coding", "text_general"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 128_000,
    maxOutput: 32_000,
    priceInputPer1M: null,
    priceOutputPer1M: null,
    implementationStatus: "implemented",
    preferredLane: "paas",
    supportedLanes: ["paas"],
    notes: "Free tier. PAAS lane. Reliable last-resort fallback for text tasks.",
  },

  {
    modelId: "glm-4.5-flash",
    displayName: "GLM-4.5-Flash",
    description: "FREE model. Fast and lightweight for simple chat tasks.",
    capabilities: ["text_general"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 128_000,
    maxOutput: 32_000,
    priceInputPer1M: null,
    priceOutputPer1M: null,
    implementationStatus: "implemented",
    preferredLane: "paas",
    supportedLanes: ["paas"],
    notes: "Primary fast-chat model. PAAS lane. Free tier.",
  },

  {
    modelId: "glm-4.5v",
    displayName: "GLM-4.5V",
    description: "Multimodal model optimized for OCR and document analysis.",
    capabilities: ["vision", "text_general", "structured"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 128_000,
    maxOutput: 32_000,
    priceInputPer1M: 0.15,
    priceOutputPer1M: 0.45,
    implementationStatus: "implemented",
    preferredLane: "paas",
    supportedLanes: ["paas"],
    notes: "Primary model for OCR/document analysis tasks. PAAS lane.",
  },

  {
    modelId: "glm-4.5-air",
    displayName: "GLM-4.5-Air",
    description: "Cost-optimized model for high-volume, budget-conscious workloads.",
    capabilities: ["text_general", "text_coding"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 128_000,
    maxOutput: 32_000,
    priceInputPer1M: 0.05,
    priceOutputPer1M: 0.15,
    implementationStatus: "implemented",
    preferredLane: "paas",
    supportedLanes: ["paas"],
    notes: "Cost-optimized. PAAS lane. Use when cost matters more than quality.",
  },

  // ═══ Vision models — PAAS lane ══════════════════════════════════════════════
  //
  // Used in phase 1 of visual tasks: screenshot → structured text analysis.
  // Requires the Z.AI PAAS vision model entitlement package on the account.
  // Without entitlement, visual tasks fail honestly (no silent text fallback).

  {
    modelId: "glm-4.6v",
    displayName: "GLM-4.6V",
    description: "SOTA vision model. Text + image input. 128K context.",
    capabilities: ["vision", "text_general", "tools", "structured", "cache"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 128_000,
    maxOutput: 32_000,
    priceInputPer1M: 0.3,
    priceOutputPer1M: 0.9,
    implementationStatus: "implemented",
    preferredLane: "paas",
    supportedLanes: ["paas"],
    notes: "Auto-selected when messages contain image_url content. PAAS lane. Requires vision entitlement.",
  },

  {
    modelId: "glm-4.6v-flash",
    displayName: "GLM-4.6V-Flash",
    description: "FREE vision model.",
    capabilities: ["vision", "text_general"],
    callPatterns: ["sync", "streaming"],
    contextWindow: 128_000,
    maxOutput: 32_000,
    priceInputPer1M: null,
    priceOutputPer1M: null,
    implementationStatus: "implemented",
    preferredLane: "paas",
    supportedLanes: ["paas"],
    notes: "Free vision tier. PAAS lane. Fallback when glm-4.6v entitlement fails.",
  },
];

// ─── Out-of-scope Z.AI models ─────────────────────────────────────────────────
//
// These models exist on the Z.AI platform but are NOT part of VenomGPT's
// product scope.  VenomGPT is a text/coding + screenshot-analysis tool.
// Image generation, video generation, and speech-to-text are out of scope.
//
// They are listed here purely for reference and are EXCLUDED from:
//   • ZAI_MODEL_REGISTRY (not counted, not routed, not shown in diagnostics)
//   • getFallbackChain() (not eligible for any routing hint)
//   • getCapabilitySummary() (not shown as part of the usable surface)
//
// Do not move these into ZAI_MODEL_REGISTRY without a deliberate product scope
// change decision.

export const ZAI_OUT_OF_SCOPE_MODELS = [
  // Image generation — different API endpoint (/images/generations), not a chat model
  { modelId: "glm-image",   reason: "text-to-image generation — out of scope for coding assistant" },
  { modelId: "cogview-4",   reason: "text-to-image generation — out of scope for coding assistant" },
  // Video generation — requires async polling, separate endpoint, out of scope
  { modelId: "cogvideox-3", reason: "text/image-to-video generation — out of scope for coding assistant" },
  // Audio transcription — requires audio input endpoint, out of scope
  { modelId: "glm-asr-2512", reason: "speech-to-text — out of scope for coding assistant" },
] as const;

// ─── Lookup helpers ──────────────────────────────────────────────────────────

export function getModelById(modelId: string): ZaiModelSpec | undefined {
  return ZAI_MODEL_REGISTRY.find((m) => m.modelId === modelId);
}

export function getImplementedModels(): ZaiModelSpec[] {
  return ZAI_MODEL_REGISTRY.filter((m) => m.implementationStatus === "implemented");
}

export function getModelsForCapability(cap: ZaiCapabilityType): ZaiModelSpec[] {
  return ZAI_MODEL_REGISTRY.filter((m) => m.capabilities.includes(cap));
}

// ─── Model selection policy ──────────────────────────────────────────────────

export type ModelSelectionHint =
  | "agentic"           // heavy orchestration / multi-step reasoning → glm-5.1
  | "coding"            // complex coding tasks → glm-5.1
  | "coding_assistant"  // coding-assistant tasks → glm-5-turbo (faster than flagship)
  | "fast_chat"         // simple / conversational chat → glm-4.5-flash (free, fast)
  | "general"           // general text tasks → glm-4.7-flash
  | "vision"            // screenshot / image analysis → glm-4.6v
  | "ocr_documents"     // OCR / document analysis → glm-4.5v
  | "cost_optimized"    // high-volume budget workloads → glm-4.5-air
  | "conversational";   // alias for fast_chat (kept for backwards compat)

export interface LaneCandidate {
  modelId: string;
  lane: ZaiLane;
  reason: string;
}

/**
 * Returns an ordered list of (model, lane) candidates for the given hint.
 * The provider tries them in order, stopping at the first success.
 *
 * Routing policy:
 *   agentic / coding      → glm-5.1(anthropic) → glm-5(anthropic) → glm-5-code(anthropic) → glm-4.7(anthropic) → glm-4.7-flash(paas)
 *   coding_assistant      → glm-5-turbo(anthropic) → glm-5.1(anthropic) → glm-5(anthropic) → glm-4.7-flash(paas)
 *   fast_chat / conversational → glm-4.5-flash(paas)
 *   vision                → glm-4.6v(paas) → glm-4.6v-flash(paas)
 *   ocr_documents         → glm-4.5v(paas) → glm-4.6v(paas)
 *   cost_optimized        → glm-4.5-air(paas) → glm-4.5-flash(paas)
 *   general               → glm-4.7-flash(paas) → glm-4.7(anthropic)
 */
export function getFallbackChain(
  hint: ModelSelectionHint
): LaneCandidate[] {
  switch (hint) {
    case "agentic":
    case "coding":
      return [
        { modelId: "glm-5.1",       lane: "anthropic", reason: `hint="${hint}" → GLM-5.1 (Anthropic lane, flagship reasoning)` },
        { modelId: "glm-5",         lane: "anthropic", reason: `fallback #1 → GLM-5 (Anthropic lane)` },
        { modelId: "glm-5-code",    lane: "anthropic", reason: `fallback #2 → GLM-5-Code (Anthropic lane, code-specialized)` },
        { modelId: "glm-4.7",       lane: "anthropic", reason: `fallback #3 → GLM-4.7 (Anthropic lane)` },
        { modelId: "glm-4.7-flash", lane: "paas",      reason: `fallback #4 → GLM-4.7-Flash (PAAS lane, free)` },
      ];

    case "coding_assistant":
      return [
        { modelId: "glm-5-turbo",   lane: "anthropic", reason: `hint="coding_assistant" → GLM-5-Turbo (Anthropic lane, fast coding)` },
        { modelId: "glm-5.1",       lane: "anthropic", reason: `fallback #1 → GLM-5.1 (Anthropic lane, flagship)` },
        { modelId: "glm-5",         lane: "anthropic", reason: `fallback #2 → GLM-5 (Anthropic lane)` },
        { modelId: "glm-4.7-flash", lane: "paas",      reason: `fallback #3 → GLM-4.7-Flash (PAAS lane, free)` },
      ];

    case "fast_chat":
    case "conversational":
      return [
        { modelId: "glm-4.5-flash", lane: "paas", reason: `hint="${hint}" → GLM-4.5-Flash (PAAS lane, free, fast)` },
        { modelId: "glm-4.7-flash", lane: "paas", reason: `fallback → GLM-4.7-Flash (PAAS lane, free)` },
      ];

    case "vision":
      return [
        { modelId: "glm-4.6v",       lane: "paas", reason: `hint="vision" → GLM-4.6V (PAAS lane, SOTA multimodal)` },
        { modelId: "glm-4.6v-flash", lane: "paas", reason: `fallback → GLM-4.6V-Flash (PAAS lane, free vision)` },
      ];

    case "ocr_documents":
      return [
        { modelId: "glm-4.5v",  lane: "paas", reason: `hint="ocr_documents" → GLM-4.5V (PAAS lane, OCR/document)` },
        { modelId: "glm-4.6v",  lane: "paas", reason: `fallback → GLM-4.6V (PAAS lane, vision)` },
      ];

    case "cost_optimized":
      return [
        { modelId: "glm-4.5-air",   lane: "paas", reason: `hint="cost_optimized" → GLM-4.5-Air (PAAS lane, budget)` },
        { modelId: "glm-4.5-flash", lane: "paas", reason: `fallback → GLM-4.5-Flash (PAAS lane, free)` },
      ];

    case "general":
    default:
      return [
        { modelId: "glm-4.7-flash", lane: "paas",      reason: `hint="${hint}" → GLM-4.7-Flash (PAAS lane, free)` },
        { modelId: "glm-4.7",       lane: "anthropic",  reason: `fallback → GLM-4.7 (Anthropic lane)` },
      ];
  }
}

/**
 * Select the single best model for the given hint (first in fallback chain).
 * @deprecated Prefer getFallbackChain() for lane-aware routing with fallback.
 */
export function selectZaiModel(
  hint: ModelSelectionHint
): { modelId: string; lane: ZaiLane; reason: string } {
  const chain = getFallbackChain(hint);
  return chain[0];
}

/**
 * Human-readable capability + lane summary. Used in startup diagnostics.
 * Only covers in-scope models from ZAI_MODEL_REGISTRY.
 * Out-of-scope models (image/video/audio) are excluded by design.
 */
export function getCapabilitySummary(): string {
  const implemented = getImplementedModels();
  const deferred    = ZAI_MODEL_REGISTRY.filter((m) => m.implementationStatus === "deferred");

  const paasModels     = implemented.filter((m) => m.preferredLane === "paas").map((m) => m.modelId);
  const anthropicModels = implemented.filter((m) => m.preferredLane === "anthropic").map((m) => m.modelId);

  const lines = [
    `Z.AI Capability Registry (${ZAI_MODEL_REGISTRY.length} models, 2 lanes)`,
    `  PAAS lane      (/api/coding/paas/v4/) : ${paasModels.join(", ")}`,
    `  Anthropic lane (/api/anthropic/v1/) : ${anthropicModels.join(", ")}`,
  ];

  if (deferred.length > 0) {
    lines.push(`  Deferred (${deferred.length}): ${deferred.map((m) => m.modelId).join(", ")}`);
  }

  lines.push(
    `  Out of scope (image/video/audio — excluded from routing): ` +
    ZAI_OUT_OF_SCOPE_MODELS.map((m) => m.modelId).join(", ")
  );

  return lines.join("\n");
}
