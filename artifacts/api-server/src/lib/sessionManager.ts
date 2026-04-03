import { randomUUID } from "crypto";

export type TaskStatus = "pending" | "running" | "done" | "error" | "cancelled" | "interrupted" | "stalled";

/**
 * Honest lifecycle exit reason — recorded in the persisted execution summary.
 * Survives server restarts so operators can see exactly why a task ended.
 *
 *   clean_done   — agent called done after successful verification
 *   step_budget  — task exhausted its step budget without calling done
 *   cancelled    — operator cancelled the task mid-run
 *   interrupted  — server crashed or restarted while task was running
 *   error        — an unrecoverable error stopped the task (model failure, etc.)
 *   parse_failure — too many consecutive JSON parse failures from the model
 */
export type ExitReason = "clean_done" | "step_budget" | "cancelled" | "interrupted" | "error" | "parse_failure" | "approval_denied" | "selectively_blocked" | "operator_overridden";

export type AgentEventType =
  | "status"
  | "thought"
  | "file_read"
  | "file_write"
  | "command"
  | "command_output"
  | "error"
  | "done"
  /** Emitted once at task start with the resolved execution profile (category, caps). */
  | "route"
  /** Emitted after the planning phase with the structured execution plan. */
  | "plan"
  /**
   * Emitted at task completion when the task wrote at least one file.
   * Contains a serialised CheckpointSummary — file list, status, timestamps.
   * The operator can call POST /api/agent/tasks/:id/discard to revert all changes,
   * or POST /api/agent/tasks/:id/apply to mark them as permanently accepted.
   */
  | "checkpoint"
  /**
   * Emitted at every task exit path (done, error, cancel, maxSteps).
   * Contains a structured payload with step usage, gate telemetry, and phase.
   */
  | "execution_summary"
  /**
   * Emitted after the planning phase (summary of expected dependency shape)
   * and again at the done step (summary of actual observed dependency shape).
   * Contains a plain-language scheduling truth narrative and per-class counts.
   * Never asserts parallel execution — accurately describes the serial run.
   */
  | "scheduling_truth"
  /**
   * Emitted on every phase transition during an active task run.
   * Carries: phase, step, maxSteps, unverifiedWriteCount, consecutiveFailures, recoverable.
   * Used by the frontend to show a live phase pill and contextual status notices.
   */
  | "live_phase"
  /**
   * Emitted when a task is cancelled, carrying structured drain info:
   * filesWritten, unverifiedFiles, phaseAtCancellation, stepsUsed.
   */
  | "cancelled"
  /**
   * Emitted by the parallel dispatcher after all lanes have settled.
   * Contains the full join report: per-lane outcomes, merge safety flag, and join status.
   * Allows operators to inspect exactly what ran in parallel and what happened in each lane.
   */
  | "parallel_join"
  /**
   * Emitted by the checkpoint apply route after commitStaged() succeeds and staged
   * files are promoted to the live workspace. Distinct from the "checkpoint" event
   * (emitted by the agent when files are staged) and from mergeIsSafe / staged flags.
   * This event records the post-merge verification boundary with outcome: "passed".
   */
  | "post_merge_verification"
  /**
   * P4 (task-9-closeout): Emitted asynchronously after the post-apply runtime
   * snapshot has been captured and the evidence-grounded stale-runtime determination
   * has been computed. Carries isStaleAfterApply, portDiff availability, and
   * processLinkage count. Allows operator-facing surfaces to surface stale detection
   * without polling the recovery-options endpoint.
   */
  | "runtime_lifecycle_applied";

