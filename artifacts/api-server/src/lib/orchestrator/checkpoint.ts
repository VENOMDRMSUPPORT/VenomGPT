/**
 * orchestrator/checkpoint.ts — Task-scoped pre-edit snapshot and discard model.
 *
 * WHAT THIS IS:
 *   A real safety layer for code-edit tasks. Before any file is written, its
 *   original content is snapshotted into a TaskCheckpoint. When the task
 *   finishes, the operator can:
 *
 *     • Discard — restore all files to their exact pre-task state (full rollback)
 *     • Apply   — accept changes permanently (prevents future discard)
 *
 * HOW IT WORKS:
 *   1. The agent loop calls snapshotFileForTask() before every write_file action.
 *   2. The snapshot is idempotent — only the FIRST write to a file is snapshotted,
 *      preserving the true "before" state even if the agent rewrites the same file.
 *   3. After a successful write, patchSnapshotWithDiff() computes per-file diffs.
 *   4. At task completion, a "checkpoint" event is emitted with the file list.
 *   5. The checkpoint API routes expose discard/apply endpoints.
 *   6. The frontend renders a CheckpointCard with real Discard/Accept buttons.
 *
 * SCOPE:
 *   Only tasks that perform at least one successful write_file get a checkpoint.
 *   Text-only, conversational, and command-only tasks are unaffected.
 *
 * STORAGE:
 *   Checkpoints are written atomically to disk at ~/.venomgpt/checkpoints/<taskId>.json
 *   using write-to-.tmp-then-rename to prevent partial-write corruption.
 *   The in-memory Map is retained as a fast-read cache; disk is the authoritative store.
 *   On server start, pending checkpoints are recovered from disk so that discard/apply
 *   remain available even after a server restart.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { logger } from "../logger.js";
import { computeDiff } from "./diffEngine.js";
import { getTask, hydratePersistedTask } from "../sessionManager.js";
import { commitStaged, commitStagedFile, discardStagedFile, discardStaged, listStagedFiles, type CommitResult } from "./stagingStore.js";
import { VerificationLedger } from "./verificationLedger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckpointStatus = "pending" | "applied" | "discarded";

export interface FileSnapshot {
  /** Relative workspace path — same key used in write_file. */
  path: string;
  /** Content of the file captured before the first write. Empty string for new files. */
  originalContent: string;
  /** True if the file existed before the task touched it. */
  existed: boolean;
  /** ISO timestamp of when the snapshot was taken. */
  snapshotAt: string;
  /** Unified diff string (populated after the first successful write to this file). */
  diff?: string;
  /** Lines added in this file vs. the original. */
  linesAdded?: number;
  /** Lines removed from this file vs. the original. */
  linesRemoved?: number;
}

export interface TaskCheckpoint {
  taskId: string;
  /** ISO timestamp of when the first snapshot was taken (= first write intent). */
  createdAt: string;
  /** Per-file snapshots. Keyed by relative path. Set is built lazily. */
  snapshots: Map<string, FileSnapshot>;
  status: CheckpointStatus;
  appliedAt?: string;
  discardedAt?: string;
  /** Absolute workspace root — needed for file restoration on discard. */
  wsRoot: string;
  /**
   * Paths promoted to live workspace during a FAILED apply (commitStaged returned
   * success=false after partially promoting some files). Populated only when
   * applyCheckpoint() fails mid-commit; used by discardCheckpoint() to restore
   * those partially-promoted live files from snapshots before clearing staging.
   * Reset to undefined when checkpoint is successfully applied or discarded.
   */
  partiallyPromotedPaths?: string[];
  /**
   * Explicit staging mode marker. When true, this checkpoint was created under
   * the staging layer (writes went to staging dir, not live workspace). When false
   * or absent, the checkpoint was created in legacy mode (writes went directly to
   * live workspace). Used by discardCheckpoint() to disambiguate the staging path
   * from the legacy-restore fallback — prevents accidental live file reversion when
   * a staging directory is externally removed but the checkpoint still exists.
   */
  staged?: boolean;
  /**
   * Post-merge verification outcome populated by applyCheckpoint() after
   * commitStaged() succeeds and the ledger records the post_merge_verification
   * event. Never conflated with merge safety (mergeIsSafe / staged flag).
   * undefined until applyCheckpoint() completes.
   */
  postMergeVerification?: PostMergeVerification;
  /**
   * P4 (task-9-closeout): Evidence-grounded stale-runtime determination set
   * asynchronously after checkpoint apply by the post-apply lifecycle snapshot.
   * true  = runtime-impacting files applied AND port state unchanged (stale)
   * false = not stale (files applied, port state changed OR no runtime-impact files)
   * null / undefined = insufficient snapshot data to determine
   */
  runtimeStaleAfterApply?: boolean | null;
}

// Serialisable form used in API responses and event data (no content blobs).
export interface CheckpointFileSummary {
  path: string;
  existed: boolean;
  snapshotAt: string;
  /** Size of original content in bytes (0 for new files). */
  originalBytes: number;
  /** Unified diff string (populated after write). */
  diff?: string;
  /** Lines added vs. original. */
  linesAdded?: number;
  /** Lines removed vs. original. */
  linesRemoved?: number;
}

