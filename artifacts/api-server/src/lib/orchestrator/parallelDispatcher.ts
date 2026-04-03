/**
 * parallelDispatcher.ts — Bounded parallel dispatch lane.
 *
 * Acts on existing dependency truth (classifyStepDependency output) to dispatch
 * potentially_independent steps concurrently under a hard per-wave budget cap.
 */

import { logger } from "../logger.js";
import { readFile as readFileFromDisk } from "../fileTools.js";
import type { StepDependencyClass } from "./actionModel.js";
import { actionStore, ActionType, ActionStatus } from "./actionStore.js";
import type { VerifyResultMeta } from "./actionModel.js";
import type { RunState } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DispatchableStep {
  stepId:              string;
  filePath:            string;
  dependencyClass:     StepDependencyClass;
  sideEffectClass?:    string;
  isVerificationGated?: boolean;
  isRepairDriven?:     boolean;
  dependentStepIds?:   string[];
}

/**
 * Per-lane verification outcome derived from orchestrator-observed verification
 * ledger entries scoped to the lane's taskId/laneId — NOT from raw dispatch status.
 *
 *   passed       — at least one VERIFY_RESULT action for this lane passed
 *   failed       — all VERIFY_RESULT actions for this lane failed (or quality: "none")
 *   deferred     — lane completed but no verification evidence was recorded
 *   inconclusive — mixed pass/fail signals; cannot determine a clear outcome
 */
export type LaneVerificationOutcome = "passed" | "failed" | "deferred" | "inconclusive";

export interface LaneResult {
  laneId:                  string;
  stepId:                  string;
  filePath:                string;
  status:                  "success" | "failed" | "cancelled";
  content:                 string | null;
  error:                   string | null;
  durationMs:              number;
  aborted:                 boolean;
  actionRecordId?:         string;
  /**
   * Per-lane verification outcome derived from real orchestrator-observed verification
   * events (ledger entries) for this lane — never from raw dispatch status alone.
   * Populated after each wave settles via deriveVerificationOutcome().
   */
  verificationOutcome?:    LaneVerificationOutcome;
}

export type DispatchMode = "parallel" | "serial_fallback";

export interface SerializationReason {
  stepId:  string;
  reason:  string;
}

export interface DispatchResult {
  dispatchMode:    DispatchMode;
  laneCount:       number;
  laneResults:     LaneResult[];
  serializedSteps: SerializationReason[];
  mergeIsSafe:     boolean;
  joinStatus:      string;
  mergedContent:   Map<string, string>;
  abortCause?:     "cancellation" | "pause";
  /**
   * Map from laneId → LaneVerificationOutcome, derived after the wave settles
   * from real VERIFY_RESULT action records (not raw dispatch status).
   * Present after each wave; key set mirrors laneResults[*].laneId.
   */
  laneVerificationOutcomes: Map<string, LaneVerificationOutcome>;
}

// ─── Lane verification outcome derivation ────────────────────────────────────

/**
 * Derive the verification outcome for a single lane from the orchestrator's
 * own VERIFY_RESULT action records. This is the authoritative source — it is
 * derived from recorded evidence, not from the raw "success"|"failed"|"cancelled"
 * dispatch status which only reflects the I/O outcome of the lane's operation.
 *
 * Algorithm:
 *   1. Collect all VERIFY_RESULT records for this task that are tagged with laneId.
 *   2. If none → "deferred" (lane ran but produced no verification evidence).
 *   3. If all passed → "passed".
 *   4. If all failed → "failed".
 *   5. Mixed → "inconclusive".
 */
export function deriveVerificationOutcome(
  taskId: string,
  laneId: string,
): LaneVerificationOutcome {
  const allRecords = actionStore.getActions(taskId);
  const laneVerifyRecords = allRecords.filter(
    r => r.type === ActionType.VERIFY_RESULT &&
         r.laneId === laneId &&
         (r.status === ActionStatus.Completed || r.status === ActionStatus.Failed)
  );

  if (laneVerifyRecords.length === 0) return "deferred";

  let passedCount = 0;
  let failedCount = 0;

  for (const rec of laneVerifyRecords) {
    const meta = rec.meta as VerifyResultMeta;
    if (meta.passed) {
      passedCount++;
    } else {
      failedCount++;
    }
  }

  if (passedCount > 0 && failedCount === 0) return "passed";
  if (failedCount > 0 && passedCount === 0) return "failed";
  if (passedCount > 0 && failedCount > 0)   return "inconclusive";
  return "deferred";
}

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_MAX_LANES = 3;
const SAFE_SIDE_EFFECTS = new Set(["read_only"]);

