import { Router, type IRouter } from "express";
import { runAgentTask, getLiveRunState, getActiveRunState } from "../lib/agentLoop.js";
import { savePrompt, linkPromptToAgentTask } from "../lib/promptPersistence.js";
import { createBoardTask, linkBoardTaskToAgent, updateBoardTaskStatus } from "../lib/taskBoardPersistence.js";
import { registerBoardLink } from "../lib/boardLinkStore.js";
import {
  getTask,
  listTasksSummary,
  getTaskEvents,
  cancelTask,
  deleteTask,
  addEvent,
} from "../lib/sessionManager.js";
import { broadcastTaskUpdate, broadcastLivePhase } from "../lib/wsServer.js";
import { getCheckpoint } from "../lib/orchestrator/checkpoint.js";
import { getFallbackChain } from "../lib/zaiCapabilities.js";
import { getModelProvider } from "../lib/modelAdapter.js";
import { getSettings } from "../lib/settingsStore.js";
import { actionStore } from "../lib/orchestrator/actionStore.js";
import { validateLaneSteering, validateSelectiveSafety } from "../lib/orchestrator/parallelDispatcher.js";
import {
  validateCheckpointForResume,
  buildWhatRemains,
  buildContinuationChain,
  verifyFromCheckpoint,
} from "../lib/orchestrator/continuationChain.js";
import type { ContinuationLineage } from "../lib/orchestrator/types.js";
import { recordPhaseTransition } from "../lib/orchestrator/types.js";

const router: IRouter = Router();

// ─── Image validation ─────────────────────────────────────────────────────────

const MAX_IMAGES           = 5;
// Client-side JPEG compression (max 1280 px, 85 % quality) keeps real screenshots
// well under 500 KB as base64.  4 MB is a generous server-side safety cap that
// rejects maliciously-crafted payloads while never rejecting legitimate screenshots.
const MAX_IMAGE_BYTES      = 4 * 1024 * 1024; // 4 MB per image
const ALLOWED_IMAGE_PREFIXES = ["data:image/", "https://"];

function validateImages(raw: unknown): { images: string[]; error?: string } {
  if (raw === undefined || raw === null) return { images: [] };
  if (!Array.isArray(raw))              return { images: [], error: "images must be an array" };
  if (raw.length > MAX_IMAGES)          return { images: [], error: `at most ${MAX_IMAGES} images allowed per task` };

  const images: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== "string") {
      return { images: [], error: `images[${i}] must be a string` };
    }
    const ok = ALLOWED_IMAGE_PREFIXES.some(p => item.startsWith(p));
    if (!ok) {
      return { images: [], error: `images[${i}] must be a data URL (data:image/...) or https:// URL` };
    }
    if (item.startsWith("data:") && item.length > MAX_IMAGE_BYTES * (4 / 3)) {
      return { images: [], error: `images[${i}] exceeds the 6 MB size limit` };
    }
    images.push(item);
  }
  return { images };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/agent/tasks", async (req, res) => {
  const { prompt, images: rawImages } = req.body as { prompt?: string; images?: unknown };

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "missing_prompt", message: "prompt is required" });
    return;
  }

  const { images, error: imageError } = validateImages(rawImages);
  if (imageError) {
    res.status(400).json({ error: "invalid_images", message: imageError });
    return;
  }

  const trimmedPrompt = prompt.trim();

  // Create the board task entry and persist the prompt artifact immediately —
  // before runAgentTask so prompt is never lost even if task start fails.
  const boardTask = createBoardTask({ prompt: trimmedPrompt });
  savePrompt({ agentTaskId: null, boardTaskId: boardTask.id, prompt: trimmedPrompt }).catch(() => {});

  try {
    const task = await runAgentTask(trimmedPrompt, images);

    // Now we have the agent taskId — link board task → agent task.
    linkBoardTaskToAgent(boardTask.id, task.id);
    // Register link so the status-changed hook can mirror status to board.
    registerBoardLink(task.id, boardTask.id);
    // Immediately sync board task to "running" — the hook may have already fired
    // before the link was registered (race between IIFE and await resolution),
    // so we force the correct state here as a guaranteed backfill.
    updateBoardTaskStatus(boardTask.id, "running");
    // Back-fill agentTaskId on the prompt artifact that was saved before task start.
    linkPromptToAgentTask(boardTask.id, task.id).catch(() => {});

    res.json({ taskId: task.id, status: task.status });
  } catch (err) {
    // Mark the board task as error so it doesn't remain orphaned in pending state.
    updateBoardTaskStatus(boardTask.id, "error");
    res.status(400).json({ error: "agent_error", message: String(err) });
  }
});

// Slim list — excludes events array for fast payload
router.get("/agent/tasks", (_req, res) => {
  const tasks = listTasksSummary();
  res.json({ tasks });
});

// Full task including all stored events — used for replay
router.get("/agent/tasks/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  res.json(task);
});

// Events-only endpoint for lightweight replay without re-fetching full task body
router.get("/agent/tasks/:taskId/events", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  res.json({ taskId, events: getTaskEvents(taskId) });
});

// ─── Structured evidence endpoint ─────────────────────────────────────────────
//
// Returns the persisted TaskEvidence snapshot for any task, including tasks
// loaded from history.json after a server restart. Evidence is NOT derived
// from in-memory events (which are empty for hydrated tasks); it is read
// directly from the task.taskEvidence field that was assembled at completion
// and persisted via AgentTaskSummary.
//
// 404 — task not found
// 200 with taskEvidence=null — task found but evidence absent (still running, conversational, or early failure)
//         includes a "reason" field: "task_still_running" | "no_evidence_for_task_class"
// 200 with taskEvidence=object — evidence available (routeProfile always present; plan/checkpoint/execution may be null)

router.get("/agent/tasks/:taskId/evidence", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  if (!task.taskEvidence) {
    // Evidence absent. This covers several cases:
    //   1. Task is still running (evidence assembled at completion only)
    //   2. Conversational task (no route/plan/checkpoint evidence by design)
    //   3. Task failed before routing (early workspace-validation failure)
    //   4. Task was interrupted by server restart before evidence was persisted
    // Return 200 with explicit reason rather than 204 so callers know why.
    const running = task.status === "running";
    const interrupted = task.status === "interrupted";
    res.json({
      taskId,
      status: task.status,
      taskEvidence: null,
      reason: running
        ? "task_still_running"
        : interrupted
          ? "task_interrupted_before_evidence"
          : "no_evidence_for_task_class",
    });
    return;
  }

  const chain = task.continuationChain ?? null;
  const continuationLineage: ContinuationLineage | null = chain
    ? {
        isContinuation:       true,
        parentTaskId:         chain.parentTaskId,
        originCheckpointId:   chain.originCheckpointId,
        ancestryDepth:        chain.ancestryDepth,
        whatRemainedAtResume: chain.whatRemainedAtResume,
      }
    : null;

  res.json({
    taskId,
    status: task.status,
    taskEvidence: task.taskEvidence,
    ...(continuationLineage ? { continuationLineage } : {}),
  });
});

// ─── Structured replay endpoint ────────────────────────────────────────────────
//
// Returns a human-readable reconstruction of the task derived entirely from
// persisted taskEvidence — not from live memory. Works correctly after a server
// restart. Clearly marks which evidence fields are present vs absent, and states
// the retention boundary explicitly.
//
// 404 — task not found
// 200 with replay=null — task found but evidence absent (reason field explains why)
// 200 with replay=array — structured replay sequence with retention policy statement

router.get("/agent/tasks/:taskId/replay", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  if (!task.taskEvidence) {
    res.json({
      taskId,
      status: task.status,
      replay: null,
      reason: task.status === "running"
        ? "task_still_running"
        : "no_evidence_for_task_class",
    });
    return;
  }

  const ev = task.taskEvidence;

  // Build a sequenced replay narrative
  const sequence: Array<{ step: string; present: boolean; summary: string; detail?: unknown }> = [];

  // Step 1: Route
  sequence.push({
    step: "route",
    present: true,
    summary: `Routed as "${ev.routeProfile.category}" — ${ev.routeProfile.maxSteps} steps max, ` +
      `${ev.routeProfile.maxFileReads} reads, ${ev.routeProfile.maxFileWrites} writes, ` +
      `planning=${ev.routeProfile.planningPhase}, verifyRequired=${ev.routeProfile.requiresVerify}`,
    detail: ev.routeProfile,
  });

  // Step 2: Plan
  sequence.push({
    step: "plan",
    present: ev.planData !== null,
    summary: ev.planData
      ? `Plan: "${ev.planData.goal}" — approach: ${ev.planData.approach.slice(0, 120)}${ev.planData.approach.length > 120 ? "…" : ""}`
      : "No planning phase ran for this task class (plan evidence not captured)",
    detail: ev.planData ?? undefined,
  });

  // Step 3: Execution
  const execEv = ev.executionSummary;
  sequence.push({
    step: "execution",
    present: execEv !== null,
    summary: execEv
      ? `Executed ${execEv.stepsUsed}/${execEv.stepsMax} steps — ` +
        `${execEv.readsUsed} reads, ${execEv.writesUsed} writes, ${execEv.commandsUsed} commands — ` +
        `phase: ${execEv.finalPhase} — exit: ${execEv.exitReason ?? "unknown"}`
      : "No execution summary captured (conversational task or early failure before run state)",
    detail: execEv ?? undefined,
  });

  // Step 4: Checkpoint
  sequence.push({
    step: "checkpoint",
    present: ev.checkpointSummary !== null,
    summary: ev.checkpointSummary
      ? `${ev.checkpointSummary.fileCount} file${ev.checkpointSummary.fileCount !== 1 ? "s" : ""} staged — ` +
        ev.checkpointSummary.files.join(", ")
      : "No files staged (no write operations, or checkpoint not reached)",
    detail: ev.checkpointSummary ?? undefined,
  });

  // Step 5: Verification quality
  sequence.push({
    step: "verification",
    present: execEv?.verificationQuality !== undefined,
    summary: execEv
      ? `Verification quality: ${execEv.verificationQuality} — ${execEv.proofStatement}`
      : "No verification quality captured",
    detail: execEv
      ? {
          quality: execEv.verificationQuality,
          proofStatement: execEv.proofStatement,
          runtimeEvidence: execEv.runtimeEvidence,
        }
      : undefined,
  });

  const replayChain = task.continuationChain ?? null;
  const replayContinuationLineage: ContinuationLineage | null = replayChain
    ? {
        isContinuation:       true,
        parentTaskId:         replayChain.parentTaskId,
        originCheckpointId:   replayChain.originCheckpointId,
        ancestryDepth:        replayChain.ancestryDepth,
        whatRemainedAtResume: replayChain.whatRemainedAtResume,
      }
    : null;

  res.json({
    taskId,
    prompt: task.prompt,
    status: task.status,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    durationMs: task.durationMs,
    // Clearly stated retention boundary
    retentionPolicy: {
      persisted: [
        "routeProfile — routing decision (category, step budget, capability flags)",
        "planData — structured execution plan from planning phase (nullable)",
        "checkpointSummary — file manifest from latest checkpoint event (nullable)",
        "executionSummary — step telemetry, verification quality, proof statement, gate triggers, runtime port evidence",
      ],
      notPersisted: [
        "events[] — full event stream (too large; live-session memory only; empty for hydrated tasks)",
      ],
    },
    replay: sequence,
    rawEvidence: ev,
    ...(replayContinuationLineage ? { continuationLineage: replayContinuationLineage } : {}),
  });
});

