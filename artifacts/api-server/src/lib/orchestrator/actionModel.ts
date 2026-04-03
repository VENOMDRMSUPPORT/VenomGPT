/**
 * orchestrator/actionModel.ts — Canonical action-level execution model.
 *
 * This module defines the typed action record schema used to track individual
 * operations performed during a task run at a finer grain than stage-based
 * orchestration. Stage behavior (PLANNING, INSPECTING, EDITING, VERIFYING,
 * WRAPPING UP) is fully preserved and unaffected by this layer.
 *
 * Action categories (ActionType enum):
 *   READ_FILE     — File reads via readFile() in fileTools.ts or readStaged() in stagingStore.ts
 *   WRITE_FILE    — Staged file writes via writeStaged() in stagingStore.ts
 *   EXEC_COMMAND  — Shell command dispatch via runCommand() in terminal.ts / actionExecutor.ts
 *   VERIFY_RESULT — Verification steps emitted via verificationLedger.ts and actionRouter.ts
 *   TOOL_ACTION   — Generic tool/action not covered by the above categories
 *
 * Instrumented files:
 *   fileTools.ts          — READ_FILE (live workspace reads)
 *   stagingStore.ts       — READ_FILE (staged reads), WRITE_FILE (staged writes)
 *   actionExecutor.ts     — EXEC_COMMAND (run_command dispatch), READ_FILE (staged layer fallthrough)
 *   verificationLedger.ts — VERIFY_RESULT (evidence entry recording)
 *
 * Store location: orchestrator/actionStore.ts (singleton ActionStore instance)
 *
 * The schema is intentionally future-proof: operation-specific metadata is typed
 * as a discriminated union per ActionType so call sites carry only the fields
 * that matter for each operation class.
 */

// ─── Action type enum ─────────────────────────────────────────────────────────

export enum ActionType {
  READ_FILE              = "READ_FILE",
  WRITE_FILE             = "WRITE_FILE",
  EXEC_COMMAND           = "EXEC_COMMAND",
  VERIFY_RESULT          = "VERIFY_RESULT",
  TOOL_ACTION            = "TOOL_ACTION",
  // task-9: operator steering events
  APPROVAL_CHECKPOINT    = "APPROVAL_CHECKPOINT",
  APPROVAL_DECISION      = "APPROVAL_DECISION",
  LANE_STEERED           = "LANE_STEERED",
  OPERATOR_OVERRIDE      = "OPERATOR_OVERRIDE",
}

// ─── Action lifecycle ─────────────────────────────────────────────────────────

export enum ActionStatus {
  Pending   = "pending",
  Started   = "started",
  Completed = "completed",
  Failed    = "failed",
  Cancelled = "cancelled",
}

// ─── Operation-specific metadata (discriminated by ActionType) ────────────────

export interface ReadFileMeta {
  type: ActionType.READ_FILE;
  filePath: string;
  /** True when the content was served from the staging layer rather than the live workspace. */
  fromStaging: boolean;
  /** Byte count of the file content read. */
  byteCount?: number;
}

export interface WriteFileMeta {
  type: ActionType.WRITE_FILE;
  filePath: string;
  /** Byte count of the content written. */
  byteCount: number;
  /** True when this write creates a new file; false when updating an existing staged or live file. */
  isNew: boolean;
}

export interface ExecCommandMeta {
  type: ActionType.EXEC_COMMAND;
  command: string;
  /** Working directory at the time of execution. */
  workingDir: string;
  /** Side-effect class from sideEffectClassifier (populated on completion when available). */
  sideEffectClass?: string;
}

export interface VerifyResultMeta {
  type: ActionType.VERIFY_RESULT;
  /** The verification method: 'command_success' | 'static_read' | 'runtime_probe' etc. */
  method: string;
  /** The command string or probe description used for verification. */
  probe: string;
  /** Verification pass (true) or fail (false). */
  passed: boolean;
}

export interface ToolActionMeta {
  type: ActionType.TOOL_ACTION;
  toolName: string;
  [key: string]: unknown;
}

// ─── task-9: Operator steering action metadata ────────────────────────────────

export interface ApprovalCheckpointMeta {
  type: ActionType.APPROVAL_CHECKPOINT;
  checkpointId: string;
  description: string;
  /** Declared lane scope for selective approval (mirrors ApprovalGate.laneIds). */
  laneIds?: string[];
}

export interface ApprovalDecisionMeta {
  type: ActionType.APPROVAL_DECISION;
  checkpointId: string;
  decision: "approved" | "denied" | "selective";
  approvedLaneIds?: string[];
  note?: string;
}

export interface LaneSteeeredMeta {
  type: ActionType.LANE_STEERED;
  laneId: string;
  signal: "paused" | "cancelled" | "proceed";
  reason?: string;
}

export interface OperatorOverrideMeta {
  type: ActionType.OPERATOR_OVERRIDE;
  stepId: string;
  kind: "skip" | "deny" | "substitute";
  substituteWith?: string;
  note?: string;
}

export type ActionMeta =
  | ReadFileMeta
  | WriteFileMeta
  | ExecCommandMeta
  | VerifyResultMeta
  | ToolActionMeta
  | ApprovalCheckpointMeta
  | ApprovalDecisionMeta
  | LaneSteeeredMeta
  | OperatorOverrideMeta;

// ─── Result / outcome ─────────────────────────────────────────────────────────

export interface ActionOutcome {
  /** True when the action completed successfully. */
  success: boolean;
  /** Exit code for command actions (0 = success). */
  exitCode?: number;
  /** Short human-readable summary of the result. */
  summary?: string;
  /** Error message when the action failed. */
  error?: string;
}

// ─── Dependency class (imported from dependencyClassifier) ────────────────────
// Re-declared here to avoid circular imports — the canonical definition is in
// dependencyClassifier.ts; this type alias keeps actionModel.ts self-contained
// for consumers that import only from actionModel.

export type StepDependencyClass =
  | "strictly_sequential"
  | "potentially_independent"
  | "verification_gated"
  | "repair_driven";

// ─── Core ActionRecord interface ──────────────────────────────────────────────

export interface ActionRecord {
  /** Stable unique id for this action (UUID v4). */
  id: string;
  /** The task run this action belongs to. */
  taskId: string;
  /** Action category. */
  type: ActionType;
  /** Current lifecycle status. */
  status: ActionStatus;
  /** Unix ms timestamp when the record was created (pending). */
  createdAt: number;
  /** Unix ms timestamp when the action started executing (started). */
  startedAt?: number;
  /** Unix ms timestamp when the action reached a terminal state. */
  completedAt?: number;
  /** Operation-specific metadata, typed per ActionType. */
  meta: ActionMeta;
  /** Outcome recorded when the action reaches completed or failed. */
  outcome?: ActionOutcome;
  /**
   * Truthful dependency class for this step, classified at dispatch time
   * from the current RunState. Set by the agent loop immediately before
   * the action is dispatched via the action router.
   * undefined for actions created outside the main dispatch loop (e.g. VERIFY_RESULT).
   */
  dependencyClass?: StepDependencyClass;
  /**
   * Lane identifier for parallel dispatch. Set by the parallelDispatcher when a step
   * runs in a parallel lane. Serial steps get laneId: 'serial' or undefined.
   * Allows operators to inspect exactly what ran in parallel and what happened in each lane.
   */
  laneId?: string;
}
