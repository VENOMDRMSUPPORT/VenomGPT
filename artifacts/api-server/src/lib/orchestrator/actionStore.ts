/**
 * orchestrator/actionStore.ts — In-memory ActionStore for action-level execution tracking.
 *
 * Accumulates ActionRecord objects during a task run, keyed by task run id.
 * Exposes a clean CRUD-like API for the action lifecycle:
 *   pending → started → completed | failed | cancelled
 *
 * Design constraints:
 *   - In-memory only: records live for the current process lifetime.
 *   - Keyed by taskId: each task run gets its own flat list of action records.
 *   - Singleton: exported as `actionStore` — no arguments needed at call sites.
 *   - Future-proof: the internal Map + array structure is trivially replaceable
 *     with a persistence layer without touching any call sites.
 *
 * Thread safety: Node.js is single-threaded; no locking is required.
 */

import { randomUUID } from "crypto";
import { ActionType, ActionStatus } from "./actionModel.js";
import type {
  ActionRecord,
  ActionMeta,
  ActionOutcome,
  ApprovalCheckpointMeta,
  ApprovalDecisionMeta,
  LaneSteeeredMeta,
  OperatorOverrideMeta,
} from "./actionModel.js";
import { broadcastActionUpdate } from "../wsServer.js";

// ─── ActionStore implementation ───────────────────────────────────────────────

class ActionStore {
  /** Map from taskId → ordered list of ActionRecords for that task run. */
  private readonly records = new Map<string, ActionRecord[]>();

  /**
   * Create a new ActionRecord in the pending state and append it to the task's list.
   *
   * @param taskId  Task run identifier.
   * @param type    Action category (ActionType enum value).
   * @param meta    Operation-specific metadata, typed per ActionType.
   * @returns       The newly created ActionRecord.
   */
  createAction(taskId: string, type: ActionType, meta: ActionMeta): ActionRecord {
    const record: ActionRecord = {
      id:        randomUUID(),
      taskId,
      type,
      status:    ActionStatus.Pending,
      createdAt: Date.now(),
      meta,
    };

    if (!this.records.has(taskId)) {
      this.records.set(taskId, []);
    }
    this.records.get(taskId)!.push(record);

    broadcastActionUpdate(taskId, record);
    return record;
  }

  /**
   * Transition an action from pending → started, recording startedAt.
   * No-ops if the action is not found or already past the started state.
   *
   * @param id  ActionRecord id (as returned by createAction).
   */
  startAction(id: string): void {
    const record = this._find(id);
    if (!record || record.status !== ActionStatus.Pending) return;
    record.status    = ActionStatus.Started;
    record.startedAt = Date.now();
    broadcastActionUpdate(record.taskId, record);
  }

  /**
   * Transition an action from started → completed, recording completedAt and outcome.
   * Also accepts pending state for synchronous operations that skip the started step.
   *
   * @param id       ActionRecord id.
   * @param outcome  Result descriptor (success, exitCode, summary, etc.).
   */
  completeAction(id: string, outcome: ActionOutcome): void {
    const record = this._find(id);
    if (!record || (record.status !== ActionStatus.Started && record.status !== ActionStatus.Pending)) return;
    record.status      = ActionStatus.Completed;
    record.completedAt = Date.now();
    record.outcome     = outcome;
    broadcastActionUpdate(record.taskId, record);
  }

  /**
   * Transition an action to failed, recording completedAt and an error outcome.
   * Accepts both started and pending states (e.g., failure before start call).
   *
   * @param id     ActionRecord id.
   * @param error  Error message or description.
   */
  failAction(id: string, error: string): void {
    const record = this._find(id);
    if (!record || record.status === ActionStatus.Completed || record.status === ActionStatus.Cancelled || record.status === ActionStatus.Failed) return;
    record.status      = ActionStatus.Failed;
    record.completedAt = Date.now();
    record.outcome     = { success: false, error };
    broadcastActionUpdate(record.taskId, record);
  }

  /**
   * Transition an action to cancelled. Useful when a task is aborted mid-flight.
   * No-ops if the action is already in a terminal state.
   *
   * @param id  ActionRecord id.
   */
  cancelAction(id: string): void {
    const record = this._find(id);
    if (!record || record.status === ActionStatus.Completed || record.status === ActionStatus.Failed || record.status === ActionStatus.Cancelled) return;
    record.status      = ActionStatus.Cancelled;
    record.completedAt = Date.now();
    record.outcome     = { success: false, error: "cancelled" };
    broadcastActionUpdate(record.taskId, record);
  }

