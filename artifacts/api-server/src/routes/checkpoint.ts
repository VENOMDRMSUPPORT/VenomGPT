/**
 * routes/checkpoint.ts — Task checkpoint API routes.
 *
 * These routes expose the checkpoint + staging model to the operator:
 *
 *   GET  /api/agent/tasks/:taskId/checkpoint  — checkpoint status + file list + staging metadata
 *   POST /api/agent/tasks/:taskId/apply       — promote staged files into live workspace, accept permanently
 *   POST /api/agent/tasks/:taskId/discard     — remove staging directory (live workspace untouched)
 *
 * Staging model (introduced in Task #5):
 *   All file writes during agent execution go into a per-task staging directory.
 *   The live workspace is NOT touched until the operator explicitly applies.
 *   Apply = commitStaged() → promotes staged files into live workspace atomically.
 *   Discard = discardStaged() → removes staging directory only, live workspace stays clean.
 *
 * All three routes require the task to exist and to have a checkpoint
 * (i.e., the task must have performed at least one successful file write).
 */

import { Router, type IRouter } from "express";
import { getTask, addEvent, setTaskEvidence, persistTaskNow, type TaskEvidenceRuntimeLifecycle } from "../lib/sessionManager.js";
import {
  getCheckpoint,
  serializeCheckpoint,
  applyCheckpoint,
  discardCheckpoint,
  applyCheckpointFile,
  discardCheckpointFile,
  getCheckpointHistory,
  classifyRuntimeImpactFiles,
  setCheckpointRuntimeStale,
  type ApplyCheckpointResult,
} from "../lib/orchestrator/checkpoint.js";
import { listStagedFiles } from "../lib/orchestrator/stagingStore.js";
import { invalidateProjectIndex } from "../lib/projectIndex.js";
import { broadcastTaskUpdate, broadcastAgentEvent } from "../lib/wsServer.js";
import { getActiveRunState } from "../lib/agentLoop.js";
import { captureEnhancedSnapshot, buildRuntimeLifecycleRecord } from "../lib/orchestrator/runtimeLifecycle.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ─── GET checkpoint status ────────────────────────────────────────────────────

router.get("/agent/tasks/:taskId/checkpoint", async (req, res) => {
  const { taskId } = req.params;

  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  const cp = getCheckpoint(taskId);
  if (!cp) {
    res.status(404).json({
      error: "no_checkpoint",
      message: `Task ${taskId} has no checkpoint — the task made no tracked file writes`,
    });
    return;
  }

  // Include staged file metadata so the operator surface can accurately report
  // the isolation state: which files are staged but not yet in the live workspace.
  // staged is derived from the checkpoint's own mode flag (cp.staged), not hardcoded,
  // so legacy/non-staged checkpoints report correctly.
  const stagedFiles = await listStagedFiles(taskId);
  const summary = serializeCheckpoint(cp);

  // Classify which checkpoint files are runtime-sensitive (pure metadata,
  // no behavioral change to staging/apply/discard logic).
  const allFilePaths = summary.files.map((f: { path: string }) => f.path);
  const runtimeImpactFiles = classifyRuntimeImpactFiles(allFilePaths);

  res.json({
    ...summary,
    // summary.staged already reflects cp.staged from serializeCheckpoint;
    // liveUnchanged is true when there are staged files not yet promoted to live.
    liveUnchanged: cp.staged === true && stagedFiles.length > 0,
    // stagedFiles from disk (may differ from summary.stagedFiles if staging dir was
    // partially committed or externally modified between snapshot and listing)
    stagedFiles,
    // Files in this checkpoint that match runtime-sensitive patterns (empty when none).
    // The frontend uses this to show a "preview may need restart" callout after apply.
    runtimeImpactFiles,
  });
});

// ─── Apply checkpoint ─────────────────────────────────────────────────────────

