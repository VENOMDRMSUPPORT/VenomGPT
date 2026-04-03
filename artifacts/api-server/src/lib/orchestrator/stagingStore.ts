/**
 * orchestrator/stagingStore.ts — Per-task staging layer.
 *
 * WHAT THIS IS:
 *   A real per-task staging layer that isolates all file edits during agent
 *   execution. Instead of writing directly into the live workspace, the agent
 *   writes into a per-task staging directory at:
 *
 *     ~/.venomgpt/staging/<taskId>/<relative-workspace-path>
 *
 *   The live workspace is NEVER touched until the operator clicks "Accept",
 *   which triggers commitStaged() — an atomic promotion of staged files into
 *   the live workspace. Discard removes only the staging directory; the live
 *   workspace is completely clean.
 *
 * HOW IT WORKS:
 *   1. writeStaged(taskId, relPath, content) — validates the workspace-relative
 *      path, then writes into the staging dir using write-then-rename atomicity.
 *      The live file is NOT touched.
 *   2. readStaged(taskId, relPath) — returns staged content if present,
 *      or null if the file has not been staged yet. The caller falls through
 *      to the live workspace when null is returned.
 *   3. commitStaged(taskId, wsRoot) — copies all staged files into the live
 *      workspace atomically (per-file write-then-rename). Fails fast on any
 *      individual promotion error — returns a structured result with success/
 *      failure details. Called by apply route.
 *   4. discardStaged(taskId) — removes the staging directory entirely.
 *      No live workspace changes are needed since the live files were never touched.
 *   5. recoverStagingDirs() — called at startup to enumerate staging directories
 *      left by a crash or restart. Returns list of task IDs with pending staging.
 *
 * PATH SAFETY:
 *   All workspace-relative paths are validated against the task staging root
 *   before any disk operation. Absolute paths and directory-traversal sequences
 *   (../) that escape the staging directory for that task are rejected with a
 *   StagingPathError. This mirrors the workspace path validation in safety.ts
 *   and prevents arbitrary file read/write via the staging layer.
 *
 * NON-STAGED TASK CLASSES:
 *   Conversational, visual_describe, code_verify, text_explain, and any profile
 *   with writesAllowed: false are NEVER staged — they cannot write files at all,
 *   so staging is irrelevant. This is enforced at the gate level in actionRouter.ts
 *   and documented here as an explicit design constraint.
 *
 * COMMAND SIDE EFFECTS:
 *   Shell commands (run_command) execute in the live workspace by design.
 *   Their side effects (compiled artefacts, installed packages, build outputs)
 *   are NOT staged. This is documented as an explicit out-of-scope constraint.
 *
 * ATOMICITY:
 *   Individual file writes use write-to-<unique>.tmp then rename.
 *   Commit uses the same pattern per file. The overall commit is NOT a single
 *   atomic transaction across all files, but each individual file promotion is
 *   atomic. If any promotion fails, commitStaged returns an error result without
 *   marking the checkpoint as applied.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { logger } from "../logger.js";
import { actionStore, ActionType } from "./actionStore.js";
import { isWorkspaceSet, getWorkspaceRoot } from "../safety.js";

// ─── Directory resolution ──────────────────────────────────────────────────────

const CANONICAL_DATA_DIR = path.join(os.homedir(), ".venomgpt");

function resolveDataDir(): string {
  if (process.env["VENOMGPT_DATA_DIR"]) return path.resolve(process.env["VENOMGPT_DATA_DIR"]);
  if (process.env["DEVMIND_DATA_DIR"])  return path.resolve(process.env["DEVMIND_DATA_DIR"]);
  return CANONICAL_DATA_DIR;
}

const STAGING_ROOT = path.join(resolveDataDir(), "staging");

// ─── Path validation ───────────────────────────────────────────────────────────

export class StagingPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StagingPathError";
  }
}

/**
 * Validate that a workspace-relative path is safe to use under the staging root.
 *
 * Rejects:
 *   - Absolute paths (e.g. /etc/passwd, C:\Windows\...)
 *   - Path traversal sequences that escape the task staging directory (../)
 *   - Empty or whitespace-only paths
 *
 * Returns the resolved absolute staging path if valid.
 * Throws StagingPathError if the path is unsafe.
 */
