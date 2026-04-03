// @ts-nocheck — DEFERRED file; type-checking suppressed until Codex is re-enabled.
/**
 * DEFERRED — not wired at runtime.
 * This router is NOT mounted in routes/index.ts as of the Z.AI-only provider
 * cleanup (Task #20). All routes below are preserved for future re-enablement.
 * Do not import this file from any active runtime path until Codex is re-enabled.
 */

/**
 * codexAuth.ts — OpenAI Codex OAuth REST routes
 *
 * GET  /api/auth/codex/status              — current connection state
 * POST /api/auth/codex/connect             — start PKCE auth flow; returns authUrl
 * POST /api/auth/codex/disconnect          — revoke session and clear stored tokens
 * POST /api/auth/codex/forensic-probe      — run diagnostic probe; returns full evidence
 * GET  /api/auth/codex/last-probe-evidence — retrieve evidence from the most recent probe run
 *
 * The callback is received by a local HTTP server on port 1455 started by
 * the oauth module when `connect` is called. The frontend polls status
 * to detect when the flow completes.
 *
 * ── Capability probe ────────────────────────────────────────────────────────
 * After each successful OAuth exchange, we run a lightweight capability probe
 * against api.openai.com/v1/chat/completions using the session token.
 *
 * The probe sends EXACTLY the same headers as the real callCodex() path in
 * modelAdapter.ts: Authorization: Bearer <token> + ChatGPT-Account-Id (when
 * accountId is known).
 *
 * The probe iterates over a bounded candidate model set. Each candidate is
 * tried in order; the first 2xx result marks the path as viable. If no model
 * succeeds, the DECISIVE failure is selected by severity:
 *   quota_exhausted  (proves auth path works, billing is the only block)
 *   entitlement_mismatch
 *   model_unavailable (all models gated)
 *   wrong_api_path
 *
 * Evidence from every probe run is stored in-memory and persisted to
 * docs/codex-forensic-conclusion.md automatically.
 *
 * Result mapping:
 *   2xx                  → `verified` (execution is viable)
 *   429 insufficient_quota → `authenticated_blocked` (quota_exhausted)
 *   4xx other (e.g. 403) → `authenticated_blocked` (entitlement_mismatch)
 *   all 404 model_not_found → `authenticated_blocked` (model_unavailable)
 *   network error        → `authenticated_unverified` (probe inconclusive)
 *
 * This probe is the ONLY path to `verified`. Token presence alone is NOT
 * sufficient — this prevents false "Connected/Ready" display.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { codexOAuthManager, isTokenExpired } from "../lib/openai-codex-auth/oauth.js";
import { getCredentials, loadCredentials, isAuthenticated } from "../lib/openai-codex-auth/tokenStore.js";
import {
  setCodexState,
  setProviderState,
  clearProviderIssue,
  recordProviderIssue,
  type ProviderIssue,
  type CodexConnectionState,
} from "../lib/providerRegistry.js";
import { updateSettings, getSettings } from "../lib/settingsStore.js";
import { logger } from "../lib/logger.js";

// ─── Docs root (repo-level /docs directory) ───────────────────────────────────
const _thisDir = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(_thisDir, "../../../../docs");

const router = Router();

// ─── Codex execution endpoint ─────────────────────────────────────────────────
// This is the ACTUAL endpoint that Codex tasks are dispatched to at runtime.
// Source: modelAdapter.ts CodexProvider (OpenAI-compatible completions endpoint).
const CODEX_EXECUTION_ENDPOINT = "https://api.openai.com/v1/chat/completions";

/**
 * Bounded candidate model set for the capability probe.
 *
 * These are the Codex-family and capable reasoning models reachable via the
 * OpenAI API at v1/chat/completions. The set is intentionally small:
 *   - codex-mini-latest  — primary Codex model (may be gated to specific tiers)
 *   - o3-mini            — reasoning model (mid-tier, broader availability)
 *   - o4-mini            — reasoning model (broader availability, fallback)
 *
 * Order matters: we stop at the first success. All failures are recorded.
 * The set is fixed here — not a configurable feature. Expanding it would
 * require a dedicated model browser, which is out of scope.
 */
const CODEX_CANDIDATE_MODELS = ["codex-mini-latest", "o3-mini", "o4-mini"] as const;

// ─── Capability probe ─────────────────────────────────────────────────────────

/**
 * Probe failure modes that are surfaced to the UI as distinct categories.
 */
export type CodexProbeFailureReason =
  | "quota_exhausted"       // 429 insufficient_quota — API credits required
  | "entitlement_mismatch"  // 403 or 429 non-quota — wrong auth type or plan
  | "model_unavailable"     // 404 model_not_found — all candidates gated
  | "wrong_api_path"        // 404 endpoint / routing error (not model-related)
  | "network_error"         // fetch failed — inconclusive
  | "unexpected";           // other non-2xx