/**
 * Post-merge verification outcome recorded after applyCheckpoint() completes.
 * Distinct from merge safety (mergeIsSafe) — this reflects whether verification
 * was run against the live workspace after the staging commit succeeded.
 *
 *   passed   — post-merge verification evidence was recorded and passed
 *   failed   — post-merge verification was attempted but evidence failed
 *   deferred — apply succeeded but no post-merge verification was requested
 */
export interface PostMergeVerification {
  outcome: "passed" | "failed" | "deferred";
  /** Human-readable detail of what was verified (or why it was deferred). */
  detail: string;
}

export interface CheckpointSummary {
  taskId: string;
  createdAt: string;
  status: CheckpointStatus;
  appliedAt?: string;
  discardedAt?: string;
  files: CheckpointFileSummary[];
  fileCount: number;
  /** True when checkpoint state is durably persisted to disk. Always true when present. */
  durable: boolean;
  /**
   * True when this checkpoint was created under the staging layer.
   * All writes went to ~/.venomgpt/staging/<taskId>/ — live workspace is unchanged
   * until the operator accepts. Matches the staged flag on TaskCheckpoint.
   */
  staged: boolean;
  /**
   * Relative paths of all staged files (mirrors files[].path).
   * Provided for parity with the file_write event's stagedPath field.
   * Enables operator surfaces to display per-file staging metadata consistently.
   */
  stagedFiles: string[];
  /**
   * Post-merge verification outcome, populated after applyCheckpoint() succeeds.
   * Never conflated with merge safety (mergeIsSafe / staged flag) — this represents
   * a distinct post-merge verification step, not the staging commit itself.
   * null when the checkpoint has not yet been applied.
   */
  postMergeVerification: PostMergeVerification | null;
}

// ─── Checkpoint history types ─────────────────────────────────────────────────

export type CheckpointHistoryEventKind = "snapshotted" | "applied" | "discarded" | "file_applied" | "file_discarded";

