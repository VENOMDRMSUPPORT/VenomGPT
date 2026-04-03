/**
 * agentLoop/evidenceAssembler.ts — Task evidence assembly.
 *
 * Extracted from agentLoop.ts — no behavior changes.
 *
 * Scans the task's in-memory events[] for the five key structured event types
 * and assembles a TaskEvidence snapshot. Called after emitExecutionSummary at
 * every exit point so the evidence is attached before updateTaskStatus fires the
 * persistence hook (which strips events[] via AgentTaskSummary).
 *
 * Evidence retention boundary:
 *   PERSISTED  — routeProfile, planData, checkpointSummary, executionSummary
 *   NOT PERSISTED — the full events[] array (too large; live-session only)
 */

import {
  getTask,
  type TaskEvidence,
  type TaskEvidenceCheckpointSummary,
  type TaskEvidenceRuntimeLifecycle,
  type ExitReason,
  type AgentEvent,
} from "../sessionManager.js";
import { getCheckpoint, serializeCheckpoint, classifyRuntimeImpactFiles } from "../orchestrator/checkpoint.js";
import type { RunState } from "../orchestrator/types.js";
import { buildRuntimeLifecycleRecord } from "../orchestrator/runtimeLifecycle.js";
import { actionStore, ActionType, ActionStatus } from "../orchestrator/actionStore.js";
import type { VerifyResultMeta } from "../orchestrator/actionModel.js";

// ─── Verification evidence derivation ─────────────────────────────────────────

/**
 * Derive verification contributors from real orchestrator-observed evidence only.
 *
 * Sources (in order of priority):
 *   1. VerificationEntry objects from the task's verificationLedger (if available via runState)
 *   2. VERIFY_RESULT ActionRecord entries from the actionStore
 *
 * NEVER populated from plan steps, step counts, model narration, or agent-reported tags.
 * When no real evidence exists → contributors: [], confidence: "none".
 *
 * Returns an object with contributors (string[]) and confidence level.
 */
function deriveVerificationEvidence(
  taskId: string,
  runState: RunState | null,
): { contributors: string[]; confidence: "none" | "low" | "medium" | "high" } {
  const contributors: string[] = [];

  // ── Source 1: Real VerificationEntry objects from the ledger ──────────────
  // These are the highest-fidelity source — the ledger records every meaningful
  // proof event observed by the orchestrator during the task run.
  if (runState?.verificationLedger) {
    const entries = runState.verificationLedger.getEntries();
    for (const entry of entries) {
      if (entry.type === "command_success" && entry.sideEffectClass) {
        contributors.push(`command_success:${entry.sideEffectClass}:${entry.detail.slice(0, 80)}`);
      } else if (entry.type === "runtime_probe") {
        const probeDetail = entry.runtimeDiff?.hasChange
          ? `runtime_probe:port_changed:${entry.detail.slice(0, 80)}`
          : entry.serverLivePostCommand
            ? `runtime_probe:server_live:${entry.detail.slice(0, 80)}`
            : `runtime_probe:no_change:${entry.detail.slice(0, 80)}`;
        contributors.push(probeDetail);
      } else if (entry.type === "static_read") {
        contributors.push(`static_read:${entry.detail.slice(0, 80)}`);
      }
    }

    // Map ledger quality to confidence level
    const quality = runState.verificationLedger.getQuality();
    const confidence: "none" | "low" | "medium" | "high" =
      quality === "runtime_confirmed" ? "high"
      : quality === "command_success"  ? "medium"
      : quality === "static_only"      ? "low"
      : "none";

    // De-duplicate contributors (keep order)
    const unique = [...new Set(contributors)];
    return { contributors: unique, confidence };
  }

  // ── Source 2 (fallback): VERIFY_RESULT ActionRecord entries from actionStore ──
  // Used when runState is unavailable (e.g., post-restart evidence assembly
  // from persisted task state). Only real VERIFY_RESULT records are counted —
  // never synthetic proxies, plan steps, or model-narrated outcomes.
  const allRecords = actionStore.getActions(taskId);
  const verifyRecords = allRecords.filter(
    r => r.type === ActionType.VERIFY_RESULT &&
         (r.status === ActionStatus.Completed || r.status === ActionStatus.Failed)
  );

  if (verifyRecords.length === 0) {
    return { contributors: [], confidence: "none" };
  }

  let passedCount = 0;
  let failedCount = 0;

  for (const rec of verifyRecords) {
    const meta = rec.meta as VerifyResultMeta;
    const label = `verify_result:${meta.method ?? "unknown"}:${meta.probe?.slice(0, 60) ?? ""}`;
    contributors.push(label);
    if (meta.passed) passedCount++; else failedCount++;
  }

  // Confidence from actionStore fallback: without the ledger we cannot distinguish
  // command_success vs runtime_confirmed quality levels, so cap at "low".
  // When all records failed → "none" (no positive evidence).
  const confidence: "none" | "low" | "medium" | "high" =
    passedCount > 0 ? "low" : "none";

  return { contributors: [...new Set(contributors)], confidence };
}

