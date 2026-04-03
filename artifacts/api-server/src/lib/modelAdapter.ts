/**
 * modelAdapter.ts — TEMPORARY SHIM (Phase 2 legacy bridge)
 *
 * This file is a transitional compatibility layer that bridges the legacy
 * ModelProvider interface (used by agentLoop.ts, agent.ts, and call sites
 * predating the Provider Layer Reset) to the new ZaiDriver via providerRouter.
 *
 * ── Why it still exists ─────────────────────────────────────────────────────
 *
 * Phase 2 of the Provider Layer Reset migrated Z.AI execution into ZaiDriver.ts
 * and wired the providerRouter. However, the legacy ModelProvider interface
 * (chat / chatStream / isVisionCapable / getVisualTaskCapability) is still
 * consumed by agentLoop.ts and related orchestration code. Removing this shim
 * requires updating all those call sites — that is Phase 6 work.
 *
 * ── Expected lifecycle ───────────────────────────────────────────────────────
 *
 * Phase 6 (closeout): Delete this file after agentLoop.ts and all remaining
 * call sites are updated to call providerRouter / ZaiDriver directly.
 * Until then, this file must not grow: no new logic, no new providers.
 *
 * ── What lives here vs. in ZaiDriver.ts ─────────────────────────────────────
 *
 * modelAdapter.ts: ModelProvider interface, ZaiProvider shim class, error
 *   re-mapping from ZaiError → ModelError, logProviderDiagnostic(), and the
 *   replit-openai fallback detection in resolveProviderConfig().
 *
 * ZaiDriver.ts: All real Z.AI execution logic (lane selection, fallback chains,
 *   PAAS/Anthropic lane calls, error categorization, probe logic).
 */

import OpenAI from "openai";
import { logger } from "./logger.js";
import {
  getFallbackChain,
  getCapabilitySummary,
  getModelById,
  type ModelSelectionHint,
  type ZaiLane,
  type LaneCandidate,
} from "./zaiCapabilities.js";
import { zaiDriver } from "./providers/drivers/ZaiDriver.js";
import { getDriver } from "./providers/providerRouter.js";
import type { ExecutionMessage } from "./providers/ProviderContract.js";

// ─── Public message types ─────────────────────────────────────────────────────

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | MessageContentPart[];
}

export interface MessageContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ModelResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
  /** Which model was actually used (may differ from requested if fallback engaged). */
  modelUsed?: string;
  /** Which lane was used. */
  laneUsed?: ZaiLane;
}

/**
 * Describes what a provider can do for visual/multimodal tasks.
 * Declared on the ModelProvider interface so callers never need to
 * check provider-specific types — they use this descriptor instead.
 *
 * This is the primary extension point for adding vision to new providers:
 * implement getVisualTaskCapability() and the rest of the pipeline adapts.
 */
export interface VisualTaskCapability {
  /** Whether this provider/configuration supports image_url input at all. */
  capable: boolean;
  /** Which model is selected for vision tasks (first in the fallback chain). */
  primaryVisionModel: string | null;
  /** All models available for vision, in fallback order. */
  visionModelChain: string[];
  /** Provider-human note about constraints, entitlement, or known limitations. */
  note: string;
  /** Maximum images accepted per request. */
  maxImagesPerRequest: number;
  /** Maximum size per image (bytes). */
  maxImageSizeBytes: number;
}

export interface ModelProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<ModelResponse>;
  chatStream(
    messages: Message[],
    onChunk: (text: string) => void,
    options?: ChatOptions
  ): Promise<ModelResponse>;
  /**
   * Quick boolean check — true if this provider can handle image_url messages.
   * Use getVisualTaskCapability() for the full constraint descriptor.
   */
  isVisionCapable(): boolean;
  /**
   * Returns the full visual task capability descriptor for this provider.
   * Use this instead of provider-specific checks anywhere visual task
   * routing decisions need to be made.
   */
  getVisualTaskCapability(): VisualTaskCapability;
}

export type { ModelSelectionHint };

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  taskHint?: ModelSelectionHint;
  /** Task ID for per-request diagnostic logging. */
  taskId?: string;
}

// ─── Error categories ────────────────────────────────────────────────────────

