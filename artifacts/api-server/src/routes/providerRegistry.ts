/**
 * providerRegistry route — GET /api/providers
 *
 * Returns the current provider registry state (Z.AI only as of Task #20).
 * Used by the frontend Integrations page to render provider cards.
 *
 * Also exposes POST /api/providers/:id/simulate-issue and
 * POST /api/providers/:id/clear-issue for testing and recovery paths.
 */

import { Router } from "express";
import {
  getAllProviderStatusViews,
  buildProviderStatusView,
  recordProviderIssue,
  clearProviderIssue,
  type ProviderId,
  type ProviderIssue,
  type ProviderIssueCategory,
} from "../lib/providerRegistry.js";
import { logger } from "../lib/logger.js";

const router = Router();

const VALID_PROVIDER_IDS: ProviderId[] = ["zai"];

const VALID_ISSUE_CATEGORIES: ProviderIssueCategory[] = [
  "auth_failed",
  "session_expired",
  "token_refresh_failed",
  "subscription_invalid",
  "model_unavailable",
  "usage_limit",
  "entitlement_mismatch",
  "wrong_api_path",
];

/**
 * GET /api/providers
 *
 * Returns all provider status views.
 */
router.get("/providers", (_req, res) => {
  try {
    const providers = getAllProviderStatusViews();
    res.json({ providers });
  } catch (err) {
    logger.error({ err }, "Failed to build provider status views");
    res.status(500).json({ error: "Failed to load provider registry" });
  }
});

/**
 * GET /api/providers/:id
 *
 * Returns a single provider status view by ID.
 */
router.get("/providers/:id", (req, res) => {
  const id = req.params["id"] as ProviderId;
  if (!VALID_PROVIDER_IDS.includes(id)) {
    res.status(404).json({ error: `Unknown provider: ${id}` });
    return;
  }
  try {
    const provider = buildProviderStatusView(id);
    res.json({ provider });
  } catch (err) {
    logger.error({ err, id }, "Failed to build provider status view");
    res.status(500).json({ error: "Failed to load provider" });
  }
});

/**
 * POST /api/providers/:id/simulate-issue
 *
 * Injects a simulated provider issue into the registry for testing visibility.
 * Body: { category: ProviderIssueCategory, message?: string, action?: string }
 *
 * This endpoint is intentionally available without auth for operator use —
 * it only writes to the local registry file and never touches external APIs.
 */
router.post("/providers/:id/simulate-issue", async (req, res) => {
  const id = req.params["id"] as ProviderId;
  if (!VALID_PROVIDER_IDS.includes(id)) {
    res.status(404).json({ error: `Unknown provider: ${id}` });
    return;
  }

  const body = req.body as { category?: string; message?: string; action?: string };
  const category = body.category as ProviderIssueCategory | undefined;

  if (!category || !VALID_ISSUE_CATEGORIES.includes(category)) {
    res.status(400).json({
      error: `Invalid or missing category. Must be one of: ${VALID_ISSUE_CATEGORIES.join(", ")}`,
    });
    return;
  }

  const issue: ProviderIssue = buildIssueFromCategory(category, body.message, body.action);

  try {
    const entry = await recordProviderIssue(id, issue);
    logger.info({ id, category }, "[simulate-issue] Provider issue injected for testing");
    res.json({ ok: true, provider: buildProviderStatusView(id), entry });
  } catch (err) {
    logger.error({ err, id }, "Failed to simulate provider issue");
    res.status(500).json({ error: "Failed to record provider issue" });
  }
});

/**
 * POST /api/providers/:id/clear-issue
 *
 * Clears the active issue for a provider, simulating recovery.
 * This is also called by the reconnect flow once a connection is re-established.
 */
router.post("/providers/:id/clear-issue", async (req, res) => {
  const id = req.params["id"] as ProviderId;
  if (!VALID_PROVIDER_IDS.includes(id)) {
    res.status(404).json({ error: `Unknown provider: ${id}` });
    return;
  }

  try {
    await clearProviderIssue(id, "connected");
    logger.info({ id }, "[clear-issue] Provider issue cleared");
    res.json({ ok: true, provider: buildProviderStatusView(id) });
  } catch (err) {
    logger.error({ err, id }, "Failed to clear provider issue");
    res.status(500).json({ error: "Failed to clear provider issue" });
  }
});

// ─── Issue factory ────────────────────────────────────────────────────────────

/**
 * Build a ProviderIssue with sensible defaults for each category.
 * Callers may override message/action via the request body.
 */
function buildIssueFromCategory(
  category: ProviderIssueCategory,
  messageOverride?: string,
  actionOverride?: string
): ProviderIssue {
  const defaults = ISSUE_DEFAULTS[category];
  return {
    category,
    message: messageOverride ?? defaults.message,
    action: actionOverride ?? defaults.action,
    detectedAt: new Date().toISOString(),
  };
}

const ISSUE_DEFAULTS: Record<ProviderIssueCategory, { message: string; action: string }> = {
  auth_failed: {
    message: "Authentication failed — credentials were rejected by the provider.",
    action: "Reconnect the provider or verify your API key.",
  },
  session_expired: {
    message: "Session expired — the access token is past its expiry and was not refreshed.",
    action: "Reconnect the provider to obtain a fresh session.",
  },
  token_refresh_failed: {
    message: "Token refresh failed — automatic refresh was attempted but the provider rejected it.",
    action: "Reconnect the provider to start a new OAuth session.",
  },
  subscription_invalid: {
    message: "Account not in good standing — the provider returned an account-level rejection.",
    action: "Check your Z.AI subscription and billing status.",
  },
  model_unavailable: {
    message: "Model unavailable — the requested model is not accessible on your current plan.",
    action: "Check your Z.AI plan or select an available model.",
  },
  usage_limit: {
    message: "Usage limit reached — rate limit or quota exhaustion is temporarily blocking requests.",
    action: "Wait for your quota to reset or contact Z.AI support.",
  },
  entitlement_mismatch: {
    message: "Entitlement mismatch — the API key lacks execution entitlement for this endpoint.",
    action: "Verify your ZAI_API_KEY has the required permissions for this API path.",
  },
  wrong_api_path: {
    message: "API path error — the execution endpoint returned an unexpected response for this key type.",
    action: "This may be a configuration issue. Verify ZAI_API_KEY is valid for the configured endpoint.",
  },
};

export default router;