/** Per-candidate result stored in ProbeEvidence.candidates[]. */
export interface CandidateModelResult {
  model: string;
  status: number;
  viable: boolean;
  failureReason: CodexProbeFailureReason | null;
  bodyFull: string;
}

// ─── Forensic evidence storage ────────────────────────────────────────────────

/**
 * Full evidence record from the most recent probe run.
 * Stored in-memory; also written to docs/codex-forensic-conclusion.md.
 *
 * Evidence contract:
 *   - request.chatGptAccountIdPresent: boolean only — raw accountId is NOT stored
 *   - candidates[]: one result per candidate model tried
 *   - decisiveModel: which model's result drove the ruling
 *   - response: the decisive candidate's result (for backward compat with legacy consumers)
 */
export interface ProbeEvidence {
  capturedAt: string;
  source: "capability-probe" | "forensic-probe" | "re-verify-probe";
  request: {
    endpoint: string;
    authHeaderPresent: boolean;
    tokenTail: string;
    chatGptAccountIdPresent: boolean;   // present/absent — raw accountId is intentionally omitted
    bodyKeys: string[];
  };
  candidates: CandidateModelResult[];   // per-model results, in order tried
  decisiveModel: string;                // model whose result drove the ruling
  response: {
    status: number;
    bodyFull: string;
    viable: boolean;
    failureReason: CodexProbeFailureReason | null;
  };
  interpretation: string;
  ruling: string;
}

let lastProbeEvidence: ProbeEvidence | null = null;

// ─── Failure severity ranking ──────────────────────────────────────────────────

/**
 * Higher score = more informative / higher severity.
 * Used to pick the decisive failure when no model succeeds.
 *
 * quota_exhausted beats model_unavailable because it proves:
 *   - the auth path reaches the endpoint
 *   - the token is accepted
 *   - only billing credits are missing
 * That is a more actionable and accurate conclusion than "all models gated".
 */
const FAILURE_SEVERITY: Record<CodexProbeFailureReason, number> = {
  quota_exhausted:      5,
  entitlement_mismatch: 4,
  wrong_api_path:       3,
  unexpected:           2,
  model_unavailable:    1,
  network_error:        0,
};

function pickDecisiveResult(candidates: CandidateModelResult[]): CandidateModelResult {
  const successful = candidates.find(c => c.viable);
  if (successful) return successful;

  // Pick the failure with the highest severity
  return candidates.reduce((best, c) => {
    const bestScore = FAILURE_SEVERITY[best.failureReason ?? "unexpected"] ?? 0;
    const cScore    = FAILURE_SEVERITY[c.failureReason   ?? "unexpected"] ?? 0;
    return cScore > bestScore ? c : best;
  });
}

// ─── Interpretation & ruling text ─────────────────────────────────────────────

function buildInterpretation(
  candidates: CandidateModelResult[],
  decisive: CandidateModelResult
): { interpretation: string; ruling: string } {
  if (decisive.viable) {
    return {
      interpretation:
        `HTTP ${decisive.status} on model '${decisive.model}' — the execution endpoint accepted the ` +
        "request. The ChatGPT OAuth token has active API execution access.",
      ruling: `PATH_A_SUCCESS: model '${decisive.model}' is viable. Provider can be marked verified.`,
    };
  }

  const tried = candidates.map(c => `${c.model} → HTTP ${c.status > 0 ? c.status : "network-error"} (${c.failureReason ?? "unknown"})`).join("; ");

  switch (decisive.failureReason) {
    case "quota_exhausted":
      return {
        interpretation:
          `Tried ${candidates.length} candidate model(s): ${tried}. ` +
          `The decisive result is model '${decisive.model}': HTTP 429 (insufficient_quota). ` +
          "The auth token IS accepted by the endpoint. The block is billing-only: " +
          "the OpenAI account has no API billing credits. " +
          "A ChatGPT Plus/Pro subscription does NOT include OpenAI Platform API credits.",
        ruling:
          `PATH_B_PROVED_NEGATIVE: quota_exhausted — model '${decisive.model}' confirmed auth path ` +
          "works (HTTP 429 insufficient_quota, NOT 401/403). Execution blocked by missing API credits " +
          "at platform.openai.com/account/billing.",
      };

    case "entitlement_mismatch":
      return {
        interpretation:
          `Tried ${candidates.length} candidate model(s): ${tried}. ` +
          `Decisive failure: model '${decisive.model}' HTTP ${decisive.status} — ` +
          "the ChatGPT OAuth token is not entitled to execute requests on this endpoint combination.",
        ruling:
          `PATH_B_PROVED_NEGATIVE: entitlement_mismatch — HTTP ${decisive.status} on model '${decisive.model}'. ` +
          "The ChatGPT OAuth token does not have execution entitlement for this model/endpoint.",
      };

    case "model_unavailable": {
      const allGated = candidates.every(c => c.failureReason === "model_unavailable" || c.failureReason === "network_error");
      return {
        interpretation:
          `Tried ${candidates.length} candidate model(s): ${tried}. ` +
          (allGated
            ? "ALL candidates returned model_not_found (HTTP 404). " +
              "None of the probed Codex-family models are accessible to this account via ChatGPT OAuth. " +
              "This does NOT prove a quota wall — the auth path may work but the models themselves are gated."
            : `Most decisive failure: model '${decisive.model}' returned model_not_found (HTTP 404). `),
        ruling:
          allGated
            ? "PATH_B_INCONCLUSIVE: model_unavailable — ALL candidate models returned model_not_found (HTTP 404). " +
              "Cannot confirm whether the execution path works (auth accepted?) without a model the account can access. " +
              "This is NOT a proven quota issue."
            : `PATH_B_PARTIAL: model_unavailable — model '${decisive.model}' gated. Try with a different model or account tier.`,
      };
    }

    case "wrong_api_path":
      return {
        interpretation:
          `HTTP ${decisive.status} on model '${decisive.model}' — not a model error but an endpoint error. ` +
          "The API path (api.openai.com/v1/chat/completions) may not be reachable with this token type.",
        ruling:
          `PATH_B_PROVED_NEGATIVE: wrong_api_path — HTTP ${decisive.status}. ` +
          "The ChatGPT OAuth token may not be valid for this API path.",
      };

    case "network_error":
      return {
        interpretation: `All ${candidates.length} probe(s) failed with network errors. Result is inconclusive.`,
        ruling: "INCONCLUSIVE: network_error — cannot reach api.openai.com. Check connectivity and retry.",
      };

    default:
      return {
        interpretation:
          `Unexpected response on model '${decisive.model}': HTTP ${decisive.status}. ` +
          `Tried: ${tried}.`,
        ruling: `INCONCLUSIVE: Unexpected HTTP ${decisive.status} on '${decisive.model}' — retry or investigate the full response body.`,
      };
  }
}

