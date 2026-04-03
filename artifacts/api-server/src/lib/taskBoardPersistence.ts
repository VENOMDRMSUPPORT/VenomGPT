/**
 * taskBoardPersistence.ts — VenomGPT Tasks Board persistence layer.
 *
 * Manages a dedicated taskboard.json file stored alongside history.json.
 * Provides:
 *   - A permanent master project session (auto-created on workspace load, un-deletable)
 *   - Child task creation with deterministic sequential human-facing indices (001, 002, …)
 *   - Active task listing (excludes done/archived)
 *   - Full task listing (for board/history view)
 *   - Status transitions with delete/archive protection for the master session
 *
 * File: <data dir>/taskboard.json
 * Data dir resolution follows the same order as taskPersistence.ts.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BoardTaskStatus =
  | "draft"
  | "pending"
  | "running"
  | "done"
  | "archived"
  | "error"
  | "cancelled"
  | "interrupted"
  | "stalled"
  | "blocked"
  | "partial";

/** Statuses that hide a task from the sidebar (but keep it in board/history). */
export const HIDDEN_FROM_SIDEBAR: ReadonlySet<BoardTaskStatus> = new Set<BoardTaskStatus>([
  "done",
  "archived",
]);

export interface MasterSession {
  type: "master";
  id: "master";
  name: string;
  workspaceRoot: string;
  createdAt: string;
}

export interface BoardTask {
  type: "task";
  /** UUID for internal use. */
  id: string;
  /** Human-facing sequential index (1-based). Displayed as Task 001, Task 002, etc. */
  index: number;
  /** Short human-readable label (defaults to truncated prompt). */
  name: string;
  /** The original prompt submitted for this task. */
  prompt: string;
  status: BoardTaskStatus;
  createdAt: string;
  updatedAt: string;
  /** The agent task ID (from sessionManager) linked to this board entry. */
  agentTaskId?: string;
}

interface PersistedTaskBoard {
  version: 1;
  master: MasterSession;
  /** Monotonically increasing counter — persisted so indices survive restarts. */
  nextIndex: number;
  tasks: BoardTask[];
}

// ─── Data dir resolution ──────────────────────────────────────────────────────

const CANONICAL_DATA_DIR = path.join(os.homedir(), ".venomgpt");

function resolveDataDir(): string {
  if (process.env["VENOMGPT_DATA_DIR"]) return path.resolve(process.env["VENOMGPT_DATA_DIR"]);
  if (process.env["DEVMIND_DATA_DIR"])  return path.resolve(process.env["DEVMIND_DATA_DIR"]);
  return CANONICAL_DATA_DIR;
}

const DATA_DIR = resolveDataDir();

// ─── Workspace-scoped file path ───────────────────────────────────────────────

/**
 * Derive a stable, filesystem-safe filename from an absolute workspace root path.
 * Uses a simple hash so paths like /home/user/projects/foo don't collide with
 * /home/user/projects/foo-bar.
 *
 * We persist one `taskboard-<hash>.json` per workspace root in DATA_DIR so
 * switching workspaces never overwrites another workspace's data.
 */
