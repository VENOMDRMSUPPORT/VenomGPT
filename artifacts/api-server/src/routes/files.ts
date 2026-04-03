import { Router, type IRouter } from "express";
import type { Response } from "express";
import fs from "fs/promises";
import path from "path";
import {
  listDirectory,
  readFile,
  writeFile,
  deleteFile,
} from "../lib/fileTools.js";
import { SafetyError, isWorkspaceSet, getWorkspaceRoot, validateWorkspacePath } from "../lib/safety.js";

const router: IRouter = Router();

function safetyCheck(res: Response): boolean {
  if (!isWorkspaceSet()) {
    res.status(400).json({
      error: "no_workspace",
      message: "Workspace root is not configured. Set it via POST /api/workspace",
    });
    return false;
  }
  return true;
}

router.get("/files", async (req, res) => {
  if (!safetyCheck(res)) return;
  const { path: rawPath } = req.query as { path?: string };
  try {
    const entries = await listDirectory(rawPath || "");
    res.json({ entries, workspaceRoot: getWorkspaceRoot() });
  } catch (err) {
    const msg = err instanceof SafetyError ? err.message : String(err);
    res.status(400).json({ error: "file_error", message: msg });
  }
});

router.get("/files/read", async (req, res) => {
  if (!safetyCheck(res)) return;
  const { path: rawPath } = req.query as { path?: string };

  if (!rawPath) {
    res.status(400).json({ error: "missing_param", message: "path query parameter is required" });
    return;
  }

  try {
    const { content, language } = await readFile(rawPath);
    res.json({ path: rawPath, content, language });
  } catch (err) {
    if (err instanceof SafetyError) {
      res.status(400).json({ error: "safety_error", message: err.message });
    } else if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: "not_found", message: `File not found: ${rawPath}` });
    } else {
      res.status(400).json({ error: "file_error", message: String(err) });
    }
  }
});

// Raw binary download — serves file bytes with a guessed MIME type
router.get("/files/download", async (req, res) => {
  if (!safetyCheck(res)) return;
  const { path: rawPath } = req.query as { path?: string };

  if (!rawPath) {
    res.status(400).json({ error: "missing_param", message: "path query parameter is required" });
    return;
  }

  try {
    const absPath = validateWorkspacePath(rawPath);
    const buffer = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf', '.zip': 'application/zip',
      '.ts': 'text/plain', '.tsx': 'text/plain', '.js': 'text/plain',
      '.json': 'application/json', '.md': 'text/markdown', '.txt': 'text/plain',
      '.css': 'text/css', '.html': 'text/html',
    };
    const mime = mimeMap[ext] ?? 'application/octet-stream';
    const filename = path.basename(absPath);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    if (err instanceof SafetyError) {
      res.status(400).json({ error: "safety_error", message: err.message });
    } else if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: "not_found", message: `File not found: ${rawPath}` });
    } else {
      res.status(400).json({ error: "file_error", message: String(err) });
    }
  }
});

router.post("/files/write", async (req, res) => {
  if (!safetyCheck(res)) return;
  const { path: rawPath, content, encoding } = req.body as { path?: string; content?: string; encoding?: string };

  if (!rawPath || content === undefined) {
    res.status(400).json({ error: "missing_param", message: "path and content are required" });
    return;
  }

  try {
    const absPath = validateWorkspacePath(rawPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });

    if (encoding === 'dataurl' && content.startsWith('data:')) {
      // Decode a data URL to binary bytes so images are stored as real files
      const commaIdx = content.indexOf(',');
      if (commaIdx === -1) throw new Error('Malformed data URL');
      const base64Data = content.slice(commaIdx + 1);
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(absPath, buffer);
    } else {
      await fs.writeFile(absPath, content, 'utf-8');
    }
    res.json({ success: true, message: `File written: ${rawPath}` });
  } catch (err) {
    const msg = err instanceof SafetyError ? err.message : String(err);
    res.status(400).json({ error: "file_error", message: msg });
  }
});

router.delete("/files/delete", async (req, res) => {
  if (!safetyCheck(res)) return;
  const { path: rawPath } = req.query as { path?: string };

  if (!rawPath) {
    res.status(400).json({ error: "missing_param", message: "path query parameter is required" });
    return;
  }

  try {
    await deleteFile(rawPath);
    res.json({ success: true, message: `Deleted: ${rawPath}` });
  } catch (err) {
    const msg = err instanceof SafetyError ? err.message : String(err);
    res.status(400).json({ error: "file_error", message: msg });
  }
});

router.post("/files/rename", async (req, res) => {
  if (!safetyCheck(res)) return;
  const { oldPath, newPath } = req.body as { oldPath?: string; newPath?: string };

  if (!oldPath || !newPath) {
    res.status(400).json({ error: "missing_param", message: "oldPath and newPath are required" });
    return;
  }

  try {
    const absOld = validateWorkspacePath(oldPath);
    const absNew = validateWorkspacePath(newPath);
    await fs.mkdir(path.dirname(absNew), { recursive: true });
    await fs.rename(absOld, absNew);
    res.json({ success: true, message: `Renamed: ${oldPath} → ${newPath}` });
  } catch (err) {
    const msg = err instanceof SafetyError ? err.message : String(err);
    res.status(400).json({ error: "file_error", message: msg });
  }
});

router.post("/files/mkdir", async (req, res) => {
  if (!safetyCheck(res)) return;
  const { path: rawPath } = req.body as { path?: string };

  if (!rawPath) {
    res.status(400).json({ error: "missing_param", message: "path is required" });
    return;
  }

  try {
    const absPath = validateWorkspacePath(rawPath);
    await fs.mkdir(absPath, { recursive: true });
    res.json({ success: true, message: `Directory created: ${rawPath}` });
  } catch (err) {
    const msg = err instanceof SafetyError ? err.message : String(err);
    res.status(400).json({ error: "file_error", message: msg });
  }
});

export default router;