// ─── Forensic conclusion doc ───────────────────────────────────────────────────

async function writeForensicConclusion(evidence: ProbeEvidence): Promise<void> {
  const lines: string[] = [
    "# Codex Forensic Conclusion",
    "",
    `> Last updated: ${evidence.capturedAt}`,
    `> Source: ${evidence.source}`,
    `> Candidate models tried: ${evidence.candidates.map(c => c.model).join(", ")}`,
    "",
    "## Ruling",
    "",
    `**${evidence.ruling}**`,
    "",
    "## Request Shape",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| Endpoint | \`${evidence.request.endpoint}\` |`,
    `| Authorization header | ${evidence.request.authHeaderPresent ? `Bearer ***${evidence.request.tokenTail}` : "ABSENT"} |`,
    `| ChatGPT-Account-Id header | ${evidence.request.chatGptAccountIdPresent ? "present" : "ABSENT"} |`,
    `| Body keys | ${evidence.request.bodyKeys.join(", ")} |`,
    "",
    "## Per-Model Results",
    "",
    "| Model | HTTP Status | Viable | Failure Reason |",
    "|-------|-------------|--------|----------------|",
    ...evidence.candidates.map(c =>
      `| \`${c.model}\` | ${c.status > 0 ? c.status : "network-error"} | ${c.viable ? "**YES**" : "NO"} | ${c.failureReason ?? "none"} |`
    ),
    "",
  ];

  // Per-model full response bodies
  for (const c of evidence.candidates) {
    lines.push(`### ${c.model} — Full Response Body`);
    lines.push("");
    lines.push("```json");
    lines.push(c.bodyFull || "(empty)");
    lines.push("```");
    lines.push("");
  }

  lines.push(
    "## Interpretation",
    "",
    evidence.interpretation,
    "",
    `## Decisive Model`,
    "",
    `The ruling above is based on the result for \`${evidence.decisiveModel}\`.`,
    "",
    "---",
    "",
    "_This file is written automatically by the VenomGPT Codex probe._",
    "_Do not edit manually — it will be overwritten on the next probe run._",
    "_See docs/cline-codex-reference.md for the static Cline reference analysis._",
  );

  const content = lines.join("\n");
  try {
    await mkdir(DOCS_DIR, { recursive: true });
    await writeFile(resolve(DOCS_DIR, "codex-forensic-conclusion.md"), content, "utf-8");
    logger.info("[codex-probe] Wrote docs/codex-forensic-conclusion.md");
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[codex-probe] Failed to write forensic conclusion doc");
  }
}

// ─── Single-model raw probe ────────────────────────────────────────────────────

/**
 * Run a single HTTP call to the Codex execution endpoint for one model.
 * Does NOT touch lastProbeEvidence or write the doc.
 */
