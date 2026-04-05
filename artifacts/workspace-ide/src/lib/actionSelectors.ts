/**
 * actionSelectors.ts — Thin adapter layer that derives renderable structures from raw ActionRecord[].
 *
 * This is the single authoritative place where action data is interpreted for the UI.
 * No parallel interpretation logic elsewhere.
 */

// ─── ActionRecord types (mirrored from api-server, no import dependency) ────

export type ActionType =
  | 'READ_FILE'
  | 'WRITE_FILE'
  | 'EXEC_COMMAND'
  | 'VERIFY_RESULT'
  | 'TOOL_ACTION'
  | 'APPROVAL_CHECKPOINT'
  | 'APPROVAL_DECISION'
  | 'LANE_STEERED'
  | 'OPERATOR_OVERRIDE';

export type ActionStatus =
  | 'pending'
  | 'started'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ReadFileMeta {
  type: 'READ_FILE';
  filePath: string;
  fromStaging: boolean;
  byteCount?: number;
}

export interface WriteFileMeta {
  type: 'WRITE_FILE';
  filePath: string;
  byteCount: number;
  isNew: boolean;
}

export interface ExecCommandMeta {
  type: 'EXEC_COMMAND';
  command: string;
  workingDir: string;
  sideEffectClass?: string;
}

export interface VerifyResultMeta {
  type: 'VERIFY_RESULT';
  method: string;
  probe: string;
  passed: boolean;
}

export interface ToolActionMeta {
  type: 'TOOL_ACTION';
  toolName: string;
  [key: string]: unknown;
}

// ─── task-9: Operator steering metadata (mirrored from api-server) ─────────

export interface ApprovalCheckpointMeta {
  type: 'APPROVAL_CHECKPOINT';
  checkpointId: string;
  description: string;
}

export interface ApprovalDecisionMeta {
  type: 'APPROVAL_DECISION';
  checkpointId: string;
  decision: 'approved' | 'denied' | 'selective';
  approvedLaneIds?: string[];
  note?: string;
}

export interface LaneSteeeredMeta {
  type: 'LANE_STEERED';
  laneId: string;
  signal: 'paused' | 'cancelled' | 'proceed';
  reason?: string;
}

