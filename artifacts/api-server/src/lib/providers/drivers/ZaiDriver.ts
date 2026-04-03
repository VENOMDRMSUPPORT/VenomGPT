/**
 * ZaiDriver.ts — Phase 2: Z.AI provider driver
 *
 * Implements ProviderDriver for the Z.AI dual-lane (PAAS + Anthropic) execution path.
 * This is the authoritative home for all Z.AI behavior extracted from modelAdapter.ts.
 *
 * ── Execution path ────────────────────────────────────────────────────────────
 *
 *   ZaiDriver.execute(request)
 *     → resolveChain()              — vision detection + hint → LaneCandidate[]
 *     → callWithFallback()          — tries candidates in order, stops at first success
 *       → callAnthropicLane()       — fetch-based Anthropic-schema call
 *       → callAnthropicLaneStream() — SSE streaming on Anthropic lane
 *       → PAAS lane via OpenAI SDK  — OpenAI-compatible PAAS endpoint
 *
 * ── Wire-in (Phase 2) ─────────────────────────────────────────────────────────
 *
 *   providerRouter.ts: getDriver("zai") returns the singleton ZaiDriver.
 *   modelAdapter.ts: ZaiProvider.chat() / chatStream() delegate to this driver.
 *
 * ── Behavior preserved ────────────────────────────────────────────────────────
 *
 *   - Dual-lane selection (PAAS vs Anthropic)
 *   - Z.AI error code 1113 (entitlement) detection and fallback
 *   - 429 disambiguation: balance exhaustion vs route-mismatch vs rate-limit
 *   - Vision detection from messages → vision fallback chain
 *   - replit-openai integration fallback (AI_INTEGRATIONS_OPENAI_API_KEY)
 *   - Per-request diagnostic logging with lane/model/attempt/latency
 */

import OpenAI from "openai";
import { logger } from "../../logger.js";
import {
  getFallbackChain,
  getModelById,
  ZAI_MODEL_REGISTRY,
  type ModelSelectionHint,
  type ZaiLane,
  type LaneCandidate,
} from "../../zaiCapabilities.js";
import {
  getState as storeGetState,
  setState as storeSetState,
  applyProbeResult,
  setAuthenticatedUnverified,
} from "../ProviderStateStore.js";
import {
  registerAll,
  deregisterProvider,
} from "../ModelRegistry.js";
import type {
  ProviderDriver,
  ProviderConfig,
  ProbeResult,
  ModelDescriptor,
  ExecutionRequest,
  ExecutionResult,
  ProviderState,
  NormalizedProviderError,
  NormalizedErrorCategory,
} from "../ProviderContract.js";

// ─── Z.AI exact runtime endpoints ─────────────────────────────────────────────
//
// These are the ONLY two URLs where Z.AI requests land.
// Preserved verbatim from modelAdapter.ts — no path construction, exact constants only.
//
//   PAAS lane:      https://api.z.ai/api/coding/paas/v4/chat/completions
//   Anthropic lane: https://api.z.ai/api/anthropic/v1/messages

const ZAI_CODING_PAAS_ENDPOINT       = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const ZAI_ANTHROPIC_ENDPOINT         = "https://api.z.ai/api/anthropic/v1/messages";
const ZAI_CODING_PAAS_BASE_URL       = ZAI_CODING_PAAS_ENDPOINT.replace(/\/chat\/completions$/, "/");
const ZAI_ANTHROPIC_BASE_URL_DEFAULT = ZAI_ANTHROPIC_ENDPOINT.replace(/\/v1\/messages$/, "");
const ANTHROPIC_VERSION              = "2023-06-01";

// ─── Internal config type ─────────────────────────────────────────────────────

type ZaiDriverConfigName = "zai" | "replit-openai";

interface ZaiDriverConfig {
  name: ZaiDriverConfigName;
  apiKey: string;
  paasBaseURL: string;
  anthropicBaseURL: string;
  supportsTemperature: boolean;
  routingReason: string;
}