export type ModelErrorCategory =
  | "missing_api_key"
  | "invalid_api_key"
  | "model_not_found"
  | "base_url_error"
  | "network_error"
  | "rate_limit"
  | "rate_limit_route_mismatch"  // 429 that looks like a route/entitlement issue, not genuine rate limit
  | "insufficient_balance"
  | "entitlement_error"    // Z.AI error 1113: model not available on this lane/package
  | "subscription_invalid" // quota exhaustion or account-level subscription rejection
  | "context_length"
  | "unexpected_response"
  | "unknown";

export class ModelError extends Error {
  category: ModelErrorCategory;
  technical: string;

  constructor(message: string, category: ModelErrorCategory, technical: string) {
    super(message);
    this.name = "ModelError";
    this.category = category;
    this.technical = technical;
  }
}

/** Returns true if the error is a transient access error worth retrying on a different model/lane. */
export function isEntitlementError(err: unknown): boolean {
  if (err instanceof ModelError) {
    return (
      err.category === "entitlement_error" ||
      err.category === "insufficient_balance" ||
      err.category === "rate_limit_route_mismatch"
    );
  }
  return false;
}

// ─── Route-mismatch signal detection ─────────────────────────────────────────
//
// A 429 from the Anthropic lane that lacks genuine "balance exhausted" keywords
// may actually be a route/entitlement issue (wrong lane, wrong plan).
// We detect these signals in the error payload so the fallback chain continues.

const ROUTE_MISMATCH_RE = /no resource|resource package|route|endpoint|access denied|not available on|plan|subscription|not enabled|not supported on/i;
const BALANCE_KEYWORDS_RE = /balance|credit|quota|insufficient fund/i;

function isRouteMismatch429(msg: string): boolean {
  return ROUTE_MISMATCH_RE.test(msg) && !BALANCE_KEYWORDS_RE.test(msg);
}

// ─── Error categorization ────────────────────────────────────────────────────

/** Extract HTTP status code from an error, supporting both `status` and `httpStatus` properties. */
function extractStatus(err: unknown): number | undefined {
  if (err == null) return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e["status"] === "number") return e["status"] as number;
  if (typeof e["httpStatus"] === "number") return e["httpStatus"] as number;
  // Also try to parse "HTTP NNN" prefix from message string
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^HTTP (\d{3})\b/);
  return m ? parseInt(m[1], 10) : undefined;
}

function categorizeError(err: unknown): ModelError {
  const msg = err instanceof Error ? err.message : String(err);
  const status = extractStatus(err);

  if (status === 401 || /incorrect api key|invalid api key|authentication/i.test(msg)) {
    return new ModelError(
      "Invalid API key — the configured ZAI_API_KEY was rejected. Check https://z.ai/manage-apikey/apikey-list",
      "invalid_api_key",
      msg
    );
  }

  if (status === 404 || /model not found|no such model/i.test(msg)) {
    return new ModelError(
      "Model not found — the requested model does not exist on Z.AI. Check the model auto-selection policy or any call-time model override.",
      "model_not_found",
      msg
    );
  }

  // Z.AI error code 1113 = the model is not entitled on this API lane/package.
  // This is NOT the same as running out of credits. The account has access to the API
  // but not to this specific model on this specific lane/subscription tier.
  if (/\b1113\b/.test(msg) || /no resource package/i.test(msg)) {
    logger.warn(
      { errorCode: "1113" },
      "[VenomGPT] 1113 entitlement error — this model is not available on your Z.AI subscription lane. " +
      "Continuing fallback chain."
    );
    return new ModelError(
      "API access unavailable for this model/lane combination — your Z.AI account does not include the resource package for this model. " +
      "Trying a fallback model.",
      "entitlement_error",
      msg
    );
  }

  // Z.AI returns 429 for both rate-limit AND balance exhaustion AND route mismatches.
  if (status === 429) {
    if (BALANCE_KEYWORDS_RE.test(msg)) {
      return new ModelError(
        "Insufficient Z.AI account balance — no credits remaining. Top up at https://z.ai/manage-apikey/billing. Trying a free fallback model.",
        "insufficient_balance",
        msg
      );
    }
    // Check for route/entitlement mismatch signals in the 429 payload before
    // treating this as a non-retriable rate limit — a route mismatch 429 should
    // continue the fallback chain rather than aborting it.
    if (isRouteMismatch429(msg)) {
      return new ModelError(
        `Route or entitlement mismatch (HTTP 429) — this model may not be available on the current lane/plan. Trying next fallback. Details: ${msg}`,
        "rate_limit_route_mismatch",
        msg
      );
    }
    return new ModelError(
      "Rate limit reached — too many requests. Wait a moment and try again.",
      "rate_limit",
      msg
    );
  }

  if (/rate limit|too many requests/i.test(msg)) {
    return new ModelError(
      "Rate limit reached — too many requests. Wait a moment and try again.",
      "rate_limit",
      msg
    );
  }

  if (/context.*length|maximum.*token|token.*limit/i.test(msg)) {
    return new ModelError(
      "Context length exceeded — the conversation is too long for this model.",
      "context_length",
      msg
    );
  }

  if (/econnrefused|network|timeout|fetch failed|socket/i.test(msg)) {
    return new ModelError(
      "Cannot reach Z.AI — check your network connection.",
      "network_error",
      msg
    );
  }

  if (/base_url|baseurl|invalid url/i.test(msg)) {
    return new ModelError(
      "Z.AI base URL error — the internal endpoint URL is malformed. This is likely a bug; please report it.",
      "base_url_error",
      msg
    );
  }

  return new ModelError(
    `AI provider returned an unexpected error: ${msg}`,
    "unknown",
    msg
  );
}

