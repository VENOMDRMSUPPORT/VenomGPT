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
} from "../lib/sessionManager.js";
import { broadcastTaskUpdate, broadcastLivePhase } from "../lib/wsServer.js";
import { getFallbackChain } from "../lib/zaiCapabilities.js";
import { getModelProvider } from "../lib/modelAdapter.js";
import { getSettings } from "../lib/settingsStore.js";
import { actionStore } from "../lib/orchestrator/actionStore.js";
import { validateLaneSteering, validateSelectiveSafety } from "../lib/orchestrator/parallelDispatcher.js";
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

// Recovery assessment, checkpoint evidence, and continuation follow-up endpoints
// (recovery-options, checkpoint, resubmit-after-denial, resume-from-checkpoint,
// retry-verification, continue-partial, recheck-runtime) have been extracted to
// routes/agentContinuation.ts to reduce file size. Route paths and behavior are
// identical — only the file boundary changed.

export default router;
