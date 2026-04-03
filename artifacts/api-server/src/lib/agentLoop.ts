import { existsSync } from "fs";
import { join }       from "path";
import { getModelProvider, ModelError, type Message, type MessageContentPart } from "./modelAdapter.js";
import { normalizeModelResponse, buildRetryInstruction, type NormalizeFailureReason } from "./responseNormalizer.js";
import { listDirectory } from "./fileTools.js";
import {
  createTask,
  createTaskController,
  getTaskSignal,
  isTaskCancelled,
  updateTaskStatus,
  setTaskMeta,
  setTaskEvidence,
  addEvent,
  type AgentTask,
  type TaskCompletion,
  type TaskFailureDetail,
  type ExitReason,
} from "./sessionManager.js";
import { broadcastAgentEvent, broadcastTaskUpdate, broadcastLivePhase } from "./wsServer.js";
import { getWorkspaceRoot, isWorkspaceSet } from "./safety.js";
import {
  getProjectIndex,
  selectRelevantFiles,
  selectVisualDebugFiles,
  selectVisualAwareFiles,
  extractVisualKeywords,
  extractComponentNames,
  buildProjectSummary,
  invalidateProjectIndex,
  type ProjectIndex,
} from "./projectIndex.js";
import { getSettings } from "./settingsStore.js";
import { logger } from "./logger.js";
import { assembleTaskEvidence } from "./agentLoop/evidenceAssembler.js";
import { executeAction, formatDirectoryTree, pruneMessages, MAX_CONSECUTIVE_PARSE_FAILURES } from "./agentLoop/actionExecutor.js";
import { readBurst } from "./agentLoop/readBurstExecutor.js";
import { parallelDispatcher, parallelEligibilityGate, deriveVerificationOutcome } from "./orchestrator/parallelDispatcher.js";
import type { DispatchResult } from "./orchestrator/parallelDispatcher.js";

// ─── Orchestrator imports ──────────────────────────────────────────────────────
import { routeTask }                         from "./orchestrator/taskRouter.js";
import { runPlanningPhase, formatPlanForContext } from "./orchestrator/planner.js";
import { savePlan as savePlanArtifact } from "./planPersistence.js";
import { getBoardTaskId } from "./boardLinkStore.js";
import { persistContinuationChain } from "./orchestrator/continuationChain.js";
import type { ContinuationChain } from "./orchestrator/types.js";
import { gateAction, updateStateAfterAction, recordShellReadBlocked, recordGateTrigger, captureBeforeSnapshot, captureAfterSnapshotAndRecord } from "./orchestrator/actionRouter.js";
import type { GateRejectionReason }          from "./orchestrator/actionRouter.js";
import { classifyCommand }                   from "./orchestrator/sideEffectClassifier.js";
import { createRunState, recordPhaseTransition } from "./orchestrator/types.js";
import type { RunState, ApprovalGate }           from "./orchestrator/types.js";
import { snapshotFileForTask, getCheckpoint, serializeCheckpoint, patchSnapshotWithDiff, classifyRuntimeImpactFiles } from "./orchestrator/checkpoint.js";
import { captureEnhancedSnapshot } from "./orchestrator/runtimeLifecycle.js";
import type { RuntimeSnapshot } from "./orchestrator/runtimeLifecycle.js";
import { getStagedPath } from "./orchestrator/stagingStore.js";
import { actionStore as _actionStore } from "./orchestrator/actionStore.js";
import {
  classifyStepDependency,
  recordDependencyClass,
  buildPlanningPhaseTruth,
  buildDonePhaseTruth,
} from "./orchestrator/dependencyClassifier.js";

// ─── Live run state registry ──────────────────────────────────────────────────
// Maps taskId → a snapshot of the most recent RunState fields needed for the
// live-state REST endpoint. Updated on every phase transition.

export interface LiveRunStateSnapshot {
  phase:                RunState["phase"];
  step:                 number;
  maxSteps:             number;
  unverifiedWriteCount: number;
  consecutiveFailures:  number;
  recoverable:          boolean;
  interventionKind:     RunState["interventionKind"];
}

const _liveRunState = new Map<string, LiveRunStateSnapshot>();

export function getLiveRunState(taskId: string): LiveRunStateSnapshot | null {
  return _liveRunState.get(taskId) ?? null;
}

function setLiveRunState(taskId: string, state: RunState): void {
  const recoverable = state.phase === "executing" || state.phase === "verifying" || state.phase === "repairing";
  _liveRunState.set(taskId, {
    phase:                state.phase,
    step:                 state.step,
    maxSteps:             state.maxSteps,
    unverifiedWriteCount: state.unverifiedWrites.size,
    consecutiveFailures:  state.consecutiveFailures,
    recoverable,
    interventionKind:     state.interventionKind,
  });
}

function clearLiveRunState(taskId: string): void {
  _liveRunState.delete(taskId);
  unregisterActiveRunState(taskId);
}

// ─── Active run state registry ────────────────────────────────────────────────
// Maps taskId → live RunState. Populated for the duration of a run so that
// pause/resume/proceed endpoints can mutate flags on the live object.

const _activeRunStates = new Map<string, RunState>();

export function getActiveRunState(taskId: string): RunState | null {
  return _activeRunStates.get(taskId) ?? null;
}

function registerActiveRunState(taskId: string, state: RunState): void {
  _activeRunStates.set(taskId, state);
}

function unregisterActiveRunState(taskId: string): void {
  _activeRunStates.delete(taskId);
}

// ─── Event helpers ────────────────────────────────────────────────────────────

function emit(taskId: string, type: Parameters<typeof addEvent>[1], message: string, data?: Record<string, unknown>): void {
  const event = addEvent(taskId, type, message, data);
  broadcastAgentEvent(taskId, event);
}

/**
 * Record a phase transition AND emit a live_phase WS broadcast.
 * This is the single canonical path for all phase changes in the agent loop and
 * approval/steering lifecycle. Every phase transition must go through here so the
 * phase timeline evidence is complete and the frontend receives consistent updates.
 *
 * Approval phase state machine (task-9):
 *   executing
 *     → awaiting_approval  (gate raised; interventionKind = "awaiting_approval")
 *     → executing          (gate approved; interventionKind = null)
 *     → selectively_blocked (selective approval; some lanes blocked; interventionKind = null)
 *     → approval_denied    (gate denied; interventionKind = null; task exits)
 *   operator_overridden    (transient phase during override consumption; run continues)
 *
 * Route handlers (/approve, /deny, /approve-selective) mutate state.phase and
 * state.interventionKind directly (they run outside the loop), then call broadcastLivePhase.
 * The loop reads the updated phase after the spin-wait and calls emitPhaseTransition here.
 */
function emitPhaseTransition(taskId: string, state: RunState, newPhase: RunState["phase"]): void {
  recordPhaseTransition(state, newPhase);
  setLiveRunState(taskId, state);
  const recoverable = newPhase === "executing" || newPhase === "verifying" || newPhase === "repairing";
  broadcastLivePhase(
    taskId,
    newPhase,
    state.step,
    state.maxSteps,
    state.unverifiedWrites.size,
    state.consecutiveFailures,
    recoverable,
    state.interventionKind,
    state.blockedContext ?? null,
    Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null,
    state.verificationQuality ?? null,
  );
  emit(taskId, "live_phase", `Phase: ${newPhase}`, {
    phase:                newPhase,
    step:                 state.step,
    maxSteps:             state.maxSteps,
    unverifiedWriteCount: state.unverifiedWrites.size,
    consecutiveFailures:  state.consecutiveFailures,
    recoverable,
    interventionKind:     state.interventionKind,
  });
}

/**
 * Emit a structured `cancelled` WS event so the frontend can show a drain
 * indicator separate from a normal failure.  Called at every cancel path.
 *
 * IMPORTANT: must be called BEFORE emitPhaseTransition(..., "failed") so that
 * `phaseAtCancellation` reflects the true phase at the moment of cancel, not
 * the synthetic "failed" phase we transition into afterward.
 *
 * Payload includes:
 *   - phaseAtCancellation: the phase the agent was in when cancelled
 *   - phase, step, maxSteps, consecutiveFailures (run position)
 *   - filesWritten: list of files written so far (staged, not yet applied)
 *   - unverifiedFiles: list of files with unverified writes
 */
function emitCancelledDrain(taskId: string, state: RunState): void {
  emit(taskId, "cancelled", "Task cancelled by user", {
    phaseAtCancellation:  state.phase,
    phase:                state.phase,
    step:                 state.step,
    stepsUsed:            state.step,   // alias of step — matches CancelledDrainData.stepsUsed
    maxSteps:             state.maxSteps,
    consecutiveFailures:  state.consecutiveFailures,
    filesWritten:         Array.from(state.filesWritten),
    unverifiedFiles:      Array.from(state.unverifiedWrites),
    unverifiedWriteCount: state.unverifiedWrites.size,
  });
}

function failTask(taskId: string, task: AgentTask, summary: string, failure: TaskFailureDetail): void {
  logger.error(
    { taskId, category: failure.category, step: failure.step, detail: failure.detail },
    `Task failed [${failure.category}] at step "${failure.step}": ${failure.title}`
  );
  emit(taskId, "error", `${failure.title}\n\n${failure.detail}`, {
    category: failure.category,
    step: failure.step,
    title: failure.title,
    detail: failure.detail,
  });
  updateTaskStatus(taskId, "error", summary, undefined, failure);
  broadcastTaskUpdate(task);
}

// ─── Conversational bypass ────────────────────────────────────────────────────
// Greetings and short general-knowledge questions bypass the full agent loop.
// This saves ~2s workspace scan latency and avoids "no valid JSON action" errors
// on prompts that have no codebase intent at all.
//
// Two tiers:
//   1. GREETING_RE   — social/ack phrases (≤ 80 chars, always bypassed)
//   2. Factual check — short question with no codebase references (≤ 120 chars)
//
// A prompt is NOT bypassed if it:
//   - References file extensions (.ts, .tsx, .js, etc.)
//   - Uses codebase possessives ("my code", "our project", "this component")
//   - Contains a path-like string (/src/, /lib/, etc.)
//   - Mentions specific files, functions, or classes by common dev noun patterns

/** Pure social phrases — need zero information to respond. */
const GREETING_RE =
  /^(hi|hello|hey|thanks|thank you|thx|ty|ok|okay|cool|great|bye|goodbye|yes|no|yep|nope|yeah|sure|got it|sounds good|perfect|nice|alright|what|huh)[\s!.,?]*$/i;

/** Patterns that indicate the prompt references the user's codebase. */
const CODEBASE_REF_RE =
  /\b(?:my|our|this)\s+(?:project|codebase|repo|code|file|component|function|module|class|type|interface|hook|service|route|endpoint|controller|model|schema|test|spec|build|config)\b|\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|cs|cpp|c|h|sh|json|yaml|yml|toml|env|md)\b|\/(?:[a-z][\w-]+\/)/i;

/** Opening words that signal a factual question requiring no file access. */
const FACTUAL_QUESTION_RE =
  /^(?:what|who|when|where|which|how|why|is|are|does|do|can|could|what's|who's|define|explain what)\b/i;

function isConversationalPrompt(prompt: string): boolean {
  const t = prompt.trim();

  // Tier 1: strict greetings — always bypass (very short)
  if (t.length <= 80 && GREETING_RE.test(t)) return true;

  // Tier 2: short factual question with no codebase context
  if (
    t.length <= 120 &&
    FACTUAL_QUESTION_RE.test(t) &&
    !CODEBASE_REF_RE.test(t)
  ) return true;

  return false;
}

// ─── System prompt ────────────────────────────────────────────────────────────
// Enforces: stage discipline, verification after edits, repair protocol,
// evidence-based completion, and minimal-read efficiency.

const SYSTEM_PROMPT = `You are VenomGPT, an expert AI coding assistant that executes software engineering tasks autonomously on a local codebase.

You operate in a strict JSON action loop. Each response must be EXACTLY one valid JSON object — nothing else.

CRITICAL — ONE ACTION PER RESPONSE:
Never combine a think with a write_file or any other action in the same response.
If you want to plan first, send ONLY the think action. Then on the next turn send the next action.
Returning multiple JSON objects in one response will cause a parse error and waste a step.

## Available Actions

{"action":"list_dir","path":"relative/path-or-empty-for-root","reason":"why"}
{"action":"read_file","path":"relative/file/path","reason":"why you need this file"}
{"action":"think","thought":"[STAGE] your analysis"}
{"action":"write_file","path":"relative/file/path","content":"complete file contents","reason":"what changed and why"}
{"action":"run_command","command":"shell command","reason":"why","timeout":60}
{"action":"done","summary":"evidence-based summary","changed_files":["exact list"],"commands_run":["exact list"],"final_status":"complete|partial|blocked","remaining":"unresolved issues or empty"}

## Execution Stages

Always annotate your think actions with a stage tag:

- [PLANNING] — understand the task; identify which files need to change and what verification you will run
- [INSPECTING] — reading files to understand current state before editing
- [EDITING] — about to write a file; explain what will change and why
- [VERIFYING] — confirming the edit or command succeeded
- [REPAIRING] — diagnosing a failure; deciding how to fix it
- [WRAPPING UP] — final review before done; confirming evidence

## Workflow

1. PLAN: identify the minimum files you need to read and what you will change
2. INSPECT: read ONLY the files relevant to the task (do not scan entire project)
3. EDIT: write files one at a time with their COMPLETE content
4. VERIFY: after every write_file, confirm the change is correct:
   - Run a build/lint/type-check command (preferred), OR
   - Read the file back to confirm the content is correct
5. REPAIR: if verification fails, diagnose the specific failure and fix it once
6. SUMMARIZE: report what was done and what evidence confirms it

## Verification Protocol (mandatory)

After every write_file you MUST verify:
- Run the appropriate build/check command (e.g. npx tsc --noEmit, npm test, python -c "import X"), OR
- Read the written file back to confirm the content

Do NOT call done before verifying. A done without verification evidence is a weak completion.

## Repair Protocol

When a command fails or verification fails:
1. Think [REPAIRING]: identify the SPECIFIC error from the output. Read the relevant file or error message.
2. Fix the root cause with write_file (if the content is wrong) or a different command.
3. Verify again after the repair.
4. If the same fix fails twice: call done with final_status "partial" explaining exactly what failed and why.
5. NEVER repeat the exact same failing command. Always change something first.

## Evidence Requirements

Your done action MUST reflect reality:
- changed_files: list EVERY file you actually called write_file on (exact paths, no omissions)
- commands_run: list EVERY command you actually ran with run_command
- summary: explain what was done AND what evidence confirms it (e.g. "TypeScript compiled clean — exit 0", "test passed", "file verified by read-back")
- If something failed or is unfinished: say so honestly in remaining

## Step Discipline

- Maximum 25 steps. Use them efficiently.
- Read the MINIMUM files needed. If the task is "edit function X in file Y", read file Y — not the whole project.
- The project intelligence section above already identifies likely relevant files — start there.
- Do not list directories unless you genuinely need to explore structure.
- Do not read files unrelated to the task.
- Think deeply before reading — plan what you need first.

## Rules

- Use RELATIVE paths only. Never use absolute paths.
- ALWAYS read a file before writing it — never assume file contents. EXCEPTION: if you are creating a brand-new file that does not yet exist, write it directly without reading first.
- Write the COMPLETE file content when using write_file, not snippets or diffs.
- Do not run unnecessary commands or install unrelated packages.
- End with "done" whether the task is complete, partial, or blocked.

## Completion Statuses

- "complete": task is done AND has been verified with real evidence
- "partial": made real progress, but could not fully complete (explain in remaining)
- "blocked": cannot proceed without information or access you do not have (explain in remaining)

## Examples

Example 1 — Adding a utility function with verification:
{"action":"think","thought":"[PLANNING] Need to add a debounce util. Read src/utils.ts first, then verify TypeScript compiles."}
{"action":"read_file","path":"src/utils.ts","reason":"read before writing to avoid conflict"}
{"action":"write_file","path":"src/utils.ts","content":"...complete file...","reason":"added debounce at end"}
{"action":"run_command","command":"npx tsc --noEmit","reason":"verify TypeScript compiles after edit","timeout":30}
{"action":"done","summary":"Added debounce utility to src/utils.ts. TypeScript compiled clean (exit 0).","changed_files":["src/utils.ts"],"commands_run":["npx tsc --noEmit"],"final_status":"complete","remaining":""}

Example 2 — Repair after a failing command:
{"action":"run_command","command":"npm test","reason":"verify the fix","timeout":60}
[test fails with "Cannot find module './auth'"]
{"action":"think","thought":"[REPAIRING] Import path is wrong — file is auth.ts not ./auth. Need to update the import."}
{"action":"read_file","path":"src/index.ts","reason":"read the broken import before fixing it"}
{"action":"write_file","path":"src/index.ts","content":"...corrected import...","reason":"fix import path"}
{"action":"run_command","command":"npm test","reason":"verify repair succeeded","timeout":60}
{"action":"done","summary":"Fixed wrong import path in src/index.ts. npm test now passes.","changed_files":["src/index.ts"],"commands_run":["npm test","npm test"],"final_status":"complete","remaining":""}`;

// ─── Stage-aware status emission ──────────────────────────────────────────────

/**
 * Emit a human-readable stage label BEFORE an action executes.
 * This gives the user a real-time narration of what the agent is doing.
 */
function emitStage(
  taskId:      string,
  step:        number,
  maxSteps:    number,
  actionType:  string,
  action:      Record<string, unknown>,
  lastFailed:  boolean
): void {
  let label: string;

  switch (actionType) {
    case "think": {
      // Extract stage tag from the thought if present
      const thought = String(action["thought"] ?? "");
      const match = thought.match(/^\[(PLANNING|INSPECTING|EDITING|VERIFYING|REPAIRING|WRAPPING UP)\]/i);
      if (match) {
        const stage = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        label = `${stage}…`;
      } else {
        label = "Planning…";
      }
      break;
    }
    case "list_dir": {
      const p = String(action["path"] || "");
      label = `Exploring: ${p || "workspace root"}`;
      break;
    }
    case "read_file": {
      const p = String(action["path"] || "");
      label = `Inspecting: ${p}`;
      break;
    }
    case "write_file": {
      const p = String(action["path"] || "");
      label = `Editing: ${p}`;
      break;
    }
    case "run_command": {
      label = lastFailed ? "Repairing…" : "Verifying…";
      break;
    }
    case "done": {
      label = "Wrapping up…";
      break;
    }
    default: {
      label = `Processing: ${actionType}`;
    }
  }

  emit(taskId, "status", `[${step}/${maxSteps}] ${label}`);
}