// ─── Action-level execution records endpoint ───────────────────────────────────
//
// Returns the ordered list of ActionRecords accumulated by the ActionStore for
// a given task run. Records are in-memory only (current process lifetime).
//
// 404 — task not found (prevents enumeration of arbitrary task IDs)
// 200 with actions=[]  — task found but no actions recorded yet (e.g. still initializing,
//                        conversational bypass, or records cleared)
// 200 with actions=[…] — structured action records with lifecycle fields, timestamps,
//                        operation metadata, and outcome

router.get("/agent/runs/:taskId/actions", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  const actions = actionStore.getActions(taskId);
  res.json({ taskId, count: actions.length, actions });
});

router.post("/agent/tasks/:taskId/cancel", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  if (task.status !== "running") {
    const hint = task.status === "cancelled"
      ? "Task was already cancelled."
      : task.status === "interrupted"
        ? "Task was interrupted by a server restart."
        : task.status === "stalled"
          ? "Task stalled (step budget exhausted) — it is no longer running."
          : `Task is not running (status: ${task.status}).`;
    res.status(400).json({
      error: "not_running",
      message: hint,
    });
    return;
  }

  const cancelled = cancelTask(taskId);
  if (cancelled) {
    broadcastTaskUpdate(task);
    res.json({ success: true, message: "Task cancellation requested" });
  } else {
    res.status(400).json({ error: "cancel_failed", message: "Could not cancel task" });
  }
});

// ─── Pause / Resume endpoints ─────────────────────────────────────────────────
//
// POST /agent/tasks/:id/pause   — set paused=true on the live RunState;
//                                 the agent loop will stop at the next safe
//                                 inter-step boundary and spin-wait.
// POST /agent/tasks/:id/resume  — clear paused flag; the agent loop resumes.
// POST /agent/tasks/:id/proceed-as-partial — only accepted when phase==="blocked";
//                                 sets partialProceed=true so the loop calls done
//                                 with final_status "partial" on the next boundary.

router.post("/agent/tasks/:taskId/pause", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) { res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` }); return; }
  if (task.status !== "running") {
    res.status(400).json({ error: "not_running", message: `Task is not running (status: ${task.status})` });
    return;
  }
  const state = getActiveRunState(taskId);
  if (!state) { res.status(409).json({ error: "no_run_state", message: "Run state not available for this task" }); return; }
  state.paused = true;
  state.interventionKind = "pause";
  broadcastLivePhase(
    taskId, state.phase, state.step, state.maxSteps,
    state.unverifiedWrites.size, state.consecutiveFailures,
    state.phase === "executing" || state.phase === "verifying" || state.phase === "repairing",
    state.interventionKind,
    state.blockedContext ?? null,
    Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null,
    state.verificationQuality ?? null,
  );
  res.json({ success: true, paused: true, message: "Task paused — will halt at next inter-step boundary" });
});

router.post("/agent/tasks/:taskId/resume", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) { res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` }); return; }
  if (task.status !== "running") {
    res.status(400).json({ error: "not_running", message: `Task is not running (status: ${task.status})` });
    return;
  }
  const state = getActiveRunState(taskId);
  if (!state) { res.status(409).json({ error: "no_run_state", message: "Run state not available for this task" }); return; }
  state.paused = false;
  if (state.interventionKind === "pause") state.interventionKind = null;
  broadcastLivePhase(
    taskId, state.phase, state.step, state.maxSteps,
    state.unverifiedWrites.size, state.consecutiveFailures,
    state.phase === "executing" || state.phase === "verifying" || state.phase === "repairing",
    state.interventionKind,
    state.blockedContext ?? null,
    Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null,
    state.verificationQuality ?? null,
  );
  res.json({ success: true, paused: false, message: "Task resumed" });
});

router.post("/agent/tasks/:taskId/proceed-as-partial", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) { res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` }); return; }
  if (task.status !== "running") {
    res.status(400).json({ error: "not_running", message: `Task is not running (status: ${task.status})` });
    return;
  }
  const state = getActiveRunState(taskId);
  if (!state) { res.status(409).json({ error: "no_run_state", message: "Run state not available for this task" }); return; }
  if (state.phase !== "blocked") {
    res.status(400).json({
      error: "not_blocked",
      message: `proceed-as-partial is only accepted when task phase is 'blocked' (current: ${state.phase})`,
    });
    return;
  }
  state.partialProceed = true;
  state.interventionKind = "partial_proceed";
  // Ensure the loop is not paused (it needs to run to process partialProceed)
  state.paused = false;
  broadcastLivePhase(
    taskId, state.phase, state.step, state.maxSteps,
    state.unverifiedWrites.size, state.consecutiveFailures,
    false,
    state.interventionKind,
    state.blockedContext ?? null,
    Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null,
    state.verificationQuality ?? null,
  );
  res.json({ success: true, message: "Proceed-as-partial accepted — task will complete with final_status 'partial'" });
});

// ─── task-9: Approval gate endpoints ─────────────────────────────────────────
//
// POST /agent/tasks/:taskId/register-gate
//   Register an approval gate that will be raised by the agent loop at a step boundary.
//   Body: { id: string; description: string; laneIds?: string[]; triggerAtStep?: number }
//   - triggerAtStep: raise the gate when step >= triggerAtStep (default: next step boundary)
//
// POST /agent/tasks/:taskId/approve
//   Approve a pending gate → the agent loop resumes normally.
//   Body: { checkpointId?: string; note?: string }
//
// POST /agent/tasks/:taskId/deny
//   Deny a pending gate → the run is halted with approval_denied phase.
//   Body: { checkpointId?: string; note?: string }
//
// POST /agent/tasks/:taskId/approve-selective
//   Partial approval: some lanes proceed, others are blocked.
//   Body: { checkpointId?: string; approvedLaneIds: string[]; note?: string }

router.post("/agent/tasks/:taskId/register-gate", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) { res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` }); return; }
  if (task.status !== "running") {
    res.status(400).json({ error: "not_running", message: `Task is not running (status: ${task.status})` });
    return;
  }
  const state = getActiveRunState(taskId);
  if (!state) { res.status(409).json({ error: "no_run_state", message: "Run state not available for this task" }); return; }

  const { id, description, laneIds, triggerAtStep } = req.body as {
    id?: string;
    description?: string;
    laneIds?: string[];
    triggerAtStep?: number;
  };

  if (!id || typeof id !== "string" || !id.trim()) {
    res.status(400).json({ error: "missing_id", message: "id is required and must be a non-empty string" });
    return;
  }
  if (!description || typeof description !== "string" || !description.trim()) {
    res.status(400).json({ error: "missing_description", message: "description is required and must be a non-empty string" });
    return;
  }
  // Check for duplicate gate ID
  if (state.approvalGates.some(g => g.id === id)) {
    res.status(409).json({ error: "duplicate_gate", message: `A gate with id '${id}' is already registered` });
    return;
  }

  // Validate laneIds format at registration time — they must use the canonical "lane-N" form
  // emitted by the parallel dispatcher. Catching this early prevents silent mismatches later.
  if (Array.isArray(laneIds) && laneIds.length > 0) {
    const invalidLaneIds = laneIds.filter(lid => !/^lane-\d+$/.test(lid));
    if (invalidLaneIds.length > 0) {
      res.status(400).json({
        error: "invalid_lane_id_format",
        message: `laneIds contains IDs that don't match the 'lane-N' format: ${invalidLaneIds.join(", ")}. Use lane IDs as generated by the parallel dispatcher (e.g. 'lane-0', 'lane-1').`,
      });
      return;
    }
  }

  const gate: import("../lib/orchestrator/types.js").ApprovalGate = {
    id,
    description,
    status: "pending",
    laneIds: Array.isArray(laneIds) ? laneIds : undefined,
    triggerAtStep: typeof triggerAtStep === "number" ? triggerAtStep : undefined,
  };
  state.approvalGates.push(gate);

  broadcastLivePhase(taskId, state.phase, state.step, state.maxSteps, state.unverifiedWrites.size, state.consecutiveFailures, false, state.interventionKind, state.blockedContext ?? null, Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null, state.verificationQuality ?? null);
  res.json({ success: true, gateId: id, message: `Approval gate '${id}' registered — will be raised at next step boundary` });
});

