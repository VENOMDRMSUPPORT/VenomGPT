/**
 * orchestrator/continuationChain.ts — Continuation chain management for VenomGPT.
 *
 * Provides functions to build, persist, and query continuation lineage records
 * across task runs. A continuation chain links a resumed run to:
 *   - The parent task ID it continues from
 *   - The origin checkpoint that was validated and used to ground the resume
 *   - The ancestry depth (how many hops from the first run)
 *   - The what-remains snapshot derived from real prior confirmed-complete state
 *
 * Persistence:
 *   The ContinuationChain record is stored on AgentTask.continuationChain
 *   and persisted via taskPersistence (history.json) so lineage survives server
 *   restarts. Evidence/replay endpoints read directly from the task object,
 *   which is hydrated on startup for all persisted tasks.
 *
 * DESIGN PRINCIPLES:
 *   - No fabrication: all what-remains steps are derived from the actual plan steps
 *     vs. confirmed-complete WRITE_FILE action history — never from checkpoint
 *     snapshot keys (which record write intent, not confirmed completion).
 *   - Structured metadata: WhatRemainsStep.filePath carries the typed file path —
 *     gate enforcement reads this field, never parses step labels.
 *   - Explicit failure: stale, discarded, or invalid checkpoints cause structured
 *     rejection with specific reason codes rather than silent fresh-start fallback.
 *   - Honest lineage: the chain is populated only for genuine resume-from-checkpoint
 *     paths — not for unstructured retries that copy context.
 *   - Durable: lineage stored on AgentTask (persisted via history.json), not in
 *     a volatile in-memory map.
 */

import fs from "fs";
import path from "path";
import { logger } from "../logger.js";
import type { TaskCheckpoint } from "./checkpoint.js";
import type { WhatRemains, WhatRemainsStep, ContinuationChain } from "./types.js";
import type { AgentTask } from "../sessionManager.js";
import { setTaskContinuationChain } from "../sessionManager.js";
import { actionStore } from "./actionStore.js";
import { ActionStatus, ActionType } from "./actionModel.js";
import type { WriteFileMeta } from "./actionModel.js";

// ─── Invalidation reason codes ────────────────────────────────────────────────

/**
 * Structured reason codes returned when a resume attempt fails validation.
 * Each code is distinct and specific — operators can surface these in their UIs.
 *
 *   checkpoint_discarded            — operator explicitly discarded the checkpoint
 *   checkpoint_applied_to_workspace — checkpoint was applied; changes are already live;
 *                                    re-staging would duplicate work in the workspace
 *   checkpoint_applied_overwritten  — checkpoint was applied AND at least one file it
 *                                    wrote has since been modified (mtime newer than
 *                                    appliedAt), meaning another run overwrote the changes
 *   missing_execution_context       — parent task has no evidence or execution summary
 *   parent_run_error_no_progress    — parent ended in error with zero completed actions
 *   checkpoint_not_found            — no checkpoint exists for the task
 */
export type InvalidationReason =
  | "checkpoint_discarded"
  | "checkpoint_applied_to_workspace"
  | "checkpoint_applied_overwritten"
  | "missing_execution_context"
  | "parent_run_error_no_progress"
  | "checkpoint_not_found";

export interface CheckpointValidationResult {
  valid: true;
  checkpointId: string;
  ancestryDepth: number;
  parentContinuationChain: ContinuationChain | null;
}

export interface CheckpointValidationFailure {
  valid: false;
  invalidationReason: InvalidationReason;
  message: string;
}

export type CheckpointValidation = CheckpointValidationResult | CheckpointValidationFailure;

// ─── Checkpoint validity rules ────────────────────────────────────────────────

/**
 * Detect whether any file in an applied checkpoint has been modified after appliedAt.
 * Uses filesystem mtime — accurate and restart-safe (no in-memory state required).
 *
 * Returns the first overwritten path found, or null if all files are unchanged.
 */