async function probeSingleModel(
  accessToken: string,
  model: string,
  accountId: string | null,
): Promise<CandidateModelResult> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type":  "application/json",
  };
  if (accountId) headers["ChatGPT-Account-Id"] = accountId;

  const bodyPayload = {
    model,
    messages: [{ role: "user", content: "ping" }],
    max_completion_tokens: 1,
  };

  let response: Response;
  try {
    response = await fetch(CODEX_EXECUTION_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg, model }, `[codex-probe] Network error on model '${model}'`);
    return { model, status: 0, viable: false, failureReason: "network_error", bodyFull: msg };
  }

  const status = response.status;
  let rawBody = "";
  try { rawBody = await response.text(); } catch { /* ignore */ }

  logger.info({ model, status, body: rawBody }, `[codex-probe] ${model} → HTTP ${status}`);

  if (status >= 200 && status < 300) {
    return { model, status, viable: true, failureReason: null, bodyFull: rawBody };
  }

  let failureReason: CodexProbeFailureReason;
  if (status === 429) {
    const isQuota = /insufficient_quota|billing|credit|balance|payment/i.test(rawBody);
    failureReason = isQuota ? "quota_exhausted" : "entitlement_mismatch";
  } else if (status === 403) {
    failureReason = "entitlement_mismatch";
  } else if (status === 404) {
    const isModel = /model|no such/i.test(rawBody);
    failureReason = isModel ? "model_unavailable" : "wrong_api_path";
  } else {
    failureReason = "unexpected";
  }

  return { model, status, viable: false, failureReason, bodyFull: rawBody };
}

// ─── Multi-model probe ─────────────────────────────────────────────────────────

interface MultiProbeReturn {
  evidence: ProbeEvidence;
  viable: boolean;
  failureReason: CodexProbeFailureReason | null;
  httpStatus: number | undefined;
}

/**
 * Run the capability probe across a candidate model set.
 *
 * Tries each model in order.
 *   - When exhaustive=false (default): stops at first success or decisive failure
 *     (quota_exhausted / entitlement_mismatch), since those prove the execution-path truth.
 *   - When exhaustive=true: probes ALL candidates regardless of intermediate results.
 *     Used by forensic probes that need complete per-model evidence.
 *
 * Stores result in lastProbeEvidence and writes docs/codex-forensic-conclusion.md.
 */
async function runMultiModelProbe(
  accessToken: string,
  source: ProbeEvidence["source"],
  candidates: readonly string[],
  exhaustive = false,
): Promise<MultiProbeReturn> {
  const accountId = codexOAuthManager.getAccountId() ?? null;
  const tokenTail = accessToken.length >= 8 ? accessToken.slice(-8) : "***";

  logger.info(
    { source, candidates, chatGptAccountIdPresent: !!accountId, exhaustive },
    `[codex-probe] Multi-model probe — trying ${candidates.length} candidate(s)${exhaustive ? " (exhaustive)" : ""}`
  );

  const results: CandidateModelResult[] = [];
  for (const model of candidates) {
    const r = await probeSingleModel(accessToken, model, accountId);
    results.push(r);
    if (!exhaustive) {
      if (r.viable) break; // success — no need to try more
      // Stop early only for quota/entitlement — these prove the auth path; trying more models won't help
      if (r.failureReason === "quota_exhausted" || r.failureReason === "entitlement_mismatch") break;
    }
  }

  const decisive = pickDecisiveResult(results);
  const { interpretation, ruling } = buildInterpretation(results, decisive);

  const evidence: ProbeEvidence = {
    capturedAt: new Date().toISOString(),
    source,
    request: {
      endpoint: CODEX_EXECUTION_ENDPOINT,
      authHeaderPresent: true,
      tokenTail,
      chatGptAccountIdPresent: !!accountId,
      bodyKeys: ["model", "messages", "max_completion_tokens"],
    },
    candidates: results,
    decisiveModel: decisive.model,
    response: {
      status: decisive.status,
      bodyFull: decisive.bodyFull,
      viable: decisive.viable,
      failureReason: decisive.failureReason,
    },
    interpretation,
    ruling,
  };

  lastProbeEvidence = evidence;
  void writeForensicConclusion(evidence);

  return {
    evidence,
    viable: decisive.viable,
    failureReason: decisive.failureReason,
    httpStatus: decisive.status > 0 ? decisive.status : undefined,
  };
}

// ─── Build ProviderIssue from probe failure ────────────────────────────────────

/**
 * Build a ProviderIssue from a probe failure.
 *
 * The category and message MUST match exactly the failure reason from the
 * decisive probe result — no broadening to "no credits" when the evidence
 * is "model_not_found".
 */