router.post("/agent/tasks/:taskId/approve", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) { res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` }); return; }
  if (task.status !== "running") {
    res.status(400).json({ error: "not_running", message: `Task is not running (status: ${task.status})` });
    return;
  }
  const state = getActiveRunState(taskId);
  if (!state) { res.status(409).json({ error: "no_run_state", message: "Run state not available for this task" }); return; }
  if (state.awaitingApproval === null) {
    res.status(400).json({ error: "not_awaiting_approval", message: "Task is not currently awaiting approval" });
    return;
  }
  const { checkpointId, note } = req.body as { checkpointId?: string; note?: string };
  // Always resolve against the currently awaited gate — state.awaitingApproval is the canonical
  // active gate ID. If a checkpointId is provided, it must match; otherwise reject to prevent
  // approving a future gate while the active gate remains pending.
  const activeGateId = state.awaitingApproval!;
  if (checkpointId && checkpointId !== activeGateId) {
    res.status(409).json({
      error: "gate_conflict",
      message: `Cannot approve gate '${checkpointId}': the currently awaited gate is '${activeGateId}'. Approve the active gate first.`,
      activeGateId,
    });
    return;
  }
  const gate = state.approvalGates.find(g => g.id === activeGateId && g.status === "pending");
  if (!gate) {
    res.status(400).json({ error: "gate_not_found", message: `Active gate '${activeGateId}' not found in pending gates` });
    return;
  }
  gate.status = "approved";
  gate.decidedAt = new Date().toISOString();
  const decision = { checkpointId: gate.id, decision: "approved" as const, decidedAt: gate.decidedAt, note };
  state.approvalDecisions.push(decision);
  state.awaitingApproval = null;
  state.interventionKind = null;   // Clear approval-wait intervention — run is resuming
  // Keep phase as executing (approval clears the gate) and record the transition in history
  if (state.phase === "awaiting_approval" || state.phase === "approval_denied") {
    recordPhaseTransition(state, "executing");
  }
  actionStore.recordApprovalDecision(taskId, gate.id, "approved", undefined, note);
  broadcastLivePhase(taskId, state.phase, state.step, state.maxSteps, state.unverifiedWrites.size, state.consecutiveFailures, false, state.interventionKind, state.blockedContext ?? null, Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null, state.verificationQuality ?? null);
  res.json({ success: true, checkpointId: gate.id, message: "Approval granted — task will continue" });
});

router.post("/agent/tasks/:taskId/deny", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) { res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` }); return; }
  if (task.status !== "running") {
    res.status(400).json({ error: "not_running", message: `Task is not running (status: ${task.status})` });
    return;
  }
  const state = getActiveRunState(taskId);
  if (!state) { res.status(409).json({ error: "no_run_state", message: "Run state not available for this task" }); return; }
  if (state.awaitingApproval === null) {
    res.status(400).json({ error: "not_awaiting_approval", message: "Task is not currently awaiting approval" });
    return;
  }
  const { checkpointId, note } = req.body as { checkpointId?: string; note?: string };
  // Resolve against the canonical active gate — same contract as /approve
  const denyActiveGateId = state.awaitingApproval!;
  if (checkpointId && checkpointId !== denyActiveGateId) {
    res.status(409).json({
      error: "gate_conflict",
      message: `Cannot deny gate '${checkpointId}': the currently awaited gate is '${denyActiveGateId}'. Deny the active gate first.`,
      activeGateId: denyActiveGateId,
    });
    return;
  }
  const gate = state.approvalGates.find(g => g.id === denyActiveGateId && g.status === "pending");
  if (!gate) {
    res.status(400).json({ error: "gate_not_found", message: `Active gate '${denyActiveGateId}' not found in pending gates` });
    return;
  }
  gate.status = "denied";
  gate.decidedAt = new Date().toISOString();
  const decision = { checkpointId: gate.id, decision: "denied" as const, decidedAt: gate.decidedAt, note };
  state.approvalDecisions.push(decision);
  state.awaitingApproval = null;
  state.interventionKind = null;   // Clear approval-wait intervention before broadcasting denial
  recordPhaseTransition(state, "approval_denied");   // Record in phase timeline history
  actionStore.recordApprovalDecision(taskId, gate.id, "denied", undefined, note);
  // The loop will call emitPhaseTransition("approval_denied") after the spin-wait detects the denial.
  // Here we broadcast so the frontend immediately reflects the denial without waiting for the loop.
  broadcastLivePhase(taskId, "approval_denied", state.step, state.maxSteps, state.unverifiedWrites.size, state.consecutiveFailures, false, state.interventionKind, state.blockedContext ?? null, Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null, state.verificationQuality ?? null);
  res.json({ success: true, checkpointId: gate.id, message: "Approval denied — task will stop at this gate" });
});

router.post("/agent/tasks/:taskId/approve-selective", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) { res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` }); return; }
  if (task.status !== "running") {
    res.status(400).json({ error: "not_running", message: `Task is not running (status: ${task.status})` });
    return;
  }
  const state = getActiveRunState(taskId);
  if (!state) { res.status(409).json({ error: "no_run_state", message: "Run state not available for this task" }); return; }
  if (state.awaitingApproval === null) {
    res.status(400).json({ error: "not_awaiting_approval", message: "Task is not currently awaiting approval" });
    return;
  }
  const { checkpointId, approvedLaneIds, note } = req.body as { checkpointId?: string; approvedLaneIds?: string[]; note?: string };
  if (!Array.isArray(approvedLaneIds) || approvedLaneIds.length === 0) {
    res.status(400).json({ error: "missing_lanes", message: "approvedLaneIds must be a non-empty array of lane IDs" });
    return;
  }
  // Resolve against the canonical active gate — same contract as /approve and /deny
  const selectiveActiveGateId = state.awaitingApproval!;
  if (checkpointId && checkpointId !== selectiveActiveGateId) {
    res.status(409).json({
      error: "gate_conflict",
      message: `Cannot selectively approve gate '${checkpointId}': the currently awaited gate is '${selectiveActiveGateId}'. Act on the active gate first.`,
      activeGateId: selectiveActiveGateId,
    });
    return;
  }
  const gate = state.approvalGates.find(g => g.id === selectiveActiveGateId && g.status === "pending");
  if (!gate) {
    res.status(400).json({ error: "gate_not_found", message: `Active gate '${selectiveActiveGateId}' not found in pending gates` });
    return;
  }
  // Selective approval requires the gate to declare a lane scope. Without lane scope
  // there is no enforceable isolation contract — use the regular /approve endpoint instead.
  if (!gate.laneIds || gate.laneIds.length === 0) {
    res.status(422).json({
      error: "gate_has_no_lane_scope",
      message: `Gate '${gate.id}' has no lane scope declared (gate.laneIds is empty). Selective approval cannot be safely enforced without a declared lane set. Use POST /approve to approve the full gate instead, or re-register the gate with laneIds to enable selective approval.`,
    });
    return;
  }
  // Validate that all lane IDs in the gate and in approvedLaneIds use the canonical "lane-N" format.
  // The dispatcher generates lanes as "lane-0", "lane-1", etc. — any other format can't map to a real slot.
  const LANE_ID_RE = /^lane-\d+$/;
  const malformedGateLanes = gate.laneIds.filter(lid => !LANE_ID_RE.test(lid));
  if (malformedGateLanes.length > 0) {
    res.status(422).json({
      error: "invalid_lane_id_format",
      message: `Gate '${gate.id}' contains lane IDs that don't match the 'lane-N' format: ${malformedGateLanes.join(", ")}. Re-register the gate using the lane IDs emitted by the dispatcher (e.g. 'lane-0').`,
    });
    return;
  }
  const malformedApprovedLanes = approvedLaneIds.filter(lid => !LANE_ID_RE.test(lid));
  if (malformedApprovedLanes.length > 0) {
    res.status(422).json({
      error: "invalid_lane_id_format",
      message: `approvedLaneIds contains invalid lane ID formats: ${malformedApprovedLanes.join(", ")}. Use 'lane-N' format as emitted by the dispatcher.`,
    });
    return;
  }
  // Validate that all approvedLaneIds are within the gate's declared lane scope
  const unknownLanes = approvedLaneIds.filter(lid => !gate.laneIds!.includes(lid));
  if (unknownLanes.length > 0) {
    res.status(422).json({
      error: "unknown_lane_ids",
      message: `The following approvedLaneIds are not in the gate's declared lane scope: ${unknownLanes.join(", ")}. Gate scope: ${gate.laneIds.join(", ")}.`,
    });
    return;
  }
  // Compute which lanes are NOT in approvedLaneIds and block them
  const blockedLaneIds = gate.laneIds.filter(lid => !approvedLaneIds.includes(lid));
  // Validate isolation/dependency safety against the real dispatch graph.
  // Use the gate's own dispatch plan snapshot (captured at gate-raise time) so approval
  // decisions work even after parallelDispatcher has cleared lastDispatchPlan.
  if (blockedLaneIds.length > 0) {
    const planForSafety = gate.dispatchPlanSnapshot ?? state.lastDispatchPlan;
    if (planForSafety.size === 0) {
      // No dispatch plan available at all — cannot verify dependency isolation.
      res.status(422).json({
        error: "lane_steering_unsafe",
        message: "Cannot verify selective approval safety: no dispatch plan is available. Approve or deny the full gate.",
      });
      return;
    }
    const safetyCheck = validateSelectiveSafety(approvedLaneIds, blockedLaneIds, planForSafety);
    if (!safetyCheck.safe) {
      res.status(422).json({
        error: safetyCheck.code,
        message: safetyCheck.reason,
        unsafeLanes: safetyCheck.unsafeLanes,
      });
      return;
    }
  }
  gate.status = "approved";
  gate.decidedAt = new Date().toISOString();
  const decision = { checkpointId: gate.id, decision: "selective" as const, approvedLaneIds, decidedAt: gate.decidedAt, note };
  state.approvalDecisions.push(decision);
  state.selectivelyBlockedLaneIds = new Set(blockedLaneIds);
  if (blockedLaneIds.length > 0) state.hadSelectiveBlock = true;
  state.awaitingApproval = null;
  state.interventionKind = null;   // Clear approval-wait intervention — run is resuming (possibly with blocked lanes)
  // Record the phase transition in history before broadcasting
  const selectiveNextPhase = blockedLaneIds.length > 0 ? "selectively_blocked" as const : "executing" as const;
  recordPhaseTransition(state, selectiveNextPhase);
  actionStore.recordApprovalDecision(taskId, gate.id, "selective", approvedLaneIds, note);
  broadcastLivePhase(taskId, state.phase, state.step, state.maxSteps, state.unverifiedWrites.size, state.consecutiveFailures, false, state.interventionKind, state.blockedContext ?? null, Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null, state.verificationQuality ?? null);
  res.json({ success: true, checkpointId: gate.id, approvedLaneIds, blockedLaneIds, message: `Selective approval — ${approvedLaneIds.length} lane(s) approved, ${blockedLaneIds.length} blocked` });
});