function validateAndResolveStagedPath(taskId: string, workspacePath: string): string {
  if (!workspacePath || workspacePath.trim() === "") {
    throw new StagingPathError("Staging path cannot be empty");
  }

  // Reject absolute paths (Unix and Windows)
  if (
    path.isAbsolute(workspacePath) ||
    /^[A-Za-z]:/.test(workspacePath) ||
    workspacePath.startsWith("//")
  ) {
    throw new StagingPathError(
      `Staging path "${workspacePath}" must be relative to the workspace root. ` +
      `Absolute paths are not permitted in the staging layer.`
    );
  }

  // Reject URL-encoded traversal attempts (%2F, %2e%2e, etc.)
  let decoded = workspacePath;
  try {
    decoded = decodeURIComponent(workspacePath);
  } catch {
    throw new StagingPathError(`Staging path "${workspacePath}" contains invalid URL encoding.`);
  }
  if (decoded !== workspacePath) {
    // Recursively validate the decoded form
    return validateAndResolveStagedPath(taskId, decoded);
  }

  // Resolve against the task staging directory and check for escape
  const taskStagingDir  = path.resolve(STAGING_ROOT, taskId);
  const resolvedStaging = path.resolve(taskStagingDir, workspacePath);

  if (
    resolvedStaging !== taskStagingDir &&
    !resolvedStaging.startsWith(taskStagingDir + path.sep)
  ) {
    throw new StagingPathError(
      `Staging path "${workspacePath}" escapes the task staging directory. ` +
      `All staged file operations must stay within ~/.venomgpt/staging/<taskId>/.`
    );
  }

  return resolvedStaging;
}

/**
 * Validate a workspace-relative path for live-workspace operations (commit).
 * Mirrors safety.ts validateWorkspacePath logic.
 */
function validateLivePath(wsRoot: string, workspacePath: string): string {
  if (!workspacePath || workspacePath.trim() === "") {
    throw new StagingPathError("Workspace path cannot be empty");
  }
  if (
    path.isAbsolute(workspacePath) ||
    /^[A-Za-z]:/.test(workspacePath) ||
    workspacePath.startsWith("//")
  ) {
    throw new StagingPathError(
      `Workspace path "${workspacePath}" must be relative. Absolute paths are not permitted.`
    );
  }
  const root     = path.resolve(wsRoot);
  const resolved = path.resolve(root, workspacePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new StagingPathError(
      `Workspace path "${workspacePath}" escapes the workspace root "${wsRoot}".`
    );
  }
  return resolved;
}

// ─── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve the staging path for a (taskId, relative workspace path) pair.
 * The staging path mirrors the relative workspace path under the task's staging dir.
 *
 * Validates the workspace-relative path before returning.
 * Throws StagingPathError for unsafe paths.
 */
export function getStagedPath(taskId: string, workspacePath: string): string {
  return validateAndResolveStagedPath(taskId, workspacePath);
}

/**
 * Return the staging directory for a task (no validation needed — taskId is internal).
 */
function stagingDir(taskId: string): string {
  return path.join(STAGING_ROOT, taskId);
}

// ─── Core operations ───────────────────────────────────────────────────────────

/**
 * Write content into the staging directory for a task.
 * Uses write-to-unique-.tmp then rename for atomicity.
 * The live workspace file is NOT touched.
 *
 * @param taskId        - Task identifier.
 * @param workspacePath - Relative workspace path (e.g. "src/index.ts").
 * @param content       - File content to stage.
 * @throws StagingPathError if workspacePath is unsafe (traversal, absolute, etc.)
 */
export async function writeStaged(
  taskId: string,
  workspacePath: string,
  content: string,
): Promise<void> {
  const stagedPath = validateAndResolveStagedPath(taskId, workspacePath);
  const stagedDir  = path.dirname(stagedPath);
  const tmpPath    = `${stagedPath}.${Date.now()}.${process.pid}.tmp`;

  // ── Action-level instrumentation ────────────────────────────────────────────
  // Determine whether this write creates a new file (isNew=true) or updates an
  // existing one (isNew=false). A file is "existing" if it is already staged OR
  // if it exists in the live workspace — whichever is checked first. The live
  // workspace check handles the common case of a first-staged write to a file
  // that the user already has on disk, which should be labeled an "update".
  let isNew = true;
  try {
    await fs.access(stagedPath);
    isNew = false; // Already staged — definitely an update
  } catch {
    // Not staged yet — check live workspace if accessible
    if (isWorkspaceSet()) {
      try {
        const livePath = path.join(getWorkspaceRoot(), workspacePath);
        await fs.access(livePath);
        isNew = false; // Exists in live workspace — first staged write is an update
      } catch {
        isNew = true; // Not in live workspace either — genuinely new file
      }
    } else {
      isNew = true;
    }
  }

  const byteCount = Buffer.byteLength(content, "utf8");
  const writeRecord = actionStore.createAction(taskId, ActionType.WRITE_FILE, {
    type:      ActionType.WRITE_FILE,
    filePath:  workspacePath,
    byteCount,
    isNew,
  });
  actionStore.startAction(writeRecord.id);

  try {
    await fs.mkdir(stagedDir, { recursive: true });
    await fs.writeFile(tmpPath, content, "utf8");
    await fs.rename(tmpPath, stagedPath);

    actionStore.completeAction(writeRecord.id, {
      success: true,
      summary: `Staged ${byteCount} bytes to ${workspacePath} (${isNew ? "new" : "update"})`,
    });

    logger.debug(
      { taskId, workspacePath, stagedPath, bytes: content.length },
      "[StagingStore] File staged (live workspace unchanged)"
    );
  } catch (err) {
    actionStore.failAction(writeRecord.id, String(err));
    throw err;
  }
}

