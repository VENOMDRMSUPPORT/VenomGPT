/**
 * routes/taskBoard.ts — VenomGPT Tasks Board REST API.
 *
 * GET  /api/board              → { master, tasks: BoardTask[] }  (all tasks)
 * GET  /api/board/active       → { master, tasks: BoardTask[] }  (non-done/archived)
 * POST /api/board/tasks        → create a board task  { name?, prompt, agentTaskId? }
 * PATCH /api/board/tasks/:id   → update status or name  { status?, name? }
 * DELETE /api/board/tasks/:id  → delete a board task (master protected)
 * GET  /api/board/plans        → all plan artifacts for this workspace
 * GET  /api/board/prompts      → all prompt artifacts for this workspace
 */

import { Router } from "express";
import {
  getMasterSession,
  listAllTasks,
  listActiveTasks,
  createBoardTask,
  updateBoardTaskStatus,
  updateBoardTaskName,
  deleteBoardTask,
  archiveBoardTask,
  getTask,
  type BoardTaskStatus,
  initTaskBoard,
} from "../lib/taskBoardPersistence.js";
import { getAllPlans } from "../lib/planPersistence.js";
import { getAllPrompts } from "../lib/promptPersistence.js";
import { logger } from "../lib/logger.js";
import { getWorkspaceRoot, isWorkspaceSet } from "../lib/safety.js";

const router = Router();

async function ensureBoardReady() {
  let master = getMasterSession();
  if (master) return { ok: true as const, master };

  if (!isWorkspaceSet()) {
    return { ok: false as const, status: 503, error: "Task board not initialised — set a workspace first" };
  }

  try {
    await initTaskBoard(getWorkspaceRoot());
  } catch (err) {
    logger.warn({ err }, "[BoardAPI] Failed to initialize task board");
    return { ok: false as const, status: 503, error: "Task board initialisation failed" };
  }

  master = getMasterSession();
  if (!master) {
    return { ok: false as const, status: 503, error: "Task board initialisation failed" };
  }

  return { ok: true as const, master };
}

// GET /api/board — all tasks
router.get("/board", async (_req, res) => {
  if (!isWorkspaceSet()) {
    // Workspace is not configured yet (fresh boot / first-run).
    // Return an empty board with 200 so the UI can poll without generating
    // repeated server error logs.
    res.json({ master: null, tasks: [] });
    return;
  }

  const ready = await ensureBoardReady();
  if (!ready.ok) {
    res.status(ready.status).json({ error: ready.error });
    return;
  }
  res.json({ master: ready.master, tasks: listAllTasks() });
});

// GET /api/board/active — sidebar tasks only
router.get("/board/active", async (_req, res) => {
  if (!isWorkspaceSet()) {
    res.json({ master: null, tasks: [] });
    return;
  }

  const ready = await ensureBoardReady();
  if (!ready.ok) {
    res.status(ready.status).json({ error: ready.error });
    return;
  }
  res.json({ master: ready.master, tasks: listActiveTasks() });
});

// POST /api/board/tasks — create a new board task
router.post("/board/tasks", async (req, res) => {
  const ready = await ensureBoardReady();
  if (!ready.ok) {
    res.status(ready.status).json({ error: ready.error });
    return;
  }

  const { name, prompt, agentTaskId } = req.body as {
    name?: string;
    prompt?: string;
    agentTaskId?: string;
  };

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const task = createBoardTask({ name: name?.trim(), prompt: prompt.trim(), agentTaskId });
  logger.info({ taskId: task.id, index: task.index }, "[BoardAPI] Board task created");
  res.status(201).json({ task });
});

// PATCH /api/board/tasks/:id — update status or name
router.patch("/board/tasks/:id", (req, res) => {
  const { id } = req.params as { id: string };
  const { status, name } = req.body as { status?: BoardTaskStatus; name?: string };

  if (id === "master") {
    res.status(403).json({ error: "The master session cannot be modified via this endpoint" });
    return;
  }

  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  let changed = false;
  if (status) {
    const ok = updateBoardTaskStatus(id, status);
    if (!ok) {
      res.status(400).json({ error: "Status update failed" });
      return;
    }
    changed = true;
  }

  if (name && typeof name === "string" && name.trim()) {
    const ok = updateBoardTaskName(id, name.trim());
    if (!ok) {
      res.status(400).json({ error: "Name update failed" });
      return;
    }
    changed = true;
  }

  if (!changed) {
    res.status(400).json({ error: "No valid fields to update (status or name required)" });
    return;
  }

  res.json({ task: getTask(id) });
});

// DELETE /api/board/tasks/:id — delete a board task
router.delete("/board/tasks/:id", (req, res) => {
  const { id } = req.params as { id: string };

  if (id === "master") {
    res.status(403).json({ error: "The master session cannot be deleted" });
    return;
  }

  const ok = deleteBoardTask(id);
  if (!ok) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  logger.info({ taskId: id }, "[BoardAPI] Board task deleted");
  res.json({ deleted: true });
});

// POST /api/board/tasks/:id/archive — archive a board task
router.post("/board/tasks/:id/archive", (req, res) => {
  const { id } = req.params as { id: string };

  if (id === "master") {
    res.status(403).json({ error: "The master session cannot be archived" });
    return;
  }

  const ok = archiveBoardTask(id);
  if (!ok) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json({ archived: true, task: getTask(id) });
});

// GET /api/board/plans — all plan artifacts for this workspace
router.get("/board/plans", async (_req, res) => {
  try {
    const plans = await getAllPlans();
    res.json({ plans });
  } catch (err) {
    logger.warn({ err }, "[BoardAPI] Failed to list plans");
    res.status(500).json({ error: "Failed to list plans" });
  }
});

// GET /api/board/prompts — all prompt artifacts for this workspace
router.get("/board/prompts", async (_req, res) => {
  try {
    const prompts = await getAllPrompts();
    res.json({ prompts });
  } catch (err) {
    logger.warn({ err }, "[BoardAPI] Failed to list prompts");
    res.status(500).json({ error: "Failed to list prompts" });
  }
});

// GET /api/board/tasks/:id/plans — plan artifacts for a specific board task (by agentTaskId)
router.get("/board/tasks/:id/plans", async (req, res) => {
  const { id } = req.params as { id: string };
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!task.agentTaskId) {
    res.json({ plans: [] });
    return;
  }
  try {
    const { getPlansForTask } = await import("../lib/planPersistence.js");
    const plans = await getPlansForTask(task.agentTaskId);
    res.json({ plans });
  } catch (err) {
    logger.warn({ err }, "[BoardAPI] Failed to list plans for task");
    res.status(500).json({ error: "Failed to list plans for task" });
  }
});

// GET /api/board/tasks/:id/prompts — prompt artifacts for a specific board task (by agentTaskId)
router.get("/board/tasks/:id/prompts", async (req, res) => {
  const { id } = req.params as { id: string };
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  try {
    const { getPromptsForTask } = await import("../lib/promptPersistence.js");
    // Pass boardTaskId as fallback so pre-task prompts (agentTaskId: null) are included.
    const prompts = await getPromptsForTask(task.agentTaskId ?? undefined, task.id);
    res.json({ prompts });
  } catch (err) {
    logger.warn({ err }, "[BoardAPI] Failed to list prompts for task");
    res.status(500).json({ error: "Failed to list prompts for task" });
  }
});

export default router;