// ─── Lane evidence derivation ──────────────────────────────────────────────────

type LaneSummaryEntry = {
  laneId: string;
  stepId: string;
  filePath: string;
  status: string;
  durationMs: number | null;
  error: string | null;
  verificationOutcome: string | null;
  dependencyClass: string | null;
  stepCount: number;
};

/**
 * Derive per-lane execution summaries from parallel_join events.
 * Used as a fallback when RunState.parallelLaneSummaries is not available
 * (e.g. older tasks assembled before the field existed).
 * Returns null when no parallel dispatch ran.
 */
function deriveLaneEvidenceFromEvents(events: AgentEvent[]): LaneSummaryEntry[] | null {
  const joinEvents = events.filter(e => e.type === "parallel_join");
  if (joinEvents.length === 0) return null;

  const allLaneEntries: LaneSummaryEntry[] = [];

  for (const joinEvent of joinEvents) {
    const d = joinEvent.data;
    if (!d) continue;
    const report = d["unifiedStepReport"];
    if (!Array.isArray(report)) continue;

    // Count steps per lane within this join event for per-lane step count
    const laneStepCounts = new Map<string, number>();
    for (const entry of report) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (e["dispatchMode"] !== "parallel") continue;
      const lid = typeof e["laneId"] === "string" ? e["laneId"] : null;
      if (!lid) continue;
      laneStepCounts.set(lid, (laneStepCounts.get(lid) ?? 0) + 1);
    }

    for (const entry of report) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (e["dispatchMode"] !== "parallel") continue;
      const laneId = typeof e["laneId"] === "string" ? e["laneId"] : null;
      if (!laneId) continue;
      allLaneEntries.push({
        laneId,
        stepId:              typeof e["stepId"]             === "string" ? e["stepId"]             : "",
        filePath:            typeof e["filePath"]           === "string" ? e["filePath"]           : "",
        status:              typeof e["status"]             === "string" ? e["status"]             : "unknown",
        durationMs:          typeof e["durationMs"]         === "number" ? e["durationMs"]         : null,
        error:               typeof e["error"]              === "string" ? e["error"]              : null,
        verificationOutcome: typeof e["verificationOutcome"] === "string" ? e["verificationOutcome"] : null,
        dependencyClass:     typeof e["dependencyClass"]    === "string" ? e["dependencyClass"]    : null,
        stepCount:           laneStepCounts.get(laneId) ?? 1,
      });
    }
  }

  return allLaneEntries.length > 0 ? allLaneEntries : null;
}

/**
 * Normalize raw per-step lane entries into one aggregated LaneSummaryEntry per laneId.
 * Aggregation rules:
 *   - status: "failed" if any entry failed, "cancelled" if any cancelled, else first
 *   - durationMs: sum of non-null durations
 *   - error: first non-null error
 *   - verificationOutcome: "failed" > "deferred" > "passed"; first non-deferred wins
 *   - dependencyClass: from first entry (all steps in a lane share the same class)
 *   - stepCount: count of entries per laneId in this raw batch
 */