export interface OperatorOverrideMeta {
  type: 'OPERATOR_OVERRIDE';
  stepId: string;
  kind: 'skip' | 'deny' | 'substitute';
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

export interface ActionOutcome {
  success: boolean;
  exitCode?: number;
  summary?: string;
  error?: string;
}

export type StepDependencyClass =
  | 'strictly_sequential'
  | 'potentially_independent'
  | 'verification_gated'
  | 'repair_driven';

export interface ActionRecord {
  id: string;
  taskId: string;
  type: ActionType;
  status: ActionStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  meta: ActionMeta;
  outcome?: ActionOutcome;
  dependencyClass?: StepDependencyClass;
  /**
   * Lane identifier set by the parallel dispatcher when a step runs in a lane.
   * 'serial' or undefined for non-parallel steps.
   */
  laneId?: string;
}

// ─── Grouped action structure ────────────────────────────────────────────────

export interface ActionGroup {
  type: ActionType;
  count: number;
  items: ActionRecord[];
  /** Human-readable label, e.g. "3 file reads" */
  label: string;
  /** Short verb for a single item, e.g. "read" */
  verb: string;
  /** Lucide icon name token */
  iconToken: 'Eye' | 'FileEdit' | 'Terminal' | 'CheckCircle2' | 'Wrench';
  /** Tailwind color classes: text, bg, border */
  color: string;
  bg: string;
  border: string;
}

// ─── Display config per action type ─────────────────────────────────────────

interface ActionDisplayConfig {
  singularLabel: (n: number) => string;
  pluralLabel: (n: number) => string;
  verb: string;
  iconToken: ActionGroup['iconToken'];
  color: string;
  bg: string;
  border: string;
}

const ACTION_CONFIG: Record<ActionType, ActionDisplayConfig> = {
  READ_FILE: {
    singularLabel: () => '1 file read',
    pluralLabel:   (n) => `${n} file reads`,
    verb:          'Read',
    iconToken:     'Eye',
    color:         'text-purple-300',
    bg:            'bg-purple-400/5',
    border:        'border-purple-400/15',
  },
  WRITE_FILE: {
    singularLabel: () => '1 file written',
    pluralLabel:   (n) => `${n} files written`,
    verb:          'Wrote',
    iconToken:     'FileEdit',
    color:         'text-emerald-300',
    bg:            'bg-emerald-400/5',
    border:        'border-emerald-400/15',
  },
  EXEC_COMMAND: {
    singularLabel: () => '1 command',
    pluralLabel:   (n) => `${n} commands`,
    verb:          'Ran',
    iconToken:     'Terminal',
    color:         'text-cyan-300',
    bg:            'bg-cyan-400/5',
    border:        'border-cyan-400/15',
  },
  VERIFY_RESULT: {
    singularLabel: () => 'verified ✓',
    pluralLabel:   (n) => `${n} verifications`,
    verb:          'Verified',
    iconToken:     'CheckCircle2',
    color:         'text-green-300',
    bg:            'bg-green-400/5',
    border:        'border-green-400/15',
  },
  TOOL_ACTION: {
    singularLabel: () => '1 tool action',
    pluralLabel:   (n) => `${n} tool actions`,
    verb:          'Tool',
    iconToken:     'Wrench',
    color:         'text-slate-300',
    bg:            'bg-slate-400/5',
    border:        'border-slate-400/15',
  },
  APPROVAL_CHECKPOINT: {
    singularLabel: () => '1 approval checkpoint',
    pluralLabel:   (n) => `${n} approval checkpoints`,
    verb:          'Checkpoint',
    iconToken:     'CheckCircle2',
    color:         'text-blue-300',
    bg:            'bg-blue-400/5',
    border:        'border-blue-400/15',
  },
  APPROVAL_DECISION: {
    singularLabel: () => '1 approval decision',
    pluralLabel:   (n) => `${n} approval decisions`,
    verb:          'Decision',
    iconToken:     'CheckCircle2',
    color:         'text-orange-300',
    bg:            'bg-orange-400/5',
    border:        'border-orange-400/15',
  },
  LANE_STEERED: {
    singularLabel: () => '1 lane signal',
    pluralLabel:   (n) => `${n} lane signals`,
    verb:          'Steered',
    iconToken:     'Terminal',
    color:         'text-amber-300',
    bg:            'bg-amber-400/5',
    border:        'border-amber-400/15',
  },
  OPERATOR_OVERRIDE: {
    singularLabel: () => '1 step override',
    pluralLabel:   (n) => `${n} step overrides`,
    verb:          'Override',
    iconToken:     'Wrench',
    color:         'text-rose-300',
    bg:            'bg-rose-400/5',
    border:        'border-rose-400/15',
  },
};

/**
 * Group consecutive same-type ActionRecords into ActionGroup objects.
 * Non-consecutive runs of the same type are each emitted as separate groups.
 */
export function groupConsecutiveActions(actions: ActionRecord[]): ActionGroup[] {
  const groups: ActionGroup[] = [];
  let i = 0;
  while (i < actions.length) {
    const currentType = actions[i].type;
    const items: ActionRecord[] = [actions[i]];
    let j = i + 1;
    while (j < actions.length && actions[j].type === currentType) {
      items.push(actions[j]);
      j++;
    }
    const cfg = ACTION_CONFIG[currentType];
    const n = items.length;
    groups.push({
      type:      currentType,
      count:     n,
      items,
      label:     n === 1 ? cfg.singularLabel(n) : cfg.pluralLabel(n),
      verb:      cfg.verb,
      iconToken: cfg.iconToken,
      color:     cfg.color,
      bg:        cfg.bg,
      border:    cfg.border,
    });
    i = j;
  }
  return groups;
}

// ─── Stage-window assignment ──────────────────────────────────────────────────

/**
 * StageWindow represents a stage-bounded time interval derived from the log stream.
 *
 * Each "window" covers the period from one stage-tagged thought event up to
 * (but not including) the next stage-tagged thought event, or the end of
 * the log stream if it is the last stage.
 *
 * Actions are assigned to the window whose interval contains them.
 */
export interface StageWindow {
  /** Index into the flat log array where this stage begins */
  logIndex: number;
  /** ISO timestamp string from the stage-tagged thought log event */
  startTs: number;
  /** Exclusive end timestamp (startTs of next stage, or Infinity for last) */
  endTs: number;
  /** The stage tag, e.g. "EDITING" */
  stage: string;
  /** Action groups assigned to this window */
  actionGroups: ActionGroup[];
}

/**
 * Assign a flat ActionRecord[] to stage windows derived from the log events.
 *
 * Returns a Map<number, ActionGroup[]> keyed by logIndex (the position in the
 * log array where a stage thought event occurs), so the transcript renderer can
 * inject the action rows immediately after that stage block ends.
 *
 * The "ungrouped" key (-1) holds actions that don't fall into any stage window
 * (e.g. pre-stage or post-all-stages actions).
 *
 * @param logs   Flat ordered log events from the store.
 * @param actions All ActionRecord[] for this task.
 * @returns      Map<logIndex, ActionGroup[]>. logIndex -1 = no stage match.
 */
export function assignActionsToWindows(
  logs: Array<{ type: string; message: string; timestamp: string }>,
  actions: ActionRecord[],
): Map<number, ActionGroup[]> {
  const result = new Map<number, ActionGroup[]>();

  // Identify stage boundaries — indices and timestamps of stage-tagged thoughts
  const stageBoundaries: Array<{ logIndex: number; startTs: number; stage: string }> = [];

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.type !== 'thought') continue;
    const match = log.message.match(/^\[(PLANNING|INSPECTING|EDITING|VERIFYING|REPAIRING|WRAPPING UP)\]/i);
    if (!match) continue;
    stageBoundaries.push({
      logIndex: i,
      startTs:  new Date(log.timestamp).getTime(),
      stage:    match[1].toUpperCase(),
    });
  }

  if (stageBoundaries.length === 0 || actions.length === 0) {
    // No stage structure — dump all actions into the "ungrouped" slot
    if (actions.length > 0) {
      result.set(-1, groupConsecutiveActions(actions));
    }
    return result;
  }

  // Assign each action to the stage window that best covers its createdAt timestamp
  const windowBuckets = new Map<number, ActionRecord[]>();
  for (const { logIndex } of stageBoundaries) {
    windowBuckets.set(logIndex, []);
  }
  const ungrouped: ActionRecord[] = [];

  for (const action of actions) {
    const ts = action.createdAt;
    // Find the last stage boundary whose startTs <= action.createdAt
    let assigned = false;
    for (let b = stageBoundaries.length - 1; b >= 0; b--) {
      const { logIndex, startTs } = stageBoundaries[b];
      if (ts >= startTs) {
        windowBuckets.get(logIndex)!.push(action);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      ungrouped.push(action);
    }
  }

  // Convert buckets to ActionGroup arrays
  for (const [logIndex, bucket] of windowBuckets) {
    if (bucket.length > 0) {
      result.set(logIndex, groupConsecutiveActions(bucket));
    }
  }
  if (ungrouped.length > 0) {
    result.set(-1, groupConsecutiveActions(ungrouped));
  }

  return result;
}