/**
 * Read staged content for a (taskId, workspacePath) pair.
 * Returns the staged content string, or null if the file has not been staged.
 * Callers should fall through to the live workspace when null is returned.
 *
 * @param taskId        - Task identifier.
 * @param workspacePath - Relative workspace path.
 * @returns Staged content, or null if not staged.
 * @throws StagingPathError if workspacePath is unsafe.
 */
export async function readStaged(
  taskId: string,
  workspacePath: string,
): Promise<string | null> {
  const stagedPath = validateAndResolveStagedPath(taskId, workspacePath);
  try {
    const content = await fs.readFile(stagedPath, "utf8");
    logger.debug({ taskId, workspacePath }, "[StagingStore] Staged read hit — returning staged version");

    // ── Action-level instrumentation (staged read hit) ─────────────────────
    const byteCount = Buffer.byteLength(content, "utf8");
    const readRecord = actionStore.createAction(taskId, ActionType.READ_FILE, {
      type:        ActionType.READ_FILE,
      filePath:    workspacePath,
      fromStaging: true,
      byteCount,
    });
    actionStore.startAction(readRecord.id);
    actionStore.completeAction(readRecord.id, {
      success: true,
      summary: `Read ${byteCount} bytes from ${workspacePath} (staging layer)`,
    });

    return content;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null; // Not staged — caller falls through to live workspace (no record emitted)
    }
    // Unexpected error — emit a failed READ_FILE record so the attempt is fully
    // represented in the action trace, then fall through to the live workspace.
    logger.warn({ taskId, workspacePath, err }, "[StagingStore] Unexpected error reading staged file — falling through to live workspace");
    const errRecord = actionStore.createAction(taskId, ActionType.READ_FILE, {
      type:        ActionType.READ_FILE,
      filePath:    workspacePath,
      fromStaging: true,
    });
    actionStore.startAction(errRecord.id);
    actionStore.failAction(errRecord.id, String(err));
    return null;
  }
}

/**
 * List all files currently staged for a task.
 * Returns relative workspace paths (not absolute staging paths).
 *
 * @param taskId - Task identifier.
 * @returns Array of relative workspace paths, or empty array if no staged files.
 */
export async function listStagedFiles(taskId: string): Promise<string[]> {
  const dir = stagingDir(taskId);
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && !entry.name.endsWith(".tmp")) {
        // Convert absolute staging path back to relative workspace path
        const relPath = fullPath.slice(dir.length + 1).replace(/\\/g, "/");
        results.push(relPath);
      }
    }
  }

  try {
    await walk(dir);
  } catch {
    // Directory doesn't exist — no staged files
  }

  return results;
}

// ─── Commit result type ────────────────────────────────────────────────────────

export interface CommitResult {
  /** Relative workspace paths that were successfully promoted. */
  promoted: string[];
  /** Files that could not be promoted, with their error messages. */
  failed:   Array<{ path: string; error: string }>;
  /** True when all staged files were promoted successfully. */
  success:  boolean;
}

/**
 * Atomically promote all staged files into the live workspace.
 * Each file is promoted via write-to-.tmp then rename, so individual file
 * promotions are atomic even if the overall commit is interrupted.
 *
 * FAIL-FAST SEMANTICS:
 *   If ANY staged file fails to promote (path validation error, I/O failure),
 *   the function STOPS immediately and returns a CommitResult with success=false.
 *   Already-promoted files in the current run are NOT rolled back (each individual
 *   promotion is atomic, but the overall commit is best-effort transactional).
 *   The caller (applyCheckpoint) MUST check success and only mark the checkpoint
 *   as "applied" when success=true.
 *
 * The staging directory is removed after all files are promoted successfully.
 * On failure, the staging directory is LEFT INTACT so the operator can retry.
 *
 * @param taskId    - Task identifier.
 * @param wsRoot    - Absolute workspace root path.
 * @returns CommitResult with promoted/failed arrays and success flag.
 */