function normalizeLaneEntries(raw: LaneSummaryEntry[]): LaneSummaryEntry[] {
  if (raw.length === 0) return [];

  const byLane = new Map<string, LaneSummaryEntry[]>();
  for (const entry of raw) {
    const list = byLane.get(entry.laneId) ?? [];
    list.push(entry);
    byLane.set(entry.laneId, list);
  }

  const normalized: LaneSummaryEntry[] = [];
  for (const [laneId, entries] of byLane.entries()) {
    const hasFailed    = entries.some(e => e.status === "failed" || e.status === "error");
    const hasCancelled = entries.some(e => e.status === "cancelled");
    const aggregateStatus = hasFailed ? "failed" : hasCancelled ? "cancelled" : entries[0].status;

    const totalDuration = entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);

    const firstError = entries.find(e => e.error != null)?.error ?? null;

    // Verification outcome: "failed" wins, then "passed", then "deferred"
    let aggregateVerify: string = "deferred";
    for (const e of entries) {
      const v = e.verificationOutcome ?? "deferred";
      if (v === "failed") { aggregateVerify = "failed"; break; }
      if (v === "passed") aggregateVerify = "passed";
    }

    normalized.push({
      laneId,
      stepId:              entries[0].stepId,
      filePath:            entries[0].filePath,
      status:              aggregateStatus,
      durationMs:          totalDuration > 0 ? totalDuration : null,
      error:               firstError,
      verificationOutcome: aggregateVerify,
      dependencyClass:     entries[0].dependencyClass,
      stepCount:           entries.length,
    });
  }

  // Sort by laneId for stable ordering
  return normalized.sort((a, b) => a.laneId.localeCompare(b.laneId));
}

/**
 * Resolve lane evidence using RunState.parallelLaneSummaries as primary source
 * (accumulated at dispatch time, survives event-cap pruning), falling back to
 * deriveLaneEvidenceFromEvents for older tasks.
 * Always returns normalized per-lane aggregates (one entry per laneId).
 */
function resolveLaneEvidence(events: AgentEvent[], runState: RunState | null): LaneSummaryEntry[] | null {
  // Primary: RunState accumulated summaries (task-9 field, available for live/current runs)
  if (runState && runState.parallelLaneSummaries.length > 0) {
    return normalizeLaneEntries(runState.parallelLaneSummaries);
  }
  // Fallback: scan retained events (works for older tasks, may be limited by event cap)
  const raw = deriveLaneEvidenceFromEvents(events);
  if (!raw) return null;
  return normalizeLaneEntries(raw);
}