export interface AgentEvent {
  type: AgentEventType;
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export interface TaskCompletion {
  summary: string;
  changed_files: string[];
  commands_run: string[];
  final_status: "complete" | "partial" | "blocked" | "approval_denied";
  remaining: string;
}

export interface TaskFailureDetail {
  title: string;
  detail: string;
  step: string;
  category:
    | "model"
    | "missing_api_key"
    | "invalid_api_key"
    | "model_not_found"
    | "insufficient_balance"
    | "rate_limit"
    | "network_error"
    | "base_url_error"
    | "context_length"
    | "tool"
    | "command"
    | "workspace"
    | "orchestration"
    | "cancelled";
}

export type VisionStatus = "success" | "degraded" | "unavailable";

// ─── Task Evidence ─────────────────────────────────────────────────────────────
// Serialisable snapshots of key structured evidence produced during task execution.
// These five snapshots are the persistence boundary: they survive server restarts
// and are included in AgentTaskSummary (and therefore in history.json).
//
// What IS persisted (task evidence snapshots):
//   - routeProfile    — routing decision: category, step budget, capability flags
//   - planData        — structured execution plan (nullable; only for planning-phase tasks)
//   - checkpointSummary — file manifest from the latest checkpoint event (nullable)
//   - executionSummary  — full telemetry: steps, verification quality, proof statement,
//                         gate triggers, side-effect classes, runtime port evidence
//
// What is NOT persisted (too large, ephemeral):
//   - The full events[] array — live-session only, stripped at process exit

export interface TaskEvidenceRouteProfile {
  category: string;
  maxSteps: number;
  maxFileReads: number;
  maxFileWrites: number;
  requiresVerify: boolean;
  planningPhase: boolean;
}

export interface TaskEvidencePlan {
  goal: string;
  approach: string;
  filesToRead: string[];
  expectedChanges: string[];
  verification: string;
}

export interface TaskEvidenceCheckpointSummary {
  fileCount: number;
  files: string[];
  staged: boolean;
  liveUnchanged: boolean;
  runtimeImpactFiles: string[];
}

export interface TaskEvidenceExecutionSummary {
  stepsUsed: number;
  stepsMax: number;
  readsUsed: number;
  writesUsed: number;
  commandsUsed: number;
  verificationsDone: number;
  finalPhase: string;
  /**
   * Honest lifecycle exit reason — distinct from finalPhase.
   * Persisted so that after restart, operators can see exactly why a task stopped.
   */
  exitReason: ExitReason;
  verificationQuality: string;
  proofStatement: string;
  gateTriggers: Record<string, number> | null;
  shellReadsBlocked: number;
  /**
   * Wall-clock timestamps (ms since epoch) for each phase the task entered.
   * Allows operators to see exactly when the task moved through each phase.
   */
  phaseTimeline: Array<{ phase: string; enteredAt: number }> | null;
  sideEffectsObserved: Array<{
    command: string;
    sideEffectClass: string;
    trustLevel: string;
    reason: string;
  }> | null;
  runtimeEvidence: Array<{
    newlyOpened: number[];
    newlyClosed: number[];
    unchanged: number[];
    hasChange: boolean;
  }> | null;
  /**
   * Dependency/readiness classification tallies for each executed step.
   * Populated by the dependencyClassifier at task completion time.
   * null only for tasks that completed before this feature was deployed.
   */
  dependencyAnalysis: {
    counts: {
      strictly_sequential:    number;
      potentially_independent: number;
      verification_gated:     number;
      repair_driven:          number;
    };
    potentiallyIndependentActionIds: string[];
    serialReason: string;
    readBurstUsed?:  boolean;
    readBurstCount?: number;
  } | null;
  /** task-9: ID of the approval gate that was denied (if any), null otherwise. */
  approvalGateDenied?: string | null;
  /** task-9: Number of operator overrides that were applied during execution. */
  appliedOverrideCount?: number;
  /** task-9: Lane IDs that were selectively blocked by operator approval decision. */
  selectivelyBlockedLanes?: string[] | null;
  /**
   * task-2: Verification contributors derived strictly from real VerificationEntry objects
   * and VERIFY_RESULT ActionRecord entries. Empty array when no real verification evidence
   * was observed — NEVER populated from plan steps, counts, or model narration.
   */
  contributors?: string[];
  /**
   * task-2: Verification confidence level derived from the ledger's quality label.
   * Strictly tied to observed ledger quality — not inferred from agent output.
   *   "none"             — no real verification evidence observed
   *   "low"              — static file reads only (static_only quality)
   *   "medium"           — at least one substantive command succeeded (command_success)
   *   "high"             — runtime probe confirmed port or server live (runtime_confirmed)
   */
  confidence?: "none" | "low" | "medium" | "high";
  /**
   * task-2: Final repair cycle outcome driven by the RepairCycleState state machine.
   * Populated from RepairCycleState transitions observed during execution.
   * Absent when no repair cycle was engaged.
   */
  repairCycleOutcome?: string;
  /**
   * task-9: Per-lane execution summaries captured from the parallel_join event.
   * Persisted so operators can inspect lane breakdown after server restarts.
   * Null for tasks that ran no parallel dispatch.
   */
  laneEvidence?: Array<{
    laneId: string;
    stepId: string;
    filePath: string;
    status: string;
    durationMs: number | null;
    error: string | null;
    verificationOutcome: string | null;
    dependencyClass: string | null;
    /** Number of steps dispatched to this lane in the same wave. */
    stepCount: number;
  }> | null;
}

/**
 * Runtime lifecycle evidence captured at task-start and checkpoint-apply.
 * All fields are optional — degrades honestly when runtime probing is unavailable.
 *
 * P4 (task-9-closeout): task-start snapshot, post-apply snapshot, port diff,
 * process linkage, and proactive stale-runtime detection.
 */
export interface TaskEvidenceRuntimeLifecycle {
  /** Snapshot taken at task start (before any commands run). */
  taskStartSnapshot?: {
    timestamp:  string;
    openPorts:  number[];
    envMeta?: {
      nodeVersion:     string;
      processCount:    number | null;
      relevantEnvKeys: string[];
    };
  };
  /** Snapshot taken after the checkpoint was applied to the live workspace. */
  postApplySnapshot?: {
    timestamp: string;
    openPorts: number[];
    envMeta?: {
      nodeVersion:     string;
      processCount:    number | null;
      relevantEnvKeys: string[];
    };
  };
  /** Diff between taskStartSnapshot and postApplySnapshot (when both are present). */
  portDiff?: {
    newlyOpened: number[];
    newlyClosed: number[];
    unchanged:   number[];
    hasChange:   boolean;
  };
  /** Port-to-command linkage entries derived from verificationLedger runtime probes. */
  processLinkage: Array<{
    port:    number;
    event:   "opened" | "closed";
    command: string;
  }>;
  /**
   * True when runtime-impacting files were applied AND the port state has not
   * changed since task start (proactive stale detection).
   * null when there is insufficient data to make the determination.
   */
  isStaleAfterApply: boolean | null;
}

export interface TaskEvidence {
  /** The routing profile selected for this task. Always present for non-conversational tasks. */
  routeProfile: TaskEvidenceRouteProfile;
  /** Structured execution plan from the planning phase (null if no planning phase ran). */
  planData: TaskEvidencePlan | null;
  /** Checkpoint summary from the latest checkpoint event (null if no files were staged). */
  checkpointSummary: TaskEvidenceCheckpointSummary | null;
  /** Full execution telemetry (null only for conversational tasks with no run state). */
  executionSummary: TaskEvidenceExecutionSummary | null;
  /**
   * P4: Runtime lifecycle evidence — task-start snapshot, post-apply snapshot,
   * port diff, process linkage, and stale-runtime detection.
   * Null when no runtime probing was possible or task was conversational.
   */
  runtimeLifecycle?: TaskEvidenceRuntimeLifecycle | null;
}

export interface AgentTask {
  id: string;
  prompt: string;
  status: TaskStatus;
  createdAt: Date;
  completedAt?: Date;
  durationMs?: number;
  events: AgentEvent[];
  summary?: string;
  completion?: TaskCompletion;
  failureDetail?: TaskFailureDetail;
  /** Number of images attached to this task (0 = text-only). Persisted. */
  imageCount?: number;
  /** What happened with visual analysis for this task. Persisted. */
  visionStatus?: VisionStatus;
  /** How the visual intent was classified for this task. */
  visualIntent?: string;
  /**
   * Structured evidence snapshots assembled at task completion.
   * Persisted to history.json via AgentTaskSummary (Omit<AgentTask, "events">).
   * Provides durable observability after server restarts.
   */
  taskEvidence?: TaskEvidence;
  /**
   * Continuation chain record, present when this task is a resume-from-checkpoint
   * continuation of a prior run. Persisted via AgentTaskSummary so lineage survives
   * server restarts and is available for evidence/replay surfaces.
   * Absent for normal (non-resumed) runs.
   */
  continuationChain?: import("./orchestrator/types.js").ContinuationChain;
}

// Serialisable summary used for the task list endpoint and persistence.
// Excludes the (potentially large) events array.
export type AgentTaskSummary = Omit<AgentTask, "events">;

// Per-task event cap — prevents unbounded memory growth on long-running tasks.
const MAX_EVENTS_PER_TASK = 300;

const tasks = new Map<string, AgentTask>();
const taskControllers = new Map<string, AbortController>();

// ─── Persistence hooks ────────────────────────────────────────────────────────
// Populated by taskPersistence.ts at startup so the session manager never
// imports persistence directly (avoids circular deps and keeps concerns clean).
let _onTaskCompleted: ((task: AgentTaskSummary) => void) | null = null;
/**
 * Called when a task transitions to "running" so taskPersistence can write
 * a minimal "running" snapshot to disk. This ensures crash recovery can find
 * and mark the task as "interrupted" even if no terminal event was written.
 */
let _onTaskStarted: ((task: AgentTaskSummary) => void) | null = null;
/**
 * Called on every task status change. Used by the board persistence layer to
 * mirror agent task status onto the corresponding board task.
 */
let _onTaskStatusChanged: ((taskId: string, status: TaskStatus) => void) | null = null;

export function registerTaskCompletionHook(fn: (task: AgentTaskSummary) => void): void {
  _onTaskCompleted = fn;
}

export function registerTaskStartedHook(fn: (task: AgentTaskSummary) => void): void {
  _onTaskStarted = fn;
}

export function registerTaskStatusChangedHook(fn: (taskId: string, status: TaskStatus) => void): void {
  _onTaskStatusChanged = fn;
}

/**
 * Persist the current in-memory state of a task to disk immediately.
 *
 * For terminal tasks that are mutated after completion (e.g., when a post-apply
 * runtime lifecycle record is merged into TaskEvidence), the normal persistence
 * path has already fired. Calling this function re-triggers the same hook so the
 * updated snapshot is written to history.json.
 *
 * Safe to call for non-terminal tasks but has no effect (persistence only writes
 * terminal snapshots; running tasks use the "running" snapshot path separately).
 *
 * Best-effort: errors are silently ignored.
 */
export function persistTaskNow(taskId: string): void {
  if (!_onTaskCompleted) return;
  const task = tasks.get(taskId);
  if (!task) return;
  if (!TERMINAL_STATUSES.has(task.status)) return;
  const { events: _events, ...taskSummary } = task;
  try {
    _onTaskCompleted(taskSummary);
  } catch {
    // Persistence errors must never crash callers
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function createTask(prompt: string): AgentTask {
  const task: AgentTask = {
    id: randomUUID(),
    prompt,
    status: "pending",
    createdAt: new Date(),
    events: [],
  };
  tasks.set(task.id, task);
  return task;
}

/**
 * Set image/vision metadata on a task immediately after creation.
 * Called by agentLoop before the async agent loop begins.
 */
export function setTaskMeta(taskId: string, meta: { imageCount?: number; visionStatus?: VisionStatus; visualIntent?: string }): void {
  const task = tasks.get(taskId);
  if (!task) return;
  if (meta.imageCount     !== undefined) task.imageCount    = meta.imageCount;
  if (meta.visionStatus   !== undefined) task.visionStatus  = meta.visionStatus;
  if (meta.visualIntent   !== undefined) task.visualIntent  = meta.visualIntent;
}

/**
 * Attach structured evidence snapshots to a task just before completion.
 * Called by agentLoop after emitting the execution summary event.
 * Because AgentTaskSummary = Omit<AgentTask, "events">, this evidence is
 * automatically included when the session manager persists the task.
 */
export function setTaskEvidence(taskId: string, evidence: TaskEvidence): void {
  const task = tasks.get(taskId);
  if (!task) return;
  task.taskEvidence = evidence;
}

/**
 * Attach a continuation chain record to a task.
 * Called immediately when a task is created via resume-from-checkpoint so the
 * chain is persisted as part of AgentTaskSummary (history.json) when the task
 * reaches a terminal state. Surviving restarts allows evidence/replay endpoints
 * to truthfully report continuation lineage for hydrated tasks.
 */
export function setTaskContinuationChain(
  taskId: string,
  chain: import("./orchestrator/types.js").ContinuationChain,
): void {
  const task = tasks.get(taskId);
  if (!task) return;
  task.continuationChain = chain;
}

export function createTaskController(taskId: string): AbortController {
  const controller = new AbortController();
  taskControllers.set(taskId, controller);
  return controller;
}

export function getTaskSignal(taskId: string): AbortSignal | undefined {
  return taskControllers.get(taskId)?.signal;
}

export function isTaskCancelled(taskId: string): boolean {
  return taskControllers.get(taskId)?.signal.aborted ?? false;
}

export function cancelTask(taskId: string): boolean {
  const controller = taskControllers.get(taskId);
  const task = tasks.get(taskId);
  if (!controller || !task || task.status !== "running") return false;
  controller.abort();
  return true;
}

export function cleanupTaskController(taskId: string): void {
  taskControllers.delete(taskId);
}

export function getTask(id: string): AgentTask | undefined {
  return tasks.get(id);
}

/** Full task list including events (kept for internal use and single-task fetch). */
export function listTasks(): AgentTask[] {
  return Array.from(tasks.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * Slim task list without events — used for the /api/agent/tasks list endpoint.
 * Keeps response payloads small; consumers fetch events on demand via /tasks/:id.
 */
export function listTasksSummary(): AgentTaskSummary[] {
  return listTasks().map(({ events: _events, ...summary }) => summary);
}

/** Return stored events for a specific task (may be empty if task not found). */
export function getTaskEvents(taskId: string): AgentEvent[] {
  return tasks.get(taskId)?.events ?? [];
}

export function deleteTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;
  if (task.status === "running") {
    cancelTask(taskId);
  }
  tasks.delete(taskId);
  taskControllers.delete(taskId);
  return true;
}

/** Returns all task summaries (no events) — used by diagnostics and settings. */
export function getAllTaskSummaries(): AgentTaskSummary[] {
  return listTasksSummary();
}

/** Remove every non-running task from memory. Running tasks are unaffected. */
export function clearAllTasks(): void {
  for (const [id, task] of tasks.entries()) {
    if (task.status !== "running") {
      tasks.delete(id);
      taskControllers.delete(id);
    }
  }
}

export function addEvent(
  taskId: string,
  type: AgentEventType,
  message: string,
  data?: Record<string, unknown>
): AgentEvent {
  const task = tasks.get(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const event: AgentEvent = { type, message, data, timestamp: new Date() };

  // Cap events to prevent unbounded memory growth on very long tasks
  if (task.events.length < MAX_EVENTS_PER_TASK) {
    task.events.push(event);
  }
  // Still return the event even if not stored (it will still be broadcast via WS)

  return event;
}

/** Hydrate a completed task from persisted data (used on server start). */
export function hydratePersistedTask(summary: AgentTaskSummary): void {
  if (tasks.has(summary.id)) return; // already in memory (e.g. from this session)
  const task: AgentTask = { ...summary, events: [] };
  tasks.set(task.id, task);
}

/** Terminal statuses — these trigger completedAt, durationMs, and persistence. */
const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "done", "error", "cancelled", "interrupted", "stalled",
]);

export function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  summary?: string,
  completion?: TaskCompletion,
  failureDetail?: TaskFailureDetail
): void {
  const task = tasks.get(taskId);
  if (!task) return;

  task.status = status;
  if (TERMINAL_STATUSES.has(status)) {
    task.completedAt = new Date();
    task.durationMs = task.completedAt.getTime() - task.createdAt.getTime();
    cleanupTaskController(taskId);
  }
  if (summary !== undefined) task.summary = summary;
  if (completion !== undefined) task.completion = completion;
  if (failureDetail !== undefined) task.failureDetail = failureDetail;

  // Notify status-change listeners (board sync, etc.)
  if (_onTaskStatusChanged) {
    try { _onTaskStatusChanged(taskId, status); } catch { /* never throw */ }
  }

  const { events: _events, ...taskSummary } = task;

  // Persist a "running" snapshot so crash recovery can find and mark it as interrupted
  if (status === "running" && _onTaskStarted) {
    try {
      _onTaskStarted(taskSummary);
    } catch {
      // Persistence errors must never crash the session manager
    }
  }

  // Notify the persistence layer when a task reaches a terminal status
  if (TERMINAL_STATUSES.has(status) && _onTaskCompleted) {
    try {
      _onTaskCompleted(taskSummary);
    } catch {
      // Persistence errors must never crash the session manager
    }
  }
}