// ─── Eligibility gate ─────────────────────────────────────────────────────────

export function parallelEligibilityGate(
  step:  DispatchableStep,
  state: RunState,
): { eligible: true } | { eligible: false; reason: string } {
  if (step.dependencyClass !== "potentially_independent") {
    return { eligible: false, reason: `dependency_class: "${step.dependencyClass}"` };
  }
  // Fail-closed: only explicitly-safe side-effect classes are admitted.
  // Unknown or absent classification serializes by default.
  if (!step.sideEffectClass || !SAFE_SIDE_EFFECTS.has(step.sideEffectClass)) {
    return { eligible: false, reason: `side_effect_class: "${step.sideEffectClass ?? "unknown"}"` };
  }
  if (step.isVerificationGated || state.unverifiedWrites.size > 0) {
    return { eligible: false, reason: `verification_gated` };
  }
  if (step.isRepairDriven || state.consecutiveFailures > 0 || state.lastActionFailed) {
    return { eligible: false, reason: `repair_driven` };
  }
  if (state.filesRead.has(step.filePath)) {
    return { eligible: false, reason: `redundant_read` };
  }
  if (state.filesRead.size >= state.profile.maxFileReads) {
    return { eligible: false, reason: `read_cap_exceeded` };
  }
  return { eligible: true };
}

// ─── Join ─────────────────────────────────────────────────────────────────────

function joinLanes(laneResults: LaneResult[]): {
  mergeIsSafe:   boolean;
  joinStatus:    string;
  mergedContent: Map<string, string>;
} {
  const mergedContent = new Map<string, string>();
  const seen          = new Set<string>();
  let   conflict      = "";

  for (const lane of laneResults) {
    if (lane.status !== "success" || lane.content === null) continue;
    if (seen.has(lane.filePath)) {
      conflict = lane.filePath;
    } else {
      seen.add(lane.filePath);
      mergedContent.set(lane.filePath, lane.content);
    }
  }

  const ok  = laneResults.filter(r => r.status === "success").length;
  const bad = laneResults.filter(r => r.status !== "success").length;

  if (conflict) {
    return { mergeIsSafe: false, joinStatus: `join_conflict: "${conflict}"`, mergedContent };
  }
  if (bad > 0) {
    return { mergeIsSafe: false, joinStatus: `join_partial: ${ok} ok, ${bad} not-ok`, mergedContent };
  }
  return { mergeIsSafe: true, joinStatus: `join_ok: ${ok} lanes`, mergedContent };
}

// ─── Wave executor ────────────────────────────────────────────────────────────