router.post("/agent/tasks/:taskId/apply", async (req, res) => {
  const { taskId } = req.params;

  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  if (task.status === "running") {
    res.status(400).json({
      error: "task_running",
      message: "Cannot apply checkpoint while the task is still running",
    });
    return;
  }

  const cp = getCheckpoint(taskId);
  if (!cp) {
    res.status(404).json({
      error: "no_checkpoint",
      message: `Task ${taskId} has no checkpoint`,
    });
    return;
  }

  let applyResult: ApplyCheckpointResult | null = null;
  try {
    const activeRunState = getActiveRunState(taskId);
    applyResult = await applyCheckpoint(taskId, activeRunState?.verificationLedger);
  } catch (err) {
    // applyCheckpoint() sets cp.postMergeVerification = { outcome: "failed" }
    // before throwing, so the checkpoint carries the failed outcome durably.
    try {
      const pmv = cp.postMergeVerification;
      const failEvent = addEvent(
        taskId,
        "post_merge_verification",
        `post_merge_verification: ${pmv?.detail ?? String(err)}`,
        { outcome: pmv?.outcome ?? "failed", detail: pmv?.detail ?? String(err) },
      );
      broadcastAgentEvent(taskId, failEvent);
    } catch { /* best-effort */ }
    res.status(400).json({ error: "apply_failed", message: String(err) });
    return;
  }

  // Emit post_merge_verification event from cp.postMergeVerification (set by
  // applyCheckpoint). Distinct from the "checkpoint" event (staging) and mergeIsSafe.
  const postMergeV = cp.postMergeVerification;
  try {
    const postMergeEvent = addEvent(
      taskId,
      "post_merge_verification",
      `post_merge_verification: ${postMergeV?.detail ?? "checkpoint applied"}`,
      {
        outcome:       postMergeV?.outcome ?? "passed",
        promotedCount: cp.snapshots.size,
        appliedAt:     cp.appliedAt ?? new Date().toISOString(),
        detail:        postMergeV?.detail ?? `${cp.snapshots.size} file(s) promoted`,
      },
    );
    broadcastAgentEvent(taskId, postMergeEvent);
  } catch {
    // Task may have been evicted from memory — event emission is best-effort
  }

  // Invalidate project intelligence cache — files on disk have changed
  invalidateProjectIndex();
  broadcastTaskUpdate(task);

  // ── P4: Post-apply runtime snapshot + lifecycle record ──────────────────
  // Capture the runtime state after applying the checkpoint. This runs
  // asynchronously so it doesn't block the apply response. The lifecycle
  // record is MERGED into (not replacing) the task's stored TaskEvidence.
  //
  // Source of task-start snapshot:
  //   Priority 1 — existing task.taskEvidence.runtimeLifecycle.taskStartSnapshot
  //     (set by evidenceAssembler at task completion — persisted, always available)
  //   Priority 2 — activeRunState?.taskStartRuntimeSnapshot
  //     (only available when the run state hasn't been cleared yet — unusual for applies)
  //   Fall back to undefined (honest absent-data handling)
  const activeRunState = getActiveRunState(taskId);
  // Use only the files ACTUALLY promoted (from applyCheckpoint result) — not
  // all snapshot keys, which may include files discarded via per-file discard
  // before the full apply. This prevents false-positive stale classification.
  const promotedFilePaths: string[] = applyResult?.promotedFiles ?? [];
  const runtimeImpactFiles = classifyRuntimeImpactFiles(promotedFilePaths);

  // Read task-start snapshot from persisted evidence BEFORE the async block
  // (task.taskEvidence may be mutated inside the then-callback; capture now).
  const persistedTaskEvidence = getTask(taskId)?.taskEvidence ?? null;
  const persistedTaskStartSnap =
    persistedTaskEvidence?.runtimeLifecycle?.taskStartSnapshot;
  const taskStartSnap = persistedTaskStartSnap ?? activeRunState?.taskStartRuntimeSnapshot;

  // Also capture existing processLinkage from persisted evidence to preserve it
  const persistedProcessLinkage =
    persistedTaskEvidence?.runtimeLifecycle?.processLinkage ?? [];

  captureEnhancedSnapshot().then(postApplySnap => {
    logger.debug(
      { taskId, openPorts: postApplySnap.openPorts },
      "[RuntimeLifecycle] Post-apply snapshot captured"
    );

    // Gather ledger probe entries for process linkage (augment persisted entries)
    const ledger = activeRunState?.verificationLedger;
    const newProbeEntries = ledger
      ? ledger.getEntries().filter(e => e.type === "runtime_probe").map(e => ({
          runtimeDiff: e.runtimeDiff,
          detail: e.detail,
        }))
      : [];

    const lifecycleRecord = buildRuntimeLifecycleRecord(
      taskStartSnap,
      postApplySnap,
      runtimeImpactFiles,
      newProbeEntries,
    );

    // Merge: preserve existing processLinkage from pre-apply evidence;
    // augment with any new entries from buildRuntimeLifecycleRecord
    const mergedProcessLinkage = [
      ...persistedProcessLinkage,
      ...lifecycleRecord.processLinkage.filter(e =>
        !persistedProcessLinkage.some(p => p.port === e.port && p.command === e.command)
      ),
    ];

    const mergedLifecycle: TaskEvidenceRuntimeLifecycle = {
      // Preserve existing task-start snapshot (from persisted evidence) if buildRuntimeLifecycleRecord
      // returned one — they should be identical; prefer the persisted one for stability
      taskStartSnapshot: lifecycleRecord.taskStartSnapshot,
      postApplySnapshot: lifecycleRecord.postApplySnapshot,
      portDiff:          lifecycleRecord.portDiff,
      processLinkage:    mergedProcessLinkage,
      isStaleAfterApply: lifecycleRecord.isStaleAfterApply,
    };

    // ── Durable outcome signal ───────────────────────────────────────────────
    // Store the evidence-grounded stale outcome on the checkpoint itself so
    // recovery-options can read it without in-memory run state. This persists
    // to disk alongside the applied checkpoint record.
    setCheckpointRuntimeStale(taskId, mergedLifecycle.isStaleAfterApply);

    // ── Emit a post-apply runtime lifecycle event ────────────────────────────
    // Emit a durable event so operator-facing surfaces (WS, audit log) can
    // surface the stale determination without polling.
    try {
      const outcomeLabel = mergedLifecycle.isStaleAfterApply === true
        ? "stale_detected"
        : mergedLifecycle.isStaleAfterApply === false
          ? "not_stale"
          : "insufficient_data";
      const lifecycleEvent = addEvent(
        taskId,
        "runtime_lifecycle_applied",
        `runtime_lifecycle_applied: ${outcomeLabel}`,
        {
          outcome:            outcomeLabel,
          isStaleAfterApply:  mergedLifecycle.isStaleAfterApply,
          hasPortDiff:        !!mergedLifecycle.portDiff,
          portDiffHasChange:  mergedLifecycle.portDiff?.hasChange ?? null,
          processLinkageCount: mergedLifecycle.processLinkage.length,
        },
      );
      broadcastAgentEvent(taskId, lifecycleEvent);
    } catch {
      // Event emission is best-effort
    }

    // ── Merge into stored TaskEvidence and persist to disk ───────────────────
    // When taskEvidence already exists (normal case): merge runtimeLifecycle in.
    // When taskEvidence is absent (edge case: task stub from checkpoint recovery
    // or very early cancellation): build a minimal evidence shell so the lifecycle
    // record is not silently dropped. In both cases, persist to disk.
    try {
      const task = getTask(taskId);
      if (task) {
        const baseEvidence = task.taskEvidence ?? {
          routeProfile:       { category: "unknown", maxSteps: 0, maxFileReads: 0, maxFileWrites: 0, requiresVerify: false, planningPhase: false },
          planData:           null,
          checkpointSummary:  null,
          executionSummary:   null,
        };
        const updated = { ...baseEvidence, runtimeLifecycle: mergedLifecycle };
        setTaskEvidence(taskId, updated);
        // Re-trigger persistence so the updated lifecycle record survives server restart.
        // persistTaskNow() is a no-op for non-terminal tasks, safe to call unconditionally.
        persistTaskNow(taskId);
        logger.debug(
          { taskId, isStaleAfterApply: mergedLifecycle.isStaleAfterApply, hasPostApplySnap: !!mergedLifecycle.postApplySnapshot },
          "[RuntimeLifecycle] Runtime lifecycle record merged into TaskEvidence and persisted"
        );
        // Broadcast a second task update so Evidence panel clients see the updated
        // lifecycle fields without waiting for polling. The first broadcastTaskUpdate
        // (above) fires before the async lifecycle merge completes; this second one
        // ensures the runtimeLifecycle fields are reflected immediately.
        broadcastTaskUpdate(task);
      }
    } catch (evidenceErr) {
      logger.debug({ taskId, evidenceErr }, "[RuntimeLifecycle] Evidence update failed — non-fatal");
    }
  }).catch(err => {
    logger.debug({ taskId, err }, "[RuntimeLifecycle] Post-apply snapshot capture failed — non-fatal");
  });

  res.json({
    success: true,
    message: `Checkpoint applied — ${cp.snapshots.size} file(s) promoted from staging to live workspace`,
    status:  "applied",
  });
});