// ─── Internal message types ───────────────────────────────────────────────────

interface InternalMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text?: string } | { type: "image_url"; image_url?: { url: string } }>;
}

interface InternalResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
  modelUsed: string;
  laneUsed: ZaiLane;
}

// ─── Route-mismatch signal detection ─────────────────────────────────────────
//
// A 429 that lacks genuine "balance exhausted" keywords may actually be a
// route/entitlement issue. Detect these so the fallback chain continues.

const ROUTE_MISMATCH_RE  = /no resource|resource package|route|endpoint|access denied|not available on|plan|subscription|not enabled|not supported on/i;
const BALANCE_KEYWORDS_RE = /balance|credit|quota|insufficient fund/i;

function isRouteMismatch429(msg: string): boolean {
  return ROUTE_MISMATCH_RE.test(msg) && !BALANCE_KEYWORDS_RE.test(msg);
}

// ─── HTTP status extraction ───────────────────────────────────────────────────

function extractStatus(err: unknown): number | undefined {
  if (err == null) return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e["status"] === "number") return e["status"] as number;
  if (typeof e["httpStatus"] === "number") return e["httpStatus"] as number;
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^HTTP (\d{3})\b/);
  return m ? parseInt(m[1], 10) : undefined;
}

// ─── Error types ──────────────────────────────────────────────────────────────

type ZaiErrorCategory =
  | "missing_api_key"
  | "invalid_api_key"
  | "model_not_found"
  | "base_url_error"
  | "network_error"
  | "rate_limit"
  | "rate_limit_route_mismatch"
  | "insufficient_balance"
  | "entitlement_error"
  | "subscription_invalid"
  | "context_length"
  | "unexpected_response"
  | "unknown";

class ZaiError extends Error {
  category: ZaiErrorCategory;
  technical: string;

  constructor(message: string, category: ZaiErrorCategory, technical: string) {
    super(message);
    this.name = "ZaiError";
    this.category = category;
    this.technical = technical;
  }
}

function isEntitlementError(err: unknown): boolean {
  if (err instanceof ZaiError) {
    return (
      err.category === "entitlement_error" ||
      err.category === "insufficient_balance" ||
      err.category === "rate_limit_route_mismatch"
    );
  }
  return false;
}

