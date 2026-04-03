/**
 * taskPersistence.ts — lightweight task history persistence
 *
 * Writes completed task summaries to a JSON file so task history survives
 * server restarts. Only summaries (no event arrays) are persisted to keep
 * the file small. The full event log for a completed task is available in
 * memory for the duration of the server session.
 *
 * File location: <data dir>/history.json
 *
 * Data dir resolution order (first match wins):
 *   1. VENOMGPT_DATA_DIR env var
 *   2. DEVMIND_DATA_DIR env var  (backward-compat — migrates data to new path)
 *   3. ~/.venomgpt               (canonical default)
 *
 * Migration: if the canonical ~/.venomgpt/history.json does not exist but
 * the legacy ~/.devmind/history.json does, the legacy file is copied to the
 * new location so no history is lost on upgrade.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { logger } from "./logger.js";
import {
  registerTaskCompletionHook,
  registerTaskStartedHook,
  registerTaskStatusChangedHook,
  hydratePersistedTask,
  listTasks,
  updateTaskStatus,
  setTaskEvidence,
  type AgentTaskSummary,
  type TaskStatus,
} from "./sessionManager.js";
import { getBoardTaskId, clearBoardLink } from "./boardLinkStore.js";
import { updateBoardTaskStatus } from "./taskBoardPersistence.js";
import { getSettings } from "./settingsStore.js";

// ─── Data directory resolution ────────────────────────────────────────────────

const LEGACY_DATA_DIR = path.join(os.homedir(), ".devmind");
const CANONICAL_DATA_DIR = path.join(os.homedir(), ".venomgpt");

function resolveDataDir(): string {
  if (process.env["VENOMGPT_DATA_DIR"]) {
    return path.resolve(process.env["VENOMGPT_DATA_DIR"]);
  }
  if (process.env["DEVMIND_DATA_DIR"]) {
    return path.resolve(process.env["DEVMIND_DATA_DIR"]);
  }
  return CANONICAL_DATA_DIR;
}

const DATA_DIR = resolveDataDir();
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

// Maximum number of tasks to keep is read from settings at each write,
// so operators can change it via the Settings page without restarting the server.

// ─── Evidence retention policy ────────────────────────────────────────────────
//
// VenomGPT persists a structured evidence snapshot (taskEvidence) alongside each
// completed task summary.  The retention boundary is explicit:
//
// PERSISTED to history.json (via AgentTaskSummary = Omit<AgentTask, "events">):
//   ✓ taskEvidence.routeProfile     — routing decision: category, step budget, capability flags
//   ✓ taskEvidence.planData         — structured plan from the planning phase (null if none)
//   ✓ taskEvidence.checkpointSummary— file manifest from the latest checkpoint event (null if none)
//   ✓ taskEvidence.executionSummary — step telemetry, verification quality, proof statement,
//                                     gate trigger counts, side-effect classes, runtime port evidence
//   ✓ All other AgentTaskSummary fields (status, completion, failureDetail, etc.)
//
// NOT PERSISTED (stripped by AgentTaskSummary = Omit<AgentTask, "events">):
//   ✗ events[]  — the full event stream is too large and ephemeral; it is available in
//                 live-session memory but is NOT written to disk. Hydrated tasks have
//                 an empty events[] array; evidence is served from taskEvidence instead.
//
// The evidence endpoints (/tasks/:id/evidence, /tasks/:id/replay) read exclusively from
// taskEvidence, so they work correctly after a server restart using disk-loaded data.

interface PersistedHistory {
  version: 1;
  tasks: AgentTaskSummary[];
}

// ─── Serialisation helpers ────────────────────────────────────────────────────

function serialise(summary: AgentTaskSummary): AgentTaskSummary {
  return {
    ...summary,
    createdAt:   new Date(summary.createdAt),
    completedAt: summary.completedAt ? new Date(summary.completedAt) : undefined,
  };
}

// ─── Legacy migration ─────────────────────────────────────────────────────────

/**
 * If the canonical history file doesn't exist but the legacy one does,
 * copy it over so existing history is preserved after the rename.
 */
