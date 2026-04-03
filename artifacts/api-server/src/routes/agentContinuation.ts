import { Router, type IRouter } from "express";
import { runAgentTask, getActiveRunState } from "../lib/agentLoop.js";
import { getTask, addEvent } from "../lib/sessionManager.js";
import { getCheckpoint } from "../lib/orchestrator/checkpoint.js";
import {
  validateCheckpointForResume,
  verifyFromCheckpoint,
} from "../lib/orchestrator/continuationChain.js";

const router: IRouter = Router();

// ─── Recovery Assessment types ────────────────────────────────────────────────

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

// ─── Recovery assessment builder ──────────────────────────────────────────────

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
        ? ` No server restart was observed (port state unchanged since task start — open: ${portDiff.unchanged.map((p: number) => `:${p}`).join(", ") || "none"}).`
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
  const hasRemaining = !!(comp?.remaining?.trim());
  const canContinuePartial = outcomeClass === "partial" && hasRemaining;

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

  // Affordance: resubmit_after_denial
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

  // Affordance: bypass_gate_continue
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

  // Affordance: view_approval_checkpoint
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

// ─── Recovery options endpoint ─────────────────────────────────────────────────
//
// GET /agent/tasks/:taskId/recovery-options
// Returns a RecoveryAssessment derived entirely from persisted task state.
// No fabrication — all fields are derived from real evidence.

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

router.get("/agent/tasks/:taskId/checkpoint", (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  const checkpoint = getCheckpoint(taskId);
  const runState   = getActiveRunState(taskId);

  const ev               = task.taskEvidence ?? null;
  const deniedGateId     = runState?.approvalGates?.find((g) => g.status === "denied")?.id
    ?? ev?.executionSummary?.approvalGateDenied ?? null;
  const deniedGate       = runState?.approvalGates?.find((g) => g.status === "denied") ?? null;
  const deniedAt         = deniedGate?.decidedAt ?? null;
  const description      = deniedGate?.description ?? null;

  const approvalGates    = runState?.approvalGates?.map((g) => ({
    id:          g.id,
    status:      g.status,
    description: g.description,
    decidedAt:   g.decidedAt ?? null,
  })) ?? [];

  const approvalDecisions = runState?.approvalDecisions ?? [];

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

router.post("/agent/tasks/:taskId/resubmit-after-denial", async (req, res) => {
  const { taskId } = req.params;
  const task = getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

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