function categorizeError(err: unknown): ZaiError {
  const msg = err instanceof Error ? err.message : String(err);
  const status = extractStatus(err);

  if (status === 401 || /incorrect api key|invalid api key|authentication/i.test(msg)) {
    return new ZaiError(
      "Invalid API key — the configured ZAI_API_KEY was rejected. Check https://z.ai/manage-apikey/apikey-list",
      "invalid_api_key",
      msg
    );
  }

  if (status === 404 || /model not found|no such model/i.test(msg)) {
    return new ZaiError(
      "Model not found — the requested model does not exist on Z.AI. Check the model auto-selection policy or any call-time model override.",
      "model_not_found",
      msg
    );
  }

  if (/\b1113\b/.test(msg) || /no resource package/i.test(msg)) {
    logger.warn(
      { errorCode: "1113" },
      "[ZaiDriver] 1113 entitlement error — this model is not available on your Z.AI subscription lane. " +
      "Continuing fallback chain."
    );
    return new ZaiError(
      "API access unavailable for this model/lane combination — your Z.AI account does not include the resource package for this model. " +
      "Trying a fallback model.",
      "entitlement_error",
      msg
    );
  }

  if (status === 429) {
    if (BALANCE_KEYWORDS_RE.test(msg)) {
      return new ZaiError(
        "Insufficient Z.AI account balance — no credits remaining. Top up at https://z.ai/manage-apikey/billing. Trying a free fallback model.",
        "insufficient_balance",
        msg
      );
    }
    if (isRouteMismatch429(msg)) {
      return new ZaiError(
        `Route or entitlement mismatch (HTTP 429) — this model may not be available on the current lane/plan. Trying next fallback. Details: ${msg}`,
        "rate_limit_route_mismatch",
        msg
      );
    }
    return new ZaiError(
      "Rate limit reached — too many requests. Wait a moment and try again.",
      "rate_limit",
      msg
    );
  }

  if (/rate limit|too many requests/i.test(msg)) {
    return new ZaiError("Rate limit reached — too many requests. Wait a moment and try again.", "rate_limit", msg);
  }

  if (/context.*length|maximum.*token|token.*limit/i.test(msg)) {
    return new ZaiError("Context length exceeded — the conversation is too long for this model.", "context_length", msg);
  }

  if (/econnrefused|network|timeout|fetch failed|socket/i.test(msg)) {
    return new ZaiError("Cannot reach Z.AI — check your network connection.", "network_error", msg);
  }

  if (/base_url|baseurl|invalid url/i.test(msg)) {
    return new ZaiError(
      "Z.AI base URL error — the internal endpoint URL is malformed. This is likely a bug; please report it.",
      "base_url_error",
      msg
    );
  }

  return new ZaiError(`AI provider returned an unexpected error: ${msg}`, "unknown", msg);
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
    `[ZaiDriver request] lane=${ctx.lane} model=${ctx.model} endpoint=${ctx.endpoint} attempt=${ctx.attempt} streaming=${ctx.streaming}`
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
      provider_diag:     true,
      taskId:            ctx.taskId ?? "(none)",
      lane:              ctx.lane,
      model:             ctx.model,
      endpoint:          ctx.endpoint,
      attempt:           ctx.attempt,
      httpStatus:        status,
      latencyMs,
      errorCode:         errorCode ?? null,
      requestFailed:     requestFailed ?? false,
      fallbackTriggered: fallbackTriggered ?? false,
      errorPayload:      errorPayloadSnippet ?? null,
    },
    `[ZaiDriver response] lane=${ctx.lane} model=${ctx.model} status=${status} latency=${latencyMs}ms${errorCode ? ` errorCode=${errorCode}` : ""}${requestFailed ? " REQUEST_FAILED" : ""}${fallbackTriggered ? " FALLBACK_TRIGGERED" : ""}`
  );
}

// ─── Anthropic message conversion ─────────────────────────────────────────────

interface AnthropicRequestMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string }>;
}

function messagesToAnthropic(messages: InternalMessage[]): {
  system: string | undefined;
  messages: AnthropicRequestMessage[];
} {
  const systemMsg = messages.find((m) => m.role === "system");
  const system = systemMsg
    ? typeof systemMsg.content === "string"
      ? systemMsg.content
      : systemMsg.content.filter((p) => p.type === "text").map((p) => (p as { type: "text"; text?: string }).text ?? "").join("")
    : undefined;

  const nonSystem = messages.filter((m) => m.role !== "system");
  const converted: AnthropicRequestMessage[] = nonSystem.map((m) => ({
    role: m.role as "user" | "assistant",
    content: typeof m.content === "string"
      ? m.content
      : m.content
          .filter((p) => p.type === "text")
          .map((p) => ({ type: "text" as const, text: (p as { type: "text"; text?: string }).text ?? "" })),
  }));

  return { system, messages: converted };
}

// ─── Vision detection ─────────────────────────────────────────────────────────

function detectVisionFromMessages(messages: InternalMessage[]): boolean {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "image_url") return true;
      }
    }
  }
  return false;
}

// ─── PAAS lane helpers ────────────────────────────────────────────────────────