export function assembleTaskEvidence(taskId: string, runState: RunState | null, exitReason: ExitReason = "error"): TaskEvidence | null {
  const task = getTask(taskId);
  if (!task) return null;

  const events = task.events;

  // Extract route profile from the "route" event
  const routeEvent = [...events].reverse().find(e => e.type === "route");
  if (!routeEvent?.data) return null; // no route = conversational bypass, no evidence

  const routeProfile = {
    category:       String(routeEvent.data["category"] ?? "unknown"),
    maxSteps:       Number(routeEvent.data["maxSteps"] ?? 0),
    maxFileReads:   Number(routeEvent.data["maxFileReads"] ?? 0),
    maxFileWrites:  Number(routeEvent.data["maxFileWrites"] ?? 0),
    requiresVerify: Boolean(routeEvent.data["requiresVerify"]),
    planningPhase:  Boolean(routeEvent.data["planningPhase"]),
  };

  // Extract plan from the "plan" event (nullable)
  const planEvent = [...events].reverse().find(e => e.type === "plan");
  let planData: TaskEvidence["planData"] = null;
  if (planEvent?.data) {
    const d = planEvent.data;
    planData = {
      goal:            String(d["goal"] ?? ""),
      approach:        String(d["approach"] ?? ""),
      filesToRead:     Array.isArray(d["filesToRead"]) ? d["filesToRead"].map(String) : [],
      expectedChanges: Array.isArray(d["expectedChanges"]) ? d["expectedChanges"].map(String) : [],
      verification:    String(d["verification"] ?? ""),
    };
  }

  // Extract checkpoint summary from the latest "checkpoint" event (nullable).
  // Fallback: if the checkpoint event was evicted by the event cap (MAX_EVENTS_PER_TASK),
  // read directly from the in-memory checkpoint store. This guarantees checkpointSummary
  // is always populated whenever files were staged, regardless of event log length.
  const checkpointEvent = [...events].reverse().find(e => e.type === "checkpoint");
  let checkpointSummary: TaskEvidenceCheckpointSummary | null = null;
  if (checkpointEvent?.data) {
    const d = checkpointEvent.data;
    const filesArr: string[] = [];
    if (Array.isArray(d["files"])) {
      for (const f of d["files"]) {
        if (f && typeof f === "object" && "path" in f) {
          filesArr.push(String((f as Record<string, unknown>)["path"]));
        } else if (typeof f === "string") {
          filesArr.push(f);
        }
      }
    }
    const runtimeImpactFromEvent: string[] = Array.isArray(d["runtimeImpactFiles"])
      ? (d["runtimeImpactFiles"] as unknown[]).map(String)
      : [];
    checkpointSummary = {
      fileCount:          typeof d["fileCount"] === "number" ? d["fileCount"] : filesArr.length,
      files:              filesArr,
      staged:             Boolean(d["staged"]),
      liveUnchanged:      Boolean(d["liveUnchanged"]),
      runtimeImpactFiles: runtimeImpactFromEvent,
    };
  } else {
    // Fallback: read from the checkpoint store directly (event may have been evicted)
    const cp = getCheckpoint(taskId);
    if (cp && cp.snapshots.size > 0) {
      const cpSer = serializeCheckpoint(cp);
      checkpointSummary = {
        fileCount:          cpSer.fileCount,
        files:              cpSer.files.map(f => f.path),
        staged:             cpSer.staged,
        liveUnchanged:      cpSer.staged, // staged implies live workspace unchanged
        runtimeImpactFiles: [], // checkpoint store fallback has no runtimeImpactFiles
      };
    }
  }

  // Extract execution summary from the "execution_summary" event (nullable)
  const execEvent = [...events].reverse().find(e => e.type === "execution_summary");
  let executionSummary: TaskEvidence["executionSummary"] = null;
  if (execEvent?.data) {
    const d = execEvent.data;
    const rawGate = d["gateTriggers"];
    const gateTriggers: Record<string, number> | null =
      rawGate && typeof rawGate === "object" && !Array.isArray(rawGate)
        ? Object.fromEntries(Object.entries(rawGate).map(([k, v]) => [k, Number(v)]))
        : null;

    const rawSideEffects = d["sideEffectsObserved"];
    const sideEffectsObserved = Array.isArray(rawSideEffects)
      ? rawSideEffects.map((e: unknown) => {
          const s = e as Record<string, unknown>;
          return {
            command:         String(s["command"] ?? ""),
            sideEffectClass: String(s["sideEffectClass"] ?? ""),
            trustLevel:      String(s["trustLevel"] ?? ""),
            reason:          String(s["reason"] ?? ""),
          };
        })
      : null;

    const rawRuntime = d["runtimeEvidence"];
    const runtimeEvidence = Array.isArray(rawRuntime)
      ? rawRuntime.map((e: unknown) => {
          const r = e as Record<string, unknown>;
          return {
            newlyOpened: Array.isArray(r["newlyOpened"]) ? r["newlyOpened"].map(Number) : [],
            newlyClosed: Array.isArray(r["newlyClosed"]) ? r["newlyClosed"].map(Number) : [],
            unchanged:   Array.isArray(r["unchanged"])   ? r["unchanged"].map(Number)   : [],
            hasChange:   Boolean(r["hasChange"]),
          };
        })
      : null;

    // Extract phaseTimeline from event data
    const rawPhaseTimeline = d["phaseTimeline"];
    const phaseTimeline = Array.isArray(rawPhaseTimeline)
      ? rawPhaseTimeline.map((e: unknown) => {
          const p = e as Record<string, unknown>;
          return { phase: String(p["phase"] ?? ""), enteredAt: Number(p["enteredAt"] ?? 0) };
        })
      : null;

    // Extract dependencyAnalysis from event data (nullable — older tasks may lack it)
    const rawDA = d["dependencyAnalysis"];
    const dependencyAnalysis = rawDA && typeof rawDA === "object" && !Array.isArray(rawDA)
      ? (() => {
          const da = rawDA as Record<string, unknown>;
          const rawCounts = da["counts"] as Record<string, unknown> | undefined;
          return {
            counts: {
              strictly_sequential:     Number(rawCounts?.["strictly_sequential"]     ?? 0),
              potentially_independent: Number(rawCounts?.["potentially_independent"] ?? 0),
              verification_gated:      Number(rawCounts?.["verification_gated"]      ?? 0),
              repair_driven:           Number(rawCounts?.["repair_driven"]           ?? 0),
            },
            potentiallyIndependentActionIds: Array.isArray(da["potentiallyIndependentActionIds"])
              ? (da["potentiallyIndependentActionIds"] as unknown[]).map(String)
              : [],
            serialReason:   String(da["serialReason"]   ?? ""),
            readBurstUsed:  Boolean(da["readBurstUsed"]  ?? false),
            readBurstCount: Number(da["readBurstCount"]  ?? 0),
          };
        })()
      : null;

    // ── task-2: contributors and confidence from real verification evidence ────
    // Derived from real VerificationEntry / VERIFY_RESULT records only.
    // When event data contains these fields (from a persisted execution_summary
    // that already ran through the evidence assembler), use them directly.
    // Otherwise derive from actionStore fallback.
    const verificationEvidence = deriveVerificationEvidence(taskId, runState);

    executionSummary = {
      stepsUsed:           Number(d["stepsUsed"] ?? 0),
      stepsMax:            Number(d["stepsMax"] ?? 0),
      readsUsed:           Number(d["readsUsed"] ?? 0),
      writesUsed:          Number(d["writesUsed"] ?? 0),
      commandsUsed:        Number(d["commandsUsed"] ?? 0),
      verificationsDone:   Number(d["verificationsDone"] ?? 0),
      finalPhase:          String(d["finalPhase"] ?? ""),
      exitReason:          (String(d["exitReason"] ?? "error")) as ExitReason,
      phaseTimeline,
      verificationQuality: String(d["verificationQuality"] ?? "none"),
      proofStatement:      String(d["proofStatement"] ?? ""),
      gateTriggers,
      shellReadsBlocked:   Number(d["shellReadsBlocked"] ?? 0),
      sideEffectsObserved,
      runtimeEvidence,
      dependencyAnalysis,
      // task-9: operator steering evidence fields
      approvalGateDenied:   d["approvalGateDenied"] != null ? String(d["approvalGateDenied"]) : null,
      appliedOverrideCount: d["appliedOverrideCount"] != null ? Number(d["appliedOverrideCount"]) : 0,
      selectivelyBlockedLanes: Array.isArray(d["selectivelyBlockedLanes"])
        ? (d["selectivelyBlockedLanes"] as unknown[]).map(String)
        : null,
      // task-2: grounded verification contributors and confidence
      contributors:     verificationEvidence.contributors,
      confidence:       verificationEvidence.confidence,
      // task-2: repair cycle outcome from RepairCycleState machine
      repairCycleOutcome: runState?.repairCycleOutcome,
      // task-9: per-lane execution summaries — primary: RunState accumulated, fallback: events
      laneEvidence: resolveLaneEvidence(events, runState),
    };
  } else if (runState !== null) {
    // Fallback: build from live runState if the event wasn't stored (event cap)
    const ledger = runState.verificationLedger.getSummary();
    // phaseTransitions is the append-only ordered log — use directly
    const phaseTimeline = runState.phaseTransitions;

    executionSummary = {
      stepsUsed:           runState.step,
      stepsMax:            runState.maxSteps,
      readsUsed:           runState.filesRead.size,
      writesUsed:          runState.filesWritten.size,
      commandsUsed:        runState.commandsRun.length,
      verificationsDone:   runState.verificationsDone,
      finalPhase:          runState.phase,
      exitReason,
      phaseTimeline:       phaseTimeline.length > 0 ? phaseTimeline : null,
      verificationQuality: ledger.quality,
      proofStatement:      ledger.proofStatement,
      gateTriggers:        Object.keys(runState.gateCounts).length > 0
        ? Object.fromEntries(Object.entries(runState.gateCounts).map(([k, v]) => [k, Number(v)]))
        : null,
      shellReadsBlocked:   runState.shellReadsBlocked,
      sideEffectsObserved: runState.sideEffectsObserved.length > 0
        ? runState.sideEffectsObserved.map(e => ({
            command:         e.command.slice(0, 120),
            sideEffectClass: e.classification.sideEffectClass,
            trustLevel:      e.classification.trustLevel,
            reason:          e.classification.reason,
          }))
        : null,
      runtimeEvidence: ledger.runtimeEvidence.length > 0
        ? ledger.runtimeEvidence.map(d => ({
            newlyOpened: d.newlyOpened,
            newlyClosed: d.newlyClosed,
            unchanged:   d.unchanged,
            hasChange:   d.hasChange,
          }))
        : null,
      dependencyAnalysis: {
        counts:                          runState.dependencyAnalysis.counts,
        potentiallyIndependentActionIds: runState.dependencyAnalysis.potentiallyIndependentActionIds,
        serialReason:                    runState.dependencyAnalysis.serialReason,
        readBurstUsed:                   runState.dependencyAnalysis.readBurstUsed,
        readBurstCount:                  runState.dependencyAnalysis.readBurstCount,
      },
      // task-9: operator steering evidence fields — populated from live runState
      approvalGateDenied:      runState.approvalGates.find(g => g.status === "denied")?.id ?? null,
      appliedOverrideCount:    runState.appliedOverrides.length,
      selectivelyBlockedLanes: runState.selectivelyBlockedLaneIds.size > 0
        ? [...runState.selectivelyBlockedLaneIds]
        : null,
      // task-2: grounded verification contributors and confidence from real evidence
      // Derived from live verificationLedger entries — the highest fidelity source.
      // Empty when no real verification evidence was observed.
      ...deriveVerificationEvidence(taskId, runState),
      // task-2: repair cycle outcome from RepairCycleState machine
      repairCycleOutcome: runState.repairCycleOutcome,
      // task-9: per-lane execution summaries — primary: RunState accumulated, fallback: events
      laneEvidence: resolveLaneEvidence(events, runState),
    };
  }

  // ── P4: Runtime lifecycle evidence ──────────────────────────────────────────
  // Build a RuntimeLifecycleRecord from the task-start snapshot stored in runState
  // and any runtime probe entries in the verificationLedger.
  // When there is no runState or no task-start snapshot, runtimeLifecycle is null
  // (honest absent-data handling — AbsentBlock in evidence panel).
  let runtimeLifecycle: TaskEvidenceRuntimeLifecycle | null = null;
  if (runState?.taskStartRuntimeSnapshot) {
    const checkpoint = getCheckpoint(taskId);
    const allFilePaths = checkpoint
      ? Array.from(checkpoint.snapshots.keys())
      : [];
    const runtimeImpactFiles = classifyRuntimeImpactFiles(allFilePaths);

    const probeEntries = runState.verificationLedger
      .getEntries()
      .filter(e => e.type === "runtime_probe")
      .map(e => ({ runtimeDiff: e.runtimeDiff, detail: e.detail }));

    const record = buildRuntimeLifecycleRecord(
      runState.taskStartRuntimeSnapshot,
      undefined,            // postApplySnapshot — captured later in checkpoint apply route
      runtimeImpactFiles,
      probeEntries,
    );

    runtimeLifecycle = {
      taskStartSnapshot: record.taskStartSnapshot,
      postApplySnapshot: record.postApplySnapshot,
      portDiff:          record.portDiff,
      processLinkage:    record.processLinkage,
      isStaleAfterApply: record.isStaleAfterApply,
    };
  }

  return { routeProfile, planData, checkpointSummary, executionSummary, runtimeLifecycle };
}