// ─── Z.AI exact runtime endpoints ────────────────────────────────────────────
//
// These are the ONLY two URLs where Z.AI requests are sent at runtime.
// All request construction is anchored to these two constants — no implicit
// path building from separate parts.
//
//   PAAS (OpenAI-compatible):  https://api.z.ai/api/coding/paas/v4/chat/completions
//   Anthropic-compatible:      https://api.z.ai/api/anthropic/v1/messages
//
// Source: https://docs.z.ai/api-reference/introduction
//         https://docs.z.ai/scenario-example/develop-tools/claude
//
// Auth:
//   PAAS lane      — Authorization: Bearer <key>  (OpenAI SDK)
//   Anthropic lane — x-api-key: <key>             (manual fetch, uses ZAI_ANTHROPIC_ENDPOINT directly)
//
// Lane selection is fully automatic — only ZAI_API_KEY is required from the environment.

// Primary: exact full endpoint URLs that receive requests
const ZAI_CODING_PAAS_ENDPOINT        = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const ZAI_ANTHROPIC_ENDPOINT          = "https://api.z.ai/api/anthropic/v1/messages";

// Derived: base URLs stripped from the exact endpoint constants above.
// ZAI_CODING_PAAS_BASE_URL  — used only for OpenAI SDK init; the SDK appends
//   /chat/completions to produce → ZAI_CODING_PAAS_ENDPOINT exactly.
// ZAI_ANTHROPIC_BASE_URL_DEFAULT — used for ProviderConfig.anthropicBaseURL;
//   Anthropic fetch calls bypass this and use ZAI_ANTHROPIC_ENDPOINT directly.
const ZAI_CODING_PAAS_BASE_URL        = ZAI_CODING_PAAS_ENDPOINT.replace(/\/chat\/completions$/, "/");
const ZAI_ANTHROPIC_BASE_URL_DEFAULT  = ZAI_ANTHROPIC_ENDPOINT.replace(/\/v1\/messages$/, "");
const ANTHROPIC_VERSION               = "2023-06-01";

// ─── Provider configuration ──────────────────────────────────────────────────

export type ProviderName = "zai" | "replit-openai";

interface ProviderConfig {
  name: ProviderName;
  apiKey: string;
  paasBaseURL: string;
  anthropicBaseURL: string;
  supportsTemperature: boolean;
  routingReason: string;
}