async function executeWave(
  cohort:      DispatchableStep[],
  taskId:      string,
  isCancelled: () => boolean,
  slotOffsets: number[],
  waveStartMs: number,
): Promise<LaneResult[]> {
  if (cohort.length === 0) return [];

  // One AbortController per lane — signal flows into readFileFromDisk for cooperative I/O abort
  const controllers = cohort.map(() => new AbortController());
  const stepIdToIdx = new Map(cohort.map((s, i) => [s.stepId, i]));

  const lanePromises = cohort.map(async (step, laneIdx): Promise<LaneResult> => {
    const laneId  = `lane-${slotOffsets[laneIdx] ?? laneIdx}`;
    const startMs = Date.now();
    const ctrl    = controllers[laneIdx]!;

    if (ctrl.signal.aborted || isCancelled()) {
      return { laneId, stepId: step.stepId, filePath: step.filePath,
               status: "cancelled", content: null, error: "before-start", durationMs: 0, aborted: true };
    }

    try {
      // AbortSignal passed to readFileFromDisk — fs.readFile propagates it; AbortError thrown on abort
      const { content } = await readFileFromDisk(step.filePath, taskId, laneId, ctrl.signal);
      return { laneId, stepId: step.stepId, filePath: step.filePath,
               status: "success", content, error: null,
               durationMs: Date.now() - startMs, aborted: false };
    } catch (err) {
      const aborted = ctrl.signal.aborted || (err instanceof DOMException && err.name === "AbortError");
      if (!aborted) {
        logger.warn({ taskId, laneId, filePath: step.filePath, err: String(err) }, "[Dispatcher] Lane failed");
        // Abort dependent sibling lanes in this wave
        for (const depId of step.dependentStepIds ?? []) {
          const depIdx = stepIdToIdx.get(depId);
          if (depIdx !== undefined && depIdx !== laneIdx) controllers[depIdx]?.abort();
        }
      }
      return { laneId, stepId: step.stepId, filePath: step.filePath,
               status: aborted ? "cancelled" : "failed",
               content: null, error: aborted ? "aborted" : String(err),
               durationMs: Date.now() - startMs, aborted };
    }
  });

  // Cancellation watcher: aborts all controllers when isCancelled fires during wave execution
  let watcherDone = false;
  const watcher = (async () => {
    while (!watcherDone) {
      if (isCancelled()) { for (const c of controllers) c.abort(); return; }
      await new Promise<void>(r => setTimeout(r, 50));
    }
  })();

  const settled = await Promise.allSettled(lanePromises);

  // Stop watcher and ensure all controllers are aborted before returning
  watcherDone = true;
  for (const c of controllers) c.abort();
  await watcher;

  return settled.map((s, laneIdx) => {
    if (s.status === "fulfilled") return s.value;
    const step   = cohort[laneIdx]!;
    const laneId = `lane-${slotOffsets[laneIdx] ?? laneIdx}`;
    logger.error({ taskId, laneId, reason: s.reason }, "[Dispatcher] Unexpected lane rejection");
    return { laneId, stepId: step.stepId, filePath: step.filePath,
             status: "failed" as const, content: null, error: String(s.reason),
             durationMs: Date.now() - waveStartMs, aborted: false };
  });
}

// ─── Lane control safety check ─────────────────────────────────────────────────

export interface LaneSteeringResult {
  safe: true;
}

export interface LaneSteeringRejection {
  safe: false;
  reason: string;
}

/**
 * Validate that a per-lane steering signal is safe to apply.
 * Rejects steering that would corrupt the join/merge truth of an in-progress wave.
 *
 * Rules:
 *   - "proceed" is always safe (unblocking a lane).
 *   - "cancelled": safe unless the lane already has a "proceed" signal recorded
 *     (i.e. was previously un-paused and may have results in flight). The dispatcher
 *     enforces the cancel at the next wave boundary; this check warns the operator.
 *   - "paused": safe unless the lane was already cancelled (irreversible).
 *     The dispatcher will spin-wait at the wave boundary until the signal changes.
 *   - Both signals are applied cooperatively — they take effect before the next
 *     wave executes, not mid-step. This is documented to the caller.
 */
export function validateLaneSteering(
  laneId: string,
  signal: "paused" | "cancelled" | "proceed",
  state: RunState,
): { safe: true } | { safe: false; reason: string; code: string } {
  // "proceed" always removes a prior signal — safe in all states.
  if (signal === "proceed") {
    return { safe: true };
  }

  const existing = state.laneControlSignals.get(laneId);

  // ── Invariant 1: Cannot pause an already-cancelled lane ──
  // Pausing a cancelled lane is a no-op at best and confusing at worst — the lane has
  // already exited its dispatch slot. Operator must use "proceed" first to restore it.
  if (signal === "paused" && existing === "cancelled") {
    return {
      safe:   false,
      reason: `Lane '${laneId}' is already cancelled. Use 'proceed' to restore it before pausing, or let the task finish.`,
      code:   "lane_steering_unsafe",
    };
  }

  // ── Invariant 2: Cannot pause or cancel a lane that is selectively blocked ──
  // selectivelyBlockedLaneIds records lanes that were excluded by an operator selective
  // approval. Sending a further pause/cancel to an already-blocked lane creates a
  // conflicting signal that has no defined merge semantics — reject explicitly.
  // (signal is always "paused" | "cancelled" here — "proceed" was returned above)
  if (state.selectivelyBlockedLaneIds.has(laneId)) {
    return {
      safe:   false,
      reason: `Lane '${laneId}' is already selectively blocked by an operator approval decision. Sending a '${signal}' signal would conflict. Use 'proceed' to unblock it instead.`,
      code:   "lane_steering_unsafe",
    };
  }

  // ── Invariant 3: Idempotency — no-op signals are safe but auditable ──
  // A pause on an already-paused lane or a cancel on an already-cancelled lane is
  // technically safe (idempotent), but return safe: true so caller can log if desired.
  if (signal === existing) {
    return { safe: true };
  }

  // ── Invariant 4: All other transitions are safe ──
  // proceed→pause, proceed→cancel, <unset>→pause, <unset>→cancel, paused→cancel
  // These are well-defined: signals take effect at the next wave boundary.
  return { safe: true };
}

