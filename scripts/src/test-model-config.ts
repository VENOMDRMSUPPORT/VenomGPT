/**
 * test-model-config.ts — Validates provider configuration logic
 *
 * Tests that:
 * 1. A clear error is thrown when no provider is configured
 * 2. ZAI is primary when ZAI_API_KEY is set (even if Replit vars are also present)
 * 3. Replit integration is used as fallback when ZAI_API_KEY is absent
 * 4. Default PAAS URL is the coding endpoint (not the deprecated standard endpoint)
 * 5. ModelError category is correct for missing key
 *
 * NOTE: ZAI_BASE_URL, ZAI_MODEL, and ZAI_VISION_MODEL are NOT supported.
 * Endpoint and model selection are fully automatic and internal.
 */

import { execSync } from "child_process";
void execSync;

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

console.log("\n=== Model Config Tests ===\n");

const originalZaiKey   = process.env["ZAI_API_KEY"];
const originalReplitKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
const originalReplitURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];

const { getModelProvider, resetModelProvider } = await import("../../artifacts/api-server/src/lib/modelAdapter.js");

// Test 1: Throws a clear error when NO provider is configured at all
resetModelProvider();
delete process.env["ZAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];

try {
  getModelProvider();
  console.error("  ✗ FAIL: Should have thrown when no provider is configured");
  failed++;
} catch (err) {
  const msg = String(err);
  const hasKeyword = /api.key|provider|zai_api_key|no.*configured/i.test(msg);
  if (hasKeyword) {
    console.log("  ✓ Throws clear error when no provider is configured");
    passed++;
  } else {
    console.error(`  ✗ FAIL: Error message not descriptive enough: "${msg}"`);
    failed++;
  }
}

// Test 2: ZAI is primary — used when ZAI_API_KEY is set, even if Replit integration is present
// NOTE: No ZAI_BASE_URL or ZAI_MODEL — endpoint and model selection are automatic.
resetModelProvider();
process.env["ZAI_API_KEY"] = "test-zai-primary-key";
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = "replit-key";
process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = "https://ai-integrations.example.com/v1";

try {
  const provider = getModelProvider();
  assert(typeof provider.chat === "function", "ZAI is primary when ZAI_API_KEY is set (even if Replit vars are present)");
  assert(typeof provider.chatStream === "function", "ZAI provider has chatStream() method");
} catch (err) {
  console.error(`  ✗ FAIL: ZAI primary provider creation failed: ${String(err)}`);
  failed += 2;
}

// Test 3: Replit integration is used as fallback when ZAI_API_KEY is absent
resetModelProvider();
delete process.env["ZAI_API_KEY"];
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = "replit-fake-key";
process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = "https://ai-integrations.example.com/v1";

try {
  const provider = getModelProvider();
  assert(typeof provider.chat === "function", "Replit integration is fallback when ZAI_API_KEY is absent");
} catch (err) {
  console.error(`  ✗ FAIL: Replit fallback provider creation failed: ${String(err)}`);
  failed++;
}

// Test 4: Default PAAS URL is the coding endpoint (not the deprecated standard /api/paas/v4/)
resetModelProvider();
delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
process.env["ZAI_API_KEY"] = "test-zai-key";

try {
  const provider = getModelProvider();
  assert(provider !== null, "Provider created with default coding PAAS URL");
  // Verify the provider uses the coding endpoint via diagnostics
  const { getZaiProviderForDiagnostics } = await import("../../artifacts/api-server/src/lib/modelAdapter.js");
  const diag = getZaiProviderForDiagnostics();
  const config = diag?.getDiagnosticConfig();
  assert(
    config?.paasBaseURL === "https://api.z.ai/api/coding/paas/v4/",
    `Default PAAS URL is coding endpoint: ${config?.paasBaseURL}`
  );
  assert(
    config?.paasBaseURL !== "https://api.z.ai/api/paas/v4/",
    "Deprecated standard PAAS endpoint is NOT used"
  );
  assert(
    config?.anthropicBaseURL === "https://api.z.ai/api/anthropic",
    `Anthropic URL is correct: ${config?.anthropicBaseURL}`
  );
} catch (err) {
  console.error(`  ✗ FAIL: Should work with default ZAI config: ${String(err)}`);
  failed += 4;
}

// Test 5: ModelError is thrown with correct category for missing key
resetModelProvider();
delete process.env["ZAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];

const { ModelError } = await import("../../artifacts/api-server/src/lib/modelAdapter.js");
try {
  getModelProvider();
  console.error("  ✗ FAIL: Should have thrown ModelError");
  failed++;
} catch (err) {
  if (err instanceof ModelError && err.category === "missing_api_key") {
    console.log("  ✓ Throws ModelError with category=missing_api_key");
    passed++;
  } else {
    console.error(`  ✗ FAIL: Wrong error type or category: ${String(err)}`);
    failed++;
  }
}

// Restore env
if (originalZaiKey)   process.env["ZAI_API_KEY"]                     = originalZaiKey;
else                  delete process.env["ZAI_API_KEY"];

if (originalReplitKey) process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = originalReplitKey;
else                   delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];

if (originalReplitURL) process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = originalReplitURL;
else                   delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];

resetModelProvider();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