function buildPaasParams(
  model: string,
  options: { maxTokens?: number; temperature?: number; taskId?: string },
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

// ─── Anthropic lane calls ─────────────────────────────────────────────────────

async function callAnthropicLane(
  apiKey: string,
  model: string,
  messages: InternalMessage[],
  options: { maxTokens?: number; temperature?: number; taskId?: string },
  attempt = 1
): Promise<InternalResponse> {
  const { system, messages: anthropicMessages } = messagesToAnthropic(messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? 8192,
    messages: anthropicMessages,
  };
  if (system) body["system"] = system;
  if (options.temperature !== undefined) body["temperature"] = options.temperature;

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
    let errMsg = responseText;
    let errorCode: string | undefined;
    try {
      const errData = JSON.parse(responseText) as { error?: { code?: string; message?: string } };
      if (errData.error?.message) {
        errorCode = errData.error.code;
        errMsg = `code=${errData.error.code ?? response.status}: ${errData.error.message}`;
      }
    } catch { /* use raw text */ }
    logRequestResult(diagCtx, response.status, latencyMs, errorCode, true, responseText.slice(0, 300), true);
    throw categorizeError(new Error(`HTTP ${response.status} from Z.AI Anthropic lane: ${errMsg}`));
  }

  logRequestResult(diagCtx, response.status, latencyMs);

  let data: { content: Array<{ type: string; text: string }>; usage?: { input_tokens: number; output_tokens: number } };
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new ZaiError("Anthropic lane returned non-JSON response.", "unexpected_response", responseText.slice(0, 200));
  }

  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
  if (!text) {
    throw new ZaiError("Anthropic lane returned a response with no text content.", "unexpected_response", JSON.stringify(data).slice(0, 200));
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
  model: string,
  messages: InternalMessage[],
  onChunk: (text: string) => void,
  options: { maxTokens?: number; temperature?: number; taskId?: string },
  attempt = 1
): Promise<InternalResponse> {
  const { system, messages: anthropicMessages } = messagesToAnthropic(messages);

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? 8192,
    messages: anthropicMessages,
    stream: true,
  };
  if (system) body["system"] = system;
  if (options.temperature !== undefined) body["temperature"] = options.temperature;

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
    logRequestResult(diagCtx, response.status, latencyMs, errorCode, true, errorText.slice(0, 300), true);
    throw categorizeError(new Error(`HTTP ${response.status} from Z.AI Anthropic lane: ${errMsg}`));
  }

  logRequestResult(diagCtx, response.status, latencyMs);

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
    throw new ZaiError(
      "Anthropic lane stream completed but produced no content.",
      "unexpected_response",
      "Empty stream from Anthropic lane"
    );
  }

  return { content: fullContent, modelUsed: model, laneUsed: "anthropic" };
}

// ─── Lane-aware fallback executor ─────────────────────────────────────────────

type DriverCallFn = (candidate: LaneCandidate, attempt: number) => Promise<InternalResponse>;

async function callWithFallback(
  chain: LaneCandidate[],
  callFn: DriverCallFn,
  logContext: string
): Promise<InternalResponse> {
  let lastErr: unknown;

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    const attempt = i + 1;
    const isRetry = i > 0;

    if (isRetry) {
      logger.warn(
        { modelId: candidate.modelId, lane: candidate.lane, attempt },
        `[ZaiDriver] ${logContext}: trying fallback #${i} — ${candidate.modelId} (${candidate.lane} lane)`
      );
    } else {
      logger.debug(
        { modelId: candidate.modelId, lane: candidate.lane },
        `[ZaiDriver] ${logContext}: ${candidate.reason}`
      );
    }

    try {
      const result = await callFn(candidate, attempt);
      if (isRetry) {
        logger.info(
          { modelId: candidate.modelId, lane: candidate.lane },
          `[ZaiDriver] ${logContext}: fallback succeeded with ${candidate.modelId} (${candidate.lane} lane)`
        );
      }
      return result;
    } catch (err) {
      const categorized = err instanceof ZaiError ? err : categorizeError(err);
      lastErr = categorized;

      const retriable = isEntitlementError(categorized);
      logger.warn(
        { modelId: candidate.modelId, lane: candidate.lane, category: categorized.category, retriable },
        `[ZaiDriver] ${logContext}: ${candidate.modelId} failed [${categorized.category}]${retriable ? " — continuing fallback chain" : " — aborting (non-retriable)"}`
      );

      if (!retriable) {
        throw categorized;
      }

      if (i === chain.length - 1) {
        throw new ZaiError(
          `All Z.AI models in the fallback chain are unavailable. Last error: ${categorized.message}`,
          categorized.category,
          categorized.technical
        );
      }
    }
  }

  throw lastErr ?? new ZaiError("No fallback candidates available.", "unknown", "empty chain");
}