/**
 * validateSelectiveSafety — rejects a selective approval where any approved lane has a
 * prerequisite in a blocked lane (B → A means A needs B's output; blocking B while
 * approving A creates a dangling dependency).
 *
 * DispatchableStep.dependentStepIds = downstream steps that wait for this step.
 * To find prerequisites of A: look for steps S where S.dependentStepIds includes A.stepId.
 */
export function validateSelectiveSafety(
  approvedLaneIds:  string[],
  blockedLaneIds:   string[],
  stepsByLaneId:    Map<string, DispatchableStep>,
): { safe: true } | { safe: false; reason: string; code: string; unsafeLanes: string[] } {
  if (blockedLaneIds.length === 0) return { safe: true };

  // Build approved step IDs set for fast lookup
  const approvedStepIds = new Set<string>();
  for (const laneId of approvedLaneIds) {
    const step = stepsByLaneId.get(laneId);
    if (step) approvedStepIds.add(step.stepId);
  }

  // Find blocked lane IDs that have APPROVED steps in their downstream dependents.
  // A blocked step B → approved step A means: A expects B's output as a prerequisite.
  // Approving A while blocking B creates a dangling dependency.
  const unsafeApprovedLanes: string[] = [];
  const blockedSet = new Set(blockedLaneIds);

  for (const blockedLaneId of blockedLaneIds) {
    const blockedStep = stepsByLaneId.get(blockedLaneId);
    if (!blockedStep || !blockedStep.dependentStepIds) continue;
    // blockedStep.dependentStepIds = steps that wait for blockedStep to finish
    for (const downstreamStepId of blockedStep.dependentStepIds) {
      // If this downstream step lives in an approved lane, approval is unsafe
      for (const [approvedLaneId, approvedStep] of stepsByLaneId) {
        if (
          approvedLaneIds.includes(approvedLaneId) &&
          approvedStep.stepId === downstreamStepId
        ) {
          if (!unsafeApprovedLanes.includes(approvedLaneId)) {
            unsafeApprovedLanes.push(approvedLaneId);
          }
        }
      }
    }
  }

  if (unsafeApprovedLanes.length > 0) {
    return {
      safe:       false,
      reason:     `Selective approval is unsafe: approved lanes [${unsafeApprovedLanes.join(", ")}] have prerequisites in blocked lanes [${blockedLaneIds.filter(b => {
        const bs = stepsByLaneId.get(b);
        return bs?.dependentStepIds?.some(d => approvedStepIds.has(d));
      }).join(", ")}]. Approving them would create dangling dependencies — they require outputs that won't be produced. Approve the full gate or adjust the lane split.`,
      code:       "lane_steering_unsafe",
      unsafeLanes: unsafeApprovedLanes,
    };
  }
  return { safe: true };
}

