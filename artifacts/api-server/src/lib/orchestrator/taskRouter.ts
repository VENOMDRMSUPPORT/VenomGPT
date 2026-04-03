/**
 * @module orchestrator/taskRouter
 *
 * Task categories and their descriptions:
 *
 * 1. conversational  — Direct response, no file access
 * 2. visual_describe — Describe screenshot, answer only, no file access
 * 3. visual_report   — Write findings file then verify
 * 4. visual_fix      — Inspect ≤2 files, write fix, verify
 * 5. visual_improve  — Inspect ≤2 files, implement improvements, verify
 * 6. visual_analyze  — Structured assessment, optional 1-file read
 * 7. code_edit       — Full loop with planning phase and verification
 * 8. code_verify     — Read and run commands, no writes
 * 9. text_explain    — Read relevant context, answer, done
 */

import type { VisualIntent } from "../agentLoop.js";
import type { TaskCategory, ExecutionProfile } from "./types.js";

// ─── Profile registry ─────────────────────────────────────────────────────────

const PROFILE_CONFIGS: Record<TaskCategory, Omit<ExecutionProfile, "category">> = {
  //                                                                                                                  requiresRuntimeProof
  //                         maxSteps  reads  writes  writesAllowed  maxCmds  verify  plan
  conversational:  { maxSteps:  2, maxFileReads: 0, maxFileWrites: 0, writesAllowed: false, maxCommands:  0, requiresVerify: false, planningPhase: false, requiresRuntimeProof: false,
    description: "Conversational — direct response, no file access" },
  visual_describe: { maxSteps:  3, maxFileReads: 0, maxFileWrites: 0, writesAllowed: false, maxCommands:  0, requiresVerify: false, planningPhase: false, requiresRuntimeProof: false,
    description: "Describe screenshot — answer only, no file access" },
  visual_report:   { maxSteps:  6, maxFileReads: 0, maxFileWrites: 1, writesAllowed: true,  maxCommands:  2, requiresVerify: true,  planningPhase: false, requiresRuntimeProof: false,
    description: "Visual report — write findings file then verify" },
  visual_fix:      { maxSteps: 12, maxFileReads: 2, maxFileWrites: 3, writesAllowed: true,  maxCommands:  4, requiresVerify: true,  planningPhase: false, requiresRuntimeProof: false,
    description: "Visual fix — inspect ≤2 files, write fix, verify" },
  visual_improve:  { maxSteps: 14, maxFileReads: 2, maxFileWrites: 4, writesAllowed: true,  maxCommands:  5, requiresVerify: true,  planningPhase: false, requiresRuntimeProof: false,
    description: "Visual improve — inspect ≤2 files, implement improvements, verify" },
  visual_analyze:  { maxSteps:  5, maxFileReads: 1, maxFileWrites: 0, writesAllowed: false, maxCommands:  1, requiresVerify: false, planningPhase: false, requiresRuntimeProof: false,
    description: "Visual analyze — structured assessment, optional 1-file read" },
  code_edit:       { maxSteps: 25, maxFileReads: 10, maxFileWrites: 8, writesAllowed: true,  maxCommands: 12, requiresVerify: true,  planningPhase: true,  requiresRuntimeProof: false,
    description: "Code editing — full loop with planning phase and verification" },
  code_verify:     { maxSteps:  8, maxFileReads:  5, maxFileWrites: 0, writesAllowed: false, maxCommands:  5, requiresVerify: false, planningPhase: false, requiresRuntimeProof: false,
    description: "Verification/inspection — read and run commands, no writes" },
  /**
   * server_check: dedicated profile for tasks that explicitly verify whether a
   * running server is healthy (e.g. "check if the server is running", "is the
   * dev server up", "verify the API is live on port 3001").
   *
   * requiresRuntimeProof=true: the done gate unconditionally enforces that the
   * ledger reaches 'runtime_confirmed' quality before completion. The agent MUST
   * either: (a) run a server_start/server_stop command that triggers a port diff,
   * or (b) observe an open port in the post-command snapshot (live-server path).
   * This ensures the operator always has hard evidence that a server is live,
   * not just a static answer based on reading config files.
   */
  server_check:    { maxSteps:  6, maxFileReads:  3, maxFileWrites: 0, writesAllowed: false, maxCommands:  4, requiresVerify: false, planningPhase: false, requiresRuntimeProof: true,
    description: "Server health check — verify a running server is live; requires runtime-confirmed proof before done" },
  text_explain:    { maxSteps:  6, maxFileReads:  4, maxFileWrites: 0, writesAllowed: false, maxCommands:  0, requiresVerify: false, planningPhase: false, requiresRuntimeProof: false,
    description: "Explanation — read relevant context, answer, done" },
};