function workspaceHash(workspaceRoot: string): string {
  // Stable, short hash: XOR of char codes folded into 32-bit unsigned integer.
  let h = 0x811c9dc5;
  for (let i = 0; i < workspaceRoot.length; i++) {
    h = Math.imul(h ^ workspaceRoot.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function taskboardFile(workspaceRoot: string): string {
  return path.join(DATA_DIR, `taskboard-${workspaceHash(workspaceRoot)}.json`);
}

// ─── In-memory state ──────────────────────────────────────────────────────────

let _master:              MasterSession | null = null;
let _tasks:               BoardTask[]          = [];
let _nextIndex:           number               = 1;
let _currentWorkspaceRoot: string | null       = null;
let _taskboardFile:       string               = path.join(DATA_DIR, "taskboard.json"); // fallback

// ─── Disk I/O ─────────────────────────────────────────────────────────────────

async function read(): Promise<PersistedTaskBoard | null> {
  try {
    const raw  = await fs.readFile(_taskboardFile, "utf8");
    const data = JSON.parse(raw) as PersistedTaskBoard;
    if (data.version !== 1 || !data.master || !Array.isArray(data.tasks)) return null;
    return data;
  } catch {
    return null;
  }
}

async function write(): Promise<void> {
  if (!_master) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const payload: PersistedTaskBoard = {
      version:   1,
      master:    _master,
      nextIndex: _nextIndex,
      tasks:     _tasks,
    };
    await fs.writeFile(_taskboardFile, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err, file: _taskboardFile }, "[TaskBoard] Failed to write taskboard.json");
  }
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Load the task board from disk, creating a master session if needed.
 * Must be called after the workspace root is configured.
 * Re-loads from disk whenever the workspace root changes so each workspace
 * gets its own isolated board state.
 */
export async function initTaskBoard(workspaceRoot: string): Promise<void> {
  // If workspace hasn't changed, nothing to do (idempotent guard).
  if (_currentWorkspaceRoot === workspaceRoot && _master !== null) {
    return;
  }

  // Point I/O at the workspace-specific file before any read/write.
  _taskboardFile = taskboardFile(workspaceRoot);

  const persisted = await read();

  if (persisted) {
    _master    = persisted.master;
    _tasks     = persisted.tasks;
    _nextIndex = persisted.nextIndex;
    // Update workspace root in master if it changed (e.g. after rename / path change)
    if (_master.workspaceRoot !== workspaceRoot) {
      _master = { ..._master, workspaceRoot };
      write().catch(() => {});
    }
  } else {
    _master = {
      type:          "master",
      id:            "master",
      name:          "Project Session",
      workspaceRoot,
      createdAt:     new Date().toISOString(),
    };
    _tasks     = [];
    _nextIndex = 1;
    await write();
  }

  _currentWorkspaceRoot = workspaceRoot;
  logger.info({ taskCount: _tasks.length, workspaceRoot, file: _taskboardFile }, "[TaskBoard] Task board loaded");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getMasterSession(): MasterSession | null {
  return _master;
}

/**
 * All child tasks (including done/archived).
 * Sorted oldest-first by creation time.
 */
export function listAllTasks(): BoardTask[] {
  return _tasks.slice().sort((a, b) => a.index - b.index);
}

/**
 * Active child tasks visible in the sidebar:
 * excludes tasks whose status is "done" or "archived".
 */
export function listActiveTasks(): BoardTask[] {
  return listAllTasks().filter(t => !HIDDEN_FROM_SIDEBAR.has(t.status));
}

export function getTask(id: string): BoardTask | undefined {
  return _tasks.find(t => t.id === id);
}

/**
 * Create a new child task with a deterministic sequential index.
 */
export function createBoardTask(params: {
  name?: string;
  prompt: string;
  agentTaskId?: string;
}): BoardTask {
  const index = _nextIndex++;
  const id    = randomUUID();
  const now   = new Date().toISOString();

  const task: BoardTask = {
    type:       "task",
    id,
    index,
    name:       params.name ?? (params.prompt.slice(0, 60).trim() || `Task ${String(index).padStart(3, "0")}`),
    prompt:     params.prompt,
    status:     "pending",
    createdAt:  now,
    updatedAt:  now,
    agentTaskId: params.agentTaskId,
  };

  _tasks.push(task);
  write().catch(() => {});
  return task;
}

/**
 * Update the status of a board task.
 * Protected: the master session can never be transitioned.
 * Returns false if the task was not found or is the master session.
 */
export function updateBoardTaskStatus(id: string, status: BoardTaskStatus): boolean {
  if (id === "master") {
    logger.warn({ id }, "[TaskBoard] Attempted to change status of master session — rejected");
    return false;
  }
  const task = _tasks.find(t => t.id === id);
  if (!task) return false;
  task.status    = status;
  task.updatedAt = new Date().toISOString();
  write().catch(() => {});
  return true;
}

/**
 * Link a board task to an agent task ID.
 */
export function linkBoardTaskToAgent(boardTaskId: string, agentTaskId: string): boolean {
  const task = _tasks.find(t => t.id === boardTaskId);
  if (!task) return false;
  task.agentTaskId = agentTaskId;
  task.updatedAt   = new Date().toISOString();
  write().catch(() => {});
  return true;
}

/**
 * Archive a board task (master session cannot be archived).
 */
export function archiveBoardTask(id: string): boolean {
  return updateBoardTaskStatus(id, "archived");
}

/**
 * Delete a board task from the board entirely.
 * Master session cannot be deleted — returns false.
 */
export function deleteBoardTask(id: string): boolean {
  if (id === "master") {
    logger.warn({ id }, "[TaskBoard] Attempted to delete master session — rejected");
    return false;
  }
  const before = _tasks.length;
  _tasks = _tasks.filter(t => t.id !== id);
  if (_tasks.length === before) return false;
  write().catch(() => {});
  return true;
}

/**
 * Update a board task's name and persist to disk.
 * Returns false if the task is not found or is the master session.
 */
export function updateBoardTaskName(id: string, name: string): boolean {
  if (id === "master") return false;
  const task = _tasks.find(t => t.id === id);
  if (!task) return false;
  task.name      = name;
  task.updatedAt = new Date().toISOString();
  write().catch(() => {});
  return true;
}

/**
 * Format a task index as the human-facing label (e.g. 1 → "Task 001").
 */
export function formatTaskIndex(index: number): string {
  return `Task ${String(index).padStart(3, "0")}`;
}