export async function parallelDispatcher(
  steps:       DispatchableStep[],
  taskId:      string,
  state:       RunState,
  maxLanes:    number = DEFAULT_MAX_LANES,
  isCancelled: () => boolean = () => false,
  isPaused:    () => boolean = () => false,
): Promise<DispatchResult> {
  if (steps.length === 0) {
    return { dispatchMode: "serial_fallback", laneCount: 0, laneResults: [],
             serializedSteps: [], mergeIsSafe: true, joinStatus: "join_ok: no steps",
             mergedContent: new Map(), laneVerificationOutcomes: new Map() };
  }

  // Gate each step using advancing admittedPaths to enforce cohort-level read budget
  // Also respect operator selectively blocked lane IDs from state.
  const eligible:     DispatchableStep[]    = [];
  const serialized:   SerializationReason[] = [];
  const admittedPaths = new Set<string>(state.filesRead);

  for (const step of steps) {
    const gate = parallelEligibilityGate(step, { ...state, filesRead: admittedPaths });
    if (gate.eligible) {
      eligible.push(step);
      admittedPaths.add(step.filePath);
    } else {
      serialized.push({ stepId: step.stepId, reason: gate.reason });
    }
  }

  if (eligible.length === 0) {
    return { dispatchMode: "serial_fallback", laneCount: 0, laneResults: [],
             serializedSteps: serialized, mergeIsSafe: true,
             joinStatus: "join_ok: no eligible steps", mergedContent: new Map(),
             laneVerificationOutcomes: new Map() };
  }

  // Build forward-dependency map for cohort-wide failure isolation across waves
  const dependentMap = new Map<string, Set<string>>();
  for (const step of eligible) {
    for (const depId of step.dependentStepIds ?? []) {
      if (!dependentMap.has(step.stepId)) dependentMap.set(step.stepId, new Set());
      dependentMap.get(step.stepId)!.add(depId);
    }
  }

  const allLaneResults:          LaneResult[] = [];
  const globallyCancelledStepIds = new Set<string>();
  let   waveOffset               = 0;
  let   abortCause: "cancellation" | "pause" | undefined;

  for (let i = 0; i < eligible.length; i += maxLanes) {
    if (isPaused()) {
      // Pause: mark remaining steps cancelled and record cause
      abortCause = "pause";
      let off = 0;
      for (const step of eligible.slice(i)) {
        allLaneResults.push({ laneId: `lane-${waveOffset + off}`, stepId: step.stepId,
                               filePath: step.filePath, status: "cancelled", content: null,
                               error: "paused", durationMs: 0, aborted: true });
        off++;
      }
      break;
    }
    if (isCancelled()) {
      abortCause = "cancellation";
      let off = 0;
      for (const step of eligible.slice(i)) {
        allLaneResults.push({ laneId: `lane-${waveOffset + off}`, stepId: step.stepId,
                               filePath: step.filePath, status: "cancelled", content: null,
                               error: "cancelled", durationMs: 0, aborted: true });
        off++;
      }
      break;
    }

    const wave        = eligible.slice(i, i + maxLanes);
    const waveStartMs = Date.now();

    // Populate lastDispatchPlan so approve-selective can validate isolation safety
    // against the real lane-step mapping for this wave.
    state.lastDispatchPlan = new Map(wave.map((s, idx) => [`lane-${waveOffset + idx}`, s]));

    // Pre-cancel steps that are dependents of globally-failed steps from earlier waves,
    // or that have an operator lane-cancel signal.
    // Paused lanes: spin-wait at the wave boundary until the signal clears or becomes cancelled.
    const laneSignal = (s: DispatchableStep, slotIdx: number): "paused" | "cancelled" | "proceed" | undefined => {
      const laneId = `lane-${waveOffset + slotIdx}`;
      return state.laneControlSignals.get(laneId);
    };
    const laneSignalCancelled = (s: DispatchableStep, slotIdx: number): boolean =>
      laneSignal(s, slotIdx) === "cancelled";

    // Spin-wait for any lanes that are currently paused before running this wave.
    // We wait in 200ms intervals and re-check the signal. Cancelled tasks abort the wait.
    const pausedSlots = wave.filter((s, idx) =>
      !globallyCancelledStepIds.has(s.stepId) && laneSignal(s, idx) === "paused"
    );
    if (pausedSlots.length > 0 && !isCancelled()) {
      logger.info({ taskId, pausedCount: pausedSlots.length, waveOffset }, "[Dispatcher] Wave has paused lanes — waiting for operator resume");
      let waitMs = 0;
      while (!isCancelled()) {
        const stillPaused = wave.some((s, idx) =>
          !globallyCancelledStepIds.has(s.stepId) && laneSignal(s, idx) === "paused"
        );
        if (!stillPaused) break;
        await new Promise<void>(r => setTimeout(r, 200));
        waitMs += 200;
        if (waitMs > 300_000) {
          // Safety: after 5 min, treat paused lanes as cancelled
          for (const [idx, s] of wave.entries()) {
            if (!globallyCancelledStepIds.has(s.stepId) && laneSignal(s, idx) === "paused") {
              state.laneControlSignals.set(`lane-${waveOffset + idx}`, "cancelled");
            }
          }
          break;
        }
      }
    }

    const preCancelled  = wave.filter((s, idx) =>
      globallyCancelledStepIds.has(s.stepId) || laneSignalCancelled(s, idx)
    );
    const runnableSteps = wave.filter((s, idx) =>
      !globallyCancelledStepIds.has(s.stepId) && !laneSignalCancelled(s, idx)
    );

    for (const step of preCancelled) {
      const slotIdx = wave.indexOf(step);
      // Distinguish operator-steered cancellation from upstream dependency failure.
      // An operator cancel signal on the lane takes precedence and must be labelled
      // separately so evidence/troubleshooting does not conflate the two causes.
      const isOperatorCancelled = laneSignalCancelled(step, slotIdx);
      const cancelError = isOperatorCancelled ? "operator-lane-cancelled" : "upstream-dependency-failed";
      allLaneResults.push({ laneId: `lane-${waveOffset + slotIdx}`, stepId: step.stepId,
                             filePath: step.filePath, status: "cancelled", content: null,
                             error: cancelError, durationMs: 0, aborted: true });
    }

    logger.info({ taskId, waveSize: wave.length, runnable: runnableSteps.length,
                  preCancelled: preCancelled.length, waveOffset }, "[Dispatcher] Wave");

    const slotOffsets = runnableSteps.map(s => waveOffset + wave.indexOf(s));
    let   waveResults: LaneResult[] = [];
    if (runnableSteps.length > 0) {
      waveResults = await executeWave(runnableSteps, taskId, () => isCancelled() || isPaused(), slotOffsets, waveStartMs);
      allLaneResults.push(...waveResults);
    }

    // After wave settles, mark dependents of failed steps globally cancelled
    for (const result of waveResults) {
      if (result.status === "failed") {
        for (const depId of dependentMap.get(result.stepId) ?? []) {
          globallyCancelledStepIds.add(depId);
        }
      }
    }

    waveOffset += wave.length;

    // Check if pause/cancel interrupted mid-wave
    if (isPaused() && !abortCause) abortCause = "pause";
    if (isCancelled() && !abortCause) abortCause = "cancellation";
    if (abortCause) break;
  }

  const { mergeIsSafe, joinStatus, mergedContent } = joinLanes(allLaneResults);

  // Derive per-lane verification outcomes from real lane-scoped VERIFY_RESULT
  // ledger records. Parallel lanes in this dispatcher only read files — they do
  // not run verification commands — so outcomes are typically "deferred".
  // "deferred" is structurally correct and honest: the lane ran but produced no
  // independent verification evidence. Non-deferred outcomes arise only when
  // agent verification actions are run within a lane context (laneId tagged).
  const laneVerificationOutcomes = new Map<string, LaneVerificationOutcome>();
  for (const lane of allLaneResults) {
    const outcome = deriveVerificationOutcome(taskId, lane.laneId);
    lane.verificationOutcome = outcome;
    laneVerificationOutcomes.set(lane.laneId, outcome);
  }

  // Purge per-lane signals for slots just completed — lane-N IDs restart at 0 on the
  // next parallelDispatcher() invocation, so signals must not bleed across dispatches.
  for (let slot = 0; slot < waveOffset; slot++) {
    const laneId = `lane-${slot}`;
    state.laneControlSignals.delete(laneId);
    state.selectivelyBlockedLaneIds.delete(laneId);
  }
  // Clear lastDispatchPlan — only valid for the wave that just ran.
  state.lastDispatchPlan = new Map();

  logger.info({ taskId, lanes: allLaneResults.length, mergeIsSafe, joinStatus, abortCause,
                cleanedSlots: waveOffset }, "[Dispatcher] Complete");

  return { dispatchMode: "parallel", laneCount: allLaneResults.length, laneResults: allLaneResults,
           serializedSteps: serialized, mergeIsSafe, joinStatus, mergedContent, abortCause,
           laneVerificationOutcomes };
}