// ─── Per-type tallies for summary use ────────────────────────────────────────

export interface ActionTypeStat {
  count:       number;
  successCount: number;
  failureCount: number;
}

export interface ActionTallies {
  totalCount:        number;
  readCount:         number;
  writeCount:        number;
  commandCount:      number;
  verifyCount:       number;
  /**
   * True only when ALL completed verification actions passed.
   * Any failed/cancelled verification action causes this to be false.
   * Pending/started verifications are not counted as passed.
   */
  verifyPassed:      boolean;
  writtenFiles:      string[];
  commandsRun:       Array<{ command: string; exitCode?: number; success: boolean }>;
  /** Per-type success/failure counts. Only populated for types that appear in the action list. */
  typeStats:         Partial<Record<ActionType, ActionTypeStat>>;
  /** Frequency map of sideEffectClass values among EXEC_COMMAND records (undefined class omitted). */
  commandClassFreq:  Record<string, number>;
}

export function computeActionTallies(actions: ActionRecord[]): ActionTallies {
  let readCount = 0;
  let writeCount = 0;
  let commandCount = 0;
  let verifyCount = 0;
  let anyVerifyFailed = false;
  let anyVerifyCompleted = false;
  const writtenFiles: string[] = [];
  const commandsRun: Array<{ command: string; exitCode?: number; success: boolean }> = [];
  const seenFiles = new Set<string>();

  const typeStats: Partial<Record<ActionType, ActionTypeStat>> = {};
  const commandClassFreq: Record<string, number> = {};

  const ensureStat = (type: ActionType) => {
    if (!typeStats[type]) {
      typeStats[type] = { count: 0, successCount: 0, failureCount: 0 };
    }
    return typeStats[type]!;
  };

  const isTerminalSuccess = (action: ActionRecord): boolean => {
    if (action.status === 'completed') return action.outcome?.success !== false;
    return false;
  };

  const isTerminalFailure = (action: ActionRecord): boolean => {
    return action.status === 'failed' || action.status === 'cancelled' ||
      (action.status === 'completed' && action.outcome?.success === false);
  };

  for (const action of actions) {
    const stat = ensureStat(action.type);
    stat.count++;
    if (isTerminalSuccess(action)) stat.successCount++;
    if (isTerminalFailure(action)) stat.failureCount++;

    switch (action.type) {
      case 'READ_FILE':
        readCount++;
        break;
      case 'WRITE_FILE': {
        writeCount++;
        const meta = action.meta as WriteFileMeta;
        if (!seenFiles.has(meta.filePath)) {
          seenFiles.add(meta.filePath);
          writtenFiles.push(meta.filePath);
        }
        break;
      }
      case 'EXEC_COMMAND': {
        commandCount++;
        const meta = action.meta as ExecCommandMeta;
        commandsRun.push({
          command:  meta.command,
          exitCode: action.outcome?.exitCode,
          success:  action.outcome?.success ?? false,
        });
        if (meta.sideEffectClass) {
          commandClassFreq[meta.sideEffectClass] = (commandClassFreq[meta.sideEffectClass] ?? 0) + 1;
        }
        break;
      }
      case 'VERIFY_RESULT': {
        verifyCount++;
        const meta = action.meta as VerifyResultMeta;
        // Use meta.passed for the semantic outcome (set at record creation time)
        // and cross-check with action.outcome.success for terminal records
        const terminalFail =
          action.status === 'failed' ||
          action.status === 'cancelled' ||
          (action.status === 'completed' && action.outcome?.success === false);
        const metaFail = !meta.passed;
        if (terminalFail || metaFail) {
          anyVerifyFailed = true;
        } else if (action.status === 'completed' && action.outcome?.success !== false && meta.passed) {
          anyVerifyCompleted = true;
        }
        break;
      }
      default:
        break;
    }
  }

  // verifyPassed: true only if at least one completed passing verify AND no failures
  const verifyPassed = anyVerifyCompleted && !anyVerifyFailed;

  return {
    totalCount: actions.length,
    readCount,
    writeCount,
    commandCount,
    verifyCount,
    verifyPassed,
    writtenFiles,
    commandsRun,
    typeStats,
    commandClassFreq,
  };
}