function buildProbeIssue(
  reason: CodexProbeFailureReason,
  decisiveModel: string,
  httpStatus?: number,
): ProviderIssue {
  const detectedAt = new Date().toISOString();

  switch (reason) {
    case "quota_exhausted":
      return {
        category: "usage_limit",
        message:
          `Authentication succeeded and the OpenAI API accepted your token (model: ${decisiveModel}, ` +
          `HTTP ${httpStatus ?? 429}, OpenAI error code: insufficient_quota). ` +
          "Execution is blocked by missing API billing credits. " +
          "The ChatGPT subscription and OpenAI Platform API are separate billing systems — " +
          "a ChatGPT Plus/Pro subscription does NOT grant API execution credits.",
        action:
          "Add a payment method and credit balance at platform.openai.com/account/billing. " +
          "A ChatGPT Plus or Pro subscription is NOT sufficient — separate API credits are required.",
        detectedAt,
      };

    case "entitlement_mismatch":
      return {
        category: "entitlement_mismatch",
        message:
          `Authentication accepted but execution is blocked (model: ${decisiveModel}, ` +
          `HTTP ${httpStatus ?? "4xx"}). ` +
          "The ChatGPT OAuth token is rejected or rate-limited for a reason unrelated to billing credits. " +
          "This may indicate the account type does not grant API execution access at this endpoint.",
        action:
          "Verify your OpenAI account has API access enabled at platform.openai.com/account. " +
          "If you only have a ChatGPT subscription without API tier access, task execution cannot proceed.",
        detectedAt,
      };

    case "model_unavailable":
      return {
        category: "model_unavailable",
        message:
          `None of the probed Codex-family candidate models are accessible to this account ` +
          `(all returned model_not_found / HTTP 404, decisive model: ${decisiveModel}). ` +
          "This is NOT proven to be a billing issue — the models themselves may be gated. " +
          "Whether the auth path would work with API credits cannot be confirmed from this evidence alone.",
        action:
          "Check your OpenAI account for Codex model access at platform.openai.com. " +
          "Run the diagnostic probe again after adding API credits, or try connecting a different OpenAI account.",
        detectedAt,
      };

    case "wrong_api_path":
      return {
        category: "wrong_api_path",
        message:
          `Execution endpoint returned HTTP ${httpStatus ?? 404} for a non-model reason ` +
          `(model: ${decisiveModel}). ` +
          "The configured path (api.openai.com/v1/chat/completions) may not be reachable with this token type.",
        action: "This may be a VenomGPT configuration issue. Try reconnecting with a fresh OAuth flow.",
        detectedAt,
      };

    case "network_error":
      return {
        category: "auth_failed",
        message: "Capability probe could not reach the OpenAI API — network error. Result is inconclusive.",
        action: "Check your network connection and try reconnecting.",
        detectedAt,
      };

    default:
      return {
        category: "subscription_invalid",
        message: `Execution probe failed with unexpected status${httpStatus ? ` (HTTP ${httpStatus})` : ""}. ` +
          "The provider may be temporarily unavailable.",
        action: "Try reconnecting. If the issue persists, check the OpenAI status page at status.openai.com.",
        detectedAt,
      };
  }
}

// ─── Post-auth state update ───────────────────────────────────────────────────

/**
 * Run multi-model capability probe across the candidate set and update provider
 * registry state. Called after both local callback and manual callback complete.
 *
 * The probe tries all CODEX_CANDIDATE_MODELS in order, stopping at the first
 * success or when a decisive failure is found. The decisive failure drives the
 * issue category — so quota_exhausted is never reported when the only evidence
 * is model_not_found.
 *
 * Never throws — all errors are captured into the registry.
 * Returns the final CodexConnectionState.
 */
async function verifyAndUpdateState(
  accessToken: string,
  email: string | undefined,
  source: ProbeEvidence["source"] = "capability-probe"
): Promise<CodexConnectionState> {
  logger.info({ email: email ?? "(none)", source }, "[codex-probe] Running post-auth capability probe (multi-model)");

  // Mark as unverified while probe is in flight
  await setCodexState("authenticated_unverified", {
    availableModels: [],
    errorState: null,
    issue: null,
  });

  const { evidence, viable, failureReason, httpStatus } = await runMultiModelProbe(
    accessToken,
    source,
    CODEX_CANDIDATE_MODELS,
  );

  if (viable) {
    logger.info({ email: email ?? "(none)", decisiveModel: evidence.decisiveModel }, "[codex-probe] Codex verified");
    await setCodexState("verified", {
      availableModels: [...CODEX_CANDIDATE_MODELS],
      errorState: null,
      issue: null,
    });
    return "verified";
  }

  // Network error is inconclusive — don't block
  if (failureReason === "network_error") {
    logger.warn("[codex-probe] Probe inconclusive (network error) — leaving as authenticated_unverified");
    return "authenticated_unverified";
  }

  // Hard block — the decisive failure reason drives the issue category
  const issue = buildProbeIssue(failureReason!, evidence.decisiveModel, httpStatus);
  logger.warn(
    { failureReason, httpStatus, decisiveModel: evidence.decisiveModel, issueCategory: issue.category },
    "[codex-probe] Codex execution is blocked — marking as authenticated_blocked"
  );
  await setCodexState("authenticated_blocked", {
    availableModels: [],
    errorState: issue.message,
    issue,
  });
  return "authenticated_blocked";
}

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * GET /api/auth/codex/status
 *
 * Returns the current session state using the five-state model.
 * Does NOT trigger a token refresh — safe to call frequently.
 *
 * Usage data audit (Step 5):
 *   The OpenAI Codex provider connects via a ChatGPT consumer OAuth PKCE flow.
 *   The resulting access_token is a ChatGPT session token, NOT an OpenAI API key.
 *   Checked endpoints:
 *     - /v1/usage           — requires an API key; not available to OAuth session tokens
 *     - /dashboard/billing  — requires org admin + API key; not available here
 *     - /v1/organization/usage/* — requires API key + org role; not available here
 *   Result: no consumption, quota, or plan-tier data is accessible via this token.
 *   Only session identity metadata (email, accountId, connectedAt) is genuinely known.
 *   The usageNote field surfaces this honestly; no fake values are included.
 */