// ─── task-9: Lane steering endpoints ─────────────────────────────────────────
//
// POST /agent/tasks/:taskId/lanes/:laneId/pause    — pause a specific lane
// POST /agent/tasks/:taskId/lanes/:laneId/cancel   — cancel a specific lane
// POST /agent/tasks/:taskId/lanes/:laneId/proceed  — clear any signal, let the lane run
// Body (all): { reason?: string }

function handleLaneSteering(signal: "paused" | "cancelled" | "proceed") {
  return (req: import("express").Request, res: import("express").Response): void => {
    const { taskId, laneId } = req.params as { taskId: string; laneId: string };
    const task = getTask(taskId);
    if (!task) { res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` }); return; }
    if (task.status !== "running") {
      res.status(400).json({ error: "not_running", message: `Task is not running (status: ${task.status})` });
      return;
    }
    const state = getActiveRunState(taskId);
    if (!state) { res.status(409).json({ error: "no_run_state", message: "Run state not available for this task" }); return; }

    const { reason } = req.body as { reason?: string };

    // Lane IDs emitted by the dispatcher are always "lane-N" (e.g. "lane-0", "lane-2").
    // Reject anything that doesn't match this format — it won't map to a real dispatch slot.
    if (!/^lane-\d+$/.test(laneId)) {
      res.status(400).json({
        error: "invalid_lane_id",
        message: `Lane ID '${laneId}' is not a valid format. Lane IDs are generated by the dispatcher as 'lane-N' (e.g. 'lane-0'). Check the active dispatch plan for valid lane IDs.`,
      });
      return;
    }

    // Validate the lane exists in the current or most recent dispatch wave.
    // If the lane is not in lastDispatchPlan AND not in laneControlSignals (no prior signal),
    // reject the signal — applying it to an unknown lane is unsafe and produces no effect.
    // Exception: "proceed" on a known signal can always clear an existing signal safely.
    const isKnownInPlan    = state.lastDispatchPlan.has(laneId);
    const hasExistingSignal = state.laneControlSignals.has(laneId);
    if (!isKnownInPlan && !hasExistingSignal) {
      res.status(409).json({
        error: "lane_steering_unsafe",
        message: `Lane '${laneId}' is not in the active dispatch plan and has no existing signal. Steering an unknown lane would have no effect and cannot be safely applied. Valid lanes: ${[...state.lastDispatchPlan.keys()].join(", ") || "none (dispatch not yet started)"}`,
      });
      return;
    }

    const validation = validateLaneSteering(laneId, signal, state);
    if (!validation.safe) {
      res.status(409).json({ error: "lane_steering_unsafe", message: validation.reason });
      return;
    }

    if (signal === "proceed") {
      state.laneControlSignals.delete(laneId);
      state.selectivelyBlockedLaneIds.delete(laneId);
      // hadSelectiveBlock is immutable once set — outcome classification persists
      // regardless of whether lanes are later unblocked via proceed.
    } else {
      state.laneControlSignals.set(laneId, signal);
    }

    actionStore.recordLaneSteered(taskId, laneId, signal, reason);
    broadcastLivePhase(taskId, state.phase, state.step, state.maxSteps, state.unverifiedWrites.size, state.consecutiveFailures, false, state.interventionKind, state.blockedContext ?? null, Object.keys(state.gateCounts).length > 0 ? state.gateCounts : null, state.verificationQuality ?? null);
    res.json({ success: true, laneId, signal, message: `Lane ${laneId} → ${signal}` });
  };
}

router.post("/agent/tasks/:taskId/lanes/:laneId/pause",   handleLaneSteering("paused"));
router.post("/agent/tasks/:taskId/lanes/:laneId/cancel",  handleLaneSteering("cancelled"));
router.post("/agent/tasks/:taskId/lanes/:laneId/proceed", handleLaneSteering("proceed"));

// ─── task-9: Step override endpoint ──────────────────────────────────────────
//
// POST /agent/tasks/:taskId/steps/:stepId/override
//   Apply a bounded override to a specific pending step.
//   Body: { kind: "skip" | "deny" | "substitute"; substituteWith?: string; note?: string }
//   Bounded semantics:
//   - "skip"       → mark step as bypassed (not executed), loop continues
//   - "deny"       → mark step as denied (execution refused), error emitted
//   - "substitute" → replace step output with operator-supplied string

router.post("/agent/tasks/:taskId/steps/:stepId/override", (req, res) => {
  const { taskId, stepId } = req.params as { taskId: string; stepId: string };
  const task = getTask(taskId);
  if (!task) { res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` }); return; }
  if (task.status !== "running") {
    res.status(400).json({ error: "not_running", message: `Task is not running (status: ${task.status})` });
    return;
  }
  const state = getActiveRunState(taskId);
  if (!state) { res.status(409).json({ error: "no_run_state", message: "Run state not available for this task" }); return; }

  const { kind, substituteWith, note } = req.body as { kind?: string; substituteWith?: string; note?: string };
  if (!kind || !["skip", "deny", "substitute"].includes(kind)) {
    res.status(400).json({ error: "invalid_kind", message: "kind must be one of: skip, deny, substitute" });
    return;
  }
  if (kind === "substitute" && (typeof substituteWith !== "string" || !substituteWith.trim())) {
    res.status(400).json({ error: "missing_substitute", message: "substituteWith is required for substitute overrides" });
    return;
  }

  // Validate stepId format: reject empty and bare action-type names.
  if (!stepId || !stepId.trim()) {
    res.status(400).json({
      error: "invalid_step_id",
      message: "stepId must be 'step:N' (positional), a file path, or a command string. Empty stepId is not accepted.",
    });
    return;
  }
  const BARE_ACTION_TYPE_RE = /^(write_file|read_file|run_command|run_shell|think|done|list_dir|inspect|verify)$/;
  if (BARE_ACTION_TYPE_RE.test(stepId.trim())) {
    res.status(400).json({
      error: "invalid_step_id",
      message: `stepId '${stepId}' is a bare action type name and would match all steps of that type. Use 'step:N', a file path, or a command string.`,
    });
    return;
  }

  const overrideKind = kind as "skip" | "deny" | "substitute";
  const override = {
    stepId,
    kind: overrideKind,
    substituteWith: overrideKind === "substitute" ? substituteWith : undefined,
    note,
    registeredAt: new Date().toISOString(),
  };
  state.operatorOverrides.set(stepId, override);
  // Note: appliedOverrides and the OPERATOR_OVERRIDE action record are populated
  // in the agent loop WHEN the override is consumed (at execution boundary), not here.
  res.json({
    success: true,
    stepId,
    kind: overrideKind,
    message: `Override registered for step '${stepId}': ${overrideKind}${note ? ` — ${note}` : ""} — will take effect at the next matching step boundary`,
  });
});

router.delete("/agent/tasks/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  if (task.status === "running") {
    res.status(400).json({
      error: "still_running",
      message: "Cannot delete a running task. Cancel it first.",
    });
    return;
  }

  const deleted = deleteTask(taskId);
  if (deleted) {
    res.json({ success: true, message: `Task ${taskId} deleted` });
  } else {
    res.status(500).json({ error: "delete_failed", message: "Could not delete task" });
  }
});

// ─── Provider capability surface ─────────────────────────────────────────────
//
// Returns a provider-agnostic view of what the current AI configuration
// supports.  Used by the frontend and operator tooling for honest capability
// reporting — no guessing, no fake feature flags.

router.get("/agent/capabilities", (_req, res) => {
  const hasZai    = !!process.env["ZAI_API_KEY"];
  const hasReplit = !!process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const provider  = hasZai ? "zai" : hasReplit ? "replit" : "none";

  const model         = getModelProvider(getSettings().activeProvider);
  const visualCap     = model.getVisualTaskCapability();

  const agenticChain = hasZai
    ? getFallbackChain("agentic").map((c) => `${c.modelId} (${c.lane})`)
    : ["gpt-5.2 (replit-openai)"];

  res.json({
    provider,
    agentic: {
      available:     provider !== "none",
      primaryModel:  hasZai ? "glm-5.1" : hasReplit ? "gpt-5.2" : null,
      fallbackChain: agenticChain,
    },
    vision: {
      // Populated entirely from the provider's VisualTaskCapability descriptor.
      // No hardcoded values here — adding a new provider just requires
      // implementing getVisualTaskCapability() in its ModelProvider class.
      capable:             visualCap.capable,
      primaryModel:        visualCap.primaryVisionModel,
      modelChain:          visualCap.visionModelChain,
      runtimeStatus:       "unknown",  // tested at call time, not at boot
      maxImagesPerRequest: visualCap.maxImagesPerRequest,
      maxImageSizeBytes:   visualCap.maxImageSizeBytes,
      note:                visualCap.note,
    },
    multimodal: {
      imageIntake:      true,                // UI + backend validated image submission
      visionAnalysis:   visualCap.capable,   // two-phase: vision model → text → coding agent
      codeAwareBridge:  true,                // visual debug file scan + protocol injected on success
      mcpEnrichment:    false,               // not yet wired (no MCP servers configured)
    },
  });
});

// ─── Live run state ────────────────────────────────────────────────────────────
// Polling REST endpoint returning the most recent RunState snapshot for an
// in-flight task.  Returns 404 if the task has no live state (not running or
// has already completed).