async function migrateFromLegacyIfNeeded(): Promise<void> {
  const legacyFile = path.join(LEGACY_DATA_DIR, "history.json");

  // Only migrate when using the canonical default dir (not when the user
  // has set a custom dir via env var, which they control themselves).
  if (DATA_DIR !== CANONICAL_DATA_DIR) return;

  try {
    await fs.access(HISTORY_FILE);
    return; // Canonical file already exists — no migration needed
  } catch {
    // Canonical file absent — check for legacy
  }

  try {
    await fs.access(legacyFile);
  } catch {
    return; // No legacy file either — nothing to migrate
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.copyFile(legacyFile, HISTORY_FILE);
    logger.info(
      { from: legacyFile, to: HISTORY_FILE },
      "Migrated task history from legacy .devmind directory to .venomgpt"
    );
  } catch (err) {
    logger.warn({ err, legacyFile, HISTORY_FILE }, "Failed to migrate legacy task history — starting fresh");
  }
}

// ─── Read / write ─────────────────────────────────────────────────────────────

async function readHistory(): Promise<AgentTaskSummary[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    const data = JSON.parse(raw) as PersistedHistory;
    if (data.version !== 1 || !Array.isArray(data.tasks)) return [];
    return data.tasks.map(serialise);
  } catch {
    return [];
  }
}

async function writeHistory(tasks: AgentTaskSummary[]): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const payload: PersistedHistory = { version: 1, tasks };
    await fs.writeFile(HISTORY_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err, file: HISTORY_FILE }, "Failed to write task history");
  }
}

// In-memory shadow of persisted tasks, sorted newest-first
let _persisted: AgentTaskSummary[] = [];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load persisted task history from disk and hydrate the session manager.
 * Handles migration from the legacy .devmind directory automatically.
 * Call this once at server start AFTER setting up the workspace.
 */
export async function loadPersistedHistory(): Promise<void> {
  await migrateFromLegacyIfNeeded();
  _persisted = await readHistory();
  logger.info({ count: _persisted.length, file: HISTORY_FILE }, "Loaded task history");

  for (const summary of _persisted) {
    hydratePersistedTask(summary);
  }
}

/**
 * Clear all persisted task history from disk and reset the in-memory shadow.
 * Called by the settings route when the user clears history via the UI.
 */
export async function clearPersistedHistory(): Promise<void> {
  _persisted = [];
  await writeHistory([]);
  logger.info({ file: HISTORY_FILE }, "Task history cleared");
}

/**
 * Register the session-manager hook so completed tasks are automatically saved.
 * Also registers a "task started" hook that writes a minimal "running" snapshot
 * to disk immediately when a task begins — ensuring crash/restart recovery can
 * find the task and mark it as "interrupted" even if no terminal event was written.
 * Must be called before tasks start running.
 */
export function initTaskPersistence(): void {
  // ── Task-started hook: write a running snapshot to disk ─────────────────────
  registerTaskStartedHook((summary) => {
    const idx = _persisted.findIndex((t) => t.id === summary.id);
    if (idx >= 0) {
      _persisted[idx] = summary;
    } else {
      _persisted.unshift(summary);
    }
    // Fire-and-forget — errors already logged inside writeHistory
    writeHistory(_persisted).catch(() => { /* already logged inside */ });
  });

  // ── Board status-change hook: mirror agent task status → board task ──────────
  registerTaskStatusChangedHook((agentTaskId: string, status: TaskStatus) => {
    const boardTaskId = getBoardTaskId(agentTaskId);
    if (!boardTaskId) return;
    // Map agent TaskStatus to BoardTaskStatus — only propagate known board statuses.
    const BOARD_STATUS_MAP: Partial<Record<TaskStatus, string>> = {
      running:     "running",
      done:        "done",
      error:       "error",
      cancelled:   "cancelled",
      interrupted: "interrupted",
      stalled:     "stalled",
    };
    const boardStatus = BOARD_STATUS_MAP[status];
    if (boardStatus) {
      updateBoardTaskStatus(boardTaskId, boardStatus as Parameters<typeof updateBoardTaskStatus>[1]);
    }
    // Clean up the in-memory link on terminal states to prevent unbounded map growth.
    const TERMINAL: Set<TaskStatus> = new Set(['done', 'error', 'cancelled', 'interrupted']);
    if (TERMINAL.has(status)) {
      clearBoardLink(agentTaskId);
    }
  });

  // ── Task-completed hook: upsert terminal snapshot and persist ────────────────
  registerTaskCompletionHook((summary) => {
    // Upsert: replace existing entry or prepend
    const idx = _persisted.findIndex((t) => t.id === summary.id);
    if (idx >= 0) {
      _persisted[idx] = summary;
    } else {
      _persisted.unshift(summary);
    }

    // Trim to the operator-configured capacity (read live from settings)
    const cap = getSettings().historyCapacity;
    if (_persisted.length > cap) {
      _persisted = _persisted.slice(0, cap);
    }

    // Fire-and-forget write
    writeHistory(_persisted).catch(() => { /* already logged inside */ });
  });
}