function resolveProviderConfig(): ProviderConfig {
  const zaiApiKey = process.env["ZAI_API_KEY"];
  if (zaiApiKey) {
    return {
      name: "zai",
      apiKey: zaiApiKey,
      paasBaseURL: ZAI_CODING_PAAS_BASE_URL,
      anthropicBaseURL: ZAI_ANTHROPIC_BASE_URL_DEFAULT,
      supportsTemperature: true,
      routingReason: "ZAI_API_KEY is set — using Z.AI (coding PAAS + Anthropic lanes)",
    };
  }

  // ── PASSIVE EMERGENCY FALLBACK — not an active provider ───────────────────
  // The Replit AI integration path (AI_INTEGRATIONS_OPENAI_API_KEY) is a passive
  // emergency fallback preserved from the pre-Z.AI-only era. It is NOT an active
  // provider in the Z.AI-only baseline. It is NOT exposed in the Integrations UI,
  // NOT represented in ProviderStateStore, and NOT documented as a supported path.
  // It exists here only to avoid a hard crash in development environments where
  // ZAI_API_KEY is absent but a Replit AI integration key is present.
  //
  // IMPORTANT: This path has NO Anthropic lane, NO vision capability, and NO
  // fallback chain. It delegates to the PAAS-compatible OpenAI SDK endpoint only.
  //
  // DO NOT expand this path. If ZAI_API_KEY is absent, the correct operator
  // action is to set ZAI_API_KEY — not to rely on this fallback.
  const replitApiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const replitBaseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  if (replitApiKey && replitBaseURL) {
    return {
      name: "replit-openai",
      apiKey: replitApiKey,
      paasBaseURL: replitBaseURL,
      anthropicBaseURL: "",
      supportsTemperature: false,
      routingReason: "No ZAI_API_KEY — passive emergency fallback to Replit AI integration (NOT an active provider path)",
    };
  }

  throw new ModelError(
    [
      "No AI provider configured. To use VenomGPT locally:",
      "  1. Get an API key at https://z.ai/manage-apikey/apikey-list",
      "  2. Add ZAI_API_KEY=your_key to your .env file at the repo root",
      "  3. Restart the server",
    ].join("\n"),
    "missing_api_key",
    "Neither ZAI_API_KEY nor AI_INTEGRATIONS_OPENAI_API_KEY is set in the environment."
  );
}

// ─── Vision detection ─────────────────────────────────────────────────────────

function detectVisionFromMessages(messages: Message[]): boolean {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "image_url") return true;
      }
    }
  }
  return false;
}

// ─── Anthropic lane — fetch-based client ──────────────────────────────────────
// The Anthropic lane uses a different request/response schema from OpenAI.
// We call it with fetch directly to avoid adding the Anthropic SDK as a dependency.

interface AnthropicRequestMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string }>;
}

function messagesToAnthropic(messages: Message[]): {
  system: string | undefined;
  messages: AnthropicRequestMessage[];
} {
  const systemMsg = messages.find((m) => m.role === "system");
  const system = systemMsg
    ? typeof systemMsg.content === "string"
      ? systemMsg.content
      : systemMsg.content.filter((p) => p.type === "text").map((p) => p.text ?? "").join("")
    : undefined;

  const nonSystem = messages.filter((m) => m.role !== "system");
  const converted: AnthropicRequestMessage[] = nonSystem.map((m) => ({
    role: m.role as "user" | "assistant",
    // INTENTIONAL: image_url parts are stripped here. Vision tasks are routed to
    // the PAAS lane (glm-4.6v) exclusively — the Anthropic lane models do not
    // support vision. The visual analysis is converted to plain text before being
    // forwarded to any Anthropic-lane call. If Anthropic-lane vision support is
    // added in future, this filter must be updated to emit Anthropic image blocks.
    content: typeof m.content === "string"
      ? m.content
      : m.content
          .filter((p) => p.type === "text")
          .map((p) => ({ type: "text" as const, text: p.text ?? "" })),
  }));

  return { system, messages: converted };
}

// ─── Per-request diagnostic context ──────────────────────────────────────────

interface RequestDiagCtx {
  taskId?: string;
  lane: ZaiLane;
  model: string;
  baseURL: string;
  endpoint: string;
  attempt: number;
  streaming: boolean;
}

function logRequestIssued(ctx: RequestDiagCtx): void {
  logger.info(
    {
      provider_diag: true,
      taskId:    ctx.taskId ?? "(none)",
      lane:      ctx.lane,
      model:     ctx.model,
      baseURL:   ctx.baseURL,
      endpoint:  ctx.endpoint,
      attempt:   ctx.attempt,
      streaming: ctx.streaming,
    },
    `[Z.AI request] lane=${ctx.lane} model=${ctx.model} endpoint=${ctx.endpoint} attempt=${ctx.attempt} streaming=${ctx.streaming}`
  );
}