router.get("/agent/tasks/:taskId/live-state", (req, res): void => {
  const { taskId } = req.params;
  const snapshot = getLiveRunState(taskId);
  if (!snapshot) {
    // Not running — return structured not_running payload with task status if available
    const task = getTask(taskId);
    res.json({
      taskId,
      running: false,
      status:     task?.status ?? null,
      exitReason: task?.taskEvidence?.executionSummary?.exitReason ?? null,
    });
    return;
  }
  res.json({ taskId, running: true, ...snapshot });
});

// ─── Recovery Assessment endpoint ─────────────────────────────────────────────
//
// GET /agent/tasks/:id/recovery-options
// Returns a RecoveryAssessment derived entirely from persisted task state.
// No fabrication — all fields are derived from real evidence.
//
// outcomeClass values:
//   clean_done                — agent completed with final_status "complete" and exit clean_done
//   partial                   — final_status "partial" with remaining work described
//   blocked                   — final_status "blocked" awaiting operator input
//   verification_limited      — completed but verification quality below command_success
//   runtime_stale_after_apply — checkpoint applied with runtime-impacting files
//   cancelled_with_progress   — cancelled while files were written
//   interrupted_with_progress — interrupted mid-run with files written
//   step_budget_exhausted     — ran out of steps (exitReason "step_budget")
//   error_no_recovery         — unrecoverable error, no meaningful evidence

type OutcomeClass =
  | "clean_done"
  | "partial"
  | "blocked"
  | "verification_limited"
  | "runtime_stale_after_apply"
  | "cancelled_with_progress"
  | "interrupted_with_progress"
  | "step_budget_exhausted"
  | "approval_denied"
  | "selectively_blocked"
  | "operator_overridden"
  | "error_no_recovery";

interface RecoveryAffordance {
  kind:              "retry_verification" | "continue_partial" | "recheck_runtime" | "resubmit_after_denial" | "bypass_gate_continue" | "view_approval_checkpoint";
  label:             string;
  description:       string;
  endpoint:          string;
  httpMethod?:       "GET" | "POST";
  available:         boolean;
  unavailableReason?: string;
}

interface RecoveryAssessment {
  taskId:       string;
  outcomeClass: OutcomeClass;
  whatHappened: string;
  whatRemains:  string | null;
  affordances:  RecoveryAffordance[];
}