router.get("/auth/codex/status", async (_req, res) => {
  await loadCredentials();
  const creds = getCredentials();

  if (!creds) {
    res.json({
      connected: false,
      state: "disconnected",
      codexState: "disconnected",
      email: null,
      accountId: null,
      connectedAt: null,
      tokenExpired: false,
      activeProvider: getSettings().activeProvider,
      usageNote: "Usage details unavailable from provider" as const,
    });
    return;
  }

  const tokenExpired = isTokenExpired(creds);

  // Derive codexState from what's stored in the registry
  const { getRegistry, setCodexState } = await import("../lib/providerRegistry.js");
  const codexEntry = getRegistry().entries["openai-codex"];
  let codexState = codexEntry.codexState ?? (tokenExpired ? "disconnected" : "authenticated_unverified");

  // If the persisted state is `verified` but the token is now expired, demote to
  // `disconnected` at read time so the status response never overstates readiness.
  // Also update the registry so the persisted state reflects reality.
  if (tokenExpired && codexState === "verified") {
    const now = new Date().toISOString();
    await setCodexState("disconnected", {
      availableModels: [],
      errorState: "Session token expired. Please reconnect.",
      issue: {
        category: "session_expired",
        message: "Your OpenAI Codex session has expired. Please reconnect to continue using Codex.",
        action: "Click Connect on the Integrations page to start a fresh authorization flow.",
        detectedAt: now,
      },
    });
    codexState = "disconnected";
  }

  // `connected` in the legacy sense: only true when state is `verified`
  const connected = codexState === "verified";

  res.json({
    connected,
    state: codexState,
    codexState,
    email: creds.email ?? null,
    accountId: creds.accountId ?? null,
    connectedAt: creds.connectedAt ?? null,
    tokenExpired,
    activeProvider: getSettings().activeProvider,
    usageNote: "Usage details unavailable from provider" as const,
  });
});

// ─── Connect ──────────────────────────────────────────────────────────────────

// In-flight connect state (one at a time)
let _pendingFlow: {
  state: string;
  codeVerifier: string;
  authUrl: string;
  promise: Promise<void>;
} | null = null;

/**
 * POST /api/auth/codex/connect
 *
 * Initiates the PKCE OAuth flow.
 * Returns { authUrl } — the frontend must open this URL in the browser.
 * The backend starts a local callback server on port 1455.
 * Poll GET /api/auth/codex/status to detect when auth completes.
 */