function logRequestResult(
  ctx: RequestDiagCtx,
  status: number,
  latencyMs: number,
  errorCode?: string,
  requestFailed?: boolean,
  errorPayloadSnippet?: string,
  fallbackTriggered?: boolean,
): void {
  const level = status >= 200 && status < 300 ? "info" : "warn";
  logger[level](
    {
      provider_diag:      true,
      taskId:             ctx.taskId ?? "(none)",
      lane:               ctx.lane,
      model:              ctx.model,
      endpoint:           ctx.endpoint,
      attempt:            ctx.attempt,
      httpStatus:         status,
      latencyMs,
      errorCode:          errorCode ?? null,
      requestFailed:      requestFailed ?? false,
      // fallbackTriggered is set to true when the error is retriable and a next
      // candidate exists in the chain; false when request fails but chain aborts.
      // The authoritative fallback/abort decision is also logged in callWithFallback.
      fallbackTriggered:  fallbackTriggered ?? false,
      errorPayload:       errorPayloadSnippet ?? null,
    },
    `[Z.AI response] lane=${ctx.lane} model=${ctx.model} status=${status} latency=${latencyMs}ms${errorCode ? ` errorCode=${errorCode}` : ""}${requestFailed ? " REQUEST_FAILED" : ""}${fallbackTriggered ? " FALLBACK_TRIGGERED" : ""}`
  );
}

async function callAnthropicLane(
  apiKey: string,
  anthropicBaseURL: string,
  model: string,
  messages: Message[],
  options: ChatOptions,
  attempt = 1
): Promise<ModelResponse> {
  const { system, messages: anthropicMessages } = messagesToAnthropic(messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? 8192,
    messages: anthropicMessages,
  };
  if (system) body["system"] = system;
  if (options.temperature !== undefined) body["temperature"] = options.temperature;

  // Use the exact endpoint constant — no path construction.
  // ZAI_ANTHROPIC_ENDPOINT = "https://api.z.ai/api/anthropic/v1/messages"
  const url = ZAI_ANTHROPIC_ENDPOINT;

  const diagCtx: RequestDiagCtx = {
    taskId: options.taskId,
    lane: "anthropic",
    model,
    baseURL: ZAI_ANTHROPIC_BASE_URL_DEFAULT,
    endpoint: url,
    attempt,
    streaming: false,
  };
  logRequestIssued(diagCtx);
  const t0 = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logRequestResult(diagCtx, 0, Date.now() - t0, "network_error");
    throw categorizeError(err);
  }

  const latencyMs = Date.now() - t0;
  const responseText = await response.text();

  if (!response.ok) {
    // Parse Z.AI error format: {"error":{"code":"1113","message":"..."}}
    let errMsg = responseText;
    let errorCode: string | undefined;
    try {
      const errData = JSON.parse(responseText) as { error?: { code?: string; message?: string } };
      if (errData.error?.message) {
        errorCode = errData.error.code;
        errMsg = `code=${errData.error.code ?? response.status}: ${errData.error.message}`;
      }
    } catch { /* use raw text */ }
    const payloadSnippet = responseText.slice(0, 300);
    logRequestResult(diagCtx, response.status, latencyMs, errorCode, true, payloadSnippet, true);
    throw categorizeError(new Error(`HTTP ${response.status} from Z.AI Anthropic lane: ${errMsg}`));
  }

  logRequestResult(diagCtx, response.status, latencyMs);

  let data: { content: Array<{ type: string; text: string }>; usage?: { input_tokens: number; output_tokens: number } };
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new ModelError("Anthropic lane returned non-JSON response.", "unexpected_response", responseText.slice(0, 200));
  }

  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
  if (!text) {
    throw new ModelError("Anthropic lane returned a response with no text content.", "unexpected_response", JSON.stringify(data).slice(0, 200));
  }

  return {
    content: text,
    usage: data.usage
      ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens }
      : undefined,
    modelUsed: model,
    laneUsed: "anthropic",
  };
}