function buildRecoveryAssessment(taskId: string): RecoveryAssessment | null {
  const task = getTask(taskId);
  if (!task) return null;

  // Must be a terminal task
  const TERMINAL = new Set(["done", "error", "cancelled", "interrupted", "stalled"]);
  if (!TERMINAL.has(task.status)) return null;

  const ev  = task.taskEvidence;
  const exec = ev?.executionSummary ?? null;
  const ckpt = ev?.checkpointSummary ?? null;
  const comp = task.completion ?? null;

  const exitReason         = exec?.exitReason ?? null;
  const finalStatus        = comp?.final_status ?? null;
  const verificationQuality = exec?.verificationQuality ?? "none";
  // filesWritten: prefer checkpoint fileCount (staged files), fall back to executionSummary.writesUsed
  // (tracks all writes via runState even when no checkpoint was emitted before cancellation/interruption).
  const filesWritten       = ckpt?.fileCount ?? exec?.writesUsed ?? 0;
  const gateTriggers       = exec?.gateTriggers ?? {};

  // ── Read cancelled drain evidence from in-memory events when available ─────
  // task.events is in-memory only (300-event cap). For cancelled tasks the cancelled event is
  // typically still present because cancellation is the last thing emitted before the task
  // terminates — so this is a reliable source of high-fidelity drain data.
  const cancelledEvent = task.status === "cancelled"
    ? [...task.events].reverse().find(e => e.type === "cancelled")
    : undefined;
  const drainData = cancelledEvent?.data as Record<string, unknown> | undefined;
  const drainFilesWritten: string[] = Array.isArray(drainData?.["filesWritten"])
    ? (drainData!["filesWritten"] as unknown[]).map(String)
    : [];
  const drainUnverifiedFiles: string[] = Array.isArray(drainData?.["unverifiedFiles"])
    ? (drainData!["unverifiedFiles"] as unknown[]).map(String)
    : [];
  const drainPhaseAtCancellation: string | null = typeof drainData?.["phaseAtCancellation"] === "string"
    ? drainData!["phaseAtCancellation"] as string
    : null;
  const drainStepsUsed: number | null = typeof drainData?.["stepsUsed"] === "number"
    ? drainData!["stepsUsed"] as number
    : (typeof drainData?.["step"] === "number" ? drainData!["step"] as number : null);

  // filesWrittenCount: use drain event data when available (more precise: reflects all written files
  // even if no checkpoint was emitted). Fall back to checkpoint + executionSummary.
  const filesWrittenCount = drainFilesWritten.length > 0
    ? drainFilesWritten.length
    : filesWritten;

  // ── Determine outcome class ────────────────────────────────────────────────
  let outcomeClass: OutcomeClass;
  let whatHappened: string;
  let whatRemains: string | null = null;

  if (task.status === "cancelled") {
    if (filesWrittenCount > 0) {
      outcomeClass = "cancelled_with_progress";
      const phaseStr = drainPhaseAtCancellation ? ` during ${drainPhaseAtCancellation} phase` : "";
      const stepsStr = drainStepsUsed != null ? ` after ${drainStepsUsed} step${drainStepsUsed !== 1 ? "s" : ""}` : "";
      const unverifiedStr = drainUnverifiedFiles.length > 0 ? ` (${drainUnverifiedFiles.length} unverified)` : "";
      whatHappened = `Task was cancelled${stepsStr}${phaseStr}. ${filesWrittenCount} file${filesWrittenCount !== 1 ? "s" : ""} had been written${unverifiedStr} before cancellation.`;
      whatRemains  = "Staged changes can be discarded or reviewed. The original task remains incomplete.";
    } else {
      outcomeClass = "error_no_recovery";
      whatHappened = "Task was cancelled before any files were written.";
    }
  } else if (task.status === "interrupted") {
    if (filesWritten > 0) {
      outcomeClass = "interrupted_with_progress";
      whatHappened = `Task was interrupted by a server restart. ${filesWritten} file${filesWritten !== 1 ? "s" : ""} had been staged before interruption.`;
      whatRemains  = "Staged changes may be incomplete. Consider retrying the task from the beginning or inspecting the checkpoint.";
    } else {
      outcomeClass = "interrupted_with_progress";
      whatHappened = "Task was interrupted by a server restart before completion.";
      whatRemains  = "The task did not complete. Retry the original task.";
    }
  } else if (task.status === "error") {
    outcomeClass = "error_no_recovery";
    whatHappened = task.failureDetail
      ? `Task failed: ${task.failureDetail.title}. ${task.failureDetail.detail}`
      : "Task ended with an unrecoverable error.";
  } else if (exitReason === "step_budget") {
    outcomeClass = "step_budget_exhausted";
    const stepsUsed = exec?.stepsUsed ?? 0;
    const stepsMax  = exec?.stepsMax  ?? 0;
    whatHappened = `Task exhausted its step budget (${stepsUsed}/${stepsMax} steps) without calling done.`;
    whatRemains  = comp?.remaining || "Task did not complete within the allocated step budget.";
  } else if (finalStatus === "blocked") {
    outcomeClass = "blocked";
    // Map gate triggers to human-readable blocking reason
    const hasVerifGate   = (gateTriggers["verification_required"] ?? 0) > 0;
    const hasRuntimeGate = (gateTriggers["runtime_proof_required"] ?? 0) > 0;
    if (hasVerifGate) {
      whatHappened = `Task is blocked: verification was required before completion, but no substantive verification (build/test/lint) ran after the last file write. The agent called done with unverified changes.`;
    } else if (hasRuntimeGate) {
      whatHappened = `Task is blocked: runtime proof was required (port change or live server confirmation) but no port activity was observed during the run.`;
    } else {
      whatHappened = comp?.remaining
        ? `Task is blocked: ${comp.remaining}`
        : "Task reached a blocked state — the agent could not proceed without additional information or a gate condition being met.";
    }
    whatRemains = comp?.remaining || "The agent needs operator input or a precondition to be satisfied before this work can continue.";
  } else if (finalStatus === "approval_denied" || exitReason === "approval_denied") {
    outcomeClass = "approval_denied";
    const gateId = exec?.approvalGateDenied ?? null;
    whatHappened = gateId
      ? `An operator denied the approval gate '${gateId}'. The run was halted before further steps could execute.`
      : "An operator denied an approval gate checkpoint. The run was halted at the operator's request.";
    whatRemains = comp?.remaining || "The task was stopped by operator denial. Review the denial reason and re-submit if appropriate.";
  } else if (exitReason === "selectively_blocked") {
    outcomeClass = "selectively_blocked";
    whatHappened = "The operator selectively approved the run but blocked one or more parallel execution lanes. Affected lanes were cancelled before running.";
    whatRemains = "Blocked lanes did not execute. Review which lanes were cancelled and re-run the task if complete coverage is required.";
  } else if (exitReason === "operator_overridden") {
    outcomeClass = "operator_overridden";
    const appliedCount = exec?.appliedOverrideCount ?? 0;
    whatHappened = appliedCount > 0
      ? `The operator applied ${appliedCount} step override${appliedCount !== 1 ? "s" : ""} (skip/deny/substitute) during execution.`
      : "The operator applied step overrides during execution, modifying or bypassing one or more agent actions.";
    whatRemains = "Overridden steps may not have run as the agent intended. Verify the output covers all required changes.";
  } else if (finalStatus === "partial") {
    outcomeClass = "partial";
    whatHappened = `Task completed partially. Some work was done but not everything was accomplished.`;
    whatRemains  = comp?.remaining || "Remaining work was not described by the agent.";
  } else if (finalStatus === "complete" || exitReason === "clean_done") {
    // runtime_stale_after_apply: checkpoint was applied AND snapshot evidence shows stale.
    //
    // P4 stale determination — sources (in priority order):
    //   1. taskEvidence.runtimeLifecycle.isStaleAfterApply (persisted in history.json via
    //      persistTaskNow() in checkpoint apply route — survives server restart)
    //   2. liveCheckpoint.runtimeStaleAfterApply (in-memory + checkpoint-file field;
    //      set by setCheckpointRuntimeStale() — available when checkpoint is in memory
    //      and acts as a secondary source when TaskEvidence was evicted or not updated)
    //
    // NOTE: We do NOT use liveCheckpoint.status === "applied" as a prerequisite.
    // Applied checkpoints are not recovered after server restart (only "pending" ones are),
    // so gating on live status would lose stale classification after restart. Instead we
    // use the evidence fields which are persisted independently of checkpoint recovery.
    const runtimeLifecycle = ev?.runtimeLifecycle ?? null;
    const lifecycleIsStale = runtimeLifecycle?.isStaleAfterApply ?? null;

    // Secondary source: live checkpoint runtimeStaleAfterApply (in-memory)
    const liveCheckpoint = getCheckpoint(taskId);
    const checkpointStaleSignal = liveCheckpoint?.runtimeStaleAfterApply ?? null;

    // Use persisted runtimeImpactFiles from checkpoint evidence for stale message context
    const runtimeImpactFiles: string[] = ckpt?.runtimeImpactFiles ?? [];

    // Resolve stale outcome: prefer TaskEvidence lifecycle signal, fallback to checkpoint signal.
    // Neither is used without explicit evidence — null on both means insufficient data.
    const resolvedIsStale = lifecycleIsStale ?? checkpointStaleSignal;

    // Only classify as stale when evidence concretely says so (true, not null or false)
    const isStale = resolvedIsStale === true;

    if (isStale) {
      outcomeClass = "runtime_stale_after_apply";
      // Build a richer message when P4 portDiff data is available
      const portDiff = runtimeLifecycle?.portDiff;
      // When portDiff shows no change, server was not restarted — enrich the message
      const portInfo = (portDiff && !portDiff.hasChange)
        ? ` No server restart was observed (port state unchanged since task start — open: ${portDiff.unchanged.map(p => `:${p}`).join(", ") || "none"}).`
        : "";
      whatHappened = `Task completed and the checkpoint was applied to the workspace. Files that may affect the running server were changed (${runtimeImpactFiles.slice(0, 3).join(", ")}${runtimeImpactFiles.length > 3 ? "…" : ""}).${portInfo} The runtime state may not reflect the applied changes yet.`;
      whatRemains  = "Consider re-checking the runtime to confirm the server is running correctly with the new changes.";
    } else if (verificationQuality === "none" || verificationQuality === "static_only") {
      outcomeClass = "verification_limited";
      whatHappened = `Task completed but verification quality is low (${verificationQuality}). No substantive command-based verification (build/test/compile) was observed.`;
      whatRemains  = "Consider running a verification pass to confirm the changes are correct.";
    } else {
      outcomeClass = "clean_done";
      whatHappened = "Task completed successfully with verification evidence.";
    }
  } else {
    outcomeClass = "error_no_recovery";
    whatHappened = "Task ended in an unrecognised state.";
  }

  // ── Build affordances ──────────────────────────────────────────────────────

  // Affordance: retry_verification
  // Valid when:
  //   (a) blocked (any reason) AND checkpoint evidence exists with written files AND low verify quality, OR
  //   (b) step_budget_exhausted AND checkpoint evidence exists with written files AND low verify quality.
  // Requires checkpoint-grounded evidence (ckpt.fileCount > 0) — exec.writesUsed alone is not enough.
  const isLowVerifyQuality = verificationQuality !== "command_success" && verificationQuality !== "runtime_confirmed";
  const hasCheckpointEvidence = ckpt != null && ckpt.fileCount > 0;
  const canRetryVerify =
    ((outcomeClass === "blocked" || outcomeClass === "step_budget_exhausted") &&
      hasCheckpointEvidence && isLowVerifyQuality);
  const retryVerifyAffordance: RecoveryAffordance = {
    kind:        "retry_verification",
    label:       "Retry Verification",
    description: "Start a new task to verify the changes written by this task.",
    endpoint:    `/api/agent/tasks/${taskId}/retry-verification`,
    available:   canRetryVerify,
    unavailableReason: !canRetryVerify
      ? (!hasCheckpointEvidence
          ? "No checkpoint evidence with written files — nothing to verify."
          : !isLowVerifyQuality
            ? `Verification quality is already '${verificationQuality}' — retry not needed.`
            : "Verification retry is only applicable when the task was blocked or exhausted its step budget with checkpoint evidence and low verification quality.")
      : undefined,
  };

  // Affordance: continue_partial
  // Valid when: final_status is "partial" and remaining is non-empty.
  // Upgraded: when a valid pending checkpoint exists, reference the resume-from-checkpoint
  // endpoint (which provides structured continuation lineage) instead of the generic path.
  const hasRemaining = !!(comp?.remaining?.trim());
  const canContinuePartial = outcomeClass === "partial" && hasRemaining;

  // Pre-flight: advertise structured continuation only if checkpoint is valid.
  // Uses validateCheckpointForResume() as a lightweight eligibility check.
  // The actual resume call uses verifyFromCheckpoint() at the resume boundary.
  const liveCheckpointForContinue = getCheckpoint(taskId);
  let continuationCheckpointAvailable = false;
  let continuationCheckpointId: string | null = null;

  if (liveCheckpointForContinue && liveCheckpointForContinue.status === "pending" && canContinuePartial) {
    const continuationValidation = validateCheckpointForResume(task, liveCheckpointForContinue);
    if (continuationValidation.valid) {
      continuationCheckpointAvailable = true;
      continuationCheckpointId = liveCheckpointForContinue.taskId;
    }
  }

  const continuePartialAffordance: RecoveryAffordance & {
    continuationAvailable: boolean;
    continuationCheckpointId: string | null;
  } = {
    kind:                   "continue_partial",
    label:                  "Continue from Partial",
    description:            continuationCheckpointAvailable
      ? "Resume from checkpoint — starts a structured continuation run with prior state linked."
      : "Start a new task to complete the remaining work described by this task.",
    endpoint:               continuationCheckpointAvailable
      ? `/api/agent/tasks/${taskId}/resume-from-checkpoint`
      : `/api/agent/tasks/${taskId}/continue-partial`,
    available:              canContinuePartial,
    continuationAvailable:  continuationCheckpointAvailable,
    continuationCheckpointId,
    unavailableReason: !canContinuePartial
      ? (outcomeClass !== "partial"
          ? "Continue is only available for tasks that ended with partial status."
          : "No remaining work was described by the agent.")
      : undefined,
  };

  // Affordance: recheck_runtime
  // Valid when:
  //   1. Checkpoint was applied (live checkpoint store status === "applied")
  //   2. Persisted runtimeImpactFiles evidence in the checkpoint summary is non-empty.
  //      Uses the canonical classifyRuntimeImpactFiles result stored at checkpoint creation time.
  // IMPORTANT: derive checkpointApplied from the live store — frozen taskEvidence.checkpointSummary
  // is assembled at completion time (staged===true) and is never updated when apply is called.
  const liveCheckpointForRecheck = getCheckpoint(taskId);
  const checkpointAppliedForRecheck = liveCheckpointForRecheck?.status === "applied";
  const recheckRuntimeImpactFiles: string[] = ckpt?.runtimeImpactFiles ?? [];
  const canRecheckRuntime =
    checkpointAppliedForRecheck && recheckRuntimeImpactFiles.length > 0;
  const recheckRuntimeAffordance: RecoveryAffordance = {
    kind:        "recheck_runtime",
    label:       "Re-check Runtime",
    description: "Start a new task to verify the runtime state after applying changes from this task.",
    endpoint:    `/api/agent/tasks/${taskId}/recheck-runtime`,
    available:   canRecheckRuntime,
    unavailableReason: !canRecheckRuntime
      ? (!checkpointAppliedForRecheck
          ? "Checkpoint has not been applied to the workspace — apply the checkpoint first."
          : "No runtime-impacting files were identified in the checkpoint.")
      : undefined,
  };

  // Affordance: resubmit_after_denial (task-9)
  // Valid when: outcome is approval_denied — operator can resubmit the original task
  // after reviewing the denial reason. Uses continue-partial semantics (new task with same prompt).
  const canResubmit = outcomeClass === "approval_denied";
  const resubmitAffordance: RecoveryAffordance = {
    kind:        "resubmit_after_denial",
    label:       "Resubmit Task",
    description: "Resubmit the original task — use if you believe the denial was incorrect or conditions have changed.",
    endpoint:    `/api/agent/tasks/${taskId}/resubmit-after-denial`,
    available:   canResubmit,
    unavailableReason: !canResubmit
      ? "Resubmit is only available for tasks that were halted by an operator denial."
      : undefined,
  };

  // Affordance: bypass_gate_continue (task-9)
  // Valid when: outcome is selectively_blocked or operator_overridden AND a checkpoint exists
  // with written files. Allows the operator to trigger a verification-only follow-up run
  // to confirm what was completed before the override/selective-block.
  const canBypassContinue =
    (outcomeClass === "selectively_blocked" || outcomeClass === "operator_overridden")
    && hasCheckpointEvidence;
  const bypassGateContinueAffordance: RecoveryAffordance = {
    kind:        "bypass_gate_continue",
    label:       "Verify Partial Work",
    description: "Start a verification task to confirm the changes that were completed before the gate or override interrupted execution.",
    endpoint:    `/api/agent/tasks/${taskId}/retry-verification`,
    available:   canBypassContinue,
    unavailableReason: !canBypassContinue
      ? (outcomeClass !== "selectively_blocked" && outcomeClass !== "operator_overridden"
          ? "Only available for selectively_blocked or operator_overridden outcomes."
          : "No checkpoint evidence with written files — nothing to verify.")
      : undefined,
  };

  // Affordance: view_approval_checkpoint (task-9)
  // Valid when: outcome is approval_denied — allows operator to inspect the checkpoint
  // evidence that was assembled at the gate (files written before denial, commands run, etc.).
  // Always available for approval_denied outcomes — the checkpoint is always assembled.
  const hasApprovalCheckpoint = outcomeClass === "approval_denied" && hasCheckpointEvidence;
  const viewApprovalCheckpointAffordance: RecoveryAffordance = {
    kind:        "view_approval_checkpoint",
    label:       "View Checkpoint Evidence",
    description: "Inspect the checkpoint assembled at the approval gate — shows files written and commands run before the denial.",
    endpoint:    `/api/agent/tasks/${taskId}/checkpoint`,
    httpMethod:  "GET",
    available:   hasApprovalCheckpoint,
    unavailableReason: !hasApprovalCheckpoint
      ? (outcomeClass !== "approval_denied"
          ? "Only available for tasks that were halted by an operator denial."
          : "No checkpoint evidence was assembled before the denial.")
      : undefined,
  };

  return {
    taskId,
    outcomeClass,
    whatHappened,
    whatRemains,
    affordances: [retryVerifyAffordance, continuePartialAffordance, recheckRuntimeAffordance, resubmitAffordance, bypassGateContinueAffordance, viewApprovalCheckpointAffordance],
  };
}

