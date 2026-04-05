/**
 * evidenceTypes.ts — Frontend mirrors of the backend TaskEvidence types.
 *
 * These are kept in sync with artifacts/api-server/src/lib/sessionManager.ts
 * without importing from the server package (no shared dependency needed).
 */

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

export type StepDependencyClass =
  | "strictly_sequential"
  | "potentially_independent"
  | "verification_gated"
  | "repair_driven";

export interface DependencyAnalysis {
  counts: Record<StepDependencyClass, number>;
  potentiallyIndependentActionIds: string[];
  serialReason: string;
  readBurstUsed?:  boolean;
  readBurstCount?: number;
}

/** Per-lane execution summary captured from a parallel dispatch wave. */
export interface LaneSummary {
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
}

export interface TaskEvidenceExecutionSummary {
  stepsUsed: number;
  stepsMax: number;
  readsUsed: number;
  writesUsed: number;
  commandsUsed: number;
  verificationsDone: number;
  finalPhase: string;
  exitReason: string;
  verificationQuality: string;
  proofStatement: string;
  gateTriggers: Record<string, number> | null;
  shellReadsBlocked: number;
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
  dependencyAnalysis: DependencyAnalysis | null;
  /** task-9: approval gate that was denied (null if none) */
  approvalGateDenied?: string | null;
  /** task-9: number of operator overrides applied */
  appliedOverrideCount?: number;
  /** task-9: lane IDs selectively blocked by operator */
  selectivelyBlockedLanes?: string[] | null;
  /** task-9: per-lane execution summaries from parallel dispatch (null if no parallel ran) */
  laneEvidence?: LaneSummary[] | null;
}

/**
 * P4 (task-9-closeout): Runtime lifecycle evidence surface.
 * Mirrors TaskEvidenceRuntimeLifecycle from sessionManager.ts.
 */
export interface RuntimeSnapshotFE {
  timestamp:  string;
  openPorts:  number[];
  envMeta?: {
    nodeVersion:     string;
    processCount:    number | null;
    relevantEnvKeys: string[];
  };
}

export interface TaskEvidenceRuntimeLifecycle {
  taskStartSnapshot?: RuntimeSnapshotFE;
  postApplySnapshot?: RuntimeSnapshotFE;
  portDiff?: {
    newlyOpened: number[];
    newlyClosed: number[];
    unchanged:   number[];
    hasChange:   boolean;
  };
  processLinkage: Array<{
    port:    number;
    event:   "opened" | "closed";
    command: string;
  }>;
  isStaleAfterApply: boolean | null;
}

export interface TaskEvidence {
  routeProfile: TaskEvidenceRouteProfile;
  planData: TaskEvidencePlan | null;
  checkpointSummary: TaskEvidenceCheckpointSummary | null;
  executionSummary: TaskEvidenceExecutionSummary | null;
  /** P4: Runtime lifecycle evidence (null when not available). */
  runtimeLifecycle?: TaskEvidenceRuntimeLifecycle | null;
}

// ─── Continuation lineage (task-8/9) ──────────────────────────────────────────

export interface WhatRemainsStep {
  id: string;
  label: string;
  status: "completed" | "remaining" | "failed" | "blocked";
  reason?: string;
  filePath?: string;
}

export interface WhatRemains {
  completedSteps: WhatRemainsStep[];
  remainingSteps: WhatRemainsStep[];
  failedSteps: WhatRemainsStep[];
  groundedFrom: {
    checkpointId: string;
    checkpointCreatedAt: string;
  };
}

export interface ContinuationLineage {
  isContinuation: true;
  parentTaskId: string;
  originCheckpointId: string;
  ancestryDepth: number;
  whatRemainedAtResume: WhatRemains;
}