/**
 * After loading persisted history, mark any tasks still in "running" status
 * as "interrupted" — they were orphaned by a server crash or restart.
 *
 * These tasks had no live agent loop running; leaving them as "running" forever
 * would create phantom tasks that appear active but cannot be cancelled.
 *
 * Recovery actions per orphaned task:
 *   1. Synthesize a minimal taskEvidence.executionSummary with exitReason: "interrupted",
 *      so the evidence endpoint returns useful lifecycle data after restart.
 *      If the task already has executionSummary evidence (crash mid-run, event stored),
 *      update only the exitReason field, preserving the rest.
 *   2. Transition status to "interrupted" — this triggers completedAt/durationMs
 *      and fires the completion hook so the corrected snapshot is persisted to disk.
 *
 * Call this AFTER loadPersistedHistory() and initTaskPersistence() so the
 * transition is persisted immediately via the completion hook.
 */
export function recoverInterruptedTasks(): void {
  const allTasks = listTasks();
  let recovered = 0;

  for (const task of allTasks) {
    if (task.status !== "running") continue;

    logger.warn(
      { taskId: task.id, prompt: task.prompt.slice(0, 80) },
      "[Recovery] Marking orphaned running task as interrupted"
    );

    // ── Synthesize or patch executionSummary with exitReason: "interrupted" ──
    const existing = task.taskEvidence;
    if (existing) {
      // Task had partial evidence (routing/plan/checkpoint captured before crash).
      // Patch the executionSummary exitReason if present; or create a minimal one.
      const exec = existing.executionSummary;
      setTaskEvidence(task.id, {
        ...existing,
        executionSummary: exec
          ? { ...exec, exitReason: "interrupted" }
          : {
              stepsUsed: 0,
              stepsMax: existing.routeProfile?.maxSteps ?? 0,
              readsUsed: 0,
              writesUsed: 0,
              commandsUsed: 0,
              verificationsDone: 0,
              finalPhase: "interrupted",
              exitReason: "interrupted",
              verificationQuality: "none",
              proofStatement: "Task was interrupted by server restart before execution completed.",
              gateTriggers: null,
              shellReadsBlocked: 0,
              phaseTimeline: null,
              sideEffectsObserved: null,
              runtimeEvidence: null,
              dependencyAnalysis: null,
            },
      });
    } else {
      // No evidence at all — task crashed before or during routing.
      // Inject a stub evidence block so the evidence endpoint says "interrupted"
      // rather than "no_evidence_for_task_class".
      setTaskEvidence(task.id, {
        routeProfile: {
          category: "unknown",
          maxSteps: 0,
          maxFileReads: 0,
          maxFileWrites: 0,
          requiresVerify: false,
          planningPhase: false,
        },
        planData: null,
        checkpointSummary: null,
        executionSummary: {
          stepsUsed: 0,
          stepsMax: 0,
          readsUsed: 0,
          writesUsed: 0,
          commandsUsed: 0,
          verificationsDone: 0,
          finalPhase: "interrupted",
          exitReason: "interrupted",
          verificationQuality: "none",
          proofStatement: "Task was interrupted by server restart before execution completed.",
          gateTriggers: null,
          shellReadsBlocked: 0,
          phaseTimeline: null,
          sideEffectsObserved: null,
          runtimeEvidence: null,
          dependencyAnalysis: null,
        },
      });
    }

    // Transition to interrupted — fires completion hook → persists to disk
    updateTaskStatus(task.id, "interrupted", "Server restarted — task was interrupted");
    recovered++;
  }

  if (recovered > 0) {
    logger.info({ recovered }, `[Recovery] Marked ${recovered} orphaned task(s) as interrupted`);
  }
}