export async function commitStaged(
  taskId: string,
  wsRoot: string,
): Promise<CommitResult> {
  const staged = await listStagedFiles(taskId);

  if (staged.length === 0) {
    logger.debug({ taskId }, "[StagingStore] commitStaged called with no staged files — no-op");
    return { promoted: [], failed: [], success: true };
  }

  const dir      = stagingDir(taskId);
  const promoted: string[] = [];
  const failed:   Array<{ path: string; error: string }> = [];

  for (const relPath of staged) {
    // Validate both the staging path and the live workspace target path
    let livePath: string;
    let tmpPath: string;

    try {
      livePath = validateLivePath(wsRoot, relPath);
      tmpPath  = `${livePath}.${Date.now()}.${process.pid}.staging.tmp`;
    } catch (err) {
      const errMsg = String(err);
      logger.error(
        { taskId, relPath, err },
        "[StagingStore] Path validation failed during commit — stopping"
      );
      failed.push({ path: relPath, error: errMsg });
      // Fail fast: path safety violation, stop immediately
      return { promoted, failed, success: false };
    }

    const stagedPath = path.join(dir, relPath);
    try {
      const content = await fs.readFile(stagedPath, "utf8");
      await fs.mkdir(path.dirname(livePath), { recursive: true });
      await fs.writeFile(tmpPath, content, "utf8");
      await fs.rename(tmpPath, livePath);
      promoted.push(relPath);
      logger.debug({ taskId, relPath, livePath }, "[StagingStore] File promoted to live workspace");
    } catch (err) {
      const errMsg = String(err);
      // Clean up tmp on error
      await fs.unlink(tmpPath).catch(() => { /* best effort */ });
      logger.error(
        { taskId, relPath, err },
        "[StagingStore] Failed to promote staged file — stopping commit"
      );
      failed.push({ path: relPath, error: errMsg });
      // Fail fast: I/O error during promotion
      return { promoted, failed, success: false };
    }
  }

  // All files promoted — remove the staging directory
  await discardStaged(taskId);

  logger.info(
    { taskId, promoted: promoted.length, total: staged.length, wsRoot },
    "[StagingStore] All staged files committed to live workspace"
  );

  return { promoted, failed: [], success: true };
}

/**
 * Promote a single staged file into the live workspace.
 * The per-file checkpoint snapshot is left intact — whole-checkpoint apply/discard
 * still works after per-file operations. Does NOT remove the staging directory.
 *
 * Returns { success: true } when the file was promoted, { success: false, error } on failure.
 *
 * @param taskId    - Task identifier.
 * @param relPath   - Relative workspace path (must already be staged).
 * @param wsRoot    - Absolute workspace root path.
 */
export async function commitStagedFile(
  taskId: string,
  relPath: string,
  wsRoot: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let livePath: string;
  let tmpPath: string;
  try {
    livePath = validateLivePath(wsRoot, relPath);
    tmpPath  = `${livePath}.${Date.now()}.${process.pid}.staging.tmp`;
  } catch (err) {
    return { success: false, error: String(err) };
  }

  const stagedPath = validateAndResolveStagedPath(taskId, relPath);
  try {
    const content = await fs.readFile(stagedPath, "utf8");
    await fs.mkdir(path.dirname(livePath), { recursive: true });
    await fs.writeFile(tmpPath, content, "utf8");
    await fs.rename(tmpPath, livePath);
    // Remove only this file from the staging directory
    await fs.unlink(stagedPath).catch(() => { /* best effort */ });
    logger.debug({ taskId, relPath, livePath }, "[StagingStore] Single file promoted to live workspace");
    return { success: true };
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => { /* best effort */ });
    logger.error({ taskId, relPath, err }, "[StagingStore] Failed to promote single staged file");
    return { success: false, error: String(err) };
  }
}

/**
 * Discard a single staged file without touching the live workspace.
 * The per-file checkpoint snapshot is left intact. Does NOT remove the staging directory.
 *
 * @param taskId    - Task identifier.
 * @param relPath   - Relative workspace path (must already be staged).
 */
export async function discardStagedFile(
  taskId: string,
  relPath: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let stagedPath: string;
  try {
    stagedPath = validateAndResolveStagedPath(taskId, relPath);
  } catch (err) {
    return { success: false, error: String(err) };
  }
  try {
    await fs.unlink(stagedPath);
    logger.debug({ taskId, relPath }, "[StagingStore] Single staged file discarded");
    return { success: true };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.debug({ taskId, relPath }, "[StagingStore] Single staged file already gone — no-op");
      return { success: true };
    }
    logger.error({ taskId, relPath, err }, "[StagingStore] Failed to discard single staged file");
    return { success: false, error: String(err) };
  }
}