router.get("/agent/tasks/:taskId/recovery-options", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  const TERMINAL = new Set(["done", "error", "cancelled", "interrupted", "stalled"]);
  if (!TERMINAL.has(task.status)) {
    res.status(400).json({
      error: "task_not_terminal",
      message: `Recovery options are only available for completed tasks (current status: ${task.status})`,
    });
    return;
  }

  const assessment = buildRecoveryAssessment(taskId);
  if (!assessment) {
    res.status(500).json({ error: "assessment_failed", message: "Could not build recovery assessment" });
    return;
  }

  res.json(assessment);
});

// ─── Approval checkpoint evidence endpoint ─────────────────────────────────────
//
// GET /agent/tasks/:taskId/checkpoint
//   Returns a summary of the approval gate evidence assembled before the denial.
//   Includes files written, commands run, and the gate that was active when denied.
//   Used by the view_approval_checkpoint affordance in the RecoveryCard.
//   Response is NOT a FollowUpResult — it is raw evidence data for display only.
//
router.get("/agent/tasks/:taskId/checkpoint", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  const checkpoint = getCheckpoint(taskId);
  const runState   = getActiveRunState(taskId);

  // Determine denial gate and decisions:
  // Primary source: live RunState (available while the run is in progress or briefly after).
  // Fallback: persisted task evidence (available after task completion when RunState is gone).
  const ev               = task.taskEvidence ?? null;
  const deniedGateId     = runState?.approvalGates?.find((g) => g.status === "denied")?.id
    ?? ev?.executionSummary?.approvalGateDenied ?? null;
  const deniedGate       = runState?.approvalGates?.find((g) => g.status === "denied") ?? null;
  const deniedAt         = deniedGate?.decidedAt ?? null;
  const description      = deniedGate?.description ?? null;

  // Build approval gates list: prefer live RunState, fall back to stored approval decisions
  const approvalGates    = runState?.approvalGates?.map((g) => ({
    id:          g.id,
    status:      g.status,
    description: g.description,
    decidedAt:   g.decidedAt ?? null,
  })) ?? [];

  const approvalDecisions = runState?.approvalDecisions ?? [];

  // Build files-written list from checkpoint snapshots (Map<string, FileSnapshot>)
  const filesWritten = checkpoint?.snapshots
    ? [...checkpoint.snapshots.entries()].map(([p, snap]) => ({
        path:    p,
        hasDiff: snap.diff != null && snap.diff.length > 0,
      }))
    : [];

  res.json({
    taskId,
    evidenceKind:      "approval_checkpoint",
    deniedGateId,
    deniedAt,
    description,
    filesWritten,
    approvalGates,
    approvalDecisions,
  });
});

// ─── Resubmit-after-denial endpoint ──────────────────────────────────────────
//
// POST /agent/tasks/:taskId/resubmit-after-denial
//   Creates a fresh run with the same original prompt as the denied task.
//   Used by the resubmit_after_denial affordance. This is NOT a continue-partial —
//   it does not require final_status === "partial". It creates an independent retry.
//
router.post("/agent/tasks/:taskId/resubmit-after-denial", async (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  // Verify the task was actually denied — check via recovery assessment (which reads taskEvidence)
  const assessment = buildRecoveryAssessment(taskId);
  if (assessment?.outcomeClass !== "approval_denied") {
    res.status(400).json({
      error: "precondition_failed",
      message: `Resubmit-after-denial is only available for tasks that ended with operator denial (current: ${assessment?.outcomeClass ?? "unknown"}).`,
    });
    return;
  }

  const resubmitPrompt = [
    `RESUBMIT — Original task denied at approval gate, now resubmitting:`,
    ``,
    task.prompt,
  ].join("\n");

  try {
    const newTask = await runAgentTask(resubmitPrompt, []);
    res.json({
      newTaskId:      newTask.id,
      followUpKind:   "resubmit_after_denial",
      originalTaskId: taskId,
      explicit:       "Resubmitted — original task was halted by an operator denial at an approval gate.",
    });
  } catch (err) {
    res.status(500).json({ error: "task_creation_failed", message: String(err) });
  }
});

// ─── Resume-from-checkpoint endpoint ──────────────────────────────────────────
//
// POST /agent/tasks/:taskId/resume-from-checkpoint
//
// Starts a structurally distinct continuation run, not a relabeled retry.
// The new run carries a ContinuationChain with full lineage:
//   - parent task ID
//   - origin checkpoint ID
//   - ancestry depth
//   - what-remains snapshot derived from real prior state
//
// Explicit validity checks are run BEFORE the new task is created:
//   1. Checkpoint must exist (checkpoint_not_found)
//   2. Checkpoint must not be discarded (checkpoint_discarded)
//   3. Checkpoint must not be applied/overwritten (checkpoint_applied_overwritten)
//   4. Parent task must have execution evidence (missing_execution_context)
//   5. Parent must not be a pure error run with zero completed actions (parent_run_error_no_progress)
//
// There is NO silent fallback to a fresh run — all failures return structured errors.