// ─── Discard checkpoint ───────────────────────────────────────────────────────

router.post("/agent/tasks/:taskId/discard", async (req, res) => {
  const { taskId } = req.params;

  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  if (task.status === "running") {
    res.status(400).json({
      error: "task_running",
      message: "Cannot discard checkpoint while the task is still running",
    });
    return;
  }

  const cp = getCheckpoint(taskId);
  if (!cp) {
    res.status(404).json({
      error: "no_checkpoint",
      message: `Task ${taskId} has no checkpoint`,
    });
    return;
  }

  try {
    const result = await discardCheckpoint(taskId);

    // Invalidate project intelligence cache only if live workspace was actually
    // modified. This happens in two cases:
    //   (a) partial-apply recovery: a previous failed apply partially promoted
    //       files; discard restores them from snapshots (live disk changed).
    //   (b) legacy mode: checkpoint was created before the staging layer was
    //       introduced; discard restores live files from snapshots (live disk changed).
    // In the normal staging path (live workspace untouched), no invalidation needed.
    if (result.liveFilesModified) {
      invalidateProjectIndex();
    }

    broadcastTaskUpdate(task);

    const discardMessage = result.liveFilesModified
      ? `Checkpoint discarded — ${result.discardedPaths.length} file(s) removed. Live workspace was restored to pre-task state.`
      : `Checkpoint discarded — ${result.discardedPaths.length} staged file(s) removed. Live workspace was not touched.`;

    res.json({
      success:           true,
      message:           discardMessage,
      discardedFiles:    result.discardedPaths,
      // Backward compatibility: frontend reads restoredFiles (pre-staging field name)
      restoredFiles:     result.discardedPaths,
      liveFilesModified: result.liveFilesModified,
      status:            "discarded",
    });
  } catch (err) {
    res.status(400).json({ error: "discard_failed", message: String(err) });
  }
});