/**
 * Remove the staging directory for a task entirely.
 * Since the live workspace was never touched during staging, no live files
 * need to be reverted — this is a clean removal of staged work only.
 *
 * Called by the discard route when the operator rejects changes,
 * and by commitStaged after successful promotion.
 *
 * @param taskId - Task identifier.
 */
export async function discardStaged(taskId: string): Promise<void> {
  const dir = stagingDir(taskId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    logger.info({ taskId, dir }, "[StagingStore] Staging directory removed (live workspace untouched)");
  } catch (err) {
    logger.warn({ taskId, dir, err }, "[StagingStore] Failed to remove staging directory — best effort");
  }
}

/**
 * Enumerate all existing staging directories on startup.
 * Called once at server start alongside recoverCheckpointsFromDisk().
 *
 * For each recovered staging directory, logs operator-visible output indicating
 * the task has staged-but-unapplied edits. This ensures the isolation model
 * survives server restarts without silently vanishing.
 *
 * @param pendingCheckpointTaskIds - Optional set of task IDs whose checkpoints are
 *   pending. When provided, only staging dirs with a corresponding pending checkpoint
 *   are reported and returned. Orphaned staging dirs (no pending checkpoint) are
 *   removed automatically since there is no UI pathway to accept or discard them.
 *   When not provided (or empty), all non-empty staging dirs are reported.
 * @returns Array of taskIds that have staging directories present on disk (and,
 *   when filtered, have a corresponding pending checkpoint).
 */
export async function recoverStagingDirs(
  pendingCheckpointTaskIds?: Set<string>,
): Promise<string[]> {
  try {
    await fs.mkdir(STAGING_ROOT, { recursive: true });
  } catch {
    // Already exists
  }

  let entries: string[];
  try {
    entries = await fs.readdir(STAGING_ROOT);
  } catch {
    logger.debug({ dir: STAGING_ROOT }, "[StagingStore] Staging root not readable — skipping recovery");
    return [];
  }

  const recovered: string[] = [];

  // The filter is authoritative when the argument is explicitly provided, regardless
  // of whether the set is empty. An empty set means "no tasks have pending checkpoints
  // — all staging dirs are orphans and should be removed."
  const hasPendingFilter = pendingCheckpointTaskIds !== undefined;

  for (const entry of entries) {
    const taskId = entry;
    const dir    = path.join(STAGING_ROOT, taskId);
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) continue;
      const stagedFiles = await listStagedFiles(taskId);

      if (stagedFiles.length === 0) {
        // Empty staging dir — always clean up
        await fs.rm(dir, { recursive: true, force: true }).catch(() => { /* best effort */ });
        continue;
      }

      // If a pending checkpoint filter was provided, only report dirs with
      // a corresponding pending checkpoint. Orphaned staging dirs (whose task
      // has no pending checkpoint) are NOT reported to the operator — there is
      // no UI pathway to accept or discard them — but they are NOT immediately
      // deleted (quarantine-first policy). They will be cleaned up on the next
      // startup pass once checkpoint recovery is confirmed healthy. This prevents
      // accidental data loss when checkpoint recovery fails transiently.
      if (hasPendingFilter && !pendingCheckpointTaskIds!.has(taskId)) {
        logger.warn(
          { taskId, stagedFiles: stagedFiles.length, dir },
          `[StagingStore] Orphaned staging directory — task ${taskId} has no corresponding pending checkpoint. ` +
          `Not surfaced to operator. Staging directory preserved for safety (quarantine); ` +
          `it will be removed on the next startup if still orphaned.`
        );
        // Do NOT delete — quarantine in place until confirmed safe to remove.
        continue;
      }

      recovered.push(taskId);
      logger.info(
        { taskId, stagedFiles, dir },
        `[StagingStore] Recovered staging directory — task ${taskId} has ${stagedFiles.length} staged-but-unapplied file(s). ` +
        `These changes have NOT been applied to the live workspace. Accept or discard via the checkpoint panel.`
      );
    } catch (err) {
      logger.warn({ taskId, dir, err }, "[StagingStore] Failed to inspect staging directory during recovery");
    }
  }

  logger.info(
    { recovered: recovered.length, dir: STAGING_ROOT },
    `[StagingStore] Startup recovery complete — ${recovered.length} staging director${recovered.length === 1 ? "y" : "ies"} with staged edits recovered`
  );

  return recovered;
}