// ─── Visual task classification ───────────────────────────────────────────────

interface VisualTaskMeta {
  isVisual:   boolean;
  imageCount: number;
}

function classifyTask(images: string[]): VisualTaskMeta {
  return { isVisual: images.length > 0, imageCount: images.length };
}

// ─── Visual analysis (phase 1 of multimodal tasks) ───────────────────────────
//
// When images are attached, this function calls the vision model (glm-4.6v on
// the PAAS lane) BEFORE the main agentic loop.  The resulting analysis is
// plain text that gets prepended to the main agent's user context — so the
// agentic model (glm-5.1, Anthropic lane) never receives raw image data.
//
// This two-phase design lets the best vision model handle image understanding
// while the best coding model handles planning + execution.

// ─── Visual task intent classification ────────────────────────────────────────
//
// Five distinct image-task categories, classified by prompt language:
//
//   "describe"  — "what is this?", "explain this error", "what do you see?"
//                 User wants a direct natural-language answer. No file writing.
//                 Fastest path: vision → direct done (0 agent file ops).
//
//   "report"    — "write a file about this", "document this error", "save a report"
//                 User wants findings written to a file.
//                 Path: vision → write_file → verify → done.
//
//   "fix"       — "fix this layout bug", "why is X broken", "something is wrong"
//                 User wants a specific defect found and repaired in the code.
//                 Path: vision → inspect CSS files → edit → verify → done.
//
//   "improve"   — "improve this UI", "make this better", "enhance this component"
//                 User wants general UX/visual improvements, not bug fixes.
//                 Path: vision → explore relevant files → implement improvements → verify.
//
//   "analyze"   — "analyze this design", "audit this UI", "review this component"
//                 User wants a comprehensive assessment without a specific fix target.
//                 Path: vision → write analysis file or respond directly → done.
//
// Classification uses a priority-ordered set of rules. The first matching rule wins.
// Default (no match): "fix" — safest fallback, least likely to omit useful work.

export type VisualIntent = "describe" | "report" | "fix" | "improve" | "analyze";

