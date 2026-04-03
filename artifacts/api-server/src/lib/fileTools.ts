import fs from "fs/promises";
import path from "path";
import { validateWorkspacePath, workspaceRelativePath, getWorkspaceRoot } from "./safety.js";
import { actionStore, ActionType } from "./orchestrator/actionStore.js";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileEntry[];
}

// Re-export the authoritative ignore list from projectIndex so fileTools
// and the project intelligence layer stay in sync. Then extend it with a
// broader set for the interactive file-tree browser.
export const IGNORED_DIRS = new Set([
  // Package managers
  "node_modules",
  "vendor",
  "bower_components",
  // Build outputs
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "target",
  "__pycache__",
  // Caches
  ".cache",
  ".parcel-cache",
  ".turbo",
  ".sass-cache",
  ".gradle",
  // Test / coverage
  "coverage",
  ".nyc_output",
  ".pytest_cache",
  "htmlcov",
  // VCS
  ".git",
  ".hg",
  ".svn",
  // IDEs
  ".idea",
  ".vscode",
  // Virtual envs
  ".venv",
  "venv",
  // Temp
  "tmp",
  "temp",
  ".temp",
  ".tmp",
]);

const MAX_DEPTH = 6;
const MAX_CHILDREN = 200;

export async function listDirectory(relativePath: string = ""): Promise<FileEntry[]> {
  const absPath = relativePath
    ? validateWorkspacePath(relativePath)
    : getWorkspaceRoot();

  return buildTree(absPath, 0);
}

async function buildTree(absPath: string, depth: number): Promise<FileEntry[]> {
  if (depth >= MAX_DEPTH) return [];

  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(absPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const filtered = entries
    .filter((e) => !e.name.startsWith(".") || depth === 0)
    .filter((e) => !(e.isDirectory() && IGNORED_DIRS.has(e.name)))
    .slice(0, MAX_CHILDREN);

  const sorted = filtered.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const result: FileEntry[] = [];
  for (const entry of sorted) {
    const fullPath = path.join(absPath, entry.name);
    const relPath = workspaceRelativePath(fullPath);

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, depth + 1);
      result.push({ name: entry.name, path: relPath, type: "directory", children });
    } else if (entry.isFile()) {
      result.push({ name: entry.name, path: relPath, type: "file" });
    }
  }

  return result;
}

/**
 * Read a file from the live workspace.
 *
 * @param relativePath  Workspace-relative path.
 * @param taskId        Optional task run id for ActionStore instrumentation.
 *                      When provided, a READ_FILE action record is emitted
 *                      with byteCount and fromStaging=false.
 * @param laneId        Optional parallel lane id. When provided, the action
 *                      record is tagged immediately at creation time (not post-hoc)
 *                      for deterministic lane-level observability.
 */
export async function readFile(
  relativePath: string,
  taskId?: string,
  laneId?: string,
  signal?: AbortSignal,
): Promise<{ content: string; language: string }> {
  const absPath = validateWorkspacePath(relativePath);

  // ── Action-level instrumentation ─────────────────────────────────────────
  let actionId: string | undefined;
  if (taskId) {
    const record = actionStore.createAction(taskId, ActionType.READ_FILE, {
      type:        ActionType.READ_FILE,
      filePath:    relativePath,
      fromStaging: false,
    });
    // Stamp laneId immediately at creation — deterministic, not post-hoc matching
    if (laneId) {
      actionStore.setLaneId(record.id, laneId);
    }
    actionStore.startAction(record.id);
    actionId = record.id;
  }

  // Check abort before starting I/O
  if (signal?.aborted) {
    if (actionId) actionStore.failAction(actionId, "aborted");
    throw new DOMException("Read aborted", "AbortError");
  }

  try {
    const content = String(await fs.readFile(absPath, { encoding: "utf-8", signal } as Parameters<typeof fs.readFile>[1] & { signal?: AbortSignal }));
    const language = detectLanguage(relativePath);

    if (actionId) {
      const byteCount = Buffer.byteLength(content, "utf8");
      // Populate byteCount before completing so the record carries it atomically
      const actions = actionStore.getActions(taskId!);
      const rec = actions.find(a => a.id === actionId);
      if (rec) {
        (rec.meta as { byteCount?: number }).byteCount = byteCount;
      }
      actionStore.completeAction(actionId, {
        success: true,
        summary: `Read ${byteCount} bytes from ${relativePath} (live workspace)`,
      });
    }

    return { content, language };
  } catch (err) {
    if (actionId) {
      actionStore.failAction(actionId, String(err));
    }
    throw err;
  }
}

export async function writeFile(relativePath: string, content: string): Promise<void> {
  const absPath = validateWorkspacePath(relativePath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, "utf-8");
}

export async function deleteFile(relativePath: string): Promise<void> {
  const absPath = validateWorkspacePath(relativePath);
  const stat = await fs.stat(absPath);
  if (stat.isDirectory()) {
    await fs.rm(absPath, { recursive: true, force: true });
  } else {
    await fs.unlink(absPath);
  }
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".md": "markdown",
    ".sh": "shell",
    ".bash": "shell",
    ".sql": "sql",
    ".xml": "xml",
    ".vue": "vue",
    ".svelte": "svelte",
  };
  return map[ext] || "plaintext";
}