async function callAnthropicLaneStream(
  apiKey: string,
  anthropicBaseURL: string,
  model: string,
  messages: Message[],
  onChunk: (text: string) => void,
  options: ChatOptions,
  attempt = 1
): Promise<ModelResponse> {
  const { system, messages: anthropicMessages } = messagesToAnthropic(messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? 8192,
    messages: anthropicMessages,
    stream: true,
  };
  if (system) body["system"] = system;
  if (options.temperature !== undefined) body["temperature"] = options.temperature;

  // Use the exact endpoint constant — no path construction.
  // ZAI_ANTHROPIC_ENDPOINT = "https://api.z.ai/api/anthropic/v1/messages"
  const url = ZAI_ANTHROPIC_ENDPOINT;

  const diagCtx: RequestDiagCtx = {
    taskId: options.taskId,
    lane: "anthropic",
    model,
    baseURL: ZAI_ANTHROPIC_BASE_URL_DEFAULT,
    endpoint: url,
    attempt,
    streaming: true,
  };
  logRequestIssued(diagCtx);
  const t0 = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logRequestResult(diagCtx, 0, Date.now() - t0, "network_error");
    throw categorizeError(err);
  }

  const latencyMs = Date.now() - t0;

  if (!response.ok) {
    const errorText = await response.text();
    let errMsg = errorText;
    let errorCode: string | undefined;
    try {
      const errData = JSON.parse(errorText) as { error?: { code?: string; message?: string } };
      if (errData.error?.message) {
        errorCode = errData.error.code;
        errMsg = `code=${errData.error.code ?? response.status}: ${errData.error.message}`;
      }
    } catch { /* use raw text */ }
    const payloadSnippet = errorText.slice(0, 300);
    logRequestResult(diagCtx, response.status, latencyMs, errorCode, true, payloadSnippet, true);
    throw categorizeError(new Error(`HTTP ${response.status} from Z.AI Anthropic lane: ${errMsg}`));
  }

  logRequestResult(diagCtx, response.status, latencyMs);

  // Parse SSE stream
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === "[DONE]") continue;

        try {
          const event = JSON.parse(dataStr) as {
            type: string;
            delta?: { type: string; text?: string };
          };
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            fullContent += event.delta.text;
            onChunk(event.delta.text);
          }
        } catch { /* skip malformed SSE event */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!fullContent) {
    throw new ModelError(
      "Anthropic lane stream completed but produced no content.",
      "unexpected_response",
      "Empty stream from Anthropic lane"
    );
  }

  return { content: fullContent, modelUsed: model, laneUsed: "anthropic" };
}

// ─── PAAS lane helpers ────────────────────────────────────────────────────────

function buildPaasParams(
  model: string,
  options: ChatOptions,
  supportsTemperature: boolean
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    model,
    max_completion_tokens: options.maxTokens ?? 8192,
  };
  if (supportsTemperature) {
    params["temperature"] = options.temperature ?? 0.1;
  }
  return params;
}

// ─── Lane-aware fallback logic ────────────────────────────────────────────────

type ProviderCallFn = (candidate: LaneCandidate, attempt: number) => Promise<ModelResponse>;

async function callWithFallback(
  chain: LaneCandidate[],
  callFn: ProviderCallFn,
  logContext: string
): Promise<ModelResponse> {
  let lastErr: unknown;

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    const attempt = i + 1;
    const isRetry = i > 0;

    if (isRetry) {
      logger.warn(
        { modelId: candidate.modelId, lane: candidate.lane, attempt },
        `[VenomGPT] ${logContext}: trying fallback #${i} — ${candidate.modelId} (${candidate.lane} lane)`
      );
    } else {
      logger.debug(
        { modelId: candidate.modelId, lane: candidate.lane },
        `[VenomGPT] ${logContext}: ${candidate.reason}`
      );
    }

    try {
      const result = await callFn(candidate, attempt);
      if (isRetry) {
        logger.info(
          { modelId: candidate.modelId, lane: candidate.lane },
          `[VenomGPT] ${logContext}: fallback succeeded with ${candidate.modelId} (${candidate.lane} lane)`
        );
      }
      return result;
    } catch (err) {
      const categorized = err instanceof ModelError ? err : categorizeError(err);
      lastErr = categorized;

      const retriable = isEntitlementError(categorized);
      logger.warn(
        { modelId: candidate.modelId, lane: candidate.lane, category: categorized.category, retriable },
        `[VenomGPT] ${logContext}: ${candidate.modelId} failed [${categorized.category}]${retriable ? " — continuing fallback chain" : " — aborting (non-retriable)"}`
      );

      if (!retriable) {
        // Hard errors (invalid key, network, etc.) don't benefit from retrying another model
        throw categorized;
      }

      // Entitlement/balance/route-mismatch errors: try next candidate if available
      if (i === chain.length - 1) {
        throw new ModelError(
          `All Z.AI models in the fallback chain are unavailable. Last error: ${categorized.message}`,
          categorized.category,
          categorized.technical
        );
      }
      // Continue to next candidate
    }
  }

  // Should never reach here
  throw lastErr ?? new ModelError("No fallback candidates available.", "unknown", "empty chain");
}