function detectOverwrittenFile(checkpoint: TaskCheckpoint): string | null {
  if (!checkpoint.appliedAt) return null;
  const appliedMs = new Date(checkpoint.appliedAt).getTime();

  for (const [filePath, _snapshot] of checkpoint.snapshots) {
    const absPath = path.resolve(checkpoint.wsRoot, filePath);
    try {
      const stat = fs.statSync(absPath);
      if (stat.mtimeMs > appliedMs + 1000) {
        // File mtime is more than 1 second after appliedAt — modified after apply
        return filePath;
      }
    } catch {
      // File removed or inaccessible — treat as overwritten (no longer the applied state)
      return filePath;
    }
  }
  return null;
}

/**
 * Validate a checkpoint for safe resumption.
 *
 * Explicit invalidation rules (each produces a distinct reason code):
 *   1. checkpoint_discarded            — status is "discarded"
 *   2. checkpoint_applied_overwritten  — status is "applied" AND at least one file was
 *      modified after appliedAt (mtime check via filesystem)
 *   3. checkpoint_applied_to_workspace — status is "applied" but files appear unchanged
 *      (changes are already live; re-staging would re-apply already-live work)
 *   4. missing_execution_context       — task has no taskEvidence or no executionSummary
 *   5. parent_run_error_no_progress    — parent status is "error" with zero completed
 *      actions recorded (nothing meaningful was accomplished)
 *   6. checkpoint_not_found            — handled before this function is called
 *
 * Ancestry depth:
 *   Read from parentTask.continuationChain.ancestryDepth + 1 when the parent was
 *   itself a continuation, or 1 when the parent was an original run. This is read
 *   from the persisted task object (correct across multiple continuation hops).
 */
export function validateCheckpointForResume(
  parentTask: AgentTask,
  checkpoint: TaskCheckpoint,
): CheckpointValidation {
  if (checkpoint.status === "discarded") {
    return {
      valid: false,
      invalidationReason: "checkpoint_discarded",
      message: `Checkpoint for task ${parentTask.id} was discarded — cannot resume from a discarded checkpoint.`,
    };
  }

  if (checkpoint.status === "applied") {
    // Attempt to distinguish "applied and still live" from "applied then overwritten"
    const overwrittenPath = detectOverwrittenFile(checkpoint);
    if (overwrittenPath) {
      return {
        valid: false,
        invalidationReason: "checkpoint_applied_overwritten",
        message:
          `Checkpoint for task ${parentTask.id} was applied but "${overwrittenPath}" has since been ` +
          `modified by another run after the checkpoint was applied. ` +
          `The applied state has been superseded. Start a new task from the current workspace state.`,
      };
    }
    return {
      valid: false,
      invalidationReason: "checkpoint_applied_to_workspace",
      message:
        `Checkpoint for task ${parentTask.id} was already applied to the live workspace. ` +
        `Resuming from an applied checkpoint would re-stage changes that are already live. ` +
        `Start a new task to continue from the current workspace state instead.`,
    };
  }

  if (!parentTask.taskEvidence) {
    return {
      valid: false,
      invalidationReason: "missing_execution_context",
      message:
        `Task ${parentTask.id} has no execution evidence — it may have crashed before routing. ` +
        `Cannot safely derive what-remains from incomplete state.`,
    };
  }

  if (!parentTask.taskEvidence.executionSummary) {
    return {
      valid: false,
      invalidationReason: "missing_execution_context",
      message:
        `Task ${parentTask.id} has no execution summary — run-state was not captured. ` +
        `Cannot safely derive what-remains from incomplete state.`,
    };
  }

  const completedActionCount = actionStore.getActions(parentTask.id).filter(
    a => a.status === ActionStatus.Completed
  ).length;

  if (parentTask.status === "error" && completedActionCount === 0) {
    return {
      valid: false,
      invalidationReason: "parent_run_error_no_progress",
      message:
        `Task ${parentTask.id} ended with an error and no actions were completed. ` +
        `There is no meaningful prior state to continue from.`,
    };
  }

  // Ancestry depth: read from the parent's persisted ContinuationChain (survives restarts).
  // parentTask.continuationChain is populated if the parent was itself a continuation.
  const parentChain = parentTask.continuationChain ?? null;
  const ancestryDepth = parentChain ? parentChain.ancestryDepth + 1 : 1;

  return {
    valid: true,
    checkpointId: checkpoint.taskId,
    ancestryDepth,
    parentContinuationChain: parentChain,
  };
}

