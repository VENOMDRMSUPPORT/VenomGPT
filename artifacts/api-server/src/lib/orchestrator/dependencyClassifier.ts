/**
 * orchestrator/dependencyClassifier.ts — Step dependency class classifier.
 *
 * Classifies each action step into one of four truthful dependency classes
 * based on the current RunState. Classification is grounded strictly in
 * observable state — no heuristics, no speculation.
 *
 * Classification rules (first match wins):
 *
 *   verification_gated   — unverifiedWrites is non-empty: the agent MUST verify
 *                          before proceeding; this step is gated on prior writes.
 *
 *   repair_driven        — consecutiveFailures > 0 OR lastActionFailed: the step
 *                          is a direct response to a preceding failure.
 *
 *   potentially_independent — the action touches no shared mutable state:
 *                          specifically, a read_file of a file NOT yet in filesRead
 *                          (first access, no dependency on prior steps).
 *
 *   strictly_sequential  — everything else: the step depends on prior context or
 *                          shared mutable state in a way that makes it unsafe to
 *                          run concurrently with any preceding step.
 *
 * Why all steps run serially in the current implementation:
 *   The agent loop is single-threaded and step-sequential by design. Even steps
 *   classified as `potentially_independent` run serially in this session because
 *   the executor does not yet have a parallel dispatch lane. The classification
 *   records what COULD be independent in a future semi-parallel design, not what
 *   IS currently run in parallel.
 */

import type { RunState } from "./types.js";

// ─── Type ─────────────────────────────────────────────────────────────────────

/**
 * Truthful dependency class for a single action step.
 *
 *   strictly_sequential     — depends on prior state; cannot be parallelised.
 *   potentially_independent — first-access read; structurally no prior dependency.
 *   verification_gated      — must wait for verification of an unverified write.
 *   repair_driven           — direct consequence of a preceding failure.
 */
export type StepDependencyClass =
  | "strictly_sequential"
  | "potentially_independent"
  | "verification_gated"
  | "repair_driven";

// ─── Classifier ───────────────────────────────────────────────────────────────

/**
 * Classify the dependency class of an action step given the current RunState.
 *
 * @param state       Current run state (read-only — not mutated here).
 * @param actionType  The action type string (e.g. "read_file", "run_command").
 * @returns           The dependency class for this step.
 */
export function classifyStepDependency(
  state:      RunState,
  action:     Record<string, unknown>,
  actionType: string,
): StepDependencyClass {
  // Rule 1 — verification_gated: unverified writes exist.
  // This step cannot proceed independently because it depends on the correctness
  // of files written in prior steps that have not yet been verified.
  if (state.unverifiedWrites.size > 0) {
    return "verification_gated";
  }

  // Rule 2 — repair_driven: the agent is recovering from a failure.
  // This step exists solely because a prior step produced an error; it is
  // causally chained to the failing step and cannot be independent.
  if (state.consecutiveFailures > 0 || state.lastActionFailed) {
    return "repair_driven";
  }

  // Rule 3 — potentially_independent: first-access read of a file not yet seen.
  // A read_file that touches a file no prior step has read does not depend on
  // any mutable shared state — it reads the filesystem as it was at task start.
  // If the file has already been read (it is in filesRead), this step depends on
  // context built by a prior read, so it falls through to strictly_sequential.
  if (actionType === "read_file") {
    const filePath = String(action["path"] ?? "");
    if (filePath && !state.filesRead.has(filePath)) {
      return "potentially_independent";
    }
  }

  // Rule 4 — strictly_sequential: all other cases.
  // write_file, run_command, think, list_dir, done, repeated reads, and any
  // action that modifies or depends on shared mutable state (filesWritten,
  // commandsRun, verificationLedger) must execute in order.
  return "strictly_sequential";
}

// ─── Dependency analysis accumulator ─────────────────────────────────────────

/**
 * Accumulated dependency analysis for a task run.
 * Maintained in RunState and persisted in ExecutionSummary.
 */
export interface DependencyAnalysis {
  /** Per-class action counts. */
  counts: Record<StepDependencyClass, number>;
  /**
   * Action ids retrospectively identified as potentially_independent.
   * These are the candidates for future semi-parallel execution.
   */
  potentiallyIndependentActionIds: string[];
  /**
   * Honest plain-language statement of why all steps ran serially in this run.
   * Always true regardless of classification: the executor is single-threaded.
   */
  serialReason: string;
  /**
   * Whether a semi-parallel read burst was dispatched from the planning phase
   * filesToRead list before the main agent loop.  Set to true by the read burst
   * executor integration in agentLoop.ts.
   */
  readBurstUsed: boolean;
  /** Number of files successfully read during the pre-loop burst (0 if burst not used). */
  readBurstCount: number;
}