// ─── Per-file apply ───────────────────────────────────────────────────────────

router.post("/agent/tasks/:taskId/apply-file", async (req, res) => {
  const { taskId } = req.params;
  const { filePath } = req.body as { filePath?: string };

  if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
    res.status(400).json({ error: "bad_request", message: "filePath is required" });
    return;
  }

  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  if (task.status === "running") {
    res.status(400).json({ error: "task_running", message: "Cannot apply file while the task is still running" });
    return;
  }

  const cp = getCheckpoint(taskId);
  if (!cp) {
    res.status(404).json({ error: "no_checkpoint", message: `Task ${taskId} has no checkpoint` });
    return;
  }

  const err = await applyCheckpointFile(taskId, filePath);
  if (err) {
    res.status(400).json({ error: "apply_file_failed", message: err });
    return;
  }

  invalidateProjectIndex();
  broadcastTaskUpdate(task);

  res.json({ success: true, message: `File "${filePath}" applied to live workspace`, filePath });
});

// ─── Per-file discard ─────────────────────────────────────────────────────────

router.post("/agent/tasks/:taskId/discard-file", async (req, res) => {
  const { taskId } = req.params;
  const { filePath } = req.body as { filePath?: string };

  if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
    res.status(400).json({ error: "bad_request", message: "filePath is required" });
    return;
  }

  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  if (task.status === "running") {
    res.status(400).json({ error: "task_running", message: "Cannot discard file while the task is still running" });
    return;
  }

  const cp = getCheckpoint(taskId);
  if (!cp) {
    res.status(404).json({ error: "no_checkpoint", message: `Task ${taskId} has no checkpoint` });
    return;
  }

  const err = await discardCheckpointFile(taskId, filePath);
  if (err) {
    res.status(400).json({ error: "discard_file_failed", message: err });
    return;
  }

  broadcastTaskUpdate(task);

  res.json({ success: true, message: `File "${filePath}" discarded from staging`, filePath });
});

// ─── Checkpoint history ────────────────────────────────────────────────────────

router.get("/agent/tasks/:taskId/checkpoint-history", async (req, res) => {
  const { taskId } = req.params;

  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "not_found", message: `Task ${taskId} not found` });
    return;
  }

  const history = getCheckpointHistory(taskId);
  res.json({ taskId, history });
});

export default router;