// ─── What-remains model ───────────────────────────────────────────────────────

/**
 * Build a structured WhatRemains object from the parent run's real confirmed-complete state.
 *
 * Algorithm:
 *   1. Confirmed-completed steps — entries in the plan's expectedChanges for which
 *      the action store has a WRITE_FILE action in Completed status. This is the only
 *      authoritative completion signal — checkpoint snapshot keys record write INTENT,
 *      not confirmed completion, and are NOT used to classify steps as completed.
 *   2. Failed steps — entries where the last WRITE_FILE action for that file is Failed.
 *   3. Remaining steps — entries in expectedChanges not in completed or failed sets.
 *   4. Each step carries a typed `filePath` field for deterministic gate enforcement.
 *
 * All data is derived from real prior state. No narrative generation. No snapshot-key heuristics.
 *
 * NOTE: The action store is in-memory only (consistent with the existing design of ActionStore).
 * After a server restart, action history for a prior task is unavailable — what-remains will
 * correctly show all plan steps as "remaining" rather than partially completed. This degrades
 * fidelity (more re-confirmation work) but does not break correctness: the gate enforcement
 * (Gate 0.5 in actionRouter) also reads from the chain built at resume time, so restarts
 * only affect the accuracy of what-remains *at the moment of resume*, not during execution.
 */
export function buildWhatRemains(
  parentTask: AgentTask,
  checkpoint: TaskCheckpoint,
): WhatRemains {
  const planData = parentTask.taskEvidence?.planData ?? null;
  const allActions = actionStore.getActions(parentTask.id);

  // Build per-file action maps from the action store (typed metadata, no label parsing)
  const completedWriteFiles = new Set<string>();
  const failedWriteFiles = new Set<string>();

  for (const action of allActions) {
    if (action.type !== ActionType.WRITE_FILE) continue;
    const meta = action.meta as WriteFileMeta;
    if (!meta.filePath) continue;

    if (action.status === ActionStatus.Completed) {
      completedWriteFiles.add(meta.filePath);
      // A later failed action can supersede a completed one — handle below
    } else if (action.status === ActionStatus.Failed) {
      failedWriteFiles.add(meta.filePath);
    }
  }

  // If a file appears in both (completed then failed, or failed then completed), the
  // last-status wins. Scan in reverse to get the final status for each file.
  const finalStatusByFile = new Map<string, "completed" | "failed">();
  for (const action of [...allActions].reverse()) {
    if (action.type !== ActionType.WRITE_FILE) continue;
    const meta = action.meta as WriteFileMeta;
    if (!meta.filePath) continue;
    if (finalStatusByFile.has(meta.filePath)) continue; // already have the latest status
    if (action.status === ActionStatus.Completed) {
      finalStatusByFile.set(meta.filePath, "completed");
    } else if (action.status === ActionStatus.Failed) {
      finalStatusByFile.set(meta.filePath, "failed");
    }
  }

  const completedSteps: WhatRemainsStep[] = [];
  const remainingSteps: WhatRemainsStep[] = [];
  const failedSteps: WhatRemainsStep[] = [];

  if (planData && planData.expectedChanges.length > 0) {
    for (let i = 0; i < planData.expectedChanges.length; i++) {
      const filePath = planData.expectedChanges[i];
      const stepId = `plan_step_${i}`;
      const finalStatus = finalStatusByFile.get(filePath);

      if (finalStatus === "failed") {
        failedSteps.push({
          id: stepId,
          label: `Write ${filePath}`,
          filePath,
          status: "failed",
          reason: "Write action failed in the prior run",
        });
      } else if (finalStatus === "completed") {
        completedSteps.push({
          id: stepId,
          label: `Write ${filePath}`,
          filePath,
          status: "completed",
        });
      } else {
        remainingSteps.push({
          id: stepId,
          label: `Write ${filePath}`,
          filePath,
          status: "remaining",
        });
      }
    }
  } else {
    // No plan — derive from confirmed completed action history only
    // (not checkpoint snapshots, which only record write intent)
    for (const [filePath, finalStatus] of finalStatusByFile) {
      if (finalStatus === "completed") {
        completedSteps.push({
          id: `action_written_${filePath}`,
          label: `Write ${filePath}`,
          filePath,
          status: "completed",
        });
      } else if (finalStatus === "failed") {
        failedSteps.push({
          id: `action_failed_${filePath}`,
          label: `Write ${filePath}`,
          filePath,
          status: "failed",
          reason: "Write action failed in the prior run",
        });
      }
    }

    const comp = parentTask.completion;
    if (comp?.remaining?.trim()) {
      remainingSteps.push({
        id: "agent_remaining",
        label: comp.remaining.trim(),
        // No filePath — this is a free-text remaining work description
        status: "remaining",
      });
    }
  }

  const blockedContext = parentTask.status === "done" &&
    parentTask.completion?.final_status === "blocked" &&
    parentTask.completion?.remaining
    ? parentTask.completion.remaining
    : null;

  if (blockedContext) {
    remainingSteps.push({
      id: "blocked_reason",
      label: blockedContext,
      // No filePath — blocked reason is narrative, not a specific file write
      status: "blocked",
      reason: "Task was blocked at this point in the prior run",
    });
  }

  return {
    completedSteps,
    remainingSteps,
    failedSteps,
    groundedFrom: {
      checkpointId: checkpoint.taskId,
      checkpointCreatedAt: checkpoint.createdAt,
    },
  };
}