// ─── Main provider implementation ─────────────────────────────────────────────
//
// Phase 2: ZaiProvider delegates all execution to ZaiDriver via the module-level
// zaiDriver singleton imported from providers/drivers/ZaiDriver.ts.
//
// ZaiProvider retains the ModelProvider interface (used by getModelProvider() and
// agent.ts) and is the public surface of the provider system for legacy call sites.
// The heavy logic (lanes, fallback chain, Anthropic fetch, PAAS OpenAI SDK calls,
// error categorization) now lives exclusively in ZaiDriver.ts.
//
// Methods that do not depend on execution details (isVisionCapable,
// getVisualTaskCapability, getDiagnosticConfig) read from zaiDriver helpers
// to avoid maintaining duplicate config resolution state here.

class ZaiProvider implements ModelProvider {
  constructor() {
    // Eagerly resolve provider config — throws ModelError if no credentials are set.
    // This preserves the pre-Phase-2 behavior where getModelProvider() threw immediately
    // when called with no env vars, rather than deferring the error to execute() time.
    //
    // We call resolveProviderConfig() here (not via zaiDriver) because it throws a
    // properly typed ModelError, which is what test-model-config.ts checks for.
    const config = resolveProviderConfig();
    if (config.name === "zai") {
      logger.info(
        { paasBaseURL: config.paasBaseURL, anthropicBaseURL: config.anthropicBaseURL },
        "[VenomGPT] Z.AI provider initialized — coding PAAS lane + Anthropic lane. " +
        "Lane selection is automatic based on task type."
      );
    }
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<ModelResponse> {
    // Dispatch through the provider router, not the driver directly.
    // This validates the routing layer (Phase 2 architectural requirement).
    const driver = getDriver("zai");
    let result;
    try {
      result = await driver.execute({
        messages:    messages as unknown as ExecutionMessage[],
        model:       options.model,
        maxTokens:   options.maxTokens,
        temperature: options.temperature,
        taskId:      options.taskId,
        taskHint:    options.taskHint,
      });
    } catch (err) {
      // Map driver-specific errors (ZaiError) back to ModelError so existing
      // runtime paths (agentLoop.ts, agent.ts) that branch on `err instanceof ModelError`
      // continue to work correctly without modification.
      if (err instanceof ModelError) throw err;
      const msg  = err instanceof Error ? err.message : String(err);
      const cat  = (err as { category?: string }).category ?? "unknown";
      throw new ModelError(msg, (cat as ModelErrorCategory), msg);
    }
    return {
      content:   result.content,
      usage:     result.usage,
      modelUsed: result.modelUsed,
      laneUsed:  result.laneUsed as ZaiLane | undefined,
    };
  }

  isVisionCapable(): boolean {
    return zaiDriver.isZai();
  }

  getVisualTaskCapability(): VisualTaskCapability {
    if (!zaiDriver.isZai()) {
      return {
        capable:             false,
        primaryVisionModel:  null,
        visionModelChain:    [],
        note:
          "Replit AI integration does not expose a vision-capable model. " +
          "Set ZAI_API_KEY to enable screenshot analysis via Z.AI (glm-4.6v / glm-4.6v-flash).",
        maxImagesPerRequest: 0,
        maxImageSizeBytes:   0,
      };
    }

    const chain = getFallbackChain("vision");
    return {
      capable:             true,
      primaryVisionModel:  chain[0]?.modelId ?? null,
      visionModelChain:    chain.map((c) => c.modelId),
      note:
        "Z.AI PAAS lane — glm-4.6v (primary) + glm-4.6v-flash (fallback). " +
        "Requires the Z.AI PAAS vision model entitlement package on the account. " +
        "Without entitlement, visual tasks fail honestly with a clear error message.",
      maxImagesPerRequest: 5,
      maxImageSizeBytes:   4 * 1024 * 1024,
    };
  }

  async chatStream(
    messages: Message[],
    onChunk: (text: string) => void,
    options: ChatOptions = {}
  ): Promise<ModelResponse> {
    const driver = getDriver("zai");
    let result;
    try {
      result = await driver.execute({
        messages:    messages as unknown as ExecutionMessage[],
        model:       options.model,
        maxTokens:   options.maxTokens,
        temperature: options.temperature,
        taskId:      options.taskId,
        taskHint:    options.taskHint,
        onChunk,
      });
    } catch (err) {
      if (err instanceof ModelError) throw err;
      const msg  = err instanceof Error ? err.message : String(err);
      const cat  = (err as { category?: string }).category ?? "unknown";
      throw new ModelError(msg, (cat as ModelErrorCategory), msg);
    }
    return {
      content:   result.content,
      usage:     result.usage,
      modelUsed: result.modelUsed,
      laneUsed:  result.laneUsed as ZaiLane | undefined,
    };
  }

  /** Expose config for diagnostics (never exposes the API key value). */
  getDiagnosticConfig(): {
    paasBaseURL: string;
    anthropicBaseURL: string;
    name: ProviderName;
  } {
    const dc = zaiDriver.getDiagnosticConfig();
    return {
      paasBaseURL:      dc.paasBaseURL,
      anthropicBaseURL: dc.anthropicBaseURL,
      name:             dc.name,
    };
  }
}

// ─── DEFERRED: OpenAI Codex Provider (not active) ────────────────────────────
// CodexProvider was removed as part of the Z.AI-only provider cleanup.
// The openai-codex-auth/ library files remain on disk for reference.
// Re-introduce this class only if Codex is re-enabled as an active provider.
// See routes/codexAuth.ts (also DEFERRED) for the OAuth plumbing.
//
// [Original header kept for reference]
// API endpoint: https://api.openai.com/v1/chat/completions
// Auth: Authorization: Bearer <access_token>
// Extra header: ChatGPT-Account-Id: <accountId>
//
// Codex API models available via ChatGPT subscription:
//   codex-mini-latest — primary (fast, optimized for agentic coding tasks)
//   o4-mini           — fallback
//
// Vision: NOT supported — visual tasks surface a clear error when Codex is active.


// ─── Singleton + lifecycle ────────────────────────────────────────────────────

let providerInstance: ZaiProvider | null = null;

/**
 * Returns the Z.AI provider. The activeProvider parameter is accepted for
 * call-site compatibility but only "zai" is active after the Codex cleanup.
 */
export function getModelProvider(activeProvider?: "zai"): ModelProvider {
  if (!providerInstance) {
    providerInstance = new ZaiProvider();
  }
  return providerInstance;
}

/** Returns the ZaiProvider instance with diagnostic methods, or null if not initialized yet. */
export function getZaiProviderForDiagnostics(): ZaiProvider | null {
  return providerInstance;
}

export function resetModelProvider(): void {
  providerInstance = null;
  // Also reset the driver's cached config so tests that swap env vars get fresh resolution.
  zaiDriver.resetConfig();
}

// ─── Startup diagnostic ───────────────────────────────────────────────────────

export function logProviderDiagnostic(): void {
  try {
    const config = resolveProviderConfig();
    const isZai = config.name === "zai";

    logger.info("─".repeat(60));
    logger.info("[VenomGPT] AI Provider Diagnostic");
    logger.info(`  Provider         : ${config.name}`);
    logger.info(`  PAAS lane URL    : ${config.paasBaseURL}`);
    if (isZai) {
      logger.info(`  Anthropic lane   : ${config.anthropicBaseURL}`);
      logger.info(`  Default routing  : agentic/coding → GLM-5.1 (Anthropic lane) with lane+model fallback`);
      logger.info(`  Model selection  : automatic — based on task hint, no env override`);
    }
    logger.info(`  Temperature      : ${config.supportsTemperature ? "enabled" : "disabled (gpt-5+)"}`);
    logger.info(`  Reason           : ${config.routingReason}`);
    logger.info(
      getCapabilitySummary()
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n")
    );
    logger.info("─".repeat(60));
  } catch (err) {
    const msg = err instanceof ModelError ? err.message : String(err);
    logger.warn(`[VenomGPT] No AI provider configured:\n${msg}`);
  }
}

// Export endpoint constants — the exact URLs that receive runtime requests.
// Base URL variants are also exported for diagnostics SDK init.
export { ZAI_CODING_PAAS_ENDPOINT, ZAI_ANTHROPIC_ENDPOINT, ZAI_CODING_PAAS_BASE_URL, ZAI_ANTHROPIC_BASE_URL_DEFAULT };
