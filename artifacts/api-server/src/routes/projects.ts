import { Router, type IRouter } from "express";
import fs from "fs";
import path from "path";
import { setWorkspaceRoot, getWorkspaceRoot } from "../lib/safety.js";
import { logger } from "../lib/logger.js";
import { initTaskBoard } from "../lib/taskBoardPersistence.js";

const router: IRouter = Router();

/**
 * Find the monorepo root by walking up from the given directory until we find
 * a directory containing `pnpm-workspace.yaml` (the monorepo marker file).
 * Falls back to the given start directory if no marker is found.
 */
function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);
  const maxDepth = 10;
  for (let i = 0; i < maxDepth; i++) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }
  return startDir; // fallback
}

function getProjectsRoot(): string {
  if (process.env["PROJECTS_ROOT"]) {
    return process.env["PROJECTS_ROOT"];
  }
  // Walk up from cwd to find the monorepo root, then use <repo-root>/projects.
  // process.cwd() is reliable in both dev (tsx) and production (node dist/index.mjs)
  // as both are started from the artifact directory or the repo root.
  const repoRoot = findRepoRoot(process.cwd());
  return path.join(repoRoot, "projects");
}

function ensureProjectsRoot(): string {
  const root = getProjectsRoot();
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    logger.info({ root }, "Created projects directory");
  }
  return root;
}

interface ProjectManifest {
  name: string;
  description?: string;
  createdAt: string;
}

function readManifest(projectPath: string): ProjectManifest | null {
  const manifestPath = path.join(projectPath, "venomgpt.json");
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as ProjectManifest;
  } catch {
    return null;
  }
}

function isValidProjectName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 100 &&
    /^[a-zA-Z0-9][a-zA-Z0-9_\-.]*$/.test(name) &&
    !name.includes("..") &&
    !path.isAbsolute(name)
  );
}

router.get("/projects", (_req, res) => {
  try {
    const projectsRoot = ensureProjectsRoot();
    const entries = fs.readdirSync(projectsRoot, { withFileTypes: true });

    const projects = entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const projectPath = path.join(projectsRoot, e.name);
        const manifest = readManifest(projectPath);
        let stat: fs.Stats | null = null;
        try {
          stat = fs.statSync(projectPath);
        } catch {
          // ignore
        }
        return {
          name: e.name,
          description: manifest?.description ?? undefined,
          path: projectPath,
          createdAt: manifest?.createdAt ?? stat?.birthtime?.toISOString() ?? stat?.mtime?.toISOString() ?? undefined,
        };
      })
      .sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return a.name.localeCompare(b.name);
      });

    res.json({ projects, projectsRoot });
  } catch (err) {
    logger.error({ err }, "Failed to list projects");
    res.status(500).json({ error: "internal_error", message: "Failed to list projects" });
  }
});

router.post("/projects", (req, res) => {
  const { name, description } = req.body as { name?: string; description?: string };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "invalid_name", message: "Project name is required" });
    return;
  }

  const trimmedName = name.trim();

  if (!isValidProjectName(trimmedName)) {
    res.status(400).json({
      error: "invalid_name",
      message:
        "Project name must start with a letter or number and contain only letters, numbers, hyphens, underscores, or dots (no spaces). Maximum 100 characters.",
    });
    return;
  }

  try {
    const projectsRoot = ensureProjectsRoot();
    const projectPath = path.join(projectsRoot, trimmedName);

    if (fs.existsSync(projectPath)) {
      res.status(409).json({
        error: "already_exists",
        message: `A project named "${trimmedName}" already exists`,
      });
      return;
    }

    fs.mkdirSync(projectPath, { recursive: true });

    const manifest: ProjectManifest = {
      name: trimmedName,
      description: description?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(projectPath, "venomgpt.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf-8"
    );

    logger.info({ name: trimmedName, projectPath }, "Project created");

    res.status(201).json({
      name: trimmedName,
      description: manifest.description,
      path: projectPath,
      createdAt: manifest.createdAt,
    });
  } catch (err) {
    logger.error({ err }, "Failed to create project");
    res.status(500).json({ error: "internal_error", message: "Failed to create project" });
  }
});

router.delete("/projects/:name", (req, res) => {
  const { name } = req.params;

  if (!name || !isValidProjectName(name)) {
    res.status(400).json({ error: "invalid_name", message: "Invalid project name" });
    return;
  }

  try {
    const projectsRoot = ensureProjectsRoot();
    const projectPath = path.join(projectsRoot, name);

    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      res.status(404).json({ error: "not_found", message: `Project "${name}" not found` });
      return;
    }

    // Prevent deleting the currently active workspace
    const currentRoot = getWorkspaceRoot();
    if (currentRoot && path.resolve(currentRoot) === path.resolve(projectPath)) {
      res.status(409).json({ error: "active_project", message: "Cannot delete the currently active project" });
      return;
    }

    fs.rmSync(projectPath, { recursive: true, force: true });
    logger.info({ name, projectPath }, "Project deleted");
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete project");
    res.status(500).json({ error: "internal_error", message: "Failed to delete project" });
  }
});

router.patch("/projects/:name", (req, res) => {
  const { name } = req.params;
  const { description } = req.body as { description?: string };

  if (!name || !isValidProjectName(name)) {
    res.status(400).json({ error: "invalid_name", message: "Invalid project name" });
    return;
  }

  try {
    const projectsRoot = ensureProjectsRoot();
    const projectPath = path.join(projectsRoot, name);

    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      res.status(404).json({ error: "not_found", message: `Project "${name}" not found` });
      return;
    }

    const manifestPath = path.join(projectPath, "venomgpt.json");
    let manifest: ProjectManifest = { name, createdAt: new Date().toISOString() };
    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      manifest = JSON.parse(raw) as ProjectManifest;
    } catch {
      // If manifest doesn't exist, start fresh
    }

    if (description !== undefined) {
      manifest.description = description?.trim() || undefined;
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
    logger.info({ name }, "Project updated");

    let stat: fs.Stats | null = null;
    try { stat = fs.statSync(projectPath); } catch { /* ignore */ }
    res.json({
      name,
      description: manifest.description,
      path: projectPath,
      createdAt: manifest.createdAt ?? stat?.birthtime?.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Failed to update project");
    res.status(500).json({ error: "internal_error", message: "Failed to update project" });
  }
});

router.post("/projects/:name/select", (req, res) => {
  const { name } = req.params;

  if (!name || !isValidProjectName(name)) {
    res.status(400).json({ error: "invalid_name", message: "Invalid project name" });
    return;
  }

  try {
    const projectsRoot = ensureProjectsRoot();
    const projectPath = path.join(projectsRoot, name);

    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      res.status(404).json({
        error: "not_found",
        message: `Project "${name}" not found`,
      });
      return;
    }

    setWorkspaceRoot(projectPath);
    const newRoot = getWorkspaceRoot();

    logger.info({ name, root: newRoot }, "Project selected as active workspace");

    // Initialise (or re-initialise) the task board for this workspace.
    initTaskBoard(newRoot).catch((err: unknown) => {
      logger.warn({ err }, "[projects] Task board init failed after project select");
    });

    res.json({ root: newRoot, isSet: true });
  } catch (err) {
    logger.error({ err }, "Failed to select project");
    res.status(500).json({ error: "internal_error", message: "Failed to select project" });
  }
});

export default router;