router.post("/auth/codex/connect", async (_req, res) => {
  // Cancel any prior pending flow
  if (_pendingFlow) {
    codexOAuthManager.cancelAuthorizationFlow();
    _pendingFlow = null;
  }

  try {
    const { authUrl, codeVerifier, state } = await codexOAuthManager.startAuthorizationFlow();

    // Mark as awaiting callback while OAuth is in progress
    await setCodexState("awaiting_callback", {
      availableModels: [],
      errorState: null,
      issue: null,
    });

    // Start callback server and wire token-exchange + probe in the background
    const flowPromise = codexOAuthManager.waitForCallback(state, codeVerifier).then(async (creds) => {
      logger.info({ email: creds.email }, "Codex OAuth flow completed — running capability probe");

      const finalState = await verifyAndUpdateState(creds.access_token, creds.email);

      if (finalState === "verified") {
        // Only switch active provider when execution is confirmed viable
        await updateSettings({ activeProvider: "openai-codex" });
        logger.info("[codexAuth] activeProvider set to openai-codex after verification");
      } else if (finalState === "authenticated_blocked") {
        logger.warn("[codexAuth] Codex verified OAuth but execution is blocked — NOT switching active provider");
      }
      _pendingFlow = null;
    }).catch(async (err: Error) => {
      logger.warn({ err: err.message }, "Codex OAuth flow failed");

      // Categorize the OAuth failure more precisely
      const msg = err.message;
      let issue: ProviderIssue;

      if (/callback timed out/i.test(msg)) {
        issue = {
          category: "auth_failed",
          message: "OAuth callback timed out. The authorization window was not completed within 5 minutes.",
          action: "Click Connect again and complete the OpenAI sign-in within 5 minutes.",
          detectedAt: new Date().toISOString(),
        };
      } else if (/invalid.*state|state.*mismatch|csrf/i.test(msg)) {
        issue = {
          category: "auth_failed",
          message: "OAuth callback contained an invalid state parameter — possible session mismatch.",
          action: "Click Connect again to start a fresh authorization flow.",
          detectedAt: new Date().toISOString(),
        };
      } else if (/missing code|invalid.*callback/i.test(msg)) {
        issue = {
          category: "auth_failed",
          message: "OAuth callback was malformed or missing the authorization code.",
          action: "Try reconnecting. If you are in a hosted environment, use the manual URL paste method.",
          detectedAt: new Date().toISOString(),
        };
      } else if (/eaddrinuse|address.*in use|port.*in use/i.test(msg)) {
        issue = {
          category: "auth_failed",
          message: "Local callback server could not start — port 1455 is already in use.",
          action: "Free up port 1455 or use the manual URL paste method instead.",
          detectedAt: new Date().toISOString(),
        };
      } else {
        issue = {
          category: "auth_failed",
          message: `Authentication failed: ${msg}`,
          action: "Retry the connection or check your OpenAI account.",
          detectedAt: new Date().toISOString(),
        };
      }

      await setCodexState("disconnected", {
        availableModels: [],
        errorState: issue.message,
        issue,
      });
      _pendingFlow = null;
    });

    _pendingFlow = { state, codeVerifier, authUrl, promise: flowPromise };

    res.json({ ok: true, authUrl, callbackPort: 1455 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "Failed to start Codex OAuth flow");
    res.status(500).json({ ok: false, error: msg });
  }
});

// ─── Manual Callback (Replit / hosted env fallback) ─────────────────────────

/**
 * POST /api/auth/codex/manual-callback
 *
 * For hosted environments where the browser cannot reach localhost:1455.
 * The user pastes the full redirect URL (http://localhost:1455/auth/callback?code=...&state=...)
 * and this endpoint completes the token exchange using the stored pending flow state.
 *
 * Body: { url: string }
 */
router.post("/auth/codex/manual-callback", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string") {
    res.status(400).json({ ok: false, error: "Missing required field: url" });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ ok: false, error: "Invalid URL — paste the full address bar URL" });
    return;
  }

  const code  = parsed.searchParams.get("code");
  const state = parsed.searchParams.get("state");

  if (!code || !state) {
    res.status(400).json({ ok: false, error: "URL is missing code or state parameter" });
    return;
  }

  if (!_pendingFlow) {
    res.status(400).json({ ok: false, error: "No active authorization session — your authorization code may have expired. Click Connect again to start a fresh flow." });
    return;
  }

  if (state !== _pendingFlow.state) {
    res.status(400).json({ ok: false, error: "State mismatch — this callback URL may be for an older session. Click Connect again." });
    return;
  }

  const { codeVerifier } = _pendingFlow;

  try {
    const creds = await codexOAuthManager.exchangeCodeManually(code, codeVerifier);
    _pendingFlow = null;

    logger.info({ email: creds.email }, "[codexAuth] Manual callback exchange succeeded — running capability probe");

    // Run probe in background; respond immediately so UI can show "verifying" state
    const finalState = await verifyAndUpdateState(creds.access_token, creds.email);

    if (finalState === "verified") {
      await updateSettings({ activeProvider: "openai-codex" });
      logger.info("[codexAuth] Manual: activeProvider set to openai-codex after verification");
    } else if (finalState === "authenticated_blocked") {
      logger.warn("[codexAuth] Manual: Codex OAuth OK but execution blocked — NOT switching active provider");
    }

    res.json({
      ok: true,
      codexState: finalState,
      email: creds.email ?? null,
      accountId: creds.accountId ?? null,
    });
  } catch (err) {
    _pendingFlow = null;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[codexAuth] Manual callback exchange failed");
    res.status(400).json({ ok: false, error: `Token exchange failed: ${msg}` });
  }
});

// ─── Re-verify ────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/codex/verify
 *
 * Re-runs the multi-model capability probe on demand.
 * Useful when the user believes their account entitlement has changed
 * (e.g., they just added API credits).
 */
router.post("/auth/codex/verify", async (_req, res) => {
  const token = await codexOAuthManager.getAccessToken();
  if (!token) {
    res.status(400).json({
      ok: false,
      error: "No active session — connect first.",
    });
    return;
  }

  const creds = getCredentials();
  const finalState = await verifyAndUpdateState(token, creds?.email, "re-verify-probe");

  res.json({
    ok: true,
    codexState: finalState,
    verified: finalState === "verified",
    probeEvidence: lastProbeEvidence,
  });
});

// ─── Forensic probe ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/codex/forensic-probe
 *
 * Pure-read diagnostic probe — makes the same multi-model request sequence as
 * the capability probe and returns full evidence to the caller.
 * Does NOT update provider state.
 * Requires an active session (any non-disconnected state).
 *
 * Optional body: { models?: string[] }
 *   If provided, probe only those models instead of CODEX_CANDIDATE_MODELS.
 *   This allows targeted single-model or custom-set probes without permanently
 *   altering the default candidate set.
 *
 * Returns full evidence including per-model candidate results.
 */