export interface CheckpointHistoryEntry {
  taskId:    string;
  kind:      CheckpointHistoryEventKind;
  timestamp: string;
  /** File path involved (for per-file events). */
  filePath?: string;
  /** Extra metadata (e.g. fileCount for snapshotted). */
  meta?: Record<string, unknown>;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const checkpoints = new Map<string, TaskCheckpoint>();

/**
 * In-memory checkpoint history per task.
 * Keyed by taskId. Each task accumulates history entries as checkpoint
 * transitions occur. Persisted to disk alongside checkpoint data.
 */
const checkpointHistory = new Map<string, CheckpointHistoryEntry[]>();

function appendHistory(taskId: string, entry: Omit<CheckpointHistoryEntry, "taskId">): void {
  const list = checkpointHistory.get(taskId) ?? [];
  list.push({ taskId, ...entry });
  checkpointHistory.set(taskId, list);
  persistHistoryToDisk(taskId, list).catch(() => { /* already logged inside */ });
}

export function getCheckpointHistory(taskId: string): CheckpointHistoryEntry[] {
  return checkpointHistory.get(taskId) ?? [];
}

// ─── Disk persistence ─────────────────────────────────────────────────────────

const CANONICAL_DATA_DIR = path.join(os.homedir(), ".venomgpt");
const CHECKPOINTS_DIR = path.join(
  process.env["VENOMGPT_DATA_DIR"]
    ? path.resolve(process.env["VENOMGPT_DATA_DIR"])
    : process.env["DEVMIND_DATA_DIR"]
      ? path.resolve(process.env["DEVMIND_DATA_DIR"])
      : CANONICAL_DATA_DIR,
  "checkpoints"
);

/** Serialisable on-disk form of a TaskCheckpoint (snapshots as an array). */
interface PersistedCheckpoint {
  version: 1;
  taskId: string;
  createdAt: string;
  status: CheckpointStatus;
  appliedAt?: string;
  discardedAt?: string;
  wsRoot: string;
  snapshots: FileSnapshot[];
  /** Monotonic write sequence — used to detect and suppress stale writes. */
  seq: number;
  /**
   * Staging mode marker — mirrors TaskCheckpoint.staged.
   * When true, checkpoint was created under the staging layer.
   * Must be persisted so that recovered checkpoints after restart correctly
   * select the staging-path discard (staging dir removal) vs legacy-path discard
   * (live file restoration from snapshots). Without persistence, recovered
   * checkpoints would incorrectly default to legacy mode.
   */
  staged?: boolean;
  /**
   * Paths partially promoted to live during a failed apply.
   * Persisted so that after restart, discard can still restore these files.
   */
  partiallyPromotedPaths?: string[];
  /**
   * P4 (task-9-closeout): Evidence-grounded stale-runtime outcome, set
   * asynchronously after apply by the post-apply lifecycle snapshot.
   */
  runtimeStaleAfterApply?: boolean | null;
}

function checkpointFilePath(taskId: string): string {
  return path.join(CHECKPOINTS_DIR, `${taskId}.json`);
}

function historyFilePath(taskId: string): string {
  return path.join(CHECKPOINTS_DIR, `${taskId}.history.json`);
}

/**
 * Persist checkpoint history entries to disk (fire-and-forget).
 */
async function persistHistoryToDisk(taskId: string, entries: CheckpointHistoryEntry[]): Promise<void> {
  const targetPath = historyFilePath(taskId);
  const tmpPath    = `${targetPath}.${Date.now()}.tmp`;
  try {
    await fs.mkdir(CHECKPOINTS_DIR, { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(entries, null, 2), "utf8");
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    logger.warn({ taskId, err }, "[Checkpoint] Failed to persist history to disk");
    await fs.unlink(tmpPath).catch(() => { /* best effort */ });
  }
}

/**
 * Load history entries from disk for a task.
 */
async function loadHistoryFromDisk(taskId: string): Promise<CheckpointHistoryEntry[]> {
  try {
    const raw  = await fs.readFile(historyFilePath(taskId), "utf8");
    const data = JSON.parse(raw) as CheckpointHistoryEntry[];
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * Per-task monotonic write sequence counter.
 * Incremented before every persist. Allows each persist to detect whether it
 * was superseded by a higher-sequence write before it reached the rename step.
 */
const writeSeq = new Map<string, number>();

function nextSeq(taskId: string): number {
  const n = (writeSeq.get(taskId) ?? 0) + 1;
  writeSeq.set(taskId, n);
  return n;
}

function currentSeq(taskId: string): number {
  return writeSeq.get(taskId) ?? 0;
}

/**
 * Serialise a TaskCheckpoint and write it atomically to disk.
 *
 * Each write uses a **unique** temp file path (`<taskId>.json.<seq>.tmp`) so
 * that concurrent fire-and-forget writers for the same task never collide on
 * the same temp path. This eliminates the bug where a stale writer's cleanup
 * could unlink a temp file that a newer writer had just populated.
 *
 * Monotonic sequence guards prevent stale writes from overwriting newer ones:
 *   - Each write captures the next sequence number at serialisation time.
 *   - Before renaming its own unique .tmp, the write checks whether a higher
 *     sequence has already completed. If so, it discards its own .tmp only.
 *
 * Fire-and-forget safe — errors are logged but never propagated.
 */
async function persistCheckpointToDisk(cp: TaskCheckpoint): Promise<void> {
  const targetPath = checkpointFilePath(cp.taskId);
  const seq        = nextSeq(cp.taskId);
  // Unique temp path per write — prevents cross-writer collisions on cleanup
  const tmpPath    = `${targetPath}.${seq}.tmp`;

  const payload: PersistedCheckpoint = {
    version:                1,
    taskId:                 cp.taskId,
    createdAt:              cp.createdAt,
    status:                 cp.status,
    appliedAt:              cp.appliedAt,
    discardedAt:            cp.discardedAt,
    wsRoot:                 cp.wsRoot,
    snapshots:              Array.from(cp.snapshots.values()),
    seq,
    staged:                 cp.staged,
    partiallyPromotedPaths: cp.partiallyPromotedPaths,
    runtimeStaleAfterApply: cp.runtimeStaleAfterApply,
  };

  try {
    await fs.mkdir(CHECKPOINTS_DIR, { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");

    // Only rename if no higher-sequence write has superseded us.
    // Each writer owns its unique tmpPath, so there is no cross-writer collision.
    if (currentSeq(cp.taskId) === seq) {
      await fs.rename(tmpPath, targetPath);
      logger.debug(
        { taskId: cp.taskId, status: cp.status, seq, file: targetPath },
        "[Checkpoint] Persisted checkpoint to disk"
      );
    } else {
      // Superseded — discard only our own tmp file (not a shared resource)
      await fs.unlink(tmpPath).catch(() => { /* best effort */ });
      logger.debug(
        { taskId: cp.taskId, seq, latestSeq: currentSeq(cp.taskId) },
        "[Checkpoint] Stale write suppressed — superseded by higher-sequence write"
      );
    }
  } catch (err) {
    logger.warn({ taskId: cp.taskId, err, file: targetPath }, "[Checkpoint] Failed to persist checkpoint to disk");
    // Clean up only our own unique tmp file on error
    await fs.unlink(tmpPath).catch(() => { /* best effort */ });
  }
}

/**
 * Persist the terminal state of a checkpoint to disk.
 *
 * Called on apply and discard (both terminal transitions). The file is written
 * atomically via .tmp + rename and reflects status "applied" or "discarded".
 * Because persistCheckpointToDisk serialises `cp.status` at call time, and
 * cp.status is already set to the terminal value before this is called,
 * any concurrent fire-and-forget pending persist that wins the rename race
 * will be immediately overwritten by this call's terminal write.
 *
 * The recovery code already skips non-pending checkpoints, so even in the
 * worst-case ordering (where a stale pending write lands after this call),
 * the directory can be GC'd on the next startup pass without data loss.
 * A best-effort delete follows the terminal write to keep the directory tidy.
 *
 * Fire-and-forget safe — errors are logged but never propagated.
 */
async function persistTerminalStateToDisk(cp: TaskCheckpoint): Promise<void> {
  // Write terminal status atomically — this is the canonical "authoritative" write
  await persistCheckpointToDisk(cp);

  // Best-effort cleanup: remove the file since it is no longer needed.
  // If a concurrent pending-status write races past this unlink and recreates
  // the file, the recovery code will read status:"applied"|"discarded" (if our
  // write won) or status:"pending" (if theirs won). In the latter case the next
  // startup recovery would incorrectly restore the checkpoint — but this race
  // is practically impossible because apply/discard only execute AFTER the
  // agent loop has ended and no more snapshot/diff persists will be issued.
  const filePath = checkpointFilePath(cp.taskId);
  try {
    await fs.unlink(filePath);
    logger.debug({ taskId: cp.taskId, file: filePath }, "[Checkpoint] Removed terminal checkpoint file from disk");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.debug({ taskId: cp.taskId }, "[Checkpoint] Terminal checkpoint file not removed (will be skipped on recovery due to terminal status)");
    }
  }
}

/**
 * Load all pending checkpoint files from disk and restore them into the
 * in-memory checkpoints Map. Called once at server startup.
 *
 * Only files with status "pending" are loaded — applied/discarded checkpoints
 * are cleaned up from disk as part of their state transitions.
 */
export async function recoverCheckpointsFromDisk(): Promise<void> {
  try {
    await fs.mkdir(CHECKPOINTS_DIR, { recursive: true });
  } catch {
    // Directory already exists — fine
  }

  let entries: string[];
  try {
    entries = await fs.readdir(CHECKPOINTS_DIR);
  } catch {
    logger.debug({ dir: CHECKPOINTS_DIR }, "[Checkpoint] Checkpoint directory not readable — skipping recovery");
    return;
  }

  // Only canonical checkpoint files match <taskId>.json (not .history.json or .tmp files)
  const jsonFiles = entries.filter(e => e.endsWith(".json") && !e.endsWith(".history.json"));
  let recovered = 0;

  for (const filename of jsonFiles) {
    const filePath = path.join(CHECKPOINTS_DIR, filename);
    try {
      const raw  = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw) as PersistedCheckpoint;

      if (data.version !== 1 || !data.taskId || !Array.isArray(data.snapshots)) {
        logger.warn({ file: filePath }, "[Checkpoint] Malformed checkpoint file — skipping");
        continue;
      }

      // Only recover pending checkpoints — completed ones shouldn't be in the dir
      // but we guard anyway
      if (data.status !== "pending") {
        logger.debug({ taskId: data.taskId, status: data.status }, "[Checkpoint] Skipping non-pending checkpoint during recovery");
        continue;
      }

      // Skip if already in memory (shouldn't happen at startup, but guard is cheap)
      if (checkpoints.has(data.taskId)) continue;

      const snapshotMap = new Map<string, FileSnapshot>();
      for (const snap of data.snapshots) {
        snapshotMap.set(snap.path, snap);
      }

      checkpoints.set(data.taskId, {
        taskId:                 data.taskId,
        createdAt:              data.createdAt,
        snapshots:              snapshotMap,
        status:                 data.status,
        appliedAt:              data.appliedAt,
        discardedAt:            data.discardedAt,
        wsRoot:                 data.wsRoot,
        // Restore staging mode markers — critical for restart-safe discard semantics.
        // Without these, recovered staging-layer checkpoints would incorrectly
        // take the legacy restore path on discard, potentially reverting live edits.
        staged:                 data.staged,
        partiallyPromotedPaths: data.partiallyPromotedPaths,
      });

      // Also ensure the task exists in the session manager so the checkpoint
      // routes (which require getTask() to succeed) can serve discard/apply.
      // If the task was already loaded from persisted history, this is a no-op.
      // If not (e.g., the server was restarted before the task was written to
      // history.json), inject a minimal stub so the routes can function.
      if (!getTask(data.taskId)) {
        hydratePersistedTask({
          id:          data.taskId,
          prompt:      "(recovered from checkpoint — original prompt not available)",
          status:      "done",
          createdAt:   new Date(data.createdAt),
          completedAt: new Date(data.createdAt),
        });
        logger.info(
          { taskId: data.taskId },
          "[Checkpoint] Injected minimal task stub for recovered checkpoint (task was not in history)"
        );
      }

      // Recover history from disk for this checkpoint
      if (!checkpointHistory.has(data.taskId)) {
        const hist = await loadHistoryFromDisk(data.taskId);
        if (hist.length > 0) checkpointHistory.set(data.taskId, hist);
      }

      recovered++;
      logger.info(
        { taskId: data.taskId, snapshotCount: snapshotMap.size, wsRoot: data.wsRoot },
        "[Checkpoint] Recovered pending checkpoint from disk"
      );
    } catch (err) {
      logger.warn({ file: filePath, err }, "[Checkpoint] Failed to parse checkpoint file — skipping");
    }
  }

  logger.info({ recovered, dir: CHECKPOINTS_DIR }, `[Checkpoint] Startup recovery complete — ${recovered} checkpoint(s) recovered from disk`);
}

// ─── Core operations ──────────────────────────────────────────────────────────

/**
 * Snapshot a file's current content before it gets written by the agent.
 *
 * Idempotent: calling this twice for the same (taskId, filePath) pair keeps
 * only the FIRST snapshot — preserving the true "before" state even when the
 * agent rewrites the same file multiple times in one task.
 *
 * Creates the TaskCheckpoint lazily on the first call for a given task.
 * Persists the checkpoint to disk after creation or update.
 */
export async function snapshotFileForTask(
  taskId: string,
  filePath: string,
  wsRoot: string,
): Promise<void> {
  // Create the checkpoint record on the first write for this task.
  // staged=true marks this as a staging-layer checkpoint — writes went to
  // the staging dir, not directly into the live workspace. discardCheckpoint()
  // uses this to select the correct code path (staging cleanup vs legacy restore).
  if (!checkpoints.has(taskId)) {
    const createdAt = new Date().toISOString();
    checkpoints.set(taskId, {
      taskId,
      createdAt,
      snapshots: new Map(),
      status: "pending",
      wsRoot,
      staged: true,
    });
    appendHistory(taskId, { kind: "snapshotted", timestamp: createdAt, meta: { wsRoot } });
    logger.info({ taskId }, "[Checkpoint] Checkpoint created (staged mode — live workspace unchanged)");
  }

  const cp = checkpoints.get(taskId)!;

  // Idempotent guard — never overwrite the first snapshot of a file
  if (cp.snapshots.has(filePath)) return;

  const absPath = path.join(wsRoot, filePath);
  let originalContent = "";
  let existed = false;

  try {
    originalContent = await fs.readFile(absPath, "utf8");
    existed = true;
  } catch {
    // File does not exist yet — will be newly created. Snapshot is an empty sentinel.
    existed = false;
  }

  cp.snapshots.set(filePath, {
    path: filePath,
    originalContent,
    existed,
    snapshotAt: new Date().toISOString(),
  });

  logger.debug(
    { taskId, filePath, existed, bytes: originalContent.length },
    "[Checkpoint] File snapshotted",
  );

  // Persist to disk after snapshot — fire-and-forget
  persistCheckpointToDisk(cp).catch(() => { /* already logged inside */ });
}

/**
 * Compute and store a diff on the existing snapshot for a file, after the
 * agent has successfully written the file. Safe to call multiple times —
 * each call overwrites the previous diff (so the latest write state is shown).
 *
 * @param taskId        - Task identifier.
 * @param filePath      - Relative file path (must match snapshot key).
 * @param modifiedContent - The content that was just written to the file.
 */
export function patchSnapshotWithDiff(
  taskId: string,
  filePath: string,
  modifiedContent: string,
): void {
  const cp = checkpoints.get(taskId);
  if (!cp) return;

  const snap = cp.snapshots.get(filePath);
  if (!snap) return;

  try {
    const result = computeDiff(snap.originalContent, modifiedContent, filePath);
    snap.diff         = result.unified;
    snap.linesAdded   = result.linesAdded;
    snap.linesRemoved = result.linesRemoved;
    logger.debug(
      { taskId, filePath, linesAdded: result.linesAdded, linesRemoved: result.linesRemoved },
      "[Checkpoint] Diff patched onto snapshot",
    );
  } catch (err) {
    logger.warn({ taskId, filePath, err }, "[Checkpoint] Diff computation failed — snapshot kept without diff");
  }

  // Persist updated diff to disk — fire-and-forget
  persistCheckpointToDisk(cp).catch(() => { /* already logged inside */ });
}

/**
 * Return the TaskCheckpoint for a task, or undefined if no files were written.
 */
export function getCheckpoint(taskId: string): TaskCheckpoint | undefined {
  return checkpoints.get(taskId);
}

/**
 * Return the set of task IDs whose checkpoints are currently pending (neither
 * applied nor discarded). Used by startup recovery to filter staging dirs to
 * only those with a corresponding live pending checkpoint.
 */
export function getPendingCheckpointTaskIds(): Set<string> {
  const pending = new Set<string>();
  for (const [taskId, cp] of checkpoints) {
    if (cp.status === "pending") pending.add(taskId);
  }
  return pending;
}

/**
 * Serialise a checkpoint to a safe API/event payload (no full content blobs).
 * Includes durable: true to signal disk-backed persistence to the frontend.
 */
export function serializeCheckpoint(cp: TaskCheckpoint): CheckpointSummary {
  const files: CheckpointFileSummary[] = [];
  for (const snap of cp.snapshots.values()) {
    files.push({
      path:          snap.path,
      existed:       snap.existed,
      snapshotAt:    snap.snapshotAt,
      originalBytes: snap.originalContent.length,
      diff:          snap.diff,
      linesAdded:    snap.linesAdded,
      linesRemoved:  snap.linesRemoved,
    });
  }
  return {
    taskId:                cp.taskId,
    createdAt:             cp.createdAt,
    status:                cp.status,
    appliedAt:             cp.appliedAt,
    discardedAt:           cp.discardedAt,
    files,
    fileCount:             files.length,
    durable:               true,
    staged:                cp.staged === true,
    stagedFiles:           files.map(f => f.path),
    postMergeVerification: cp.postMergeVerification ?? null,
  };
}

/**
 * Discard all changes made by a task.
 *
 * With the staging layer in place, the live workspace was NEVER touched during
 * the task — all writes went to the staging directory. Discard therefore only
 * needs to remove the staging directory; no live file restoration is required.
 *
 * For backward compatibility (e.g. checkpoints recovered from disk before the
 * staging layer was introduced, or edge cases where the staging dir was already
 * cleaned up), the function gracefully handles missing staging directories and
 * falls through without error.
 *
 * Returns a DiscardResult with the discarded file paths and whether the live
 * workspace was modified (true in partial-apply recovery or legacy restore).
 */
export interface DiscardResult {
  /** Relative paths from the checkpoint snapshot keys. */
  discardedPaths: string[];
  /**
   * True when the discard operation actually modified live workspace files.
   * This occurs when: (a) partial-apply recovery restores partially-promoted
   * live files, or (b) legacy restore path restores pre-staging live files.
   * When true, the caller should invalidate any project intelligence caches
   * that depend on live workspace state.
   */
  liveFilesModified: boolean;
}

export async function discardCheckpoint(taskId: string): Promise<DiscardResult> {
  const cp = checkpoints.get(taskId);
  if (!cp) throw new Error(`No checkpoint found for task ${taskId}`);
  if (cp.status === "applied")
    throw new Error(`Task ${taskId} checkpoint was already applied — cannot discard`);
  if (cp.status === "discarded")
    throw new Error(`Task ${taskId} checkpoint was already discarded`);

  // Staging mode detection:
  //   cp.staged === true means this checkpoint was created under the staging layer
  //   (all writes went to ~/.venomgpt/staging/<taskId>/). Use staging discard path.
  //
  //   Legacy fallback:
  //   cp.staged is false or absent (checkpoint created before staging was introduced,
  //   or writes went directly to live workspace). Fall back to snapshot-restore.
  //   This ensures backward compatibility for any pre-staging checkpoints.
  //
  // Note: even in staging mode, partial-apply failure can leave some files promoted
  // to live (tracked in cp.partiallyPromotedPaths). Those are restored below.
  const stagedFiles = await listStagedFiles(taskId);
  const isStaged = cp.staged === true;

  let liveFilesModified = false;

  if (isStaged) {
    // Staging path: remove staging dir.
    // Also check if a previous failed apply partially promoted some files to live.
    // If so, restore those live files from snapshots before clearing staging so
    // the live workspace is left completely clean after discard.
    const partiallyPromoted = cp.partiallyPromotedPaths ?? [];
    if (partiallyPromoted.length > 0) {
      logger.warn(
        { taskId, partiallyPromoted },
        "[Checkpoint] Discard after partial apply — restoring partially-promoted live files from snapshots"
      );
      for (const relPath of partiallyPromoted) {
        const snapshot = cp.snapshots.get(relPath);
        if (!snapshot) {
          logger.warn({ taskId, relPath }, "[Checkpoint] No snapshot found for partially-promoted file — leaving as-is");
          continue;
        }
        const absPath = path.join(cp.wsRoot, relPath);
        try {
          if (!snapshot.existed) {
            await fs.unlink(absPath).catch(() => { /* best effort */ });
          } else {
            const tmpPath = `${absPath}.${Date.now()}.discard.tmp`;
            await fs.writeFile(tmpPath, snapshot.originalContent, "utf8");
            await fs.rename(tmpPath, absPath);
          }
          liveFilesModified = true;
          logger.debug({ taskId, relPath }, "[Checkpoint] Restored partially-promoted live file from snapshot");
        } catch (err) {
          logger.warn(
            { taskId, relPath, err },
            "[Checkpoint] Failed to restore partially-promoted file — live workspace may have residual changes"
          );
        }
      }
      cp.partiallyPromotedPaths = undefined;
    }

    await discardStaged(taskId);
    logger.info(
      { taskId, fileCount: stagedFiles.length, partiallyRestored: partiallyPromoted.length, liveFilesModified },
      "[Checkpoint] Discard complete — staging directory removed, live workspace is clean"
    );
  } else {
    // Legacy restore path: checkpoint was created before staging was introduced,
    // or explicitly flagged as non-staged. Restore live files from snapshots.
    // The mode is determined by cp.staged, not the presence of staged files.
    const snapshotEntries = Array.from(cp.snapshots.values());
    if (snapshotEntries.length > 0) {
      logger.info(
        { taskId, snapshotCount: snapshotEntries.length, hasStagedFiles: stagedFiles.length > 0 },
        "[Checkpoint] Legacy discard mode — restoring live files from snapshots"
      );
      for (const snapshot of snapshotEntries) {
        const absPath = path.join(cp.wsRoot, snapshot.path);
        try {
          if (!snapshot.existed) {
            // File was newly created — remove it
            await fs.unlink(absPath).catch(() => { /* best effort — already absent */ });
          } else {
            // File existed before — restore its original content
            const tmpPath = `${absPath}.${Date.now()}.discard.tmp`;
            await fs.writeFile(tmpPath, snapshot.originalContent, "utf8");
            await fs.rename(tmpPath, absPath);
          }
          liveFilesModified = true;
        } catch (err) {
          logger.warn(
            { taskId, filePath: snapshot.path, err },
            "[Checkpoint] Failed to restore file during legacy discard — live workspace may have residual changes"
          );
        }
      }
      logger.info(
        { taskId, restoredCount: snapshotEntries.length },
        "[Checkpoint] Legacy discard complete — live files restored from snapshots"
      );
    } else {
      logger.debug({ taskId }, "[Checkpoint] Discard called with no staged files and no snapshots — no-op");
    }
  }

  // Report only paths that were still staged at discard time.
  // Files that were individually applied before the whole-checkpoint discard were
  // already promoted to live — they should not be reported as "discarded".
  // stagedFiles was computed above from the staging dir (before discardStaged()).
  // In legacy mode (non-staged), all snapshot paths are considered "discarded".
  const discardedPaths = isStaged
    ? stagedFiles           // listStagedFiles() already returns string[]
    : Array.from(cp.snapshots.keys());

  cp.status = "discarded";
  cp.discardedAt = new Date().toISOString();
  appendHistory(taskId, { kind: "discarded", timestamp: cp.discardedAt, meta: { fileCount: discardedPaths.length } });
  logger.info({ taskId, restoredCount: discardedPaths.length, liveFilesModified }, "[Checkpoint] Checkpoint discarded");

  // Persist terminal state then remove from disk — awaited so the disk
  // reflects terminal status before the caller signals success to the client
  await persistTerminalStateToDisk(cp);

  // No more writes will occur for this task — prune the sequence counter
  writeSeq.delete(taskId);

  return { discardedPaths, liveFilesModified };
}

/**
 * Apply a checkpoint — promote staged files into the live workspace and mark
 * changes as permanently accepted.
 *
 * With the staging layer, this is the FIRST time the live workspace is touched:
 *   1. commitStaged() atomically copies all staged files into the live workspace.
 *   2. The checkpoint status is set to "applied" — discard is no longer possible.
 *   3. If a verificationLedger is provided, a distinct post_merge_verification
 *      entry is recorded (distinct from the mergeIsSafe write-plan check).
 *
 * After this call, the staging directory is removed (commitStaged handles cleanup).
 *
 * @param taskId              - Task ID for the checkpoint to apply.
 * @param verificationLedger  - Optional ledger to record post-merge verification.
 *                              When provided, a "command_success" entry is recorded
 *                              using the fs_mutation class to represent the merge
 *                              commit as a distinct post-merge verification event.
 */
/**
 * P4 (task-9-closeout): Return type for applyCheckpoint — includes the list
 * of relative file paths that were actually promoted to the live workspace.
 * Used by the apply route to compute stale detection from promoted files only,
 * not from all snapshot keys (which may include discarded per-file applies).
 */
export interface ApplyCheckpointResult {
  promotedFiles: string[];
}

export async function applyCheckpoint(
  taskId: string,
  verificationLedger?: VerificationLedger,
): Promise<ApplyCheckpointResult> {
  const cp = checkpoints.get(taskId);
  if (!cp) throw new Error(`No checkpoint found for task ${taskId}`);
  if (cp.status === "discarded")
    throw new Error(`Task ${taskId} checkpoint was already discarded — cannot apply`);

  // Staging layer: promote all staged files into the live workspace.
  // This is the ONLY time the live workspace is touched for this task.
  // commitStaged() uses fail-fast semantics — stops on the first error and
  // returns success=false. We MUST NOT mark the checkpoint as applied until
  // all staged files have been promoted successfully.
  const result: CommitResult = await commitStaged(taskId, cp.wsRoot);

  if (!result.success) {
    const firstFailure = result.failed[0];
    logger.error(
      { taskId, promoted: result.promoted.length, failed: result.failed, wsRoot: cp.wsRoot },
      "[Checkpoint] commitStaged failed — checkpoint NOT marked as applied; staging directory preserved for retry"
    );
    // Record failed post-merge verification on the checkpoint so the outcome
    // is durable even when the caller catches and handles the thrown error.
    cp.postMergeVerification = {
      outcome: "failed",
      detail:  `${result.failed.length} file(s) could not be promoted: ` +
               (firstFailure ? `"${firstFailure.path}" — ${firstFailure.error}` : "unknown error"),
    };
    // Track which files were partially promoted to live so discardCheckpoint()
    // can revert them from snapshots if the operator chooses to discard.
    if (result.promoted.length > 0) {
      cp.partiallyPromotedPaths = result.promoted;
      logger.warn(
        { taskId, partiallyPromotedPaths: result.promoted },
        "[Checkpoint] Partial apply — these live files were promoted before failure; discard will restore them from snapshots"
      );
      await persistCheckpointToDisk(cp);
    }
    throw new Error(
      `Failed to apply checkpoint for task ${taskId}: ` +
      `${result.failed.length} file(s) could not be promoted to the live workspace. ` +
      (firstFailure ? `First failure: "${firstFailure.path}" — ${firstFailure.error}` : "") +
      ` Staged edits have NOT been lost — you can retry Apply or Discard.`
    );
  }

  logger.info(
    { taskId, promoted: result.promoted.length, wsRoot: cp.wsRoot },
    "[Checkpoint] All staged files committed to live workspace during apply"
  );

  cp.status = "applied";
  cp.appliedAt = new Date().toISOString();
  appendHistory(taskId, { kind: "applied", timestamp: cp.appliedAt, meta: { promotedCount: result.promoted.length } });
  logger.info({ taskId }, "[Checkpoint] Checkpoint applied permanently");

  // Post-merge verification: distinct from merge safety (mergeIsSafe / staged flag).
  // Records whether the live promotion succeeded after staging commit.
  // Outcome is "passed" when files were promoted, "deferred" if none were promoted.
  const promotedCount = result.promoted.length;
  const postMergeVerification: PostMergeVerification = promotedCount > 0
    ? {
        outcome: "passed",
        detail:  `${promotedCount} file${promotedCount !== 1 ? "s" : ""} committed to live workspace`,
      }
    : {
        outcome: "deferred",
        detail:  "commitStaged succeeded but no files were promoted (checkpoint may have been empty)",
      };
  logger.info({ taskId, promotedCount, outcome: postMergeVerification.outcome },
    "[Checkpoint] post_merge_verification recorded");

  // Also record in the optional caller-provided ledger for live-run evidence surfacing.
  if (verificationLedger && postMergeVerification.outcome === "passed") {
    verificationLedger.addEntry(
      "command_success",
      `post_merge_verification: ${postMergeVerification.detail}`,
      "fs_mutation",
      undefined,
      undefined,
      taskId,
    );
  }

  cp.postMergeVerification = postMergeVerification;

  // Persist terminal state then remove from disk — awaited so the disk
  // reflects terminal status before the caller signals success to the client
  await persistTerminalStateToDisk(cp);

  // No more writes will occur for this task — prune the sequence counter
  writeSeq.delete(taskId);

  return { promotedFiles: result.promoted };
}

/**
 * Remove the checkpoint for a deleted task (keeps memory clean).
 */
export function deleteCheckpoint(taskId: string): void {
  checkpoints.delete(taskId);
  writeSeq.delete(taskId);
}

// ─── Per-file apply / discard ─────────────────────────────────────────────────

/**
 * Apply a single staged file: promote it into the live workspace.
 * The overall checkpoint status remains "pending" — operators can still apply
 * or discard other files independently or accept/discard all at once.
 * Does not mark the checkpoint as "applied" (whole-checkpoint semantics preserved).
 *
 * Returns an error string on failure, or undefined on success.
 */
export async function applyCheckpointFile(
  taskId: string,
  filePath: string,
): Promise<string | undefined> {
  const cp = checkpoints.get(taskId);
  if (!cp) return `No checkpoint found for task ${taskId}`;
  if (cp.status !== "pending") return `Checkpoint is already ${cp.status}`;

  const result = await commitStagedFile(taskId, filePath, cp.wsRoot);
  if (!result.success) return result.error;

  appendHistory(taskId, { kind: "file_applied", timestamp: new Date().toISOString(), filePath });
  logger.info({ taskId, filePath }, "[Checkpoint] Single file applied from staging to live workspace");
  return undefined;
}

/**
 * Discard a single staged file: remove it from staging without touching live workspace.
 * The overall checkpoint status remains "pending".
 *
 * Returns an error string on failure, or undefined on success.
 */
export async function discardCheckpointFile(
  taskId: string,
  filePath: string,
): Promise<string | undefined> {
  const cp = checkpoints.get(taskId);
  if (!cp) return `No checkpoint found for task ${taskId}`;
  if (cp.status !== "pending") return `Checkpoint is already ${cp.status}`;

  const result = await discardStagedFile(taskId, filePath);
  if (!result.success) return result.error;

  appendHistory(taskId, { kind: "file_discarded", timestamp: new Date().toISOString(), filePath });
  logger.info({ taskId, filePath }, "[Checkpoint] Single staged file discarded");
  return undefined;
}

// ─── Runtime-impact file patterns ─────────────────────────────────────────────
//
// Files matching these patterns may affect the runtime / preview server if
// applied to the live workspace. Used by both the checkpoint route (for the
// GET response) and by agentLoop (to include runtimeImpactFiles in the
// checkpoint WebSocket event).

const RUNTIME_IMPACT_BASENAME_EXACT = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".nvmrc",
  ".node-version",
]);

const RUNTIME_IMPACT_BASENAME_PATTERNS: RegExp[] = [
  /^vite\.config\./i,
  /^next\.config\./i,
  /^webpack\.config\./i,
  /^rollup\.config\./i,
  /^babel\.config\./i,
  /^jest\.config\./i,
  /^tsconfig.*\.json$/i,
  /^\.env\./i,
  /^server\.(ts|js|mts|mjs|cjs)$/i,
  /^app\.(ts|js|mts|mjs|cjs)$/i,
  /^index\.(ts|js|mts|mjs|cjs)$/i,
];

/**
 * P4 (task-9-closeout): Set the evidence-grounded stale-runtime outcome on an
 * applied checkpoint and persist it to disk.
 *
 * Called asynchronously from routes/checkpoint.ts after the post-apply runtime
 * snapshot has been captured and stale detection has run. The outcome is stored
 * in two places:
 *   1. TaskEvidence.runtimeLifecycle.isStaleAfterApply (via persistTaskNow) — primary,
 *      survives server restart via history.json.
 *   2. This checkpoint field (persisted to checkpoint disk file) — secondary source;
 *      consumed by buildRecoveryAssessment() as a fallback when TaskEvidence
 *      runtimeLifecycle is absent (e.g. evidence assembly raced or was evicted).
 *
 * Recovery does NOT gate on liveCheckpoint.status === "applied" — applied
 * checkpoints are not recovered after restart, but this persisted field can be
 * read from the checkpoint disk file independently.
 *
 * @param taskId          - Task whose checkpoint to update.
 * @param staleAfterApply - Evidence-grounded stale determination (true/false/null).
 */
export function setCheckpointRuntimeStale(taskId: string, staleAfterApply: boolean | null): void {
  const cp = checkpoints.get(taskId);
  if (!cp) return;
  cp.runtimeStaleAfterApply = staleAfterApply;
  // Persist asynchronously — fire-and-forget
  persistCheckpointToDisk(cp).catch(() => { /* best-effort */ });
}

export function classifyRuntimeImpactFiles(filePaths: string[]): string[] {
  return filePaths.filter(filePath => {
    const base = path.basename(filePath);
    if (RUNTIME_IMPACT_BASENAME_EXACT.has(base)) return true;
    if (RUNTIME_IMPACT_BASENAME_PATTERNS.some(re => re.test(base))) return true;
    return false;
  });
}