// ─── Checkpoint-bound verification path ──────────────────────────────────────

/**
 * Result type for verifyFromCheckpoint(). Structured result — never silently falls
 * through to a fresh-start. Every outcome is explicit and carries a reason code.
 *
 *   status: "checkpoint_bound"  — the checkpoint was valid; continuation chain was
 *                                  built from checkpoint-grounded evidence. This is
 *                                  the authoritative verification path.
 *   status: "fresh_start"       — checkpoint was absent or the caller signaled that
 *                                  no parent checkpoint should be used. The resume
 *                                  should proceed without checkpoint grounding.
 *   status: "failed"            — the checkpoint exists but validation failed.
 *                                  invalidationReason and message carry specifics.
 *                                  The caller MUST NOT proceed without handling this.
 */
export type VerifyFromCheckpointResult =
  | {
      status: "checkpoint_bound";
      checkpointId: string;
      ancestryDepth: number;
      continuationChain: ContinuationChain;
      whatRemains: WhatRemains;
    }
  | {
      status: "fresh_start";
      reason: "no_parent_checkpoint" | "no_checkpoint_id_provided";
    }
  | {
      status: "failed";
      invalidationReason: InvalidationReason;
      message: string;
    };

/**
 * Verify a resume attempt from a prior checkpoint.
 *
 * This is the authoritative checkpoint-bound verification path.
 *
 * CONTRACT:
 *   1. validateCheckpointForResume() is called first. If it fails, a structured
 *      VerifyFromCheckpointResult with status="failed" is returned immediately.
 *      There is NO silent fallthrough to a fresh start on validation failure.
 *   2. A "checkpoint_bound" ledger event is logged on success.
 *   3. A "fresh_start" ledger event is logged when no checkpoint is present.
 *   4. On validation failure, a "checkpoint_bound_failed" ledger event is logged.
 *
 * The caller is responsible for deciding how to handle status="failed" —
 * typically by surfacing the invalidationReason to the operator and halting.
 *
 * @param parentTask     - The task that owns the checkpoint to validate.
 * @param checkpoint     - The checkpoint to validate. Pass undefined when no prior
 *                         checkpoint is available (results in status="fresh_start").
 * @param ledgerEmit     - Optional callback to emit ledger events for observability.
 *                         Called with (eventName, detail) so the caller can route
 *                         to their VerificationLedger instance.
 */