// Matches pure explanatory/conversational questions with no action keyword.
// Intentionally conservative — FIX_RE runs BEFORE this in the classifier.
const DESCRIBE_RE  = /^(what|explain|tell me|can you explain|show me what|is this|how (does|is) (this|the)|what('s| is| are| do| can| did))\b|^(summarize|what do you (see|notice|think)|what (happened|is happening|does this|is shown))|^(i (don't|do not|can't|cannot) understand)/i;
const DESCRIBE_RE2 = /\b(what('s| is| are| does)|explain (this|the|what|why|how)|tell me (about|what|why|how)|what (error|message|issue|problem|text|does this|is this|do you see)|why (is|does|did|are|isn't|doesn't)\s+(there|this|that|the)|how (does|is) (this|the)|summarize (this|the)|what (happened|is happening)|understand (this|what))\b/i;

// Explicit file write or document request — highest priority.
const REPORT_RE    = /\b(write|create|save|generate|produce|make)\b.{0,50}\b(file|report|document|note|description|summary|info|log)\b|\b(document|record|log|put|capture)\b.{0,40}\b(error|issue|problem|bug|warning|exception|crash|fail|screen|screenshot|visible|shown)\b/i;

// UI/UX enhancement suggestions, not defect repair.
// Handles "make X look better", "make X nicer", "make it better" etc.
const IMPROVE_RE   = /\b(improve|enhance|make\s+(?:it\s+|this\s+|the\s+)?(?:\w+\s+)?(better|nicer|cleaner|faster|smoother)|upgrade|refine|polish|suggest(ions?)?|recommendation|how (can|could|should|to) (improve|enhance|make|be better))\b/i;

// Comprehensive assessment — "analyze" needs full word forms (not just prefix)
// because \b would fail inside multi-char words like "analyze" with prefix "analyz".
const ANALYZE_RE   = /\b(analyz[a-z]*|analys[a-z]*|audit|review|assess[a-z]*|evaluat[a-z]*|examine|go through|look over|check (the|this|my)|what('s| is) wrong with|overview of|assessment of)\b/i;

// Specific defect to repair — tested BEFORE describe so "why is X misaligned"
// routes to fix rather than matching the "why is" describe prefix.
const FIX_RE       = /\b(fix|repair|resolve|broken|not working|doesn'?t work|wrong|issue|bug|defect|glitch|misaligned|overflow(ing)?|clipping|layout (problem|issue|bug)|off by|too (wide|narrow|tall|short|big|small)|overlapping|doesn'?t (show|render|display|load|work)|not (showing|rendering|displaying|loading))\b/i;

export function classifyVisualIntent(prompt: string): VisualIntent {
  const p = prompt.trim();
  // 1. Report: explicit file write intent — always highest priority
  if (REPORT_RE.test(p))                            return "report";
  // 2. Improve: enhancement / suggestion language
  if (IMPROVE_RE.test(p))                           return "improve";
  // 3. Analyze: comprehensive assessment language
  if (ANALYZE_RE.test(p))                           return "analyze";
  // 4. Fix: specific defect keywords — runs BEFORE describe so that
  //    "why is X misaligned" routes to fix rather than to describe
  if (FIX_RE.test(p))                               return "fix";
  // 5. Describe: pure conversational/explanatory questions
  if (DESCRIBE_RE.test(p) || DESCRIBE_RE2.test(p)) return "describe";
  // Default: fix is safest when intent is ambiguous and an image is attached
  return "fix";
}

// ─── Vision analysis system prompts — one per intent ─────────────────────────

// "describe": concise natural-language explanation, no jargon required
const VISION_DESCRIBE_SYSTEM = `You are a helpful assistant who explains what is visible in screenshots clearly and concisely.
Your job: look at the screenshot(s) and give a clear, direct answer to the user's question.
Rules:
• Only describe what is literally visible. Do not invent hidden state, server errors, or root causes.
• Use plain language. Avoid CSS/engineering jargon unless the user asked for it.
• Quote any visible error messages or text verbatim.
• If you cannot determine something from the screenshot alone, say so explicitly.
• Be concise. Answer the question directly.`;

// "report": grounded 3-section structured description for file writing
const VISION_REPORT_SYSTEM = `You are a software debugging assistant. Your job is to look at a screenshot and produce a concise, strictly grounded description of what is visible.
Strict grounding rules — you MUST follow these:
• OBSERVED section: only facts directly readable from the screenshot. Quote error messages verbatim. No inference, no speculation.
• LIKELY INFERENCE section: reasonable conclusions drawn from visible evidence. Each item MUST be labelled "INFERENCE:".
• CANNOT CONFIRM section: anything that cannot be determined from the screenshot alone — hidden logs, server state, API calls, root causes not shown visually. List explicitly.
Never invent: server-side error codes, API failures, hidden terminal output, entitlement issues, or CSS root causes — unless literally printed in the screenshot.
Be brief and factual. Stop after the three sections.`;

// "fix": precise CSS defect forensics for targeted bug repair
const VISION_FIX_SYSTEM = `You are a senior frontend engineer specialised in diagnosing visual defects in web and mobile applications from screenshots.
Your job: examine the screenshot(s) and produce a precise, code-actionable defect report a developer can use to open the right file and fix the right CSS rule.
Rules:
• Report only what is VISUALLY PRESENT. Never invent invisible state.
• Label findings as OBSERVED (visible fact) or INFERRED (inference from visible evidence).
• Use CSS vocabulary precisely: flex, grid, overflow, z-index, position, margin, padding, gap, etc.
• Be spatially precise: TOP/BOTTOM/LEFT/RIGHT, inside/outside which container, which layer.
• Name UI regions clearly: navbar, sidebar, card, modal, table row, button, form field, panel.
• When content is cut off or obscured, say so explicitly.
• List multiple defects individually — do not group them.`;

// "improve": UX/visual enhancement opportunities, not bug fixes
const VISION_IMPROVE_SYSTEM = `You are a senior UX and frontend engineer reviewing a UI for improvement opportunities.
Your job: identify concrete, implementable improvements to the visible UI — not bugs, but enhancements.
Rules:
• Focus on: spacing, visual hierarchy, typography, color contrast, alignment, component density, empty states, feedback affordances.
• For each improvement, state: CURRENT STATE → SUGGESTED CHANGE → EXPECTED BENEFIT.
• Be specific about what CSS or component change would achieve each improvement.
• Do not invent problems that aren't visible. Only suggest changes based on what you actually see.
• Prioritize: high-impact changes first. Limit to the 5 most valuable improvements.`;

// "analyze": balanced comprehensive assessment without a specific fix target
const VISION_ANALYZE_SYSTEM = `You are a senior frontend engineer and UX reviewer conducting a structured analysis of a UI screenshot.
Your job: provide a balanced, comprehensive assessment covering both strengths and areas for improvement.
Structure your analysis as:
• WHAT IS SHOWN: describe what you see clearly (components, layout, content)
• WORKING WELL: what is implemented correctly, following good practices
• AREAS FOR IMPROVEMENT: specific issues or enhancement opportunities (label as bugs vs enhancements)
• PRIORITY RECOMMENDATION: the single most impactful change to make next
Rules:
• Be grounded in what is visible. Label inferences as such.
• Avoid vague praise or vague criticism — be specific.
• Do not invent server state or hidden errors not visible in the screenshot.`;

// ─── Token budgets per intent ──────────────────────────────────────────────────
// Sized to the minimum needed to produce a useful response for each path.
// Smaller budgets → faster responses. Only "fix" needs full forensics detail.

const VISION_MAX_TOKENS: Record<VisualIntent, number> = {
  describe:  700,   // concise answer, no sections needed
  report:   1200,   // 3 structured sections
  fix:      2500,   // 5-section defect forensics (reduced from 3500)
  improve:  1800,   // 5 prioritized improvement items
  analyze:  1800,   // 4-section balanced assessment
};

// ─── Vision analysis prompts per intent ───────────────────────────────────────

function buildVisionPrompt(intent: VisualIntent, userPrompt: string, countLabel: string): string {
  switch (intent) {
    case "describe":
      return `User question: "${userPrompt}"

Look at ${countLabel} and answer the user's question directly.
Quote any visible error messages or text verbatim.
Only describe what you can actually see. If something cannot be determined from the screenshot, say so.
Be concise and direct.`;

    case "report":
      return `Developer task: "${userPrompt}"

Examine ${countLabel} and produce a grounded description using exactly these three sections:

## OBSERVED
List every fact directly visible: error messages (quote verbatim), UI elements, text content, visible state, colour, position. Include nothing not actually shown.

## LIKELY INFERENCE
Conclusions reasonably drawn from visible evidence. Label every item with "INFERENCE:".

## CANNOT CONFIRM
What cannot be determined from this screenshot alone: hidden logs, server state, API calls, root causes not on screen. Be specific.

Keep each section concise. Quote error text exactly as shown.`;

    case "fix":
      return `Developer task: "${userPrompt}"

Examine ${countLabel}. Produce a code-actionable defect report.

## 1. VISIBLE STATE
Each distinct UI region visible: current visual state, layout, text content, styling. Note viewport position.

## 2. DEFECTS FOUND
For each defect: (a) describe precisely what is wrong, (b) where in the viewport, (c) which element/component.
Categories to check: spacing/alignment, overflow/clipping, flex/grid layout, z-index/stacking, sizing, typography, color/style, component state, responsive/viewport.
Write "✓ none observed" for categories with no defect.

## 3. CSS ROOT-CAUSE INFERENCE
For each defect: "[Defect] → LIKELY|POSSIBLE CAUSE: [CSS property]". Label confidence.

## 4. COMPONENT OWNERSHIP
For each defect: (a) visible element with symptom, (b) likely parent component responsible, (c) fix location: inline | component CSS | shared stylesheet | parent container.

## 5. LIMITS
What cannot be confirmed without reading source code? Be specific.

Be direct. Developer must be able to open the right file and find the right rule.`;

    case "improve":
      return `Developer task: "${userPrompt}"

Review ${countLabel} for UI/UX improvement opportunities (not bugs — enhancements).

List the top 5 improvements in priority order. For each:

IMPROVEMENT [N]: [Brief title]
CURRENT: [What you see now]
CHANGE: [Specific CSS/component change to make]
BENEFIT: [Why this improves the user experience]

Focus on: visual hierarchy, spacing consistency, typography, color contrast, alignment, density, affordances.
Only suggest changes based on what is actually visible. Be specific about implementation.`;

    case "analyze":
      return `Developer task: "${userPrompt}"

Provide a structured analysis of ${countLabel}.

## WHAT IS SHOWN
Describe the UI: components visible, layout, content, purpose.

## WORKING WELL
What is implemented correctly or follows good practices? Be specific.

## AREAS FOR IMPROVEMENT
List specific issues. For each: label as BUG (functional defect) or ENHANCEMENT (quality improvement). State what change is needed.

## PRIORITY RECOMMENDATION
The single most impactful change to make next, and why.

Be grounded in what is visible. Label inferences as such. Do not invent hidden errors.`;
  }
}

async function analyzeVisualContext(
  model:      ReturnType<typeof getModelProvider>,
  images:     string[],
  userPrompt: string,
  taskId:     string,
  intent:     VisualIntent
): Promise<string> {
  const imageCount = images.length;
  const countLabel = imageCount > 1 ? `${imageCount} screenshots` : "this screenshot";
  const systemMap: Record<VisualIntent, string> = {
    describe: VISION_DESCRIBE_SYSTEM,
    report:   VISION_REPORT_SYSTEM,
    fix:      VISION_FIX_SYSTEM,
    improve:  VISION_IMPROVE_SYSTEM,
    analyze:  VISION_ANALYZE_SYSTEM,
  };

  emit(taskId, "status", `Analyzing ${countLabel} [${intent}] with vision model…`);
  logger.info({ taskId, imageCount, intent }, "[VenomGPT] Starting visual analysis phase");

  const imageParts: MessageContentPart[] = images.map(url => ({
    type:      "image_url",
    image_url: { url },
  }));

  const promptText = buildVisionPrompt(intent, userPrompt, countLabel);
  const maxTokens  = VISION_MAX_TOKENS[intent];

  const analysisMessages: Message[] = [
    { role: "system", content: systemMap[intent] },
    { role: "user",   content: [{ type: "text", text: promptText }, ...imageParts] },
  ];

  const visionOpts: Parameters<typeof model.chat>[1] = { maxTokens, taskHint: "vision", taskId };
  const visionModelPin = getSettings().visionModelOverride;
  if (visionModelPin) visionOpts.model = visionModelPin;

  const result = await model.chat(analysisMessages, visionOpts);

  logger.info(
    { taskId, intent, analysisLength: result.content.length, model: result.modelUsed, lane: result.laneUsed, maxTokens },
    `[VenomGPT] Visual analysis complete (${intent} path)`
  );

  const preview = result.content.slice(0, 400) + (result.content.length > 400 ? "…" : "");
  emit(taskId, "thought", `[INSPECTING] Visual analysis — ${intent} (${result.modelUsed ?? "vision model"}):\n${preview}`);

  return result.content;
}

// ─── Visual-to-code bridge ────────────────────────────────────────────────────
//
// Phase 07: After visual analysis succeeds, this function builds a structured
// bridge between the vision model's findings and actual file-system targets.
//
// It extracts keywords from the visual analysis text (component names, CSS
// terms, UI region names) and uses those — in addition to the user's original
// prompt keywords — to score and rank files in the project index.
//
// The result is a formatted section that tells the agent:
//   - which files visually-derived evidence points to (and why)
//   - what visual terms were extracted from the analysis
//   - how to sequence its inspection given the evidence
//
// This replaces the previous approach of scoring files only on the user prompt,
// which missed the richer vocabulary produced by the vision model.

function buildVisualCodeBridge(
  index:         ProjectIndex,
  userPrompt:    string,
  visualContext: string,
  maxFiles:      number = 4,  // Phase 07A: reduced from 8 — precision over breadth
  maxReads:      number = 2   // hard read cap given to agent in protocol text
): string {
  const scored       = selectVisualAwareFiles(index, userPrompt, visualContext, maxFiles);
  const { strong, weak } = classifyVisualTerms(visualContext);

  const lines: string[] = [];

  lines.push("VISUAL-CODE BRIDGE");
  lines.push("══════════════════════════════════════════════════");

  // Show the extracted terms so the agent (and logs) can verify what drove targeting
  if (strong.length > 0) {
    lines.push(`Component names (high-confidence): ${strong.join(", ")}`);
  }
  if (weak.length > 0) {
    lines.push(`Layout terms  (low-confidence):   ${weak.slice(0, 8).join(", ")}`);
  }
  lines.push("");

  // Authoritative read cap — agent must respect this
  const readCap = Math.min(maxReads, scored.length || 1);
  lines.push(`AUTHORIZED READS: ${readCap} file${readCap !== 1 ? "s" : ""} maximum.`);
  lines.push("Read #1 first. If the defect is found → STOP and write the fix.");
  lines.push(`Only read #2${readCap > 2 ? `–#${readCap}` : ""} if #1 does not contain the responsible code.`);
  lines.push("");

  if (scored.length === 0) {
    lines.push("No files scored above threshold. If a component was named in the analysis,");
    lines.push("search for a file whose name matches that component. Else inspect the main CSS file.");
  } else {
    lines.push("Ranked candidates (visual evidence strength → prompt relevance):");
    scored.forEach(({ file, reasons, score }, idx) => {
      const tag     = idx === 0 ? " ← START HERE" : "";
      const topReasons = reasons.slice(0, 2).join("; ") || "general relevance";
      lines.push(`  #${idx + 1}  ${file.path}  [score=${score}]${tag}`);
      lines.push(`       ${topReasons}`);
    });
  }

  lines.push("══════════════════════════════════════════════════");
  return lines.join("\n");
}

/** Split visual terms into high-confidence (CamelCase/quoted) vs generic region terms */
function classifyVisualTerms(visualContext: string): { strong: string[]; weak: string[] } {
  const compNames   = extractComponentNames(visualContext).map((e) => e.kebab);
  const allKeywords = extractVisualKeywords(visualContext);
  const compSet     = new Set(compNames);
  return {
    strong: compNames,
    weak:   allKeywords.filter((k) => !compSet.has(k)),
  };
}

// ─── Execution summary helper ─────────────────────────────────────────────────

/**
 * Emit a structured execution_summary event with full telemetry at task exit.
 * Visible in the feed as an ExecutionSummaryCard.
 *
 * Includes the verification ledger summary (quality label, proof statement,
 * side-effect classes observed, and runtime port evidence) so the operator can
 * see exactly what class of proof backs the task outcome.
 *
 * @param exitReason  Honest lifecycle exit reason (persisted in evidence).
 */

/**
 * Resolve the most truthful `ExitReason` for a "clean done" completion,
 * upgrading from "clean_done" if operator steering materially affected the run.
 *
 * Priority (highest to lowest when multiple apply):
 *   1. operator_overridden — any step override was applied during the run
 *   2. selectively_blocked — selective approval blocked at least one lane
 *   3. clean_done          — no operator steering occurred
 */
function resolveCleanExitReason(state: RunState): ExitReason {
  if (state.appliedOverrides.length > 0) return "operator_overridden";
  // Use the immutable hadSelectiveBlock flag (not the transient selectivelyBlockedLaneIds set,
  // which is pruned by parallelDispatcher after each wave to prevent cross-dispatch bleed).
  if (state.hadSelectiveBlock) return "selectively_blocked";
  return "clean_done";
}

function emitExecutionSummary(taskId: string, state: RunState, exitReason: ExitReason = "error"): void {
  const gateEntries = Object.entries(state.gateCounts) as Array<[string, number]>;

  // Build ledger summary for operator-visible proof statement
  const ledgerSummary = state.verificationLedger.getSummary();

  // Serialize side-effect observations (command → class → trust)
  const sideEffectsObserved = state.sideEffectsObserved.map(e => ({
    command:         e.command.slice(0, 120),
    sideEffectClass: e.classification.sideEffectClass,
    trustLevel:      e.classification.trustLevel,
    reason:          e.classification.reason,
  }));

  // Serialize runtime evidence (port diffs from all probes)
  const runtimeEvidence = ledgerSummary.runtimeEvidence.map(d => ({
    newlyOpened: d.newlyOpened,
    newlyClosed: d.newlyClosed,
    unchanged:   d.unchanged,
    hasChange:   d.hasChange,
  }));

  // phaseTransitions is already an append-only ordered log — use it directly
  const phaseTimeline = state.phaseTransitions;

  emit(taskId, "execution_summary", "[Orchestrator] Execution summary", {
    stepsUsed:                   state.step,
    stepsMax:                    state.maxSteps,
    readsUsed:                   state.filesRead.size,
    readsMax:                    state.profile.maxFileReads,
    writesUsed:                  state.filesWritten.size,
    writesMax:                   state.profile.maxFileWrites,
    commandsUsed:                state.commandsRun.length,
    commandsMax:                 state.profile.maxCommands,
    verificationsDone:           state.verificationsDone,
    trivialVerificationsBlocked: state.trivialVerificationsBlocked,
    finalPhase:                  state.phase,
    exitReason,
    phaseTimeline:               phaseTimeline.length > 0 ? phaseTimeline : null,
    gateTriggers:                gateEntries.length > 0 ? Object.fromEntries(gateEntries) : null,
    shellReadsBlocked:           state.shellReadsBlocked,
    // ── Runtime lifecycle / verification quality fields ────────────────────
    verificationQuality:         ledgerSummary.quality,
    proofStatement:              ledgerSummary.proofStatement,
    sideEffectsObserved:         sideEffectsObserved.length > 0 ? sideEffectsObserved : null,
    runtimeEvidence:             runtimeEvidence.length > 0 ? runtimeEvidence : null,
    runtimeSnapshots:            (state.runtimeSnapshots.before || state.runtimeSnapshots.after)
      ? {
          before: state.runtimeSnapshots.before
            ? { timestamp: state.runtimeSnapshots.before.timestamp, openPorts: state.runtimeSnapshots.before.openPorts }
            : null,
          after: state.runtimeSnapshots.after
            ? { timestamp: state.runtimeSnapshots.after.timestamp, openPorts: state.runtimeSnapshots.after.openPorts }
            : null,
        }
      : null,
    // ── Dependency analysis ────────────────────────────────────────────────
    dependencyAnalysis: {
      counts:                          state.dependencyAnalysis.counts,
      potentiallyIndependentActionIds: state.dependencyAnalysis.potentiallyIndependentActionIds,
      serialReason:                    state.dependencyAnalysis.serialReason,
      readBurstUsed:                   state.dependencyAnalysis.readBurstUsed,
      readBurstCount:                  state.dependencyAnalysis.readBurstCount,
    },
    // ── Operator steering evidence (task-9) ───────────────────────────────
    approvalGateDenied: state.approvalGates.find(g => g.status === "denied")?.id ?? null,
    appliedOverrideCount: state.appliedOverrides.length,
    selectivelyBlockedLanes: state.selectivelyBlockedLaneIds.size > 0 ? [...state.selectivelyBlockedLaneIds] : null,
  });
}

// ─── Main task runner ─────────────────────────────────────────────────────────

export async function runAgentTask(
  prompt: string,
  images: string[] = [],
  continuationChain?: ContinuationChain,
): Promise<AgentTask> {
  const taskMeta      = classifyTask(images);
  const visualIntent  = taskMeta.isVisual ? classifyVisualIntent(prompt) : "fix";
  const task     = createTask(prompt);
  const taskId   = task.id;

  if (continuationChain) {
    persistContinuationChain(taskId, continuationChain);
  }
  createTaskController(taskId);

  // Stamp imageCount and visualIntent immediately so the UI can show them
  if (taskMeta.isVisual) {
    setTaskMeta(taskId, { imageCount: taskMeta.imageCount, visualIntent });
  }

  broadcastTaskUpdate(task);

  (async () => {
    // Hoisted so the catch block can emit an execution summary on unexpected errors
    let _outerRunState: RunState | null = null;

    try {
      updateTaskStatus(taskId, "running");
      logger.info({ taskId, prompt: prompt.slice(0, 100) }, "Agent task started");

      // ── Workspace validation ──────────────────────────────────────────────
      const wsRoot = isWorkspaceSet() ? getWorkspaceRoot() : null;
      emit(taskId, "status", `Workspace: ${wsRoot ?? "not configured"}`);

      if (!wsRoot) {
        failTask(taskId, task, "Workspace not configured", {
          title: "Workspace root is not configured",
          detail: "Set a workspace directory in the UI before running tasks.",
          step: "workspace_validation",
          category: "workspace",
        });
        return;
      }

      // ── Task routing ─────────────────────────────────────────────────────
      // Conversational check runs FIRST so the route event is correct.
      // Short greetings / general-knowledge questions skip workspace scan + agent loop.
      if (!taskMeta.isVisual && isConversationalPrompt(prompt)) {
        // Emit the correct route event BEFORE entering the bypass path.
        emit(taskId, "route", "conversational: Direct response — no workspace access needed", {
          category:       "conversational",
          maxSteps:       2,
          maxFileReads:   0,
          maxFileWrites:  0,
          requiresVerify: false,
          planningPhase:  false,
        });
        logger.info({ taskId, prompt }, "[Orchestrator] Conversational prompt — direct response path");
        emit(taskId, "status", "Responding…");

        let model;
        try {
          model = getModelProvider(getSettings().activeProvider);
        } catch (err) {
          const isModelError = err instanceof ModelError;
          failTask(taskId, task, `Model error: ${isModelError ? err.message : String(err)}`, {
            title: isModelError ? err.message : "Failed to initialize AI model",
            detail: isModelError ? `Category: ${err.category}\nTechnical: ${err.technical}` : String(err),
            step: "model_initialization",
            category: "model",
          });
          return;
        }

        try {
          let reply = "";
          await model.chat(
            [
              { role: "system", content: "You are VenomGPT, a friendly AI coding assistant. Reply briefly and naturally." },
              { role: "user", content: prompt },
            ],
            { maxTokens: 200, taskHint: "conversational", taskId }
          ).then((r) => { reply = r.content; });

          emit(taskId, "thought", reply);
          const completion: TaskCompletion = {
            summary: reply, changed_files: [], commands_run: [], final_status: "complete", remaining: "",
          };
          emit(taskId, "done", reply, { changed_files: [], commands_run: [], final_status: "complete", remaining: "" });
          updateTaskStatus(taskId, "done", reply, completion);
          broadcastTaskUpdate(task);
        } catch (err) {
          const isModelError = err instanceof ModelError;
          failTask(taskId, task, `Model call failed: ${isModelError ? err.message : String(err)}`, {
            title: isModelError ? err.message : "AI model call failed",
            detail: isModelError ? `Category: ${err.category}\nTechnical: ${err.technical}` : String(err),
            step: "conversational_call",
            category: "model",
          });
        }
        return;
      }

      // ── Task routing (non-conversational) ────────────────────────────────
      // Classifies the task and selects an execution profile (step budget, file
      // caps, verification requirements, planning phase flag).
      const profile = routeTask(prompt, taskMeta.isVisual, taskMeta.isVisual ? visualIntent : undefined);
      emit(taskId, "route", `${profile.category}: ${profile.description}`, {
        category:       profile.category,
        maxSteps:       profile.maxSteps,
        maxFileReads:   profile.maxFileReads,
        maxFileWrites:  profile.maxFileWrites,
        requiresVerify: profile.requiresVerify,
        planningPhase:  profile.planningPhase,
      });
      logger.info(
        { taskId, category: profile.category, maxSteps: profile.maxSteps, maxFileReads: profile.maxFileReads },
        "[Orchestrator] Task routed"
      );

      // ── Project intelligence ──────────────────────────────────────────────
      // Build (or retrieve from cache) the project index and select files
      // likely relevant to this specific prompt. This replaces the raw
      // full-tree dump with a focused, metadata-enriched summary.
      //
      // Skip for: (a) "describe" visual intent — no file reading needed;
      //           (b) conversational profile — no codebase access at all.
      // Skipping saves ~1–2s of I/O and avoids injecting irrelevant file context.

      let workspaceSnapshot = "";
      let projectIntelligence = "";
      let projectIndex: ProjectIndex | null = null;   // kept for visual debug file selection

      const skipWorkspaceScan =
        (taskMeta.isVisual && visualIntent === "describe") ||
        profile.maxFileReads === 0;

      if (skipWorkspaceScan) {
        const skipReason = profile.maxFileReads === 0 ? "no-read profile" : "describe intent";
        emit(taskId, "status", `Skipping workspace scan (${skipReason})…`);
        logger.debug({ taskId, skipReason, visualIntent }, "[VenomGPT] Workspace scan skipped");
      } else {
        emit(taskId, "status", "Analysing workspace…");
        try {
          // Run raw tree scan and project indexing in parallel to cut latency
          const [entries, index] = await Promise.all([
            listDirectory(""),
            getProjectIndex(wsRoot),
          ]);
          workspaceSnapshot = formatDirectoryTree(entries);
          projectIndex = index;  // exposed for visual debug file selection below
          const relevantFiles = selectRelevantFiles(index, prompt, 20);
          projectIntelligence = buildProjectSummary(index, relevantFiles);

          emit(taskId, "status", `Workspace ready — ${index.totalFiles} files indexed`);
          logger.debug({ taskId, totalFiles: index.totalFiles, relevantFiles: relevantFiles.length }, "Project index ready");
        } catch (err) {
          workspaceSnapshot = "(could not read workspace)";
          projectIntelligence = "";
          logger.warn({ taskId, err }, "Could not build project index — continuing");
        }
      }

      // ── Model initialization ──────────────────────────────────────────────
      let model;
      try {
        model = getModelProvider(getSettings().activeProvider);
        logger.info({ taskId }, "Model provider acquired");
      } catch (err) {
        const isModelError = err instanceof ModelError;
        failTask(taskId, task, `Model configuration error: ${isModelError ? err.message : String(err)}`, {
          title: isModelError ? err.message : "Failed to initialize AI model",
          detail: isModelError
            ? `Category: ${err.category}\nTechnical: ${err.technical}\n\nTip: Ensure ZAI_API_KEY is set.`
            : String(err),
          step: "model_initialization",
          category: "model",
        });
        return;
      }

      // ── Multimodal intake (phase 1: visual analysis) ──────────────────────
      // If the task includes images, visual analysis MUST succeed before the
      // agent loop starts.  There is no silent text-only fallback for visual
      // tasks — if vision is unavailable the task is failed honestly so the
      // developer knows exactly what happened and can resubmit appropriately.
      //
      // Success  → rich visual context injected into the agent's prompt.
      // Failure  → task fails with a clear, specific explanation.  Period.
      let visualContext = "";

      if (taskMeta.isVisual) {
        emit(taskId, "status", `Visual task — ${taskMeta.imageCount} image${taskMeta.imageCount > 1 ? "s" : ""} attached`);
        logger.info({ taskId, imageCount: taskMeta.imageCount, visualIntent }, "[VenomGPT] Visual task detected");

        // ── Provider-level vision check ───────────────────────────────────
        // Some providers (Replit OpenAI integration) have no vision model at
        // all.  Fail immediately rather than dropping into a text-only loop.
        if (!model.isVisionCapable()) {
          setTaskMeta(taskId, { visionStatus: "unavailable" });
          logger.warn({ taskId }, "[VenomGPT] Visual task blocked — provider has no vision capability");
          failTask(taskId, task, "Screenshot analysis requires a vision-capable AI provider", {
            title: "Vision not available on current provider",
            detail:
              `This task includes ${taskMeta.imageCount} screenshot${taskMeta.imageCount > 1 ? "s" : ""} ` +
              `but the current AI provider does not support vision models.\n\n` +
              `To analyse screenshots, set ZAI_API_KEY to use Z.AI (glm-4.6v / glm-4.6v-flash).\n\n` +
              `If you need text-based code assistance without the screenshots, resubmit the task without attaching images.`,
            step: "visual_analysis",
            category: "model",
          });
          return;
        }

        // ── Vision model call ─────────────────────────────────────────────
        try {
          visualContext = await analyzeVisualContext(model, images, prompt, taskId, visualIntent);
          setTaskMeta(taskId, { visionStatus: "success" });
          emit(taskId, "status", `Visual analysis complete [${visualIntent}] — proceeding…`);
        } catch (err) {
          const isModelError = err instanceof ModelError;
          const category = isModelError ? err.category : "unknown";
          const shortReason = isModelError ? err.message : String(err);

          // All vision failures → fail the task honestly.
          // No category is "safe" to silently degrade into a text-only loop;
          // entitlement/rate-limit errors are as blocking as auth errors for a
          // visual task — the screenshot simply cannot be analysed.
          setTaskMeta(taskId, { visionStatus: "degraded" });
          logger.warn(
            { taskId, category, reason: shortReason },
            "[VenomGPT] Visual analysis failed — failing task honestly"
          );
          failTask(taskId, task, "Screenshot analysis could not be completed", {
            title: "Vision model unavailable — screenshot task cannot proceed",
            detail:
              `This task includes ${taskMeta.imageCount} screenshot${taskMeta.imageCount > 1 ? "s" : ""} ` +
              `but the vision model failed (${category}: ${shortReason}).\n\n` +
              `Screenshot analysis was not performed. The task has been stopped to avoid producing ` +
              `a misleading text-only response that ignores the visual content you provided.\n\n` +
              `To resolve:\n` +
              `• Ensure your Z.AI account has the vision model package enabled\n` +
              `• Or resubmit the task without images and describe the visual issue in text`,
            step: "visual_analysis",
            category: "model",
          });
          return;
        }
      }

      // ── Build initial prompt ──────────────────────────────────────────────
      const userPromptParts = [
        `Workspace: ${wsRoot}`,
      ];
      if (projectIntelligence) {
        userPromptParts.push(`Project intelligence:\n${projectIntelligence}`);
      }
      if (workspaceSnapshot) {
        userPromptParts.push(`File structure:\n${workspaceSnapshot}`);
      }

      // ── Visual context + intent-appropriate protocol ──────────────────────
      // Injected only when visual analysis succeeded.
      // Each of the 5 intents gets a purpose-built protocol that matches what
      // the user actually wants done — from a direct answer to a full CSS fix.
      if (visualContext) {
        userPromptParts.push(
          `VISUAL ANALYSIS — ${taskMeta.imageCount} screenshot${taskMeta.imageCount > 1 ? "s" : ""} analysed (${visualIntent} intent):\n\n` +
          visualContext
        );

        switch (visualIntent) {

          case "describe": {
            // ── Describe protocol: vision → respond directly → done ──────────
            // Fastest possible path. No file reads, no file writes, no commands.
            // The agent emits exactly one action: done.
            userPromptParts.push(
              `VISUAL DESCRIBE PROTOCOL:

The visual analysis above contains everything needed to answer the user's question.

STEP 1 — RESPOND: Use the done action immediately. Put your direct answer in the summary field.
  • Answer the user's specific question based on the visual analysis.
  • Quote visible error messages or text verbatim.
  • If something cannot be determined from the screenshot, say so.
  • Be concise and direct.

Do NOT write files. Do NOT read files. Do NOT run commands. Respond with done immediately.`
            );
            logger.debug({ taskId, visualIntent }, "[VenomGPT] Using describe protocol (direct answer)");
            break;
          }

          case "report": {
            // ── Report protocol: vision → write file → verify → done ─────────
            // No CSS investigation. Write findings directly from visual analysis.
            userPromptParts.push(
              `VISUAL REPORT PROTOCOL:

Your task is to write a file containing a grounded description of what was observed in the screenshot(s).

STEP 1 — WRITE: Create the target file immediately. You do NOT need to read any existing files first.
  • Use only the OBSERVED section of the visual analysis as primary evidence.
  • Clearly label LIKELY INFERENCE items as inferences.
  • Do NOT include claims from CANNOT CONFIRM unless explicitly noting the uncertainty.
  • Do NOT invent system-internal failures, API errors, or root causes not visible in the screenshot.

STEP 2 — VERIFY: Read the file back once to confirm the content was written correctly.

STEP 3 — DONE: Report what was written with final_status "complete".

Do NOT read existing code files. Do NOT run build commands. Go directly to write_file.`
            );
            logger.debug({ taskId, visualIntent }, "[VenomGPT] Using report protocol (direct write)");
            break;
          }

          case "fix": {
            // ── Fix protocol (Phase 07A): vision → bridge → inspect ≤2 files → edit ─
            // Key discipline: NO planning step (wasted model call), hard read cap,
            // explicit anti-report instruction, numbered bridge with read authorization.
            let bridgeSection = "";
            let bridgeTermCount = 0;
            if (projectIndex) {
              const { strong, weak } = classifyVisualTerms(visualContext);
              bridgeTermCount = strong.length + weak.length;
              bridgeSection = "\n\n" + buildVisualCodeBridge(projectIndex, prompt, visualContext, 4, 2);
              emit(taskId, "status",
                `Visual targeting: ${strong.length} component name${strong.length !== 1 ? "s" : ""} (${strong.slice(0, 3).join(", ") || "none"}) + ${weak.length} layout terms → ${Math.min(4, projectIndex.files.length)} candidates ranked`
              );
              logger.debug(
                { taskId, strongTerms: strong.length, weakTerms: weak.length, bridgeSection: bridgeSection.slice(0, 300) },
                "[VenomGPT][Phase07A] Visual-code bridge built for fix intent"
              );
            }
            userPromptParts.push(
              `VISUAL FIX PROTOCOL:${bridgeSection}

THIS IS A CODE FIX TASK — NOT A REPORT OR ANALYSIS TASK.
Do NOT write a general analysis. Do NOT describe what you see. Fix the specific defect.

HARD CONSTRAINT: READ AT MOST 2 FILES total. The VISUAL-CODE BRIDGE above tells you which ones.

STEP 1 — INSPECT (#1 file only):
  Open the #1 ranked file from the bridge. Find the CSS rule or component property causing the visible defect.
  Defect-to-property lookup:
  • Clipping / overflow → overflow: hidden, max-height, height on ancestors
  • Spacing wrong → padding, margin, gap on container or children
  • Misaligned → flex/grid: justify-content, align-items, flex-wrap on parent
  • Sizing wrong → width, height, flex-basis, min-/max- constraints
  • Text truncation → text-overflow, white-space, overflow, max-width on text element
  • Not visible → display: none, visibility: hidden, opacity: 0, z-index
  → If you find the responsible rule: go directly to STEP 2.
  → If not found: read the #2 file ONLY. Then go to STEP 2 regardless.

STEP 2 — EDIT: Write the corrected file immediately. Do not read more files before editing.
  If uncertain which exact value to use, apply the most reasonable fix based on the visual defect.

STEP 3 — DONE: State exactly: DEFECT SEEN → FILE CHANGED → RULE CHANGED → EXPECTED RESULT.
  Do not add a preamble. Do not re-describe the screenshot. Just the fix summary.`
            );
            logger.debug({ taskId, visualIntent, bridgeTermCount }, "[VenomGPT] Using fix protocol (Phase 07A: inspect≤2, no planning step)");
            break;
          }

          case "improve": {
            // ── Improve protocol (Phase 07A): bridge → inspect ≤2 files → implement ─
            let bridgeSection = "";
            if (projectIndex) {
              const { strong, weak } = classifyVisualTerms(visualContext);
              bridgeSection = "\n\n" + buildVisualCodeBridge(projectIndex, prompt, visualContext, 4, 2);
              emit(taskId, "status",
                `Visual targeting: ${strong.length} component name${strong.length !== 1 ? "s" : ""} (${strong.slice(0, 3).join(", ") || "none"}) + ${weak.length} layout terms → candidates ranked`
              );
              logger.debug(
                { taskId, strongTerms: strong.length, weakTerms: weak.length },
                "[VenomGPT][Phase07A] Visual-code bridge built for improve intent"
              );
            }
            userPromptParts.push(
              `VISUAL IMPROVE PROTOCOL:${bridgeSection}

The visual analysis above lists specific improvement opportunities. This is an implementation task, not a report.

HARD CONSTRAINT: READ AT MOST 2 FILES. Use the VISUAL-CODE BRIDGE above to choose which.

STEP 1 — INSPECT (#1 file, then #2 if needed):
  Read only the files that own the components the analysis flagged. Find the current implementation.

STEP 2 — IMPLEMENT: Apply each improvement that has a clear visual basis.
  • Tailwind utilities → spacing, color, typography changes
  • Component structure → hierarchy, density, layout changes
  • CSS variables → system-wide token changes
  Do not refactor unrelated code. Do not write a report.

STEP 3 — DONE: VISUAL FINDING → CODE CHANGE → EXPECTED RESULT for each change made.
  Be direct. No preamble.`
            );
            logger.debug({ taskId, visualIntent }, "[VenomGPT] Using improve protocol (Phase 07A: inspect≤2, direct action)");
            break;
          }

          case "analyze": {
            // ── Analyze protocol (Phase 07A): vision → direct assessment → done ──
            // Default is done with inline summary. Only write a file if user
            // explicitly requested a written report. Do NOT default to file output.
            let bridgeSection = "";
            if (projectIndex) {
              const { strong, weak } = classifyVisualTerms(visualContext);
              bridgeSection = "\n\n" + buildVisualCodeBridge(projectIndex, prompt, visualContext, 4, 1);
              if (strong.length > 0 || weak.length > 0) {
                emit(taskId, "status",
                  `Visual targeting: ${strong.length} component${strong.length !== 1 ? "s" : ""} identified — code bridge available for verification`
                );
              }
              logger.debug(
                { taskId, strongTerms: strong.length, weakTerms: weak.length },
                "[VenomGPT][Phase07A] Visual-code bridge built for analyze intent"
              );
            }
            userPromptParts.push(
              `VISUAL ANALYZE PROTOCOL:${bridgeSection}

The visual analysis above contains a structured assessment of the screenshot(s).

DEFAULT RESPONSE: Use the done action with your assessment in the summary field.
  Do NOT write a file unless the user explicitly asked to "write a report", "save an analysis", or "create a document".

Deliver the assessment directly:
  • What is working well in the screenshot.
  • What specific defects or issues were identified.
  • What is inferred vs confirmed from visual evidence alone.
  • The single highest-priority action to take next.

OPTIONAL (only if a specific named component was flagged AND inspecting its code would materially
improve the assessment accuracy): Read at most 1 file from the VISUAL-CODE BRIDGE above.
Do not read files speculatively. Do not read files to "understand the codebase".`
            );
            logger.debug({ taskId, visualIntent }, "[VenomGPT] Using analyze protocol (Phase 07A: direct done, no default report)");
            break;
          }
        }
      }

      userPromptParts.push(`Task: ${prompt}`);

      const messages: Message[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPromptParts.join("\n\n") },
      ];

      // ── Planning phase (code_edit tasks only) ────────────────────────────
      // Before the main loop, ask the model for a structured JSON plan.
      // This makes the agent's intentions explicit and gives it a clear roadmap.
      // Failure is always silent — the loop continues without a plan.
      let capturedPlan: Awaited<ReturnType<typeof runPlanningPhase>> = null;
      if (profile.planningPhase) {
        emit(taskId, "status", "Planning…");
        // Build a compact planner context from the full user context
        const plannerContext = [
          projectIntelligence ? `Project intelligence:\n${projectIntelligence}` : "",
          workspaceSnapshot   ? `File structure:\n${workspaceSnapshot}` : "",
          `Task: ${prompt}`,
        ].filter(Boolean).join("\n\n");

        const plan = await runPlanningPhase(model, plannerContext, "agentic", taskId);
        capturedPlan = plan;
        if (plan) {
          const planText = formatPlanForContext(plan);
          emit(taskId, "plan", planText, {
            goal:            plan.goal,
            approach:        plan.approach,
            filesToRead:     plan.filesToRead,
            expectedChanges: plan.expectedChanges,
            verification:    plan.verification,
          });
          // Persist plan artifact to <workspace>/.plan/ — fire-and-forget, never blocks the loop.
          savePlanArtifact({
            agentTaskId:  taskId,
            boardTaskId:  getBoardTaskId(taskId),
            plan: {
              goal:            plan.goal,
              approach:        plan.approach,
              filesToRead:     plan.filesToRead,
              expectedChanges: plan.expectedChanges,
              verification:    plan.verification,
            },
          }).catch(() => {});
          logger.info(
            { taskId, goal: plan.goal, filesToRead: plan.filesToRead, expectedChanges: plan.expectedChanges },
            "[Orchestrator] Planning phase complete"
          );
          // Inject the plan into the agent context as a pre-loop assistant turn
          messages.push({ role: "user",      content: `[ORCHESTRATOR] Here is the execution plan produced before the loop:\n\n${planText}` });
          messages.push({ role: "assistant", content: `{"action":"think","thought":"[PLANNING] I have reviewed the execution plan. Goal: ${plan.goal}. I will read ${plan.filesToRead.join(", ") || "the relevant files"}, make the expected changes, and verify with: ${plan.verification}."}` });
        } else {
          emit(taskId, "status", "Planning phase skipped (no structured plan returned).");
          logger.debug({ taskId }, "[Orchestrator] Planning phase produced no plan — continuing without one");
        }
      }

      // ── Continuation chain context injection ─────────────────────────────
      // When this task is a resume-from-checkpoint continuation, inject structured
      // context into the agent messages so the model knows:
      //   (a) which files were already written in the prior run (do NOT re-write)
      //   (b) which steps still need to be done (the remaining work)
      //   (c) which steps failed and why (fix if possible, or skip if irrelevant)
      // This is the primary mechanism for preventing re-execution of already-completed
      // steps — the model is explicitly instructed to skip them.
      if (continuationChain) {
        const { completedSteps, remainingSteps, failedSteps } = continuationChain.whatRemainedAtResume;

        const skipBlock: string[] = [
          `[CONTINUATION CONTEXT] This task is a structured resume (ancestry depth ${continuationChain.ancestryDepth}) ` +
          `from task ${continuationChain.parentTaskId}, grounded on checkpoint ${continuationChain.originCheckpointId}.`,
          "",
          "CRITICAL INSTRUCTIONS:",
          "- Do NOT re-write files that were already written in the prior run (listed below as COMPLETED).",
          "- Focus ONLY on the REMAINING steps listed below.",
          "- If a step is listed as FAILED, decide whether to re-attempt or skip based on task context.",
          "",
        ];

        if (completedSteps.length > 0) {
          skipBlock.push("ALREADY COMPLETED in prior run — DO NOT re-do these:");
          for (const s of completedSteps) skipBlock.push(`  ✓ ${s.label}`);
          skipBlock.push("");
        }

        if (remainingSteps.length > 0) {
          skipBlock.push("STILL NEEDS TO BE DONE — focus your work here:");
          for (const s of remainingSteps) skipBlock.push(`  ○ ${s.label}${s.reason ? ` (reason: ${s.reason})` : ""}`);
          skipBlock.push("");
        }

        if (failedSteps.length > 0) {
          skipBlock.push("FAILED in prior run — attempt or skip as appropriate:");
          for (const s of failedSteps) skipBlock.push(`  ✗ ${s.label}${s.reason ? ` — ${s.reason}` : ""}`);
          skipBlock.push("");
        }

        messages.push({ role: "user", content: skipBlock.join("\n") });
        messages.push({
          role: "assistant",
          content: `{"action":"think","thought":"[CONTINUATION] I am resuming from a prior run. ` +
            `${completedSteps.length} step(s) are already done and I must not re-write them. ` +
            `I will focus on the ${remainingSteps.length} remaining step(s) and handle ${failedSteps.length} failed step(s) as appropriate."}`,
        });

        logger.info(
          {
            taskId,
            parentTaskId: continuationChain.parentTaskId,
            completedSteps: completedSteps.length,
            remainingSteps: remainingSteps.length,
            failedSteps: failedSteps.length,
          },
          "[ContinuationChain] Injected step-skip enforcement context into agent messages"
        );
      }

      // ── Emit planning-phase scheduling truth ──────────────────────────────
      // Summarise the expected dependency shape for this execution profile so
      // operators can see what category of run this is before the loop begins.
      emit(taskId, "scheduling_truth", buildPlanningPhaseTruth(profile.category), {
        phase:         "planning",
        category:      profile.category,
        dispatchMode:  "serial_fallback",   // pre-dispatch; actual mode determined after burst
        laneCount:     0,
      });

      // ── Run state ─────────────────────────────────────────────────────────
      // Structured execution state. Replaces scattered local variables and
      // provides the action router with the information it needs to gate actions.
      const runState: RunState = createRunState(profile, getSettings().maxSteps);
      // Inject the plan from the planning phase so gate checks can reference it
      if (capturedPlan !== null) {
        runState.plan = capturedPlan;
      }
      // Inject the continuation chain when this is a resume-from-checkpoint run.
      // The chain carries parent lineage, what-remains, and ancestry depth.
      if (continuationChain) {
        runState.continuationChain = continuationChain;
        emit(taskId, "status",
          `Continuation run — resuming from task ${continuationChain.parentTaskId} ` +
          `(${continuationChain.whatRemainedAtResume.remainingSteps.length} step(s) remaining, ` +
          `ancestry depth ${continuationChain.ancestryDepth})`
        );
        logger.info(
          {
            taskId,
            parentTaskId: continuationChain.parentTaskId,
            originCheckpointId: continuationChain.originCheckpointId,
            ancestryDepth: continuationChain.ancestryDepth,
          },
          "[ContinuationChain] Run initiated as structured continuation"
        );
      }
      // Expose to outer catch block for unexpected-error summary emission
      _outerRunState = runState;

      // ── P4: Task-start runtime snapshot ──────────────────────────────────
      // Capture enhanced snapshot (ports + env meta) at task start.
      // Awaited with a hard outer timeout (PROBE_PORTS × PROBE_TIMEOUT_MS ≈ 5 s)
      // so we don't fire-and-forget: the snapshot must be stored on runState
      // before any task step executes, ensuring it is always available in
      // evidenceAssembler (and therefore in persisted TaskEvidence) regardless
      // of how fast the task completes. Failures are non-fatal — runState field
      // stays undefined and evidence degrades honestly.
      const TASK_START_SNAPSHOT_TIMEOUT_MS = 5_000;
      // Timeout guard: if the timeout wins the race, the outstanding probe promise
      // may still resolve afterward. We use a settled flag to prevent it from
      // assigning a late value that would not represent "task start" state.
      let taskStartSnapshotSettled = false;
      await Promise.race([
        captureEnhancedSnapshot().then(snap => {
          if (!taskStartSnapshotSettled) {
            taskStartSnapshotSettled = true;
            runState.taskStartRuntimeSnapshot = snap;
            logger.debug(
              { taskId, openPorts: snap.openPorts, nodeVersion: snap.envMeta?.nodeVersion },
              "[RuntimeLifecycle] Task-start runtime snapshot captured"
            );
          } else {
            // Late resolve after timeout — discard to preserve snapshot integrity
            logger.debug({ taskId }, "[RuntimeLifecycle] Task-start snapshot resolved after timeout — discarded to preserve integrity");
          }
        }),
        new Promise<void>(resolve => setTimeout(() => {
          taskStartSnapshotSettled = true;
          resolve();
        }, TASK_START_SNAPSHOT_TIMEOUT_MS)),
      ]).catch(err => {
        taskStartSnapshotSettled = true;
        logger.debug({ taskId, err }, "[RuntimeLifecycle] Task-start snapshot capture failed — continuing without it");
      });

      const MAX_REPAIR_ATTEMPTS = 3;

      // RepairCycleState — state machine for the orchestrator's repair loop.
      // Transitions are driven by ledger quality observations (post-action state),
      // not by raw command success/failure booleans or model narration.
      enum RepairCycleState {
        Idle               = "idle",
        VerificationFailed = "verification_failed",
        RepairInProgress   = "repair_in_progress",
        ReverifyPending    = "reverify_pending",
        Passed             = "passed",
        Failed             = "failed",
        Partial            = "partial",
        Inconclusive       = "inconclusive",
      }
      let repairCycleState: RepairCycleState = RepairCycleState.Idle;
      // State-machine-owned repair attempt counter. Advanced on each VerificationFailed
      // or RepairInProgress transition. When it reaches MAX_REPAIR_ATTEMPTS the loop
      // forces partial completion via the state machine, not consecutiveFailures.
      let repairAttempts = 0;

      // Resolves and stamps repairCycleOutcome. Called at every exit path.
      // Idempotent — no-op if already stamped.
      const finalizeRepairCycle = (): void => {
        if (runState.repairCycleOutcome !== undefined) return; // already stamped
        const ledgerQuality = runState.verificationLedger.getQuality();
        if (
          repairCycleState === RepairCycleState.VerificationFailed ||
          repairCycleState === RepairCycleState.RepairInProgress
        ) {
          repairCycleState = RepairCycleState.Failed;
          logger.warn(
            { taskId, repairCycleState: "failed", consecutiveFailures: runState.consecutiveFailures },
            "[RepairCycle] State → failed (loop exited without recovery)",
          );
        } else if (repairCycleState === RepairCycleState.ReverifyPending && ledgerQuality === "none") {
          repairCycleState = RepairCycleState.Inconclusive;
        }
        runState.repairCycleOutcome = repairCycleState as string;
      };

      let lastSummary = "Agent reached maximum steps without completing the task.";
      let completion: TaskCompletion | undefined;
      /** True once the checkpoint event has been emitted — prevents double-emission. */
      let checkpointEmitted = false;
      /** True once the execution summary has been emitted — prevents double-emission. */
      let summaryEmitted = false;
      /** Step-budget nudge sentinels — each threshold fires at most once. */
      let nudge70Sent = false;
      let nudge90Sent = false;

      // ── Semi-parallel read burst (pre-loop) ───────────────────────────────
      // Dispatch all planning-phase filesToRead concurrently via Promise.all
      // before the main agent loop, so the agent's first meaningful pass over
      // those files costs no wall-clock reads.  Eligibility guard:
      //   (a) planning phase was run and produced a plan with filesToRead or expectedChanges
      //   (b) no files have been read yet (burst is a pre-loop one-shot)
      //
      // Extended burst (task-16): After collecting filesToRead, supplement the
      // list with paths from expectedChanges that appear to be EXISTING files
      // (heuristic: no "/new-" prefix and has a file extension).  Deduplicate
      // against filesToRead.  The combined list is still capped at maxFileReads.
      if (
        profile.planningPhase &&
        capturedPlan !== null &&
        runState.filesRead.size === 0
      ) {
        // Build extended burst list: filesToRead first, then eligible expectedChanges
        const burstPaths: string[] = [...capturedPlan.filesToRead];
        const burstSources: Map<string, "filesToRead" | "expectedChanges"> = new Map(
          capturedPlan.filesToRead.map(p => [p, "filesToRead"] as [string, "filesToRead"])
        );
        const primarySet = new Set(capturedPlan.filesToRead);

        for (const ec of capturedPlan.expectedChanges) {
          if (primarySet.has(ec)) continue;  // already included
          if (!/\.[a-zA-Z0-9]+$/.test(ec)) continue; // skip paths without extension
          // Only burst-read files that actually exist on disk.
          // expectedChanges often lists brand-new files that will be created by the
          // agent — reading those would produce ENOENT noise.  Checking existence
          // here eliminates that class of spurious read failures entirely.
          const fileExistsOnDisk = wsRoot ? existsSync(join(wsRoot, ec)) : false;
          if (fileExistsOnDisk) {
            burstPaths.push(ec);
            burstSources.set(ec, "expectedChanges");
          }
        }

        if (burstPaths.length === 0) {
          emit(taskId, "status", "Read burst: no eligible files — skipping.");
        } else {
          const ecCount = burstPaths.length - capturedPlan.filesToRead.length;
          const sourceLabel = ecCount > 0
            ? `${capturedPlan.filesToRead.length} from filesToRead + ${ecCount} from expectedChanges`
            : `${capturedPlan.filesToRead.length} from filesToRead`;
          emit(taskId, "status", `Read burst: loading ${burstPaths.length} file(s) concurrently (${sourceLabel})…`);
        }

        const burstResults = burstPaths.length > 0 ? await readBurst(
          burstPaths,
          profile.maxFileReads ?? burstPaths.length,
          taskId,
        ) : [];
        // Mark files read in runState so the agent loop doesn't re-read redundantly
        // AND emit file_read transcript events + stamp dependency class for each burst read
        let burstIdCounter = 0;
        for (const r of burstResults) {
          if (r.error === null) {
            runState.filesRead.add(r.path);
            // Emit transcript event so the console shows burst reads just like loop reads
            emit(taskId, "file_read", `[burst] Reading: ${r.path}`, { path: r.path, burst: true });
            // Stamp as potentially_independent — burst reads are by definition first-access
            // concurrent reads with no shared mutable state dependency
            const burstActionId = `burst_read_${burstIdCounter++}`;
            recordDependencyClass(runState.dependencyAnalysis, "potentially_independent", burstActionId);
          } else {
            // Classify the failure: ENOENT means the file doesn't exist yet (a new
            // file that passed the existsSync check race or wasn't filtered) vs a
            // genuine I/O error.  Emit with matching severity so the console can
            // style them appropriately.
            const isNotFound = r.error.includes("ENOENT") || r.error.includes("no such file");
            if (isNotFound) {
              emit(taskId, "status", `[burst] New file (will be created): ${r.path}`, { eventClass: "expected_condition" });
            } else {
              emit(taskId, "status", `[burst] Read error: ${r.path} — ${r.error}`, { eventClass: "warning" });
            }
          }
        }
        // Record burst usage in dependency analysis
        const burstSucceeded = burstResults.filter(r => r.error === null).length;
        if (burstResults.length > 0) {
          runState.dependencyAnalysis.readBurstUsed  = true;
          runState.dependencyAnalysis.readBurstCount = burstSucceeded;
          // Update serialReason to note the burst
          runState.dependencyAnalysis.serialReason =
            `${burstSucceeded} file(s) read concurrently in a pre-loop burst (Promise.all); ` +
            `all subsequent steps ran serially: the agent executor is single-threaded.`;
        }
        if (burstResults.length > 0) {
          const ecBurst = burstPaths.length - capturedPlan.filesToRead.length;
          const sourceSuffix = ecBurst > 0
            ? ` (${capturedPlan.filesToRead.length} filesToRead + ${ecBurst} expectedChanges)`
            : "";
          emit(taskId, "status", `Read burst complete: ${burstSucceeded}/${burstPaths.length} files loaded${sourceSuffix}.`);
        }
        // Inject burst content into message context so the agent has the files
        const burstContextParts: string[] = [];
        for (const r of burstResults) {
          if (r.error === null && r.content !== null) {
            const MAX_CHARS = 12_000;
            const preview = r.content.length > MAX_CHARS
              ? r.content.slice(0, MAX_CHARS) + `\n...[truncated — file is ${r.content.length} chars total]`
              : r.content;
            const src = burstSources.get(r.path) ?? "filesToRead";
            burstContextParts.push(`### ${r.path} [source: ${src}]\n\`\`\`\n${preview}\n\`\`\``);
          } else if (r.error !== null) {
            burstContextParts.push(`### ${r.path}\n[Read failed: ${r.error}]`);
          }
        }
        if (burstContextParts.length > 0) {
          messages.push({
            role: "user",
            content: `[ORCHESTRATOR] Pre-loop read burst results (${burstSucceeded} files loaded concurrently):\n\n${burstContextParts.join("\n\n")}`,
          });
          messages.push({
            role: "assistant",
            content: `{"action":"think","thought":"[PLANNING] The pre-loop read burst has loaded ${burstSucceeded} file(s). I have their contents above and will proceed with editing."}`,
          });
        }
      }

      // ── Parallel dispatch (pre-loop) ──────────────────────────────────────
      // After the read burst, detect any remaining plan steps that are eligible
      // for the parallel lane (potentially_independent, no side-effects).
      // Dispatch them concurrently under a hard lane budget before the serial
      // while-loop begins for remaining steps.
      //
      // Eligibility: only read_file steps for files NOT yet read by the burst.
      // Side-effecting actions (WRITE_FILE, EXEC_COMMAND) are never admitted.
      // The dispatcher result gates the while-loop:
      //   - mergeIsSafe=true  → merge lane content into context, continue loop.
      //   - mergeIsSafe=false → invoke partial/intervention behavior per severity.
      //
      // Register run state BEFORE dispatch so pause/resume/proceed endpoints
      // can mutate it during pre-loop dispatch and any blocked spin-wait.
      // Both registrations are required:
      //   - registerActiveRunState: enables pause/resume/proceed-as-partial via HTTP endpoint
      //   - setLiveRunState: enables live-phase snapshot telemetry via WS
      registerActiveRunState(taskId, runState);
      setLiveRunState(taskId, runState);

      let _parallelDispatchResult: DispatchResult | null = null;
      if (
        profile.planningPhase &&
        capturedPlan !== null &&
        capturedPlan.filesToRead.length > 0
      ) {
        // Build a cohort of files that were NOT already read by the burst
        const burstReadFiles = runState.filesRead;
        const remainingFiles = capturedPlan.filesToRead.filter(p => !burstReadFiles.has(p));

        if (remainingFiles.length > 1) {
          // Only dispatch if ≥2 files remain (1 file is just as fast serially)
          emit(taskId, "status",
            `Parallel dispatch: ${remainingFiles.length} eligible file(s) not yet loaded — dispatching concurrently…`
          );
          // Build DispatchableStep descriptors.
          // Classify each prospective read_file against the SAME pre-dispatch RunState
          // snapshot — do NOT advance filesRead during classification. All remainingFiles
          // are first-access reads from the plan (that is how they passed the burst filter),
          // so each should independently get potentially_independent from the classifier when
          // the run state is clean (no failures, no unverified writes). The eligibility gate
          // inside parallelDispatcher will handle any duplicates at dispatch time.
          const dispatchSteps: import("./orchestrator/parallelDispatcher.js").DispatchableStep[] = [];
          for (let fIdx = 0; fIdx < remainingFiles.length; fIdx++) {
            const filePath = remainingFiles[fIdx]!;
            // Use real classifier output against the pre-dispatch snapshot (not a mutated copy)
            const depClass = classifyStepDependency(runState, { path: filePath }, "read_file");
            dispatchSteps.push({
              stepId:              `plan_read_${fIdx}`,
              filePath,
              dependencyClass:     depClass,        // real classifier output — not hardcoded
              sideEffectClass:     "read_only",     // read_file is always read-only
              isVerificationGated: depClass === "verification_gated",
              isRepairDriven:      depClass === "repair_driven",
              dependentStepIds:    [],              // plan reads have no intra-cohort dependencies
            });
          }

          // Count admitted steps (those that will pass the gate) before dispatch
          // for truthful pre-dispatch telemetry — not just remainingFiles.length
          const admittedCount = dispatchSteps.filter(
            s => s.dependencyClass === "potentially_independent" && !s.isVerificationGated && !s.isRepairDriven
          ).length;

          // Emit pre-dispatch scheduling_truth (intent) with accurate admitted count
          emit(taskId, "scheduling_truth", `[Parallel dispatch intent] ${admittedCount}/${remainingFiles.length} steps admitted to parallel lane`, {
            phase:         "dispatch_start",
            dispatchMode:  "parallel",
            laneCount:     Math.min(admittedCount, 3),
            admittedCount,
            totalCohort:   remainingFiles.length,
            steps:         remainingFiles,
          });

          const dispatchResult = await parallelDispatcher(
            dispatchSteps,
            taskId,
            runState,
            3,  // max 3 concurrent lanes
            () => isTaskCancelled(taskId),
            () => runState.paused === true,
          );
          _parallelDispatchResult = dispatchResult;

          // Derive per-lane verification outcomes from real ledger VERIFY_RESULT
          // entries recorded during lane execution (e.g. verification commands
          // the agent ran within that lane). If no verification ran, outcome is
          // "deferred" — we do not synthesize entries from dispatch success/failure.
          for (const lane of dispatchResult.laneResults) {
            const outcome = deriveVerificationOutcome(taskId, lane.laneId);
            lane.verificationOutcome = outcome;
            dispatchResult.laneVerificationOutcomes.set(lane.laneId, outcome);
          }

          // Build a unified per-step dispatch report that includes both lane results and
          // serialized (ineligible) steps in a single coherent structure for telemetry.
          const serializedMap = new Map(dispatchResult.serializedSteps.map(s => [s.stepId, s.reason]));
          const unifiedStepReport = dispatchSteps.map((s, _idx) => {
            const laneResult = dispatchResult.laneResults.find(r => r.stepId === s.stepId);
            const serReason  = serializedMap.get(s.stepId);
            if (laneResult) {
              return {
                stepId:               s.stepId,
                filePath:             s.filePath,
                dispatchMode:         "parallel" as const,
                laneId:               laneResult.laneId,
                status:               laneResult.status,
                durationMs:           laneResult.durationMs,
                error:                laneResult.error,
                dependencyClass:      s.dependencyClass,
                // verificationOutcome derived from real VERIFY_RESULT records (not raw status)
                verificationOutcome:  laneResult.verificationOutcome ?? "deferred",
              };
            }
            return {
              stepId:               s.stepId,
              filePath:             s.filePath,
              dispatchMode:         "serialized" as const,
              laneId:               null,
              status:               "serialized" as const,
              durationMs:           null,
              error:                null,
              dependencyClass:      s.dependencyClass,
              serializationReason:  serReason ?? "unknown",
              verificationOutcome:  null,
            };
          });

          // Emit parallel_join with per-lane verification outcomes and unified step report.
          const laneVerificationOutcomesObj = Object.fromEntries(
            [...dispatchResult.laneVerificationOutcomes.entries()].map(([k, v]) => [k, v])
          );
          emit(taskId, "parallel_join", `[Parallel dispatch join] ${dispatchResult.joinStatus}`, {
            dispatchMode:             dispatchResult.dispatchMode,
            laneCount:                dispatchResult.laneCount,
            joinStatus:               dispatchResult.joinStatus,
            mergeIsSafe:              dispatchResult.mergeIsSafe,
            laneVerificationOutcomes: laneVerificationOutcomesObj,
            unifiedStepReport,
          });

          // Accumulate per-lane summaries into RunState immediately after each dispatch
          // wave so they survive event-cap pruning before evidence assembly.
          for (const entry of unifiedStepReport) {
            if (entry.dispatchMode !== "parallel" || !entry.laneId) continue;
            const stepCountForLane = unifiedStepReport.filter(e => e.laneId === entry.laneId && e.dispatchMode === "parallel").length;
            runState.parallelLaneSummaries.push({
              laneId:              entry.laneId,
              stepId:              entry.stepId,
              filePath:            entry.filePath,
              status:              entry.status,
              durationMs:          entry.durationMs ?? null,
              error:               (entry as { error?: string | null }).error ?? null,
              verificationOutcome: entry.verificationOutcome ?? null,
              dependencyClass:     entry.dependencyClass ?? null,
              stepCount:           stepCountForLane,
            });
          }

          // Emit post-dispatch scheduling_truth (result) with unified per-step structure
          emit(taskId, "scheduling_truth", `[Parallel dispatch result] ${dispatchResult.joinStatus}`, {
            phase:            "dispatch_done",
            dispatchMode:     dispatchResult.dispatchMode,
            laneCount:        dispatchResult.laneCount,
            joinStatus:       dispatchResult.joinStatus,
            mergeIsSafe:      dispatchResult.mergeIsSafe,
            unifiedStepReport,
          });

          // ── Merge safe-lane results ──────────────────────────────────────────
          // We always merge partial successes, then handle failed/cancelled lanes
          // by degrading to serial (or triggering intervention for critical errors).
          const successfulLanes = dispatchResult.laneResults.filter(r => r.status === "success");
          const failedLanes     = dispatchResult.laneResults.filter(r => r.status !== "success");

          // Inject successful lane content into message context
          const parallelContextParts: string[] = [];
          for (const lane of successfulLanes) {
            const content = dispatchResult.mergedContent.get(lane.filePath);
            if (!content) continue;
            runState.filesRead.add(lane.filePath);
            emit(taskId, "file_read", `[parallel] Reading: ${lane.filePath}`, { path: lane.filePath, parallel: true });
            recordDependencyClass(runState.dependencyAnalysis, "potentially_independent", `parallel_read_${lane.filePath}`);

            const MAX_CHARS = 12_000;
            const preview = content.length > MAX_CHARS
              ? content.slice(0, MAX_CHARS) + `\n...[truncated — file is ${content.length} chars total]`
              : content;
            parallelContextParts.push(`### ${lane.filePath} [source: parallel_dispatch]\n\`\`\`\n${preview}\n\`\`\``);
          }
          if (parallelContextParts.length > 0) {
            messages.push({
              role: "user",
              content: `[ORCHESTRATOR] Parallel dispatch results (${successfulLanes.length} files loaded concurrently):\n\n${parallelContextParts.join("\n\n")}`,
            });
            messages.push({
              role: "assistant",
              content: `{"action":"think","thought":"[PLANNING] Parallel dispatch loaded ${successfulLanes.length} additional file(s). I have their contents above."}`,
            });
          }

          if (dispatchResult.mergeIsSafe) {
            emit(taskId, "status",
              `Parallel dispatch complete: ${dispatchResult.mergedContent.size}/${remainingFiles.length} files merged safely.`
            );
          } else if (dispatchResult.abortCause === "pause") {
            // Dispatch was aborted by operator pause. Partial successes are already injected
            // into context; remaining files will load serially when the operator resumes.
            // The while-loop pause boundary handles the actual suspend/resume — no intervention.
            emit(taskId, "status",
              `Parallel dispatch paused: ${successfulLanes.length} file(s) pre-loaded, remaining will load serially on resume.`
            );
          } else {
            // Merge is unsafe: some lanes failed or produced conflicts.
            if (isTaskCancelled(taskId)) {
              emitCancelledDrain(taskId, runState);
              emitPhaseTransition(taskId, runState, "failed");
              clearLiveRunState(taskId);
              if (!summaryEmitted) { emitExecutionSummary(taskId, runState, "cancelled"); summaryEmitted = true; }
              finalizeRepairCycle();
              { const ev = assembleTaskEvidence(taskId, runState, "cancelled"); if (ev) setTaskEvidence(taskId, ev); }
              updateTaskStatus(taskId, "cancelled", "Cancelled by user during parallel dispatch.");
              broadcastTaskUpdate(task);
              return;
            }

            // Per-spec: an unsafe join from a genuine dispatch failure MUST hard-gate the
            // run via existing blocked/partial-intervention behavior before continuing —
            // not merely log and proceed.
            //
            // Severity determines treatment:
            //   - Total failure (all lanes failed): enter full blocked/intervention spin-wait.
            //     Operator must explicitly proceed-as-partial or cancel.
            //   - Partial failure (some lanes succeeded): enter blocked path so operator
            //     sees the intervention UI and can accept partial context or cancel.
            //     Serial agent loop still runs when operator accepts (partialProceed=true).
            const totalFailure = failedLanes.length === dispatchResult.laneCount && dispatchResult.laneCount > 0;
            const failedPaths  = failedLanes.map(r => r.filePath).join(", ");

            logger.warn(
              { taskId, joinStatus: dispatchResult.joinStatus, failedPaths, totalFailure },
              "[ParallelDispatcher] Merge unsafe — entering blocked/partial-intervention path"
            );

            // Set blocked/intervention run state (mirrors the existing done-action blocked path)
            runState.lastActionFailed     = true;
            runState.consecutiveFailures  = (runState.consecutiveFailures ?? 0) + 1;
            runState.interventionKind     = "blocked";
            runState.blockedContext       = totalFailure
              ? `Parallel dispatch failed for all ${failedLanes.length} lane(s): ${failedPaths}. Manual read required.`
              : `Parallel dispatch partial: ${successfulLanes.length} succeeded, ${failedLanes.length} failed (${failedPaths}). Proceeding requires accepting partial context.`;
            emitPhaseTransition(taskId, runState, "blocked");
            emit(taskId, "status",
              `[Orchestrator] Parallel dispatch join unsafe (${dispatchResult.joinStatus}) — waiting for operator input (Proceed as partial / Cancel).`
            );

            // Spin-wait at 500 ms intervals until operator proceeds or task is cancelled.
            // This is the same pattern used by the done-action blocked path.
            while (!runState.partialProceed && !isTaskCancelled(taskId)) {
              await new Promise<void>(resolve => setTimeout(resolve, 500));
            }

            if (isTaskCancelled(taskId) && !runState.partialProceed) {
              // Cancellation was the trigger — drain and exit now
              emitCancelledDrain(taskId, runState);
              emitPhaseTransition(taskId, runState, "failed");
              clearLiveRunState(taskId);
              if (!summaryEmitted) { emitExecutionSummary(taskId, runState, "cancelled"); summaryEmitted = true; }
              finalizeRepairCycle();
              { const ev = assembleTaskEvidence(taskId, runState, "cancelled"); if (ev) setTaskEvidence(taskId, ev); }
              updateTaskStatus(taskId, "cancelled", "Cancelled by user after unsafe parallel dispatch join.");
              broadcastTaskUpdate(task);
              return;
            }

            // Operator accepted — clear the blocked state and continue with serial loop.
            runState.partialProceed   = false;
            runState.interventionKind = "partial_proceed";
            emitPhaseTransition(taskId, runState, "executing");
            emit(taskId, "status",
              `[Orchestrator] Proceed-as-partial accepted after dispatch join failure. ${
                successfulLanes.length > 0
                  ? `${successfulLanes.length} file(s) pre-loaded; ${failedLanes.length} will load serially.`
                  : `Serial agent loop will read all plan files.`
              }`
            );

            emit(taskId, "scheduling_truth",
              `[Parallel dispatch partial accepted] ${successfulLanes.length} succeeded; ${failedLanes.length} degraded to serial`,
              {
                phase:           "dispatch_partial_accepted",
                successfulFiles: successfulLanes.map(r => r.filePath),
                failedFiles:     failedLanes.map(r => r.filePath),
                joinStatus:      dispatchResult.joinStatus,
              }
            );
          }
        }
      }

      // ── Live-phase broadcast callback ─────────────────────────────────────
      // Passed to updateStateAfterAction so phase transitions inside the action
      // router emit a WS live_phase event immediately — not one step behind.
      const livePhaseOnChange = (state: RunState): void => {
        setLiveRunState(taskId, state);
        const recoverable = state.phase === "executing" || state.phase === "verifying" || state.phase === "repairing";
        broadcastLivePhase(
          taskId,
          state.phase,
          state.step,
          state.maxSteps,
          state.unverifiedWrites.size,
          state.consecutiveFailures,
          recoverable,
          state.interventionKind,
          state.blockedContext ?? null,
          Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null,
          state.verificationQuality ?? null,
        );
      };

      // Register this RunState so the pause/resume/proceed endpoints can mutate it.
      registerActiveRunState(taskId, runState);

      // ── Agent loop ────────────────────────────────────────────────────────
      while (runState.step < runState.maxSteps) {
        // ── Pause-wait: safe inter-step boundary ─────────────────────────────
        // Spin-wait at 500 ms intervals while paused.  Never interrupts a
        // running action — only checked between completed steps.
        while (runState.paused && !isTaskCancelled(taskId)) {
          await new Promise<void>(resolve => setTimeout(resolve, 500));
        }

        // ── Override phase recovery ───────────────────────────────────────────
        // operator_overridden is a transient phase: it signals the UI that an override
        // was just consumed, then immediately falls back to executing for the next step.
        if (runState.phase === "operator_overridden") {
          emitPhaseTransition(taskId, runState, "executing");
        }

        // ── Approval gate auto-raise (task-9) ───────────────────────────────
        // Check if any registered gate has become triggerable at this step boundary.
        // A gate is triggered when its status is still "pending" and either:
        //   (a) its triggerAtStep is set and the current step has reached it, OR
        //   (b) it has no trigger condition (trigger immediately on first step boundary after registration).
        // Once raised, awaitingApproval is set to the gate ID and the spin-wait below takes over.
        if (runState.awaitingApproval === null) {
          const nextPendingGate = runState.approvalGates.find(g => {
            if (g.status !== "pending") return false;
            const triggerStep = g.triggerAtStep;
            if (triggerStep !== undefined) return runState.step >= triggerStep;
            // No trigger condition: fire immediately (gate was registered while running)
            return true;
          });
          if (nextPendingGate) {
            // Snapshot the current dispatch plan into the gate before it gets cleared by
            // parallelDispatcher housekeeping — approve-selective uses this for dependency checks.
            if (runState.lastDispatchPlan.size > 0) {
              nextPendingGate.dispatchPlanSnapshot = new Map(runState.lastDispatchPlan);
            }
            runState.awaitingApproval = nextPendingGate.id;
            runState.interventionKind = "awaiting_approval";
            emitPhaseTransition(taskId, runState, "awaiting_approval");
            _actionStore.recordApprovalCheckpointReached(taskId, nextPendingGate.id, nextPendingGate.description, nextPendingGate.laneIds);
          }
        }

        // ── Approval gate spin-wait ──────────────────────────────────────────
        // When awaitingApproval is non-null the operator must explicitly approve
        // or deny (via /approve or /deny endpoint) before the loop can advance.
        // awaitingApproval holds the checkpoint ID while pending, null when clear.
        // Denial short-circuits the run with a structured approval_denied phase.
        if (runState.awaitingApproval !== null && !isTaskCancelled(taskId)) {
          const gateId = runState.awaitingApproval;
          emit(taskId, "status", `[Orchestrator] Halted at approval gate '${gateId}' — waiting for operator decision…`);
          // Phase + interventionKind already set via emitPhaseTransition above; just spin.
          while (runState.awaitingApproval !== null && !isTaskCancelled(taskId)) {
            await new Promise<void>(resolve => setTimeout(resolve, 500));
          }
          // After the wait: check if the gate was denied
          if (runState.phase === "approval_denied") {
            emit(taskId, "status", "[Orchestrator] Approval denied by operator — stopping run.");
            runState.interventionKind = null;
            emitPhaseTransition(taskId, runState, "approval_denied");
            const deniedGateId = runState.approvalGates.find(g => g.status === "denied")?.id ?? "unknown";
            const deniedDecision = runState.approvalDecisions.find(d => d.checkpointId === deniedGateId);
            const partialSummary = `Run stopped at approval gate '${deniedGateId}'${deniedDecision?.note ? `: ${deniedDecision.note}` : ""}.`;
            completion = {
              summary: partialSummary,
              changed_files: [...runState.filesWritten],
              commands_run: runState.commandsRun,
              final_status: "approval_denied",
              remaining: "Operator denied approval — run halted before further execution.",
            };
            emit(taskId, "done", partialSummary, {
              changed_files: [...runState.filesWritten],
              commands_run: runState.commandsRun,
              final_status: "approval_denied",
              remaining: completion.remaining,
            });
            lastSummary = partialSummary;
            clearLiveRunState(taskId);
            emitExecutionSummary(taskId, runState, "approval_denied");
            summaryEmitted = true;
            finalizeRepairCycle();
            { const ev = assembleTaskEvidence(taskId, runState, "approval_denied"); if (ev) setTaskEvidence(taskId, ev); }
            break;
          }
          // Selective approval: propagate blocked lane IDs into laneControlSignals,
          // then transition back to "executing" so the UI reflects that allowed lanes are running.
          if (runState.phase === "selectively_blocked" && runState.selectivelyBlockedLaneIds.size > 0) {
            for (const laneId of runState.selectivelyBlockedLaneIds) {
              runState.laneControlSignals.set(laneId, "cancelled");
            }
            emit(taskId, "status",
              `[Orchestrator] Selective approval — ${runState.selectivelyBlockedLaneIds.size} lane(s) blocked: ${[...runState.selectivelyBlockedLaneIds].join(", ")}`
            );
            // Resume: selectively_blocked → executing (blocked lanes now carry cancel signals).
            emitPhaseTransition(taskId, runState, "executing");
          }
        }

        // ── Proceed-as-partial: user accepted partial completion ─────────────
        // Only honoured when phase is "blocked".  Clears the flag and falls
        // through to a synthetic done call below.
        if (runState.partialProceed && runState.phase === "blocked") {
          runState.partialProceed = false;
          runState.interventionKind = "partial_proceed";
          emit(taskId, "status", "[Orchestrator] Proceed-as-partial accepted by operator.");
          const partialSummary = "Task accepted as partial by operator while in blocked state.";
          completion = {
            summary:       partialSummary,
            changed_files: [...runState.filesWritten],
            commands_run:  runState.commandsRun,
            final_status:  "partial",
            remaining:     "Operator signalled proceed-as-partial from blocked state.",
          };
          emit(taskId, "done", partialSummary, {
            changed_files: [...runState.filesWritten],
            commands_run:  runState.commandsRun,
            final_status:  "partial",
            remaining:     completion.remaining,
          });
          lastSummary = partialSummary;
          if (!checkpointEmitted) {
            const ppCp = getCheckpoint(taskId);
            if (ppCp && ppCp.snapshots.size > 0) {
              const cpSummary = serializeCheckpoint(ppCp);
              const n = ppCp.snapshots.size;
              const stagedPathMap: Record<string, string> = {};
              for (const relPath of ppCp.snapshots.keys()) {
                try { stagedPathMap[relPath] = getStagedPath(taskId, relPath); } catch { /* skip */ }
              }
              emit(taskId, "checkpoint",
                `${n} file${n !== 1 ? "s" : ""} staged (partial proceed) — live workspace unchanged. Discard or accept via the checkpoint panel`,
                { ...(cpSummary as unknown as Record<string, unknown>), staged: true, liveUnchanged: true, stagedPathMap },
              );
              checkpointEmitted = true;
            }
          }
          updateStateAfterAction(runState, { action: "done" }, true, taskId, livePhaseOnChange);
          clearLiveRunState(taskId);
          // ── RepairCycleState finalization at normal done ─────────────────────
          // Use the shared finalizeRepairCycle() helper — same rules as all other
          // exit paths. Ensures Passed/Idle/Inconclusive/Failed are stamped
          // uniformly regardless of which exit triggered. Idempotent on double-call.
          finalizeRepairCycle();
          { const exitReason = resolveCleanExitReason(runState); emitExecutionSummary(taskId, runState, exitReason); const ev = assembleTaskEvidence(taskId, runState, exitReason); if (ev) setTaskEvidence(taskId, ev); }
          summaryEmitted = true;
          break;
        }

        if (isTaskCancelled(taskId)) {
          logger.info({ taskId, step: runState.step }, "Task cancelled by user");
          emit(taskId, "status", "Cancelled by user.");
          // Emit checkpoint for any staged files before marking cancelled
          if (!checkpointEmitted) {
            const cancelCp = getCheckpoint(taskId);
            if (cancelCp && cancelCp.snapshots.size > 0) {
              const cpSummary = serializeCheckpoint(cancelCp);
              const n = cancelCp.snapshots.size;
              const stagedPathMap: Record<string, string> = {};
              for (const relPath of cancelCp.snapshots.keys()) {
                try { stagedPathMap[relPath] = getStagedPath(taskId, relPath); } catch { /* skip */ }
              }
              const runtimeImpactFiles = classifyRuntimeImpactFiles(
                (cpSummary as { files?: Array<{ path: string }> }).files?.map(f => f.path) ?? []
              );
              emit(taskId, "checkpoint",
                `${n} file${n !== 1 ? "s" : ""} staged (task cancelled) — live workspace unchanged. Discard or accept via the checkpoint panel`,
                { ...(cpSummary as unknown as Record<string, unknown>), staged: true, liveUnchanged: true, stagedPathMap, runtimeImpactFiles },
              );
              checkpointEmitted = true;
            }
          }
          emitCancelledDrain(taskId, runState);
          emitPhaseTransition(taskId, runState, "failed");
          clearLiveRunState(taskId);
          if (!summaryEmitted) { emitExecutionSummary(taskId, runState, "cancelled"); summaryEmitted = true; }
          finalizeRepairCycle();
          { const ev = assembleTaskEvidence(taskId, runState, "cancelled"); if (ev) setTaskEvidence(taskId, ev); }
          updateTaskStatus(taskId, "cancelled", "Cancelled by user.");
          broadcastTaskUpdate(task);
          return;
        }

        runState.step++;

        // ── Step budget nudge ───────────────────────────────────────────────
        // Each threshold fires exactly once: 70% (gentle) and 90% (urgent).
        {
          const pct = runState.step / runState.maxSteps;
          if (pct >= 0.90 && !nudge90Sent) {
            nudge90Sent = true;
            emit(taskId, "status",
              `[Orchestrator] Step budget critical — ${runState.step}/${runState.maxSteps} steps used. ` +
              `Wrap up immediately: call done now with current progress.`
            );
            messages.push({
              role: "user",
              content:
                `ORCHESTRATOR BUDGET ALERT: You have used ${runState.step} of ${runState.maxSteps} steps (≥90%). ` +
                `STOP what you are doing and call done NOW. Report what was completed and what remains. ` +
                `Do not start any new reads, writes, or commands. Call done immediately.`,
            });
          } else if (pct >= 0.70 && !nudge70Sent) {
            nudge70Sent = true;
            emit(taskId, "status",
              `[Orchestrator] Step budget warning — ${runState.step}/${runState.maxSteps} steps used. ` +
              `Begin wrapping up.`
            );
            messages.push({
              role: "user",
              content:
                `ORCHESTRATOR BUDGET WARNING: You have used ${runState.step} of ${runState.maxSteps} steps (≥70%). ` +
                `Start wrapping up: finish the current action, verify, and call done. ` +
                `Do not start new exploratory reads or optional improvements.`,
            });
          }
        }

        // ── Model call ──────────────────────────────────────────────────────
        let responseText = "";
        try {
          const agentOpts: Parameters<typeof model.chatStream>[2] = {
            maxTokens: 4096,
            temperature: 0.1,
            taskHint: "agentic",
            taskId,
          };
          // If the operator has pinned a specific model in Settings, pass it through.
          // The provider will use it as a hard override rather than auto-routing.
          const agentModelPin = getSettings().agentModelOverride;
          if (agentModelPin) agentOpts.model = agentModelPin;

          await model.chatStream(
            pruneMessages(messages),
            (chunk) => { responseText += chunk; },
            agentOpts
          );
          logger.debug({ taskId, step: runState.step, responseLength: responseText.length }, "Model response received");
        } catch (err) {
          if (isTaskCancelled(taskId)) {
            emit(taskId, "status", "Cancelled during model call.");
            // Emit checkpoint for any staged files before marking cancelled
            if (!checkpointEmitted) {
              const cancelCp = getCheckpoint(taskId);
              if (cancelCp && cancelCp.snapshots.size > 0) {
                const cpSummary = serializeCheckpoint(cancelCp);
                const n = cancelCp.snapshots.size;
                const stagedPathMap: Record<string, string> = {};
                for (const relPath of cancelCp.snapshots.keys()) {
                  try { stagedPathMap[relPath] = getStagedPath(taskId, relPath); } catch { /* skip */ }
                }
                const runtimeImpactFiles = classifyRuntimeImpactFiles(
                  (cpSummary as { files?: Array<{ path: string }> }).files?.map(f => f.path) ?? []
                );
                emit(taskId, "checkpoint",
                  `${n} file${n !== 1 ? "s" : ""} staged (task cancelled) — live workspace unchanged. Discard or accept via the checkpoint panel`,
                  { ...(cpSummary as unknown as Record<string, unknown>), staged: true, liveUnchanged: true, stagedPathMap, runtimeImpactFiles },
                );
                checkpointEmitted = true;
              }
            }
            emitCancelledDrain(taskId, runState);
            emitPhaseTransition(taskId, runState, "failed");
            clearLiveRunState(taskId);
            if (!summaryEmitted) { emitExecutionSummary(taskId, runState, "cancelled"); summaryEmitted = true; }
            { const ev = assembleTaskEvidence(taskId, runState, "cancelled"); if (ev) setTaskEvidence(taskId, ev); }
            updateTaskStatus(taskId, "cancelled", "Cancelled by user");
            broadcastTaskUpdate(task);
            return;
          }
          const isModelError = err instanceof ModelError;
          emitPhaseTransition(taskId, runState, "failed");
          clearLiveRunState(taskId);
          if (!summaryEmitted) { emitExecutionSummary(taskId, runState, "error"); summaryEmitted = true; }
          finalizeRepairCycle();
          { const ev = assembleTaskEvidence(taskId, runState, "error"); if (ev) setTaskEvidence(taskId, ev); }
          failTask(taskId, task, `Model error at step ${runState.step}: ${isModelError ? err.message : String(err)}`, {
            title: isModelError ? err.message : "AI model call failed",
            detail: isModelError ? `Category: ${err.category}\nTechnical: ${err.technical}` : String(err),
            step: `step_${runState.step}_model_call`,
            category: "model",
          });
          return;
        }

        messages.push({ role: "assistant", content: responseText });

        // ── Response normalization ──────────────────────────────────────────
        const normalized = normalizeModelResponse(responseText);

        if (!normalized.ok) {
          runState.consecutiveParseFailures++;
          const reason: NormalizeFailureReason = normalized.reason;
          const detail = normalized.detail;

          logger.warn(
            { taskId, step: runState.step, consecutiveParseFailures: runState.consecutiveParseFailures, reason, responsePreview: responseText.slice(0, 200) },
            `Normalize failed [${reason}]`
          );

          if (runState.consecutiveParseFailures >= MAX_CONSECUTIVE_PARSE_FAILURES) {
            // Final failure — surface as a visible error
            const failMsg = `Model returned ${MAX_CONSECUTIVE_PARSE_FAILURES} unparseable responses in a row.\nLast failure: [${reason}] ${detail.slice(0, 300)}`;
            emit(taskId, "error", failMsg);
            emitPhaseTransition(taskId, runState, "failed");
            clearLiveRunState(taskId);
            if (!summaryEmitted) { emitExecutionSummary(taskId, runState, "parse_failure"); summaryEmitted = true; }
            finalizeRepairCycle();
            { const ev = assembleTaskEvidence(taskId, runState, "parse_failure"); if (ev) setTaskEvidence(taskId, ev); }
            failTask(taskId, task, `Model returned ${MAX_CONSECUTIVE_PARSE_FAILURES} unparseable responses in a row`, {
              title: `Model failed to produce valid JSON ${MAX_CONSECUTIVE_PARSE_FAILURES} times`,
              detail: `Last failure reason: ${reason}\n${detail}`,
              step: `step_${runState.step}_parse`,
              category: "orchestration",
            });
            return;
          }

          // Early failure (attempt 1 or 2) — emit a quiet status, not an error.
          // Most models recover on the first retry; showing a red error card is noisy.
          // Tag with retryReason so the console can style it as a warning rather than
          // an undifferentiated grey bullet.
          emit(taskId, "status",
            `Retrying response format (attempt ${runState.consecutiveParseFailures}, reason: ${reason})…`,
            { eventClass: "warning", retryReason: reason },
          );

          const retryMsg = buildRetryInstruction(reason, responseText.slice(0, 300));
          messages.push({ role: "user", content: retryMsg });
          continue;
        }

        runState.consecutiveParseFailures = 0;

        const { action, method, warning } = normalized;
        // Only log non-trivial normalization paths
        if (method !== "direct_parse" && method !== "fence_stripped") {
          logger.debug({ taskId, step: runState.step, method, warning }, `Response normalized via ${method}`);
        }
        if (warning && method !== "json_repaired") {
          // json_repaired is expected and not concerning — skip the warn log
          logger.warn({ taskId, step: runState.step, method, warning }, "Normalization warning");
        }

        const actionType = String(action["action"] ?? "");

        // ── Dependency classification ───────────────────────────────────────
        // Classify this step's dependency class BEFORE the gate so we capture
        // state before any mutation. Classification is grounded in RunState truth:
        // filesRead, unverifiedWrites, consecutiveFailures, lastActionFailed.
        const stepDepClass = classifyStepDependency(runState, action, actionType);
        // Snapshot pre-dispatch action record IDs for post-dispatch attribution.
        // VERIFY_RESULT records may be created AFTER executeAction (during
        // updateStateAfterAction → actionRouter → verificationLedger). We use
        // this snapshot to find ALL new records, including VERIFY_RESULT.
        const preDispatchRecordIds = new Set(_actionStore.getActions(taskId).map(r => r.id));

        // ── Action router gate ──────────────────────────────────────────────
        // Enforces profile caps (read cap, redundant read, write cap, verify gate)
        // BEFORE the action executes. A blocked action injects a corrective message
        // and continues the loop without counting as a real step output.
        const gate = gateAction(action, runState);
        if (!gate.allowed) {
          // Track shell-read bypass attempts separately for operator telemetry
          if (gate.reason === "shell_read_redundant" || gate.reason === "shell_read_cap_exceeded") {
            recordShellReadBlocked(runState);
          }

          // Increment gate telemetry counter (used in execution summary)
          recordGateTrigger(runState, gate.reason as GateRejectionReason);

          // Human-readable gate labels for the operator status feed
          const gateLabel: Record<string, string> = {
            shell_read_redundant:    "Blocked: shell read of already-read file",
            shell_read_cap_exceeded: "Blocked: shell read would exceed file-read cap",
            redundant_read:          "Blocked: file already read this session",
            read_cap_exceeded:       "Blocked: file-read cap reached",
            write_cap_exceeded:      "Blocked: file-write cap reached",
            write_class_blocked:     "Blocked: writes are not allowed for this task class",
            command_cap_exceeded:    "Blocked: command budget reached for this task class",
            post_verify_read_blocked: "Blocked: out-of-plan read after verification phase",
            verification_required:   "Blocked: verification required before done",
            runtime_proof_required:  "Blocked: runtime_confirmed proof required before done (server not yet confirmed live)",
          };
          const label = gateLabel[gate.reason] ?? `Blocked: ${gate.reason.replace(/_/g, " ")}`;

          logger.info(
            { taskId, step: runState.step, actionType, reason: gate.reason, shellReadsBlocked: runState.shellReadsBlocked },
            `[Orchestrator] Action router blocked ${actionType} (${gate.reason})`
          );
          emit(taskId, "status", `[Orchestrator] ${label}`);
          messages.push({ role: "user", content: gate.forcedMessage });
          continue;
        }

        // ── Emit stage label before executing ──────────────────────────────
        emitStage(taskId, runState.step, runState.maxSteps, actionType, action, runState.lastActionFailed);

        // ── Operator step override check (task-9) ────────────────────────────
        // Check if an operator registered an override for this step.
        // Override application is bounded: only takes effect at the actual execution boundary.
        //
        // Key resolution order (operators use any of these when calling the API):
        //   1. Exact file path  (action.path  — file_read, file_write, etc.)
        //   2. Command string   (action.command — exec)
        //   3. Step number key  ("step:N" — canonical positional override)
        //
        // The agent loop checks all candidate keys so operator-registered overrides
        // reliably match regardless of which form the operator used when registering.
        if (runState.operatorOverrides.size > 0 && actionType !== "done" && actionType !== "think") {
          const filePath    = String(action["path"] ?? action["file_path"] ?? "").trim();
          const command     = String(action["command"] ?? "").trim();
          const stepNumKey  = `step:${runState.step}`;
          // The canonical key set includes (in priority order):
          //   1. filePath — matches overrides registered by the exact file path being written/read
          //   2. command  — matches overrides registered by the exact shell command being run
          //   3. step:N   — matches overrides registered by ordinal step number (e.g. "step:3")
          // Broad action-type matching (e.g. "write_file") is intentionally excluded: it would
          // match all steps of that type rather than a specific planned step, violating bounded
          // override semantics. Operators must use a specific path, command string, or step:N.
          const candidateKeys = [filePath, command, stepNumKey].filter(k => k.length > 0 && k !== "step:0");
          let matchedKey: string | undefined;
          for (const k of candidateKeys) {
            if (runState.operatorOverrides.has(k)) { matchedKey = k; break; }
          }
          const stepKey = matchedKey ?? "";
          const override = stepKey ? runState.operatorOverrides.get(stepKey) : undefined;
          if (override) {
            runState.operatorOverrides.delete(stepKey); // consume the override (once-only)
            if (!runState.appliedOverrides.includes(override)) {
              runState.appliedOverrides.push(override);
            }
            // Record evidence of the override being applied now (at execution boundary, not at registration)
            _actionStore.recordOperatorOverride(taskId, stepKey, override.kind, override.substituteWith, override.note);
            emitPhaseTransition(taskId, runState, "operator_overridden");
            if (override.kind === "skip") {
              // Skip: inject a synthetic success message and continue without executing
              emit(taskId, "status", `[Operator override] Step skipped: ${stepKey}${override.note ? ` — ${override.note}` : ""}`);
              messages.push({ role: "user", content: `[OPERATOR OVERRIDE] Step "${stepKey}" was skipped by the operator. This step was not executed. Proceed with the next step.${override.note ? ` Operator note: ${override.note}` : ""}` });
              runState.step++;
              continue;
            } else if (override.kind === "deny") {
              // Deny: inject an error message so the agent knows the step failed
              emit(taskId, "status", `[Operator override] Step denied: ${stepKey}${override.note ? ` — ${override.note}` : ""}`);
              messages.push({ role: "user", content: `[OPERATOR OVERRIDE] Step "${stepKey}" was denied by the operator and was not executed. Error: execution denied.${override.note ? ` Operator note: ${override.note}` : ""} Decide whether to retry a different approach or call done.` });
              runState.lastActionFailed = true;
              runState.consecutiveFailures++;
              runState.step++;
              continue;
            } else if (override.kind === "substitute" && override.substituteWith) {
              // Substitute: inject the substitute result as if the step had run and returned the content
              emit(taskId, "status", `[Operator override] Step substituted: ${stepKey}${override.note ? ` — ${override.note}` : ""}`);
              messages.push({ role: "user", content: `[OPERATOR OVERRIDE] Step "${stepKey}" was substituted by the operator. The following result was supplied in place of real execution:\n\n${override.substituteWith}${override.note ? `\n\nOperator note: ${override.note}` : ""}\n\nContinue as if this step ran successfully.` });
              runState.lastActionFailed = false;
              runState.consecutiveFailures = 0;
              runState.step++;
              continue;
            }
          }
        }

        // ── Done action ─────────────────────────────────────────────────────
        if (actionType === "done") {
          const summary      = String(action["summary"] ?? "Task complete.");
          const changedFiles = Array.isArray(action["changed_files"])
            ? (action["changed_files"] as unknown[]).map(String)
            : [];
          const commandsRun = Array.isArray(action["commands_run"])
            ? (action["commands_run"] as unknown[]).map(String)
            : [];
          const finalStatus = ["complete", "partial", "blocked"].includes(String(action["final_status"]))
            ? (String(action["final_status"]) as TaskCompletion["final_status"])
            : "complete";
          const remaining = String(action["remaining"] ?? "");

          // ── Evidence cross-check ────────────────────────────────────────
          // Compare what the agent CLAIMS it changed vs. what was ACTUALLY written.
          // Use runState.filesWritten as ground truth.
          const unclaimedWrites = [...runState.filesWritten].filter(f => !changedFiles.includes(f));
          const phantomClaims   = changedFiles.filter(f => runState.filesWritten.size > 0 && !runState.filesWritten.has(f));

          if (unclaimedWrites.length > 0) {
            logger.warn({ taskId, unclaimedWrites }, "Agent did not list all written files in done.changed_files");
            emit(taskId, "status", `Note: unclaimed file writes: ${unclaimedWrites.join(", ")}`);
          }
          if (phantomClaims.length > 0) {
            logger.warn({ taskId, phantomClaims }, "Agent claimed files in done.changed_files that were never written");
          }

          // Use actual tracked data to augment claimed lists
          const mergedChangedFiles = [...new Set([...changedFiles, ...unclaimedWrites])];
          const mergedCommandsRun  = runState.commandsRun.length > 0
            ? [...new Set([...commandsRun, ...runState.commandsRun])]
            : commandsRun;

          // ── Blocked wait: spin until operator proceeds or task is cancelled ──
          // When the agent calls done with final_status: "blocked", hold the run
          // alive in the "blocked" interventionKind phase so the UI can offer the
          // "Proceed as partial" intervention button.
          let effectiveFinalStatus = finalStatus;
          let effectiveSummary     = summary;
          if (finalStatus === "blocked") {
            runState.interventionKind = "blocked";
            runState.blockedContext   = remaining || null;
            emitPhaseTransition(taskId, runState, "blocked");
            emit(taskId, "status", "[Orchestrator] Task blocked — waiting for operator input (Proceed as partial / Cancel).");
            // Spin-wait at 500 ms intervals until the operator acts or the task is cancelled.
            while (!runState.partialProceed && !isTaskCancelled(taskId)) {
              await new Promise<void>(resolve => setTimeout(resolve, 500));
            }
            if (isTaskCancelled(taskId) && !runState.partialProceed) {
              // Cancellation was the trigger — follow the standard cancel path and return.
              emitCancelledDrain(taskId, runState);
              emitPhaseTransition(taskId, runState, "failed");
              clearLiveRunState(taskId);
              if (!summaryEmitted) { emitExecutionSummary(taskId, runState, "cancelled"); summaryEmitted = true; }
              finalizeRepairCycle();
              { const ev = assembleTaskEvidence(taskId, runState, "cancelled"); if (ev) setTaskEvidence(taskId, ev); }
              updateTaskStatus(taskId, "cancelled", "Cancelled by user while blocked.");
              broadcastTaskUpdate(task);
              return;
            }
            // partialProceed must be true — convert to a partial completion.
            runState.partialProceed  = false;
            runState.interventionKind = "partial_proceed";
            effectiveFinalStatus     = "partial";
            effectiveSummary         = "Task accepted as partial by operator from blocked state.";
            emit(taskId, "status", "[Orchestrator] Proceed-as-partial accepted by operator.");
          }

          completion = {
            summary:       effectiveSummary,
            changed_files: mergedChangedFiles,
            commands_run:  mergedCommandsRun,
            final_status:  effectiveFinalStatus,
            remaining,
          };
          lastSummary = effectiveSummary;

          logger.info(
            { taskId, step: runState.step, finalStatus: effectiveFinalStatus, mergedChangedFiles, mergedCommandsRun,
              filesRead: [...runState.filesRead].length, verificationsDone: runState.verificationsDone },
            "Task completed"
          );
          emit(taskId, "done", effectiveSummary, {
            changed_files: mergedChangedFiles,
            commands_run:  mergedCommandsRun,
            final_status:  effectiveFinalStatus,
            remaining,
          });

          // ── Checkpoint event (Phase 10) ─────────────────────────────────────
          // If this task wrote any files, emit a checkpoint event so the operator
          // can see what was snapshotted and choose to discard or accept the changes.
          // The event data is a serialised CheckpointSummary (no content blobs).
          // Staging metadata (staged: true, liveUnchanged: true) is included so the
          // operator surface accurately reflects that the live workspace is clean.
          const taskCp = getCheckpoint(taskId);
          if (taskCp && taskCp.snapshots.size > 0) {
            const cpSummary = serializeCheckpoint(taskCp);
            const n = taskCp.snapshots.size;
            // stagedPathMap: relative path → absolute staging path for each file.
            // Provides per-file stagedPath parity with the file_write event payload.
            const stagedPathMap: Record<string, string> = {};
            for (const relPath of taskCp.snapshots.keys()) {
              try { stagedPathMap[relPath] = getStagedPath(taskId, relPath); } catch { /* skip invalid */ }
            }
            const runtimeImpactFiles = classifyRuntimeImpactFiles(
              (cpSummary as { files?: Array<{ path: string }> }).files?.map(f => f.path) ?? []
            );
            emit(
              taskId, "checkpoint",
              `${n} file${n !== 1 ? "s" : ""} staged — live workspace unchanged. Discard or accept changes via the checkpoint panel`,
              {
                ...(cpSummary as unknown as Record<string, unknown>),
                staged:             true,
                liveUnchanged:      true,
                stagedPathMap,
                runtimeImpactFiles,
              },
            );
            logger.info(
              { taskId, fileCount: n, files: [...taskCp.snapshots.keys()] },
              "[Checkpoint] Checkpoint event emitted at task done (staged — live workspace unchanged)",
            );
            checkpointEmitted = true;
          }

          // ── Record done step in dependency accumulator ──────────────────────
          // done is always strictly_sequential (depends on all prior state).
          // Record it before emitting the scheduling_truth so counts are complete.
          recordDependencyClass(runState.dependencyAnalysis, "strictly_sequential", `done_${runState.step}`);

          // ── Done-phase scheduling truth ─────────────────────────────────────
          // Emit the actual observed dependency shape before the execution summary.
          // Includes actual dispatch decisions: which steps ran in which lane, serial vs.
          // parallel, why each step was serialized, and the join status.
          const _dispatchMode   = _parallelDispatchResult?.dispatchMode   ?? "serial_fallback";
          const _dispatchLanes  = _parallelDispatchResult?.laneCount       ?? 0;
          const _joinStatus     = _parallelDispatchResult?.joinStatus      ?? "no_dispatch";
          const _laneResults    = _parallelDispatchResult?.laneResults     ?? [];
          const _serialized     = _parallelDispatchResult?.serializedSteps ?? [];
          emit(taskId, "scheduling_truth", buildDonePhaseTruth(runState.dependencyAnalysis), {
            phase:             "done",
            counts:            runState.dependencyAnalysis.counts,
            independentCount:  runState.dependencyAnalysis.potentiallyIndependentActionIds.length,
            serialReason:      runState.dependencyAnalysis.serialReason,
            readBurstUsed:     runState.dependencyAnalysis.readBurstUsed,
            readBurstCount:    runState.dependencyAnalysis.readBurstCount,
            dispatchMode:      _dispatchMode,
            laneCount:         _dispatchLanes,
            laneResults:       _laneResults.map(r => ({
              laneId:     r.laneId,
              steps:      [r.stepId],
              status:     r.status,
              serializationReason: undefined,
            })),
            joinStatus:        _joinStatus,
            serializedSteps:   _serialized,
          });

          // ── Execution summary ────────────────────────────────────────────────
          updateStateAfterAction(runState, action, true, taskId, livePhaseOnChange);
          clearLiveRunState(taskId);
          { const exitReason = resolveCleanExitReason(runState); emitExecutionSummary(taskId, runState, exitReason); const ev2 = assembleTaskEvidence(taskId, runState, exitReason); if (ev2) setTaskEvidence(taskId, ev2); }
          summaryEmitted = true;
          break;
        }

        // ── Pre-write snapshot (Phase 10 checkpoint foundation) ──────────────
        // Before a write_file executes, capture the original file content into
        // the task's checkpoint. This is the real safety mechanism: the snapshot
        // makes full rollback possible after the task completes.
        // Idempotent: snapshotting the same file twice keeps only the first snapshot.
        if (actionType === "write_file" && wsRoot) {
          const writePath = String(action["path"] ?? "");
          if (writePath) {
            try {
              await snapshotFileForTask(taskId, writePath, wsRoot);
            } catch (snapshotErr) {
              // Never let snapshot failure block the write — log and continue
              logger.warn(
                { taskId, writePath, err: snapshotErr },
                "[Checkpoint] Snapshot failed — continuing without checkpoint for this file",
              );
            }
          }
        }

        // ── Runtime lifecycle: pre-command port snapshot ─────────────────────
        // For server_start and server_stop commands, capture a before-snapshot
        // of which ports are open so we can diff against after execution.
        // Classification is done before execute so the snapshot is captured
        // even if the command fails (the diff is still informative).
        let isServerLifecycleCmd = false;
        if (actionType === "run_command") {
          const cmdStr = String(action["command"] ?? "");
          const cls = classifyCommand(cmdStr);
          if (cls.sideEffectClass === "server_start" || cls.sideEffectClass === "server_stop") {
            isServerLifecycleCmd = true;
            await captureBeforeSnapshot(runState);
          }
        }

        // ── Execute action ──────────────────────────────────────────────────
        const signal = getTaskSignal(taskId);
        logger.debug({ taskId, step: runState.step, actionType }, "Executing action");
        const result = await executeAction(action, taskId, signal, wsRoot ?? undefined);

        // ── Emit live phase after every action (phase may have changed inside actionRouter) ──
        setLiveRunState(taskId, runState);
        broadcastLivePhase(
          taskId,
          runState.phase,
          runState.step,
          runState.maxSteps,
          runState.unverifiedWrites.size,
          runState.consecutiveFailures,
          runState.phase === "executing" || runState.phase === "verifying" || runState.phase === "repairing",
          runState.interventionKind,
          runState.blockedContext ?? null,
          Object.keys(runState.gateCounts).length > 0 ? runState.gateCounts : null,
          runState.verificationQuality ?? null,
        );

        // ── Runtime lifecycle: post-command port snapshot + diff ─────────────
        // Always probe after a server lifecycle command, regardless of exit code.
        // Server start commands frequently time out in runCommand (long-running
        // process) while the server is actually up and listening on its port.
        // result.success === false often means the runCommand timeout fired, not
        // that the server failed to start. By probing unconditionally we can
        // detect the live-server case (port open post-command) even when the
        // command appears to have failed. The 'serverLive' flag in the ledger
        // entry records this distinction, and the ledger's quality derivation
        // only promotes to runtime_confirmed when serverLive OR hasChange is true
        // — a genuinely failed server start leaves no open ports and no false
        // promotion occurs.
        if (isServerLifecycleCmd) {
          const cmdStr = String(action["command"] ?? "");
          await captureAfterSnapshotAndRecord(runState, cmdStr, result.success, taskId);
        }

        if (isTaskCancelled(taskId)) {
          emit(taskId, "status", "Cancelled.");
          // Emit checkpoint for any staged files before marking cancelled
          if (!checkpointEmitted) {
            const cancelCp = getCheckpoint(taskId);
            if (cancelCp && cancelCp.snapshots.size > 0) {
              const cpSummary = serializeCheckpoint(cancelCp);
              const n = cancelCp.snapshots.size;
              const stagedPathMap: Record<string, string> = {};
              for (const relPath of cancelCp.snapshots.keys()) {
                try { stagedPathMap[relPath] = getStagedPath(taskId, relPath); } catch { /* skip */ }
              }
              emit(taskId, "checkpoint",
                `${n} file${n !== 1 ? "s" : ""} staged (task cancelled) — live workspace unchanged. Discard or accept via the checkpoint panel`,
                { ...(cpSummary as unknown as Record<string, unknown>), staged: true, liveUnchanged: true, stagedPathMap },
              );
              checkpointEmitted = true;
            }
          }
          emitCancelledDrain(taskId, runState);
          emitPhaseTransition(taskId, runState, "failed");
          clearLiveRunState(taskId);
          if (!summaryEmitted) { emitExecutionSummary(taskId, runState, "cancelled"); summaryEmitted = true; }
          finalizeRepairCycle();
          { const ev = assembleTaskEvidence(taskId, runState, "cancelled"); if (ev) setTaskEvidence(taskId, ev); }
          updateTaskStatus(taskId, "cancelled", "Cancelled by user");
          broadcastTaskUpdate(task);
          return;
        }

        // ── Update run state (orchestrator tracking) ────────────────────────
        // Captures what happened: reads, writes, commands, phase transitions.
        // VERIFY_RESULT records are created here (via verificationLedger.addEntry).
        // We must call this BEFORE the dependency-class attribution sweep so that
        // ALL records created by this action dispatch (including VERIFY_RESULT) are
        // available to stamp.
        const prevFailed = runState.lastActionFailed;
        updateStateAfterAction(runState, action, result.success, taskId, livePhaseOnChange);

        // ── RepairCycleState machine — driven by ledger quality observations ──
        // Transitions use the post-action ledger state (quality + unverifiedWrites)
        // as the authoritative signal, not raw command success/failure booleans.
        //
        //   ledger quality "none" with unverified writes, after a run_command attempt
        //     → verification_failed (verification attempt did not produce evidence)
        //   ledger quality "none" while in active repair states (more attempts failed)
        //     → repair_in_progress
        //   ledger quality > "none" while in repair/reverify, no pending writes
        //     → passed (ledger evidence confirms recovery)
        //   ledger quality "none" while in reverify but command succeeded
        //     → reverify_pending (awaiting more evidence before declaring passed)
        {
          const ledgerQuality = runState.verificationLedger.getQuality();
          const hasUnverified = runState.unverifiedWrites.size > 0;

          if (actionType === "run_command") {
            if (ledgerQuality === "none" && hasUnverified) {
              // A run_command completed but the ledger still has no quality evidence
              // and writes remain pending — verification did not succeed.
              if (repairCycleState === RepairCycleState.Idle ||
                  repairCycleState === RepairCycleState.Passed) {
                repairAttempts++;
                repairCycleState = RepairCycleState.VerificationFailed;
                logger.info({ taskId, repairAttempts, unverifiedCount: runState.unverifiedWrites.size },
                  "[RepairCycle] State → verification_failed (ledger quality none after command)");
              } else if (repairCycleState === RepairCycleState.VerificationFailed ||
                         repairCycleState === RepairCycleState.ReverifyPending) {
                repairAttempts++;
                repairCycleState = RepairCycleState.RepairInProgress;
                logger.info({ taskId, repairAttempts },
                  "[RepairCycle] State → repair_in_progress (ledger quality still none during repair)");
              }

              // State-machine cap: exceeded MAX_REPAIR_ATTEMPTS — force partial
              if (repairAttempts >= MAX_REPAIR_ATTEMPTS &&
                  (repairCycleState === RepairCycleState.VerificationFailed ||
                   repairCycleState === RepairCycleState.RepairInProgress)) {
                repairCycleState = RepairCycleState.Partial;
                runState.repairCycleOutcome = RepairCycleState.Partial;
                logger.warn({ taskId, repairAttempts },
                  "[RepairCycle] State → partial (repair cap reached; forcing partial completion)");
              }
            } else if (ledgerQuality !== "none" && !hasUnverified) {
              // Ledger evidence present and all writes verified.
              if (repairCycleState === RepairCycleState.VerificationFailed ||
                  repairCycleState === RepairCycleState.RepairInProgress ||
                  repairCycleState === RepairCycleState.ReverifyPending) {
                repairCycleState = RepairCycleState.Passed;
                logger.info({ taskId, ledgerQuality, repairAttempts },
                  "[RepairCycle] State → passed (ledger quality confirmed, no pending writes)");
              }
            } else if (ledgerQuality === "none" && !hasUnverified &&
                       (repairCycleState === RepairCycleState.VerificationFailed ||
                        repairCycleState === RepairCycleState.RepairInProgress)) {
              // Writes cleared, but no verification quality yet — await evidence.
              repairCycleState = RepairCycleState.ReverifyPending;
              logger.info({ taskId },
                "[RepairCycle] State → reverify_pending (writes cleared, awaiting ledger quality)");
            }
          }
        }

        // ── Attach dependency class to ALL records created for this step ────
        // Find every record that was NOT in preDispatchRecordIds (i.e. created
        // during this dispatch + update cycle). This includes:
        //   • READ_FILE from readFile()/readStaged() (inside executeAction)
        //   • WRITE_FILE from writeStaged() (inside executeAction)
        //   • EXEC_COMMAND from run_command (inside executeAction)
        //   • VERIFY_RESULT from verificationLedger.addEntry() (inside updateStateAfterAction)
        // think, list_dir, and done create no records — handled separately below.
        const newRecords = _actionStore.getActions(taskId).filter(r => !preDispatchRecordIds.has(r.id));
        if (newRecords.length > 0) {
          for (const rec of newRecords) {
            rec.dependencyClass = stepDepClass;
            recordDependencyClass(runState.dependencyAnalysis, stepDepClass, rec.id);
          }
        } else if (actionType !== "done") {
          // think, list_dir (or any non-record-producing action): accumulate counts
          recordDependencyClass(runState.dependencyAnalysis, stepDepClass, `${actionType}_${runState.step}`);
        }
        // done: recorded separately below, just before the scheduling_truth event

        // ── Project index invalidation on write ─────────────────────────────
        // STAGING LAYER: write_file now routes to staging (not live workspace),
        // so project index invalidation is deferred to apply-time (when staged
        // files are promoted to live). Live files are unchanged during staging.
        // Index invalidation is handled in routes/checkpoint.ts applyCheckpoint.
        if (actionType === "write_file" && result.success) {
          // Index NOT invalidated here — live workspace unchanged (staged)

          // ── Diff enrichment & file_write event (Phase 08/10) ─────────────
          // After a successful write, compute a diff and emit the single
          // file_write event (with or without line-count metadata).
          const writtenPath    = String(action["path"] ?? "");
          const writtenContent = String(action["content"] ?? "");
          if (writtenPath) {
            let linesAdded:   number | undefined;
            let linesRemoved: number | undefined;
            let diffPreview   = "";
            try {
              patchSnapshotWithDiff(taskId, writtenPath, writtenContent);
              const cp   = getCheckpoint(taskId);
              const snap = cp?.snapshots.get(writtenPath);
              if (snap) {
                linesAdded   = snap.linesAdded;
                linesRemoved = snap.linesRemoved;
                diffPreview  = (snap.diff ?? "").split("\n").slice(0, 10).join("\n");
              }
            } catch (diffErr) {
              logger.debug({ taskId, writtenPath, err: diffErr }, "[Diff] Diff enrichment failed — continuing");
            }
            const hasCounts = linesAdded !== undefined || linesRemoved !== undefined;
            const stagedPath = getStagedPath(taskId, writtenPath);
            emit(taskId, "file_write",
              hasCounts
                ? `Staged: ${writtenPath} (+${linesAdded ?? 0} / -${linesRemoved ?? 0} lines) [live workspace unchanged]`
                : `Staged: ${writtenPath} [live workspace unchanged]`,
              {
                path:           writtenPath,
                linesAdded:     linesAdded   ?? 0,
                linesRemoved:   linesRemoved  ?? 0,
                diffPreview,
                staged:         true,
                stagedPath,
                liveUnchanged:  true,
              }
            );
          }
        }

        // ── Repair hard cap — state-machine enforced via repairAttempts ──────
        // The state-machine RepairCycleState.Partial is already set in the
        // transitions block above when repairAttempts >= MAX_REPAIR_ATTEMPTS.
        // This block handles the loop exit and completion emission when that
        // cap is reached — keyed on repairCycleState.Partial, not consecutiveFailures.
        if (
          repairCycleState === RepairCycleState.Partial &&
          runState.repairCycleOutcome === RepairCycleState.Partial &&
          (actionType === "run_command" || actionType === "write_file")
        ) {
          logger.warn(
            { taskId, step: runState.step, repairAttempts },
            "[Orchestrator] Repair loop cap reached — forcing partial completion"
          );
          emit(taskId, "status",
            `[Orchestrator] Repair loop capped after ${repairAttempts} verification attempt(s). Forcing partial completion.`
          );
          const partialSummary =
            `Repair loop capped after ${repairAttempts} failed verification attempt(s). ` +
            `Last error: ${result.output.slice(0, 300)}`;
          completion = {
            summary:       partialSummary,
            changed_files: [...runState.filesWritten],
            commands_run:  runState.commandsRun,
            final_status:  "partial",
            remaining:     `Repair loop hit the cap (${MAX_REPAIR_ATTEMPTS} attempts). Manual intervention required.`,
          };
          emit(taskId, "done", partialSummary, {
            changed_files: [...runState.filesWritten],
            commands_run:  runState.commandsRun,
            final_status:  "partial",
            remaining:     completion.remaining,
          });
          lastSummary = partialSummary;
          // Emit checkpoint if any files were written
          if (!checkpointEmitted) {
            const repairCp = getCheckpoint(taskId);
            if (repairCp && repairCp.snapshots.size > 0) {
              const cpSummary = serializeCheckpoint(repairCp);
              const n = repairCp.snapshots.size;
              const stagedPathMap: Record<string, string> = {};
              for (const relPath of repairCp.snapshots.keys()) {
                try { stagedPathMap[relPath] = getStagedPath(taskId, relPath); } catch { /* skip invalid */ }
              }
              emit(
                taskId, "checkpoint",
                `${n} file${n !== 1 ? "s" : ""} staged (repair cap) — live workspace unchanged. Discard or accept via the checkpoint panel`,
                {
                  ...(cpSummary as unknown as Record<string, unknown>),
                  staged:        true,
                  liveUnchanged: true,
                  stagedPathMap,
                },
              );
              checkpointEmitted = true;
            }
          }
          updateStateAfterAction(runState, { action: "done" }, true, taskId, livePhaseOnChange);
          clearLiveRunState(taskId);
          emitExecutionSummary(taskId, runState, "error");
          summaryEmitted = true;
          // ── RepairCycleState finalization at hard cap ─────────────────────
          // repairCycleState was transitioned to Partial above; finalizeRepairCycle()
          // stamps repairCycleOutcome idempotently (won't override the Partial state).
          finalizeRepairCycle();
          { const ev = assembleTaskEvidence(taskId, runState, "error"); if (ev) setTaskEvidence(taskId, ev); }
          break;
        }

        // ── Repair limit nudge — keyed on state-machine repairAttempts ────────
        if (repairAttempts >= MAX_REPAIR_ATTEMPTS - 1 &&
            (repairCycleState === RepairCycleState.VerificationFailed ||
             repairCycleState === RepairCycleState.RepairInProgress)) {
          logger.warn(
            { taskId, step: runState.step, repairAttempts },
            "[RepairCycle] Near repair cap — injecting nudge"
          );
          messages.push({
            role: "user",
            content: `ERROR: ${result.output}\n\nThis is repair attempt ${repairAttempts}/${MAX_REPAIR_ATTEMPTS}. You are close to the repair limit. If this cannot be fixed in one more attempt, call done with final_status "partial" and explain exactly what failed in the remaining field.`,
          });
          continue;
        }

        // ── Build tool result message for the model ─────────────────────────
        let resultMsg: string;
        if (result.success) {
          resultMsg = `Result: ${result.output}`;
          // After a write_file, prompt the agent to verify
          if (actionType === "write_file") {
            resultMsg += "\n\nIMPORTANT: You wrote a file. Now VERIFY this change is correct — run a build/lint/type-check command or read the file back before calling done.";
          }
        } else {
          const repairHint = prevFailed
            ? `\nThis is failure #${runState.consecutiveFailures}. Think [REPAIRING] about what specifically went wrong and try a different approach.`
            : `\nAnalyse this error carefully. Use think [REPAIRING] to diagnose the root cause before retrying.`;
          resultMsg = `ERROR: ${result.output}${repairHint}`;
        }

        messages.push({ role: "user", content: resultMsg });
      }

      // ── Step limit reached ────────────────────────────────────────────────
      if (runState.step >= runState.maxSteps && !completion) {
        logger.warn({ taskId, step: runState.step, maxSteps: runState.maxSteps }, "Reached maximum step limit");
        emit(taskId, "status", `Reached step limit (${runState.maxSteps}). Stopping.`);
        lastSummary = `Reached step limit (${runState.maxSteps}). Task may be partially complete.`;
        // Attach actual tracked data to the partial completion
        completion = {
          summary: lastSummary,
          changed_files: [...runState.filesWritten],
          commands_run:  runState.commandsRun,
          final_status:  "partial",
          remaining:     "Hit the step limit before task was verified complete.",
        };
      }

      // ── Post-loop checkpoint event (step-limit / abort paths) ─────────────
      // If the model-driven "done" action was NOT reached (step limit, etc.)
      // but the task wrote files, emit the checkpoint event here so the operator
      // can still discard or accept the partial changes.
      // Guard prevents double-emission when done action already fired it.
      if (!checkpointEmitted) {
        const postLoopCp = getCheckpoint(taskId);
        if (postLoopCp && postLoopCp.snapshots.size > 0) {
          const cpSummary = serializeCheckpoint(postLoopCp);
          const n = postLoopCp.snapshots.size;
          const stagedPathMap: Record<string, string> = {};
          for (const relPath of postLoopCp.snapshots.keys()) {
            try { stagedPathMap[relPath] = getStagedPath(taskId, relPath); } catch { /* skip invalid */ }
          }
          emit(
            taskId, "checkpoint",
            `${n} file${n !== 1 ? "s" : ""} staged (partial task) — live workspace unchanged. Discard or accept via the checkpoint panel`,
            {
              ...(cpSummary as unknown as Record<string, unknown>),
              staged:        true,
              liveUnchanged: true,
              stagedPathMap,
            },
          );
          logger.info(
            { taskId, fileCount: n },
            "[Checkpoint] Checkpoint event emitted at step limit / abort (staged — live workspace unchanged)",
          );
        }
      }

      // ── Determine final exit status ────────────────────────────────────────
      // If the agent completed (called done), summaryEmitted=true and status is "done".
      // If we exhausted the step budget, mark as "stalled" with step_budget exit reason.
      const stepBudgetExhausted = runState.step >= runState.maxSteps && !summaryEmitted;

      // ── Execution summary at step-limit / normal exit ─────────────────────
      if (!summaryEmitted) {
        if (stepBudgetExhausted) {
          emitPhaseTransition(taskId, runState, "failed");
          clearLiveRunState(taskId);
          emitExecutionSummary(taskId, runState, "step_budget");
        } else {
          clearLiveRunState(taskId);
          emitExecutionSummary(taskId, runState, resolveCleanExitReason(runState));
        }
        summaryEmitted = true;
      }

      // ── Evidence assembly at normal / step-limit exit ─────────────────────
      finalizeRepairCycle();
      { const exitReason = stepBudgetExhausted ? "step_budget" as const : resolveCleanExitReason(runState); const ev = assembleTaskEvidence(taskId, runState, exitReason); if (ev) setTaskEvidence(taskId, ev); }

      logger.info({ taskId, lastSummary, hasCompletion: !!completion, stepBudgetExhausted }, "Task finished");
      if (stepBudgetExhausted) {
        updateTaskStatus(taskId, "stalled", lastSummary, completion);
      } else {
        updateTaskStatus(taskId, "done", lastSummary, completion);
      }
      broadcastTaskUpdate(task);
    } catch (err) {
      logger.error({ taskId: task.id, err }, "Agent loop unexpected error");
      emit(task.id, "error", `Unexpected agent error: ${String(err)}`);
      // Best-effort: emit execution summary if runState was initialized before the error
      if (_outerRunState !== null) {
        emitPhaseTransition(task.id, _outerRunState, "failed");
        clearLiveRunState(task.id);
        emitExecutionSummary(task.id, _outerRunState, "error");
        // Stamp repairCycleOutcome at unexpected crash — repairCycleState is out of scope here
        // so we use a sentinel value to distinguish from normal terminal states.
        if (_outerRunState.repairCycleOutcome === undefined) {
          _outerRunState.repairCycleOutcome = "failed";
        }
        const ev = assembleTaskEvidence(task.id, _outerRunState, "error");
        if (ev) setTaskEvidence(task.id, ev);
      }
      updateTaskStatus(task.id, "error", String(err), undefined, {
        title: "Unexpected internal error",
        detail: String(err),
        step: "unknown",
        category: "orchestration",
      });
      broadcastTaskUpdate(task);
    }
  })();

  return task;
}
