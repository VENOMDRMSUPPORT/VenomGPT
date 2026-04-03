/**
 * providerDiagnostics.ts — Provider connectivity diagnostic endpoint
 *
 * GET /api/provider-diagnostics
 *
 * Sends a minimal test message to each configured Z.AI lane (PAAS and Anthropic)
 * and returns a structured report including:
 *   - Resolved base URL and endpoint path
 *   - Model and lane used
 *   - HTTP status code
 *   - Error payload (if any)
 *   - Round-trip latency
 *
 * NOTE: The API key value is NEVER included in the response.
 *
 * This route is callable from the settings/health surface in the IDE
 * without running a full task.
 */

import { Router } from "express";
import { getModelProvider, getZaiProviderForDiagnostics, ZAI_CODING_PAAS_ENDPOINT, ZAI_ANTHROPIC_ENDPOINT, ZAI_CODING_PAAS_BASE_URL, ZAI_ANTHROPIC_BASE_URL_DEFAULT } from "../lib/modelAdapter.js";
import { getFallbackChain } from "../lib/zaiCapabilities.js";
import { logger } from "../lib/logger.js";

const router = Router();

const PING_MESSAGES = [
  { role: "user" as const, content: "ping" },
];

interface LaneDiagResult {
  lane: string;
  baseURL: string;
  endpoint: string;
  model: string;
  status: "ok" | "error";
  httpStatus: number | null;
  latencyMs: number;
  errorCategory: string | null;
  errorMessage: string | null;
  errorPayload: string | null;
}

async function probeLane(
  lane: "paas" | "anthropic",
  apiKey: string,
  baseURL: string,
  anthropicBaseURL: string,
  model: string
): Promise<LaneDiagResult> {
  const t0 = Date.now();

  if (lane === "anthropic") {
    // Use exact endpoint constant — no path construction
    const endpoint = ZAI_ANTHROPIC_ENDPOINT;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: PING_MESSAGES,
        }),
      });
      const latencyMs = Date.now() - t0;
      const body = await res.text();

      if (!res.ok) {
        let errMsg = body;
        let errPayload = body.slice(0, 300);
        try {
          const parsed = JSON.parse(body) as { error?: { code?: string; message?: string } };
          if (parsed.error?.message) {
            errMsg = `[${parsed.error.code ?? res.status}] ${parsed.error.message}`;
          }
        } catch { /* use raw */ }
        return {
          lane: "anthropic",
          baseURL: anthropicBaseURL,
          endpoint,
          model,
          status: "error",
          httpStatus: res.status,
          latencyMs,
          errorCategory: res.status === 429 ? "rate_limit_or_route_mismatch" : `http_${res.status}`,
          errorMessage: errMsg,
          errorPayload: errPayload,
        };
      }

      return {
        lane: "anthropic",
        baseURL: anthropicBaseURL,
        endpoint,
        model,
        status: "ok",
        httpStatus: res.status,
        latencyMs,
        errorCategory: null,
        errorMessage: null,
        errorPayload: null,
      };
    } catch (err) {
      return {
        lane: "anthropic",
        baseURL: anthropicBaseURL,
        endpoint,
        model,
        status: "error",
        httpStatus: null,
        latencyMs: Date.now() - t0,
        errorCategory: "network_error",
        errorMessage: err instanceof Error ? err.message : String(err),
        errorPayload: null,
      };
    }
  } else {
    // PAAS lane — OpenAI SDK init; SDK appends /chat/completions → ZAI_CODING_PAAS_ENDPOINT
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey, baseURL });
    // Use exact endpoint constant for labeling — matches what the SDK constructs
    const endpoint = ZAI_CODING_PAAS_ENDPOINT;

    try {
      const res = await client.chat.completions.create({
        model,
        max_completion_tokens: 16,
        messages: PING_MESSAGES,
        temperature: 0.0,
        stream: false,
      });

      const latencyMs = Date.now() - t0;
      const content = res.choices[0]?.message?.content ?? "";
      void content;

      return {
        lane: "paas",
        baseURL,
        endpoint,
        model,
        status: "ok",
        httpStatus: 200,
        latencyMs,
        errorCategory: null,
        errorMessage: null,
        errorPayload: null,
      };
    } catch (err) {
      const latencyMs = Date.now() - t0;
      const status = (err as { status?: number })?.status ?? null;
      const message = err instanceof Error ? err.message : String(err);
      return {
        lane: "paas",
        baseURL,
        endpoint,
        model,
        status: "error",
        httpStatus: status,
        latencyMs,
        errorCategory: status === 429 ? "rate_limit_or_route_mismatch" : status === 401 ? "invalid_api_key" : status === 404 ? "model_not_found" : "unknown",
        errorMessage: message,
        errorPayload: null,
      };
    }
  }
}

/**
 * GET /api/provider-diagnostics
 *
 * Returns a structured connectivity report for each configured Z.AI lane.
 * Never exposes the API key value.
 */
router.get("/provider-diagnostics", async (_req, res) => {
  const hasZai = !!process.env["ZAI_API_KEY"];
  const hasReplit = !!(process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] && process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"]);

  if (!hasZai && !hasReplit) {
    res.status(503).json({
      ok: false,
      error: "No AI provider configured. Set ZAI_API_KEY in .env to run diagnostics.",
      results: [],
    });
    return;
  }

  const results: LaneDiagResult[] = [];

  // Ensure provider instance is initialized before reading config.
  try { getModelProvider("zai"); } catch { /* no provider configured — diagnostics will report error */ }

  // Read config from the now-initialized live instance (or fall back to hardcoded defaults)
  const liveProv = getZaiProviderForDiagnostics();

  if (hasZai) {
    const apiKey = process.env["ZAI_API_KEY"]!;
    const paasBaseURL = liveProv?.getDiagnosticConfig().paasBaseURL ?? ZAI_CODING_PAAS_BASE_URL;
    const anthropicBaseURL = liveProv?.getDiagnosticConfig().anthropicBaseURL ?? ZAI_ANTHROPIC_BASE_URL_DEFAULT;

    // Pick the first model from each lane's chain
    const codingChain = getFallbackChain("coding");
    const anthropicModel = codingChain.find(c => c.lane === "anthropic")?.modelId ?? "glm-5.1";
    const paasModel = codingChain.find(c => c.lane === "paas")?.modelId ?? "glm-4.7-flash";

    logger.info({ paasBaseURL, anthropicBaseURL, anthropicModel, paasModel }, "[provider-diagnostics] probing Z.AI lanes");

    // Probe Anthropic lane
    const anthropicResult = await probeLane("anthropic", apiKey, paasBaseURL, anthropicBaseURL, anthropicModel);
    results.push(anthropicResult);

    // Probe PAAS lane
    const paasResult = await probeLane("paas", apiKey, paasBaseURL, anthropicBaseURL, paasModel);
    results.push(paasResult);

  } else if (hasReplit) {
    const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]!;
    const paasBaseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"]!;
    const paasResult = await probeLane("paas", apiKey, paasBaseURL, "", "gpt-5.2");
    results.push(paasResult);
  }

  const allOk = results.every(r => r.status === "ok");

  res.json({
    ok: allOk,
    providerName: hasZai ? "Z.AI" : "Replit OpenAI",
    keyConfigured: hasZai || hasReplit,
    codingPaasURL: ZAI_CODING_PAAS_BASE_URL,
    anthropicURL: ZAI_ANTHROPIC_BASE_URL_DEFAULT,
    results,
  });
});

export default router;