// ─── NormalizedErrorCategory mapping ─────────────────────────────────────────

function toNormalizedCategory(cat: ZaiErrorCategory): NormalizedErrorCategory {
  switch (cat) {
    case "invalid_api_key":
    case "missing_api_key":
      return "auth_invalid";
    case "insufficient_balance":
    case "subscription_invalid":
      return "quota_exhausted";
    case "entitlement_error":
    case "rate_limit_route_mismatch":
      return "entitlement_mismatch";
    case "model_not_found":
      return "model_unavailable";
    case "rate_limit":
      return "rate_limited";
    case "network_error":
      return "network_error";
    default:
      return "unknown";
  }
}

// ─── ZaiDriver singleton ──────────────────────────────────────────────────────

export class ZaiDriver implements ProviderDriver {
  private _config: ZaiDriverConfig | null = null;
  private _paasClient: OpenAI | null = null;

  // ─── Config resolution ─────────────────────────────────────────────────────

  private resolveConfig(): ZaiDriverConfig {
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

    const replitApiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
    const replitBaseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
    if (replitApiKey && replitBaseURL) {
      return {
        name: "replit-openai",
        apiKey: replitApiKey,
        paasBaseURL: replitBaseURL,
        anthropicBaseURL: "",
        supportsTemperature: false,
        routingReason: "No ZAI_API_KEY — falling back to Replit AI integration (gpt-5.2)",
      };
    }

    throw new ZaiError(
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

  private getConfig(): ZaiDriverConfig {
    if (!this._config) {
      this._config = this.resolveConfig();
    }
    return this._config;
  }

  private getPaasClient(): OpenAI {
    if (!this._paasClient) {
      const config = this.getConfig();
      this._paasClient = new OpenAI({ apiKey: config.apiKey, baseURL: config.paasBaseURL });
    }
    return this._paasClient;
  }

  // ─── Chain resolution ──────────────────────────────────────────────────────

  private resolveChain(
    messages: InternalMessage[],
    options: { model?: string; taskHint?: ModelSelectionHint }
  ): LaneCandidate[] {
    if (options.model) {
      const spec = getModelById(options.model);
      return [{ modelId: options.model, lane: spec?.preferredLane ?? "paas", reason: `call-time override: ${options.model}` }];
    }

    if (this.getConfig().name === "replit-openai") {
      return [{ modelId: "gpt-5.2", lane: "paas", reason: "Replit integration: gpt-5.2" }];
    }

    const hint: ModelSelectionHint = detectVisionFromMessages(messages)
      ? "vision"
      : (options.taskHint ?? "agentic");

    return getFallbackChain(hint);
  }

  // ─── ProviderDriver: connect ───────────────────────────────────────────────

  async connect(_config: ProviderConfig): Promise<void> {
    const resolved = this.resolveConfig();
    this._config = resolved;
    this._paasClient = new OpenAI({ apiKey: resolved.apiKey, baseURL: resolved.paasBaseURL });

    if (resolved.name === "zai") {
      logger.info(
        { paasBaseURL: resolved.paasBaseURL, anthropicBaseURL: resolved.anthropicBaseURL },
        "[ZaiDriver] Z.AI provider connected — coding PAAS lane + Anthropic lane. Lane selection is automatic."
      );
    } else {
      logger.info(
        { paasBaseURL: resolved.paasBaseURL },
        "[ZaiDriver] Replit AI integration connected — PAAS-compat lane only."
      );
    }

    setAuthenticatedUnverified("zai");

    const modelDescriptors = await this.listModels();
    deregisterProvider("zai");
    registerAll(modelDescriptors);
    logger.info(
      { count: modelDescriptors.length },
      "[ZaiDriver] ModelRegistry populated with Z.AI models."
    );
  }

  // ─── ProviderDriver: probe ─────────────────────────────────────────────────

  async probe(): Promise<ProbeResult> {
    const probedAt = new Date().toISOString();

    let apiKey: string;
    try {
      apiKey = this.getConfig().apiKey;
    } catch {
      const result: ProbeResult = {
        status: "unauthenticated",
        probedAt,
        message: "No ZAI_API_KEY set — cannot probe Z.AI.",
      };
      applyProbeResult("zai", result);
      return result;
    }

    try {
      const body: Record<string, unknown> = {
        model: "glm-4.5-flash",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      };
      const t0 = Date.now();
      // Probe the canonical PAAS endpoint directly — no URL manipulation.
      // ZAI_CODING_PAAS_ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions"
      const response = await fetch(ZAI_CODING_PAAS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const latencyMs = Date.now() - t0;

      if (response.ok || response.status === 400) {
        const result: ProbeResult = {
          status: "verified",
          probedAt,
          httpStatus: response.status,
          message: `Z.AI PAAS lane reachable (HTTP ${response.status}, ${latencyMs}ms).`,
        };
        applyProbeResult("zai", result, ZAI_MODEL_REGISTRY.map((m) => m.modelId));
        return result;
      }

      if (response.status === 401) {
        const result: ProbeResult = {
          status: "unauthenticated",
          probedAt,
          httpStatus: response.status,
          failureReason: "auth_invalid",
          message: "Z.AI probe returned 401 — API key is invalid.",
        };
        applyProbeResult("zai", result);
        return result;
      }

      if (response.status === 429) {
        const body429 = await response.text().catch(() => "");
        const cat: NormalizedErrorCategory = BALANCE_KEYWORDS_RE.test(body429) ? "quota_exhausted" : "rate_limited";
        const result: ProbeResult = {
          status: "authenticated_blocked",
          probedAt,
          httpStatus: response.status,
          failureReason: cat,
          message: `Z.AI probe returned 429 — ${cat === "quota_exhausted" ? "quota exhausted" : "rate limited"}.`,
          rawDetail: body429.slice(0, 200),
        };
        applyProbeResult("zai", result);
        return result;
      }

      const result: ProbeResult = {
        status: "inconclusive",
        probedAt,
        httpStatus: response.status,
        message: `Z.AI probe returned unexpected HTTP ${response.status}.`,
      };
      applyProbeResult("zai", result);
      return result;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const result: ProbeResult = {
        status: "inconclusive",
        probedAt,
        failureReason: "network_error",
        message: `Z.AI probe network error: ${msg}`,
        rawDetail: msg,
      };
      applyProbeResult("zai", result);
      return result;
    }
  }

  // ─── ProviderDriver: listModels ───────────────────────────────────────────

  async listModels(): Promise<ModelDescriptor[]> {
    const descriptors = ZAI_MODEL_REGISTRY
      .filter((m) => m.implementationStatus === "implemented")
      .map((m) => ({
        modelId:        m.modelId,
        displayName:    m.displayName,
        providerPath:   "zai" as const,
        capabilities:   m.capabilities as string[],
        supportsVision: m.capabilities.includes("vision"),
        notes:          m.notes,
      }));
    // Ensure the ModelRegistry is populated whenever listModels() is called.
    // This guarantees population even when connect() is never called explicitly
    // (which is the case in the normal request flow via modelAdapter).
    deregisterProvider("zai");
    registerAll(descriptors);
    return descriptors;
  }

  // ─── Lazy model registration ───────────────────────────────────────────────
  //
  // Track whether the ModelRegistry has been populated in this process.
  // Populated lazily on first execute() call so normal request flow guarantees
  // model registration without requiring connect() to be called.

  private _modelsRegistered = false;

  private async _ensureModelsRegistered(): Promise<void> {
    if (this._modelsRegistered) return;
    this._modelsRegistered = true;
    const descriptors = await this.listModels();
    logger.info(
      { count: descriptors.length },
      "[ZaiDriver] ModelRegistry lazily populated on first execute()."
    );
  }

  // ─── ProviderDriver: execute ───────────────────────────────────────────────

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // Lazily populate ModelRegistry on first execute() so that models are
    // always registered in the normal request flow (connect() is not called).
    await this._ensureModelsRegistered();

    const messages = request.messages as InternalMessage[];
    const options = {
      model:       request.model,
      maxTokens:   request.maxTokens,
      temperature: request.temperature,
      taskId:      request.taskId,
      // Preserve taskHint from the request — callers (ZaiProvider bridge) set this
      // from ChatOptions.taskHint so the correct fallback chain is selected.
      taskHint:    request.taskHint as ModelSelectionHint | undefined,
    };

    const chain = this.resolveChain(messages, options);
    const config = this.getConfig();
    const paasClient = this.getPaasClient();

    let internalResult: InternalResponse;

    if (request.onChunk) {
      const onChunk = request.onChunk;
      internalResult = await callWithFallback(chain, async (candidate, attempt) => {
        if (candidate.lane === "anthropic" && config.name === "zai") {
          return callAnthropicLaneStream(config.apiKey, candidate.modelId, messages, onChunk, options, attempt);
        }

        const diagCtx: RequestDiagCtx = {
          taskId: options.taskId,
          lane: "paas",
          model: candidate.modelId,
          baseURL: config.paasBaseURL,
          endpoint: ZAI_CODING_PAAS_ENDPOINT,
          attempt,
          streaming: true,
        };
        logRequestIssued(diagCtx);
        const t0 = Date.now();

        try {
          const params = buildPaasParams(candidate.modelId, options, config.supportsTemperature);
          const stream = await paasClient.chat.completions.create({
            ...params,
            messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            stream: true,
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);

          let fullContent = "";
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) { fullContent += text; onChunk(text); }
          }

          logRequestResult(diagCtx, 200, Date.now() - t0);

          if (!fullContent) {
            throw new ZaiError("PAAS lane stream completed with no content.", "unexpected_response", "Empty stream");
          }
          return { content: fullContent, modelUsed: candidate.modelId, laneUsed: "paas" };

        } catch (err) {
          if (err instanceof ZaiError) {
            logRequestResult(diagCtx, 0, Date.now() - t0, err.category, true, err.technical.slice(0, 300), true);
            throw err;
          }
          const categorized = categorizeError(err);
          const status = extractStatus(err) ?? 0;
          const rawMsg = err instanceof Error ? err.message : String(err);
          logRequestResult(diagCtx, status, Date.now() - t0, categorized.category, true, rawMsg.slice(0, 300), true);
          throw categorized;
        }
      }, "execute[stream]");

    } else {
      internalResult = await callWithFallback(chain, async (candidate, attempt) => {
        if (candidate.lane === "anthropic" && config.name === "zai") {
          return callAnthropicLane(config.apiKey, candidate.modelId, messages, options, attempt);
        }

        const diagCtx: RequestDiagCtx = {
          taskId: options.taskId,
          lane: "paas",
          model: candidate.modelId,
          baseURL: config.paasBaseURL,
          endpoint: ZAI_CODING_PAAS_ENDPOINT,
          attempt,
          streaming: false,
        };
        logRequestIssued(diagCtx);
        const t0 = Date.now();

        try {
          const params = buildPaasParams(candidate.modelId, options, config.supportsTemperature);
          const response = await paasClient.chat.completions.create({
            ...params,
            messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);

          logRequestResult(diagCtx, 200, Date.now() - t0);

          const content = response.choices[0]?.message?.content;
          if (typeof content !== "string") {
            throw new ZaiError("PAAS lane returned no text content.", "unexpected_response", JSON.stringify(content));
          }
          return {
            content,
            usage: { promptTokens: response.usage?.prompt_tokens || 0, completionTokens: response.usage?.completion_tokens || 0 },
            modelUsed: candidate.modelId,
            laneUsed: "paas",
          };

        } catch (err) {
          if (err instanceof ZaiError) {
            logRequestResult(diagCtx, 0, Date.now() - t0, err.category, true, err.technical.slice(0, 300), true);
            throw err;
          }
          const categorized = categorizeError(err);
          const status = extractStatus(err) ?? 0;
          const rawMsg = err instanceof Error ? err.message : String(err);
          logRequestResult(diagCtx, status, Date.now() - t0, categorized.category, true, rawMsg.slice(0, 300), true);
          throw categorized;
        }
      }, "execute[sync]");
    }

    return {
      content:      internalResult.content,
      modelUsed:    internalResult.modelUsed,
      providerPath: "zai",
      usage:        internalResult.usage,
      laneUsed:     internalResult.laneUsed,
    };
  }

  // ─── ProviderDriver: getState ──────────────────────────────────────────────

  getState(): ProviderState {
    const entry = storeGetState("zai");
    return {
      providerPath:    "zai",
      lifecycle:       entry.lifecycle,
      lastProbedAt:    entry.lastProbedAt,
      lastUpdatedAt:   entry.lastUpdatedAt,
      lastProbeResult: entry.lastProbeResult,
      issue:           entry.issue,
    };
  }

  // ─── ProviderDriver: normalizeError ───────────────────────────────────────

  normalizeError(raw: unknown): NormalizedProviderError {
    const categorized = raw instanceof ZaiError ? raw : categorizeError(raw);
    return {
      category:   toNormalizedCategory(categorized.category),
      message:    categorized.message,
      action:     this._actionForCategory(categorized.category),
      detectedAt: new Date().toISOString(),
      rawDetail:  categorized.technical,
    };
  }

  private _actionForCategory(cat: ZaiErrorCategory): string {
    switch (cat) {
      case "invalid_api_key":
      case "missing_api_key":
        return "Check your ZAI_API_KEY at https://z.ai/manage-apikey/apikey-list";
      case "insufficient_balance":
      case "subscription_invalid":
        return "Top up your Z.AI account balance at https://z.ai/manage-apikey/billing";
      case "entitlement_error":
        return "Your Z.AI subscription plan does not include this model/lane. Upgrade or use a free-tier model.";
      case "rate_limit_route_mismatch":
        return "Check your Z.AI account lane entitlements.";
      case "rate_limit":
        return "Wait a moment, then retry.";
      case "network_error":
        return "Check your network connection and retry.";
      case "model_not_found":
        return "Check the model ID in the request or remove the call-time model override.";
      default:
        return "Check the diagnostic logs for details.";
    }
  }

  // ─── Diagnostic helpers (not on ProviderDriver interface) ─────────────────

  getDiagnosticConfig(): { paasBaseURL: string; anthropicBaseURL: string; name: ZaiDriverConfigName } {
    const config = this.getConfig();
    return { paasBaseURL: config.paasBaseURL, anthropicBaseURL: config.anthropicBaseURL, name: config.name };
  }

  isZai(): boolean {
    try { return this.getConfig().name === "zai"; } catch { return false; }
  }

  /**
   * Reset cached config and OpenAI client.
   * Called by modelAdapter.resetModelProvider() so the driver picks up
   * updated env vars on the next call (used by tests that swap env vars).
   */
  resetConfig(): void {
    this._config = null;
    this._paasClient = null;
    this._modelsRegistered = false;
  }
}

// ─── Module-level singleton ───────────────────────────────────────────────────
//
// One ZaiDriver instance per process. providerRouter.ts holds a reference.
// modelAdapter.ts ZaiProvider delegates to this via providerRouter.getDriver("zai").

export const zaiDriver = new ZaiDriver();

// ─── Internal ZAI state helpers (for ProviderStateStore access) ───────────────

export function setZaiState(
  lifecycle: import("../ProviderContract.js").ProviderLifecycleState,
  patch: { availableModelIds?: string[]; issue?: NormalizedProviderError | null } = {}
): void {
  storeSetState("zai", { lifecycle, ...patch });
}
