import { Router, type IRouter } from "express";
import {
  getWorkspaceRoot,
  isWorkspaceSet,
  setWorkspaceRoot,
  validateWorkspaceRootExists,
} from "../lib/safety.js";
import { initTaskBoard } from "../lib/taskBoardPersistence.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/workspace", (_req, res) => {
  const root = getWorkspaceRoot();
  res.json({ root, isSet: isWorkspaceSet() });
});

router.post("/workspace", (req, res) => {
  const { root } = req.body as { root?: string };

  if (!root || typeof root !== "string" || !root.trim()) {
    res.status(400).json({ error: "invalid_path", message: "root path is required" });
    return;
  }

  const trimmed = root.trim();

  if (!validateWorkspaceRootExists(trimmed)) {
    res.status(400).json({
      error: "invalid_path",
      message: `Directory does not exist or is not accessible: ${trimmed}`,
    });
    return;
  }

  setWorkspaceRoot(trimmed);
  const newRoot = getWorkspaceRoot();

  // Initialise (or re-initialise) the task board for the new workspace.
  initTaskBoard(newRoot).catch((err: unknown) => {
    logger.warn({ err }, "[workspace] Task board init failed after workspace set");
  });

  res.json({ root: newRoot, isSet: true });
});

export default router;