/**
 * Create a fresh DependencyAnalysis accumulator.
 */
export function createDependencyAnalysis(): DependencyAnalysis {
  return {
    counts: {
      strictly_sequential:     0,
      potentially_independent: 0,
      verification_gated:      0,
      repair_driven:           0,
    },
    potentiallyIndependentActionIds: [],
    serialReason:
      "All steps ran serially: the agent executor is single-threaded and processes " +
      "one action at a time regardless of theoretical independence.",
    readBurstUsed:  false,
    readBurstCount: 0,
  };
}

/**
 * Record a classified step into the accumulator.
 *
 * @param analysis    The accumulator to update (mutated in-place).
 * @param depClass    The dependency class of the step.
 * @param actionId    The action record id (used to track independent candidates).
 */
export function recordDependencyClass(
  analysis:  DependencyAnalysis,
  depClass:  StepDependencyClass,
  actionId:  string,
): void {
  analysis.counts[depClass]++;
  if (depClass === "potentially_independent") {
    analysis.potentiallyIndependentActionIds.push(actionId);
  }
}

/**
 * Build a plain-language planning-phase scheduling truth summary for a given
 * ExecutionProfile category. This is emitted as the post-planning
 * `scheduling_truth` event so operators see the expected dependency shape
 * before the run begins.
 */
export function buildPlanningPhaseTruth(category: string): string {
  switch (category) {
    case "code_edit":
      return (
        `This is a code_edit run — expected dependency shape: ` +
        `reads will be potentially_independent (first-access file reads with no prior dependency), ` +
        `writes will be strictly_sequential (depend on read content), ` +
        `and commands after writes will be verification_gated. ` +
        `All steps will run serially regardless of classification.`
      );
    case "code_verify":
    case "server_check":
      return (
        `This is a ${category} run — expected dependency shape: ` +
        `reads may be potentially_independent, ` +
        `commands will be verification_gated after any writes, ` +
        `and repair commands will be repair_driven if failures occur. ` +
        `All steps will run serially regardless of classification.`
      );
    case "conversational":
    case "text_explain":
      return (
        `This is a ${category} run — no file operations expected. ` +
        `All steps will be strictly_sequential (conversational context chain). ` +
        `No semi-parallel candidates anticipated.`
      );
    default:
      return (
        `This is a ${category} run — dependency shape depends on the actions taken. ` +
        `Steps will be classified as strictly_sequential, potentially_independent, ` +
        `verification_gated, or repair_driven based on run state at each action. ` +
        `All steps will run serially regardless of classification.`
      );
  }
}

/**
 * Build a plain-language done-phase scheduling truth summary from the
 * accumulated DependencyAnalysis. This is emitted as the `done`
 * `scheduling_truth` event.
 */
export function buildDonePhaseTruth(analysis: DependencyAnalysis): string {
  const { counts, potentiallyIndependentActionIds, serialReason, readBurstUsed, readBurstCount } = analysis;
  const total =
    counts.strictly_sequential +
    counts.potentially_independent +
    counts.verification_gated +
    counts.repair_driven;

  const parts: string[] = [];
  parts.push(`Dependency shape for this run (${total} classified action records):`);
  parts.push(`  strictly_sequential: ${counts.strictly_sequential}`);
  parts.push(`  potentially_independent: ${counts.potentially_independent}`);
  parts.push(`  verification_gated: ${counts.verification_gated}`);
  parts.push(`  repair_driven: ${counts.repair_driven}`);

  if (readBurstUsed) {
    parts.push(
      `Semi-parallel read burst: ${readBurstCount} file${readBurstCount !== 1 ? "s" : ""} read ` +
      `concurrently via Promise.all before the main agent loop (from planning filesToRead list).`
    );
  } else {
    parts.push(`No pre-loop read burst was used in this run.`);
  }

  if (potentiallyIndependentActionIds.length > 0) {
    parts.push(
      `Retrospective semi-parallelism candidates: ` +
      `${potentiallyIndependentActionIds.length} step(s) were potentially_independent ` +
      `(first-access file reads with no shared mutable state dependency).`
    );
  } else {
    parts.push(`No steps were identified as semi-parallelism candidates in this run.`);
  }

  parts.push(`Serial execution reason: ${serialReason}`);

  return parts.join("\n");
}