router.post("/auth/codex/forensic-probe", async (req, res) => {
  const token = await codexOAuthManager.getAccessToken();
  if (!token) {
    res.status(400).json({
      ok: false,
      error: "No active session — connect first before running a diagnostic probe.",
    });
    return;
  }

  // Allow caller to supply a custom model list for targeted probing
  const body = (req.body ?? {}) as { models?: unknown };
  const customModels: string[] | null =
    Array.isArray(body.models) && body.models.length > 0 && body.models.every(m => typeof m === "string")
      ? (body.models as string[])
      : null;

  const candidatesToProbe: readonly string[] = customModels ?? CODEX_CANDIDATE_MODELS;

  logger.info(
    { candidatesToProbe, custom: !!customModels },
    "[codex-probe] Forensic probe triggered via API — diagnostic only (no state mutation)"
  );

  // Forensic probes are exhaustive — collect results for ALL candidates
  const { evidence, viable, failureReason, httpStatus } = await runMultiModelProbe(
    token,
    "forensic-probe",
    candidatesToProbe,
    true, // exhaustive
  );

  res.json({
    ok: true,
    viable,
    httpStatus: httpStatus ?? null,
    failureReason: failureReason ?? null,
    candidatesTried: evidence.candidates.map(c => ({ model: c.model, status: c.status, failureReason: c.failureReason })),
    decisiveModel: evidence.decisiveModel,
    evidence,
  });
});

/**
 * GET /api/auth/codex/last-probe-evidence
 *
 * Returns the evidence from the most recent probe run (capability, forensic, or re-verify).
 * Returns null if no probe has been run in this server session.
 */
router.get("/auth/codex/last-probe-evidence", (_req, res) => {
  res.json({
    ok: true,
    evidence: lastProbeEvidence,
  });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

/**
 * POST /api/auth/codex/disconnect
 *
 * Clears the stored OAuth session and resets the active provider to Z.AI.
 * If the disconnected provider was selected, also resets the activeProvider setting.
 */
router.post("/auth/codex/disconnect", async (_req, res) => {
  try {
    // Cancel any in-progress flow
    if (_pendingFlow) {
      codexOAuthManager.cancelAuthorizationFlow();
      _pendingFlow = null;
    }

    await codexOAuthManager.clearCredentials();
    await setCodexState("disconnected", {
      availableModels: [],
      errorState: null,
      issue: null,
    });

    // If Codex was the active provider, revert to Z.AI
    if (getSettings().activeProvider === "openai-codex") {
      await updateSettings({ activeProvider: "zai" });
      logger.info("[codexAuth] activeProvider reset to zai after disconnect");
    }

    logger.info("[codexAuth] Disconnected — credentials cleared");
    res.json({
      ok: true,
      connected: false,
      state: "disconnected",
      codexState: "disconnected",
      activeProvider: getSettings().activeProvider,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "Failed to disconnect Codex");
    res.status(500).json({ ok: false, error: msg });
  }
});

// ─── Select / Deselect provider ───────────────────────────────────────────────

/**
 * POST /api/auth/codex/select
 *
 * Sets OpenAI Codex as the active provider for the agent loop.
 * Fails if no verified session exists.
 */
router.post("/auth/codex/select", async (_req, res) => {
  if (!isAuthenticated()) {
    res.status(400).json({
      ok: false,
      error: "No active OpenAI Codex session. Connect first before selecting this provider.",
    });
    return;
  }

  // Enforce verified state — do not allow routing to authenticated_blocked
  const { getRegistry } = await import("../lib/providerRegistry.js");
  const codexEntry = getRegistry().entries["openai-codex"];
  if (codexEntry.codexState !== "verified") {
    const stateLabel: Record<string, string> = {
      "authenticated_unverified": "unverified (capability probe not yet run)",
      "authenticated_blocked": "blocked (execution probe failed — check API access/billing)",
      "awaiting_callback": "awaiting OAuth callback",
      "disconnected": "disconnected",
    };
    const label = stateLabel[codexEntry.codexState ?? "disconnected"] ?? codexEntry.codexState ?? "not verified";
    res.status(400).json({
      ok: false,
      error: `Cannot select Codex as active provider: state is ${label}. ` +
        "Complete the connection and ensure the capability probe passes before routing tasks to Codex.",
    });
    return;
  }

  await updateSettings({ activeProvider: "openai-codex" });
  logger.info("[codexAuth] activeProvider set to openai-codex");

  res.json({
    ok: true,
    activeProvider: "openai-codex",
    message: "OpenAI Codex is now the active provider for the agent loop.",
  });
});

/**
 * POST /api/auth/codex/deselect
 *
 * Switches back to Z.AI as the active provider (without disconnecting the session).
 */
router.post("/auth/codex/deselect", async (_req, res) => {
  await updateSettings({ activeProvider: "zai" });
  logger.info("[codexAuth] activeProvider set back to zai");

  res.json({
    ok: true,
    activeProvider: "zai",
    message: "Z.AI is now the active provider for the agent loop.",
  });
});

export default router;