  /**
   * Set the laneId on a record. Called by the parallel dispatcher to tag
   * action records with which lane they ran in. No-ops if record not found.
   *
   * @param id      ActionRecord id.
   * @param laneId  Lane identifier string (e.g. 'lane-0', 'serial').
   */
  setLaneId(id: string, laneId: string): void {
    const record = this._find(id);
    if (!record) return;
    record.laneId = laneId;
    broadcastActionUpdate(record.taskId, record);
  }

  /**
   * Retrieve all ActionRecords for a given task run, in creation order.
   * Returns an empty array when no records exist for the taskId.
   *
   * @param taskId  Task run identifier.
   * @returns       Ordered list of ActionRecords.
   */
  getActions(taskId: string): ActionRecord[] {
    return this.records.get(taskId) ?? [];
  }

  /**
   * Retrieve a single ActionRecord by its id, or undefined if not found.
   * Performs a targeted lookup in the task list for O(n) within one task.
   *
   * @param id  The ActionRecord id.
   * @returns   The record, or undefined.
   */
  getAction(id: string): ActionRecord | undefined {
    return this._find(id);
  }

  /**
   * Remove all records for a task run. Called when a task is deleted from the session.
   * Optional — records will also be garbage-collected when the process restarts.
   *
   * @param taskId  Task run identifier.
   */
  clearTask(taskId: string): void {
    this.records.delete(taskId);
  }

  // ─── task-9: Operator steering convenience methods ────────────────────────

  /**
   * Record that the agent reached an approval checkpoint.
   * Creates a completed APPROVAL_CHECKPOINT action record immediately.
   */
  recordApprovalCheckpointReached(
    taskId: string,
    checkpointId: string,
    description: string,
    laneIds?: string[],
  ): ActionRecord {
    const meta: ApprovalCheckpointMeta = {
      type: ActionType.APPROVAL_CHECKPOINT,
      checkpointId,
      description,
      ...(laneIds && laneIds.length > 0 ? { laneIds } : {}),
    };
    const record = this.createAction(taskId, ActionType.APPROVAL_CHECKPOINT, meta);
    this.completeAction(record.id, { success: true, summary: `Checkpoint reached: ${checkpointId}` });
    return record;
  }

  /**
   * Record an operator approval decision for a gate.
   * Creates a completed APPROVAL_DECISION action record immediately.
   */
  recordApprovalDecision(
    taskId: string,
    checkpointId: string,
    decision: "approved" | "denied" | "selective",
    approvedLaneIds?: string[],
    note?: string,
  ): ActionRecord {
    const meta: ApprovalDecisionMeta = {
      type: ActionType.APPROVAL_DECISION,
      checkpointId,
      decision,
      approvedLaneIds,
      note,
    };
    const record = this.createAction(taskId, ActionType.APPROVAL_DECISION, meta);
    this.completeAction(record.id, {
      success: decision !== "denied",
      summary: `Approval decision: ${decision} on ${checkpointId}${approvedLaneIds ? ` (lanes: ${approvedLaneIds.join(", ")})` : ""}`,
    });
    return record;
  }

  /**
   * Record a lane steering signal applied by the operator.
   * Creates a completed LANE_STEERED action record immediately.
   */
  recordLaneSteered(
    taskId: string,
    laneId: string,
    signal: "paused" | "cancelled" | "proceed",
    reason?: string,
  ): ActionRecord {
    const meta: LaneSteeeredMeta = {
      type: ActionType.LANE_STEERED,
      laneId,
      signal,
      reason,
    };
    const record = this.createAction(taskId, ActionType.LANE_STEERED, meta);
    this.completeAction(record.id, {
      success: true,
      summary: `Lane ${laneId} steered: ${signal}${reason ? ` — ${reason}` : ""}`,
    });
    return record;
  }

  /**
   * Record an operator override applied to a specific step.
   * Creates a completed OPERATOR_OVERRIDE action record immediately.
   */
  recordOperatorOverride(
    taskId: string,
    stepId: string,
    kind: "skip" | "deny" | "substitute",
    substituteWith?: string,
    note?: string,
  ): ActionRecord {
    const meta: OperatorOverrideMeta = {
      type: ActionType.OPERATOR_OVERRIDE,
      stepId,
      kind,
      substituteWith,
      note,
    };
    const record = this.createAction(taskId, ActionType.OPERATOR_OVERRIDE, meta);
    this.completeAction(record.id, {
      success: kind !== "deny",
      summary: `Step override (${kind}): ${stepId}${note ? ` — ${note}` : ""}`,
    });
    return record;
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  /** Linear scan over all task lists to find a record by id. */
  private _find(id: string): ActionRecord | undefined {
    for (const list of this.records.values()) {
      const found = list.find(r => r.id === id);
      if (found) return found;
    }
    return undefined;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const actionStore = new ActionStore();

// Re-export types and enums for convenience at call sites
export { ActionType, ActionStatus };