// ─── Keyword classifiers for text-only tasks ──────────────────────────────────

/** Code mutation verbs — clear signal this is a code edit task. */
const CODE_EDIT_VERBS_RE = /\b(write|add|create|fix|build|implement|change|update|refactor|remove|delete|edit|migrate|convert|rewrite|replace|set up|wire|connect|make it|generate|scaffold|stub|initialize|init|install)\b/i;

/**
 * Server-health queries — explicitly ask whether a server/API/service is live.
 * These route to server_check (requiresRuntimeProof=true) so the agent must
 * supply hard runtime evidence, not just read config files and guess.
 */
const SERVER_CHECK_RE = /\b(is (the |a )?(server|api|dev server|app|service|backend|frontend|port)\s*(running|up|live|healthy|started|listening|reachable|accessible|available|on|open)|(server|api|service|port)\s*(running|up|live|status|check|health)|(check|verify|confirm|test)\s*(if\s+|that\s+|whether\s+)?(the |a )?(server|api|service|port|app|backend|frontend)\s*(is\s*)?(running|up|live|started|open|listening|healthy|accessible))\b/i;

/** Pure verification queries — run/check only, no writes. */
const CODE_VERIFY_RE = /^(check|verify|run|test|validate|is (there|it|the|this)|does|did|show me|find|list|search|grep|look at|scan|audit|can you (check|run|test|verify|show|confirm))\b/i;

/** Pure explanation / question — answer only, no code changes. */
const TEXT_EXPLAIN_RE = /^(what|how|why|explain|describe|tell me|walk me through|can you explain|what is|what are|what does|what did|who|when|is this|how (does|do|is|can|should)|why (is|does|did|are|isn't|doesn't))\b/i;

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Classify the task and return the matching execution profile.
 * For visual tasks, the profile is determined by the visual intent.
 * For text tasks, keyword-based classification is used with code_edit as the
 * safe default (avoids under-scoping legitimate engineering tasks).
 */
export function routeTask(
  prompt:        string,
  isVisual:      boolean,
  visualIntent?: VisualIntent,
): ExecutionProfile {
  // ── Visual tasks — route directly from visual intent ──────────────────────
  if (isVisual && visualIntent) {
    const category = `visual_${visualIntent}` as TaskCategory;
    return { category, ...PROFILE_CONFIGS[category] };
  }

  const t = prompt.trim();

  // ── Code edit verbs override everything — explicit mutation intent ─────────
  if (CODE_EDIT_VERBS_RE.test(t)) {
    return { category: "code_edit", ...PROFILE_CONFIGS.code_edit };
  }

  // ── Server health check — requires runtime-confirmed proof ────────────────
  // Must be tested BEFORE code_verify since some server-check queries also
  // match CODE_VERIFY_RE (e.g. "check if the server is running").
  if (SERVER_CHECK_RE.test(t)) {
    return { category: "server_check", ...PROFILE_CONFIGS.server_check };
  }

  // ── Pure verification / inspection ────────────────────────────────────────
  if (CODE_VERIFY_RE.test(t)) {
    return { category: "code_verify", ...PROFILE_CONFIGS.code_verify };
  }

  // ── Pure explanation / question ───────────────────────────────────────────
  if (TEXT_EXPLAIN_RE.test(t)) {
    return { category: "text_explain", ...PROFILE_CONFIGS.text_explain };
  }

  // ── Default: code editing (safest general fallback) ───────────────────────
  return { category: "code_edit", ...PROFILE_CONFIGS.code_edit };
}