router.post("/agent/tasks/:taskId/resume-from-checkpoint", async (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  if (task.status === "running") {
    res.status(400).json({
      error: "task_running",
      message: "Cannot resume a task that is still running. Cancel or wait for it to complete.",
    });
    return;
  }

  const checkpoint = getCheckpoint(taskId);
  if (!checkpoint) {
    res.status(400).json({
      error: "resume_invalid",
      invalidationReason: "checkpoint_not_found",
      message: `Task ${taskId} has no checkpoint — it made no tracked file writes and cannot be resumed from a checkpoint.`,
    });
    return;
  }

  // verifyFromCheckpoint — authoritative boundary for resume classification.
  // ledgerEmit persists checkpoint_bound / fresh_start / failed evidence to the
  // task event stream so orchestrator resume mode is observable in history.
  const verifyResult = verifyFromCheckpoint(task, checkpoint,
    (eventName, detail) => {
      try { addEvent(taskId, "status", `[checkpoint_resume] ${eventName}: ${detail}`); } catch { /* best-effort */ }
    }
  );

  if (verifyResult.status === "failed") {
    res.status(400).json({
      error: "resume_invalid",
      invalidationReason: verifyResult.invalidationReason,
      message: verifyResult.message,
    });
    return;
  }

  if (verifyResult.status === "fresh_start") {
    // Should not happen here since we already checked for checkpoint existence above,
    // but guard explicitly — no silent fallthrough to undefined chain.
    res.status(400).json({
      error: "resume_invalid",
      invalidationReason: "checkpoint_not_found",
      message: `verifyFromCheckpoint returned fresh_start unexpectedly for task ${taskId} — reason: ${verifyResult.reason}`,
    });
    return;
  }

  // status === "checkpoint_bound" — use the grounded chain and whatRemains
  const whatRemains = verifyResult.whatRemains;
  const chain = verifyResult.continuationChain;

  const comp = task.completion ?? null;
  const originalPrompt = task.prompt;
  const remainingWork = comp?.remaining?.trim() ?? "";
  const completedSummary = comp?.summary?.trim() ?? "";

  const remainingStepLabels = whatRemains.remainingSteps.map(s => `  • ${s.label}`).join("\n");
  const completedStepLabels = whatRemains.completedSteps.map(s => `  ✓ ${s.label}`).join("\n");

  const resumePrompt = [
    `CONTINUATION RUN — resuming from task [${taskId}]`,
    ``,
    `Original task: ${originalPrompt}`,
    ``,
    completedStepLabels
      ? `Already completed in prior run:\n${completedStepLabels}`
      : `No steps were confirmed complete in the prior run.`,
    ``,
    remainingStepLabels
      ? `Remaining work to complete:\n${remainingStepLabels}`
      : `No specific remaining steps identified from plan.`,
    ``,
    remainingWork
      ? `Agent's own description of what remains:\n${remainingWork}`
      : "",
    ``,
    completedSummary
      ? `Prior run summary: ${completedSummary}`
      : "",
    ``,
    `Origin checkpoint: ${checkpoint.taskId} (created ${checkpoint.createdAt})`,
    `Ancestry depth: ${chain.ancestryDepth}`,
    ``,
    `Resume from where the prior run left off. Do NOT redo completed work listed above.`,
    `Focus on the remaining steps. Verify your work when done.`,
  ].filter(s => s !== null && s !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  try {
    const newTask = await runAgentTask(resumePrompt, [], chain);
    res.json({
      newTaskId:            newTask.id,
      followUpKind:         "resume_from_checkpoint",
      originalTaskId:       taskId,
      originCheckpointId:   checkpoint.taskId,
      ancestryDepth:        chain.ancestryDepth,
      continuationChain:    chain,
      explicit:             "This starts a new structured continuation run, not a retry",
    });
  } catch (err) {
    res.status(500).json({ error: "task_creation_failed", message: String(err) });
  }
});

// ─── Continuation follow-up endpoints ─────────────────────────────────────────
//
// These endpoints create new follow-up tasks. Each validates its preconditions
// against real persisted task evidence before accepting the request.
// The response always includes `explicit: "This starts a new ..."` to make
// the follow-up nature visible in the UI.

router.post("/agent/tasks/:taskId/retry-verification", async (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  const ev   = task.taskEvidence;
  const exec = ev?.executionSummary ?? null;
  const ckpt = ev?.checkpointSummary ?? null;
  const comp = task.completion ?? null;

  const exitReason         = exec?.exitReason ?? null;
  const finalStatus        = comp?.final_status ?? null;
  const verificationQuality = exec?.verificationQuality ?? "none";

  // retry-verification is valid when:
  //   (a) task ended blocked (any reason) AND checkpoint evidence exists with written files AND low verify quality, OR
  //   (b) task exhausted its step budget (status === "stalled" / exitReason === "step_budget")
  //       AND checkpoint evidence exists with written files AND verification quality is still low.
  // Requires checkpoint evidence (ckpt != null + ckpt.fileCount > 0) — exec.writesUsed alone
  // is not sufficient because there must be checkpoint-grounded evidence of what was written.
  const isBlocked    = finalStatus === "blocked";
  const isStepBudget = exitReason === "step_budget" || task.status === "stalled";
  const isLowQuality = verificationQuality !== "command_success" && verificationQuality !== "runtime_confirmed";
  const hasCheckpointEvidence = ckpt != null && ckpt.fileCount > 0;

  const qualifies = (isBlocked || isStepBudget) && hasCheckpointEvidence && isLowQuality;

  if (!qualifies) {
    res.status(400).json({
      error: "precondition_failed",
      message: !hasCheckpointEvidence
        ? "No checkpoint evidence with written files — nothing to verify."
        : !isLowQuality
          ? `Verification quality is already '${verificationQuality}' — retry not needed.`
          : "Task status does not qualify for retry-verification. Applicable when blocked or after step-budget exhaustion with checkpoint evidence and low verification quality.",
    });
    return;
  }

  const checkpointFiles = ckpt?.files?.join(", ") ?? "(checkpoint files)";
  const promptTruncated = task.prompt.slice(0, 80) + (task.prompt.length > 80 ? "…" : "");
  const verifyPrompt = `Verify changes from task [${taskId}]: ${promptTruncated}

The original task wrote ${ckpt!.fileCount} file(s) (${checkpointFiles}) but did not complete substantive verification (quality: ${verificationQuality}). Please:
1. Read the files written in the original task
2. Run appropriate verification commands (build, test, type-check)
3. Report whether the changes are correct and working`;

  try {
    const newTask = await runAgentTask(verifyPrompt, []);
    res.json({
      newTaskId:      newTask.id,
      followUpKind:   "retry_verification",
      originalTaskId: taskId,
      explicit:       "This starts a new verification task",
    });
  } catch (err) {
    res.status(500).json({ error: "task_creation_failed", message: String(err) });
  }
});

router.post("/agent/tasks/:taskId/continue-partial", async (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  const comp        = task.completion ?? null;
  const finalStatus = comp?.final_status ?? null;
  const remaining   = comp?.remaining?.trim() ?? "";

  if (finalStatus !== "partial" || !remaining) {
    res.status(400).json({
      error: "precondition_failed",
      message: finalStatus !== "partial"
        ? `Task must have final_status 'partial' to use continue-partial (current: ${finalStatus ?? "none"}).`
        : "Task has no remaining work described — cannot continue.",
    });
    return;
  }

  // ── Structured continuation upgrade ─────────────────────────────────────────
  // When the parent run has a pending (staged, not yet applied/discarded) checkpoint,
  // delegate to structured continuation instead of an unstructured retry. This
  // ensures the continuation run carries full lineage, a what-remains model derived
  // from real prior state, and step-skip enforcement in the agent loop.
  const liveCheckpoint = getCheckpoint(taskId);
  if (liveCheckpoint && liveCheckpoint.status === "pending") {
    // verifyFromCheckpoint — authoritative boundary for continue-partial.
    // ledgerEmit records resume mode evidence in the task event stream.
    const verifyResult = verifyFromCheckpoint(task, liveCheckpoint,
      (eventName, detail) => {
        try { addEvent(taskId, "status", `[checkpoint_resume] ${eventName}: ${detail}`); } catch { /* best-effort */ }
      }
    );
    if (verifyResult.status === "failed") {
      res.status(400).json({
        error:               "resume_invalid",
        invalidationReason:  verifyResult.invalidationReason,
        message:             verifyResult.message,
      });
      return;
    }

    if (verifyResult.status === "checkpoint_bound") {
      const whatRemains = verifyResult.whatRemains;
      const chain = verifyResult.continuationChain;

      const completedStepLabels = whatRemains.completedSteps.map(s => `  ✓ ${s.label}`).join("\n");
      const remainingStepLabels = whatRemains.remainingSteps.map(s => `  • ${s.label}`).join("\n");

      const resumePrompt = [
        `CONTINUATION RUN — resuming from task [${taskId}]`,
        ``,
        `Original task: ${task.prompt}`,
        ``,
        completedStepLabels
          ? `Already completed in prior run:\n${completedStepLabels}`
          : `No steps were confirmed complete in the prior run.`,
        ``,
        remainingStepLabels
          ? `Remaining work to complete:\n${remainingStepLabels}`
          : `No specific remaining steps identified from plan.`,
        ``,
        remaining
          ? `Agent's own description of what remains:\n${remaining}`
          : "",
        ``,
        comp?.summary ? `Prior run summary: ${comp.summary}` : "",
        ``,
        `Origin checkpoint: ${liveCheckpoint.taskId} (created ${liveCheckpoint.createdAt})`,
        `Ancestry depth: ${chain.ancestryDepth}`,
        ``,
        `Resume from where the prior run left off. Do NOT redo completed work listed above.`,
        `Focus on the remaining steps. Verify your work when done.`,
      ].filter(s => s !== null && s !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();

      try {
        const newTask = await runAgentTask(resumePrompt, [], chain);
        res.json({
          newTaskId:            newTask.id,
          followUpKind:         "continue_partial_structured",
          originalTaskId:       taskId,
          originCheckpointId:   liveCheckpoint.taskId,
          ancestryDepth:        chain.ancestryDepth,
          continuationChain:    chain,
          explicit:             "This starts a structured continuation run (not a retry) — carries full lineage and step-skip enforcement",
        });
        return;
      } catch (err) {
        res.status(500).json({ error: "task_creation_failed", message: String(err) });
        return;
      }
    }
    // verifyFromCheckpoint returned fresh_start — no checkpoint bound; fall through
    // to the unstructured path (checkpoint exists but is not eligible for structured resume).
  }

  // ── Unstructured fallback — no valid staged checkpoint available ─────────────
  // This path runs when there is no checkpoint, or the checkpoint is not in staged
  // state (e.g., already applied or discarded). A prompt-level context is assembled
  // from the completion record but no lineage chain is created.
  const continuePrompt = `Continue the following partial work from task [${taskId}]:

Original task: ${task.prompt}

Remaining work to complete:
${remaining}

${comp?.summary ? `Progress so far: ${comp.summary}` : ""}`;

  try {
    const newTask = await runAgentTask(continuePrompt, []);
    res.json({
      newTaskId:      newTask.id,
      followUpKind:   "continue_partial",
      originalTaskId: taskId,
      explicit:       "This starts a new task to continue the remaining work (no checkpoint available for structured continuation)",
    });
  } catch (err) {
    res.status(500).json({ error: "task_creation_failed", message: String(err) });
  }
});

router.post("/agent/tasks/:taskId/recheck-runtime", async (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  const ev   = task.taskEvidence;
  const ckpt = ev?.checkpointSummary ?? null;

  // recheck-runtime requires:
  //   1. Checkpoint was applied (live checkpoint store status === "applied")
  //   2. Persisted runtimeImpactFiles evidence from the checkpoint summary shows server-affecting
  //      files were changed. This uses the canonical classifyRuntimeImpactFiles result stored at
  //      checkpoint creation time — not a regex heuristic over file names.
  // IMPORTANT: use the live checkpoint store for apply status — frozen taskEvidence.checkpointSummary
  // is assembled at completion time (staged===true) and is never updated when apply is called.
  const liveCheckpoint = getCheckpoint(taskId);
  const checkpointApplied = liveCheckpoint?.status === "applied";
  const runtimeImpactFiles: string[] = ckpt?.runtimeImpactFiles ?? [];

  if (!checkpointApplied) {
    res.status(400).json({
      error: "precondition_failed",
      message: liveCheckpoint == null
        ? "No checkpoint exists for this task — nothing to re-check."
        : "Checkpoint has not been applied to the workspace. Apply the checkpoint first before re-checking the runtime.",
    });
    return;
  }

  if (runtimeImpactFiles.length === 0) {
    res.status(400).json({
      error: "precondition_failed",
      message: "No runtime-impacting file changes (package.json, tsconfig, config files) were found in the checkpoint. A runtime re-check is not warranted.",
    });
    return;
  }

  const recheckPrompt = `Re-check runtime after applying changes from task [${taskId}].

Runtime-impacting files changed: ${runtimeImpactFiles.join(", ")}

Please:
1. Start or restart the dev server if it is not already running
2. Verify the server comes up without errors on the expected port
3. Check that the application functions correctly after these changes`;

  try {
    const newTask = await runAgentTask(recheckPrompt, []);
    res.json({
      newTaskId:      newTask.id,
      followUpKind:   "recheck_runtime",
      originalTaskId: taskId,
      explicit:       "This starts a new runtime verification task",
    });
  } catch (err) {
    res.status(500).json({ error: "task_creation_failed", message: String(err) });
  }
});

export default router;