export function verifyFromCheckpoint(
  parentTask: AgentTask | null | undefined,
  checkpoint: TaskCheckpoint | null | undefined,
  ledgerEmit?: (eventName: "checkpoint_bound" | "checkpoint_bound_failed" | "fresh_start", detail: string) => void,
): VerifyFromCheckpointResult {
  // ── No parent task or no checkpoint provided ─────────────────────────────
  if (!parentTask || !checkpoint) {
    const detail = !parentTask
      ? "No parent task provided — resuming as fresh start"
      : "No checkpoint available for parent task — resuming as fresh start";
    logger.info({ parentTaskId: parentTask?.id ?? "none" }, `[ContinuationChain] verifyFromCheckpoint: ${detail}`);
    ledgerEmit?.("fresh_start", detail);
    return {
      status: "fresh_start",
      reason: !parentTask ? "no_parent_checkpoint" : "no_checkpoint_id_provided",
    };
  }

  // ── Explicit checkpoint validation — MUST pass before proceeding ──────────
  // validateCheckpointForResume() produces structured reason codes.
  // A failure here MUST NOT silently fall through to a fresh-start path.
  const validation = validateCheckpointForResume(parentTask, checkpoint);

  if (!validation.valid) {
    const detail = `Checkpoint validation failed [${validation.invalidationReason}]: ${validation.message}`;
    logger.warn(
      { parentTaskId: parentTask.id, checkpointId: checkpoint.taskId, invalidationReason: validation.invalidationReason },
      `[ContinuationChain] verifyFromCheckpoint: ${detail}`,
    );
    ledgerEmit?.("checkpoint_bound_failed", detail);
    return {
      status: "failed",
      invalidationReason: validation.invalidationReason,
      message: validation.message,
    };
  }

  // ── Validation passed — build checkpoint-grounded continuation ────────────
  const whatRemains = buildWhatRemains(parentTask, checkpoint);
  const chain = buildContinuationChain(
    parentTask.id,
    checkpoint,
    whatRemains,
    validation.ancestryDepth,
  );

  const detail =
    `Checkpoint verified and grounded [checkpointId=${checkpoint.taskId}, ancestryDepth=${validation.ancestryDepth}]: ` +
    `${whatRemains.completedSteps.length} completed, ${whatRemains.remainingSteps.length} remaining, ` +
    `${whatRemains.failedSteps.length} failed`;

  logger.info(
    {
      parentTaskId: parentTask.id,
      checkpointId: checkpoint.taskId,
      ancestryDepth: validation.ancestryDepth,
      completedSteps: whatRemains.completedSteps.length,
      remainingSteps: whatRemains.remainingSteps.length,
    },
    `[ContinuationChain] verifyFromCheckpoint: ${detail}`,
  );
  ledgerEmit?.("checkpoint_bound", detail);

  return {
    status: "checkpoint_bound",
    checkpointId: checkpoint.taskId,
    ancestryDepth: validation.ancestryDepth,
    continuationChain: chain,
    whatRemains,
  };
}

// ─── Continuation chain builder ───────────────────────────────────────────────

/**
 * Build a ContinuationChain record to attach to a new resumed RunState.
 * Called after successful checkpoint validation and what-remains computation.
 */
export function buildContinuationChain(
  parentTaskId: string,
  checkpoint: TaskCheckpoint,
  whatRemains: WhatRemains,
  ancestryDepth: number,
): ContinuationChain {
  return {
    parentTaskId,
    originCheckpointId: checkpoint.taskId,
    isStructuredContinuation: true,
    ancestryDepth,
    whatRemainedAtResume: whatRemains,
    resumedAt: new Date().toISOString(),
  };
}

// ─── Durable lineage persistence ──────────────────────────────────────────────

/**
 * Persist a continuation chain to the new task via setTaskContinuationChain.
 * Replaces volatile in-memory registry with durable task-level storage so
 * lineage survives server restarts (persisted in history.json via AgentTaskSummary).
 *
 * Call this immediately after the new task is created, before it begins running.
 */
export function persistContinuationChain(newTaskId: string, chain: ContinuationChain): void {
  setTaskContinuationChain(newTaskId, chain);
  logger.info(
    {
      newTaskId,
      parentTaskId: chain.parentTaskId,
      originCheckpointId: chain.originCheckpointId,
      ancestryDepth: chain.ancestryDepth,
      completedSteps: chain.whatRemainedAtResume.completedSteps.length,
      remainingSteps: chain.whatRemainedAtResume.remainingSteps.length,
    },
    "[ContinuationChain] Persisted continuation chain to task"
  );
}