/**
 * Derive a concise, heuristic structural label for the execution shape from the
 * action type sequence. This is a characterisation of what the task did — not a
 * claim about parallelism or execution model.
 *
 * Labels are intentionally simple and approximate. They should be read as
 * "this task looked like …" rather than a rigorous classification.
 */
export function deriveExecutionShape(actions: ActionRecord[]): string {
  if (actions.length === 0) return 'no actions';

  const types = actions.map(a => a.type);
  const typeSet = new Set(types);

  const hasReads    = typeSet.has('READ_FILE');
  const hasWrites   = typeSet.has('WRITE_FILE');
  const hasCommands = typeSet.has('EXEC_COMMAND');
  const hasVerify   = typeSet.has('VERIFY_RESULT');

  const readOnly  = hasReads && !hasWrites && !hasCommands && !hasVerify;
  const writeOnly = hasWrites && !hasReads && !hasCommands && !hasVerify;
  const cmdOnly   = hasCommands && !hasReads && !hasWrites && !hasVerify;

  if (readOnly)  return 'read-only inspection';
  if (writeOnly) return 'writes only';
  if (cmdOnly)   return 'command-only';

  const total = actions.length;
  const cmdCount   = types.filter(t => t === 'EXEC_COMMAND').length;
  const readCount  = types.filter(t => t === 'READ_FILE').length;
  const writeCount = types.filter(t => t === 'WRITE_FILE').length;

  if (cmdCount / total >= 0.6) return 'command-heavy';
  if (readCount / total >= 0.7) return 'batched reads';

  if (hasReads && hasWrites && hasCommands && hasVerify) return 'full edit cycle';
  if (hasReads && hasWrites && hasVerify)     return 'read → write → verify';
  if (hasWrites && hasVerify && !hasCommands) return 'write → verify';
  if (hasReads && hasWrites)                  return 'inspect → edit';
  if (hasReads && hasCommands)                return 'inspect → run';
  if (hasCommands && hasVerify)               return 'run → verify';

  if (writeCount === 0 && readCount > 0 && cmdCount > 0) return 'read + command';

  return 'mixed actions';
}

/**
 * Filter an ActionGroup[] by active type filter set and a search string.
 *
 * - `activeTypes`: the set of ActionType values to include. If empty, all types pass.
 * - `searchQuery`: case-insensitive substring matched against each item's label.
 *   Items that don't match are removed from the group; groups with no items remaining
 *   are removed entirely.
 *
 * Groups whose items are filtered down are re-labelled to reflect the new count.
 */
export function filterActionGroups(
  groups: ActionGroup[],
  activeTypes: Set<ActionType>,
  searchQuery: string,
): ActionGroup[] {
  const q = searchQuery.trim().toLowerCase();
  return groups
    .filter(group => activeTypes.size === 0 || activeTypes.has(group.type))
    .map(group => {
      if (!q) return group;
      const matchedItems = group.items.filter(item =>
        getActionItemLabel(item).toLowerCase().includes(q)
      );
      if (matchedItems.length === 0) return null;
      if (matchedItems.length === group.items.length) return group;
      const cfg = ACTION_CONFIG[group.type];
      const n = matchedItems.length;
      return {
        ...group,
        count: n,
        items: matchedItems,
        label: n === 1 ? cfg.singularLabel(n) : cfg.pluralLabel(n),
      };
    })
    .filter((g): g is ActionGroup => g !== null);
}

/**
 * Get the human-readable path label for an ActionRecord.
 * Returns the most useful single string (filePath, command, probe, toolName).
 */
export function getActionItemLabel(action: ActionRecord): string {
  switch (action.type) {
    case 'READ_FILE':
      return (action.meta as ReadFileMeta).filePath;
    case 'WRITE_FILE':
      return (action.meta as WriteFileMeta).filePath;
    case 'EXEC_COMMAND':
      return (action.meta as ExecCommandMeta).command;
    case 'VERIFY_RESULT':
      return (action.meta as VerifyResultMeta).probe;
    case 'TOOL_ACTION':
      return (action.meta as ToolActionMeta).toolName;
    // task-9: operator steering action labels
    case 'APPROVAL_CHECKPOINT': {
      const m = action.meta as ApprovalCheckpointMeta;
      return m.description ?? m.checkpointId;
    }
    case 'APPROVAL_DECISION': {
      const m = action.meta as ApprovalDecisionMeta;
      return `${m.decision} — ${m.checkpointId}`;
    }
    case 'LANE_STEERED': {
      const m = action.meta as LaneSteeeredMeta;
      return `${m.laneId} → ${m.signal}`;
    }
    case 'OPERATOR_OVERRIDE': {
      const m = action.meta as OperatorOverrideMeta;
      return `${m.kind}: ${m.stepId}`;
    }
    default:
      return '';
  }
}
