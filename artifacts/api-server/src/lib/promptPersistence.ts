/**
 * promptPersistence.ts — Workspace-scoped prompt artifact persistence.
 *
 * Writes every user-to-agent prompt to <workspace>/.prompts/ with sequential
 * numeric indices and task/session linkage metadata.
 *
 * File naming: <index>-<agentTaskId>.json  (e.g. 001-abc123.json)
 * Index file:  .prompts/_index.json  — maps index → filename for ordered retrieval
 */

import fs from "fs/promises";
import path from "path";
import { getWorkspaceRoot, isWorkspaceSet } from "./safety.js";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromptArtifact {
  /** Sequential index across all prompts for this workspace. 1-based. */
  index:        number;
  /** The agent task ID this prompt was submitted for (may be null if captured before task start). */
  agentTaskId:  string | null;
  /** Optional board task ID linking this prompt to the board model. */
  boardTaskId?: string;
  /** ISO timestamp of when the prompt was saved. */
  savedAt:      string;
  /** The full prompt text. */
  prompt:       string;
}

interface PromptIndex {
  version:   1;
  nextIndex: number;
  entries:   Array<{ index: number; agentTaskId: string | null; filename: string; savedAt: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function promptDir(): string | null {
  if (!isWorkspaceSet()) return null;
  return path.join(getWorkspaceRoot(), ".prompts");
}

async function readIndex(dir: string): Promise<PromptIndex> {
  try {
    const raw  = await fs.readFile(path.join(dir, "_index.json"), "utf8");
    const data = JSON.parse(raw) as PromptIndex;
    if (data.version !== 1 || !Array.isArray(data.entries)) throw new Error("bad version");
    return data;
  } catch {
    return { version: 1, nextIndex: 1, entries: [] };
  }
}

async function writeIndex(dir: string, idx: PromptIndex): Promise<void> {
  await fs.writeFile(path.join(dir, "_index.json"), JSON.stringify(idx, null, 2), "utf8");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a prompt artifact to <workspace>/.prompts/.
 * Returns the saved artifact (with its assigned index), or null on failure.
 */
export async function savePrompt(params: {
  agentTaskId:  string | null;
  boardTaskId?: string;
  prompt:       string;
}): Promise<PromptArtifact | null> {
  const dir = promptDir();
  if (!dir) {
    logger.debug("[PromptPersistence] No workspace root set — skipping prompt save");
    return null;
  }

  try {
    await fs.mkdir(dir, { recursive: true });

    const idx      = await readIndex(dir);
    const index    = idx.nextIndex++;
    const savedAt  = new Date().toISOString();
    // Use agentTaskId if available; fall back to boardTaskId for filename uniqueness.
    const fileKey  = params.agentTaskId ?? params.boardTaskId ?? String(index);
    const filename = `${String(index).padStart(3, "0")}-${fileKey}.json`;

    const artifact: PromptArtifact = {
      index,
      agentTaskId:  params.agentTaskId,
      boardTaskId:  params.boardTaskId,
      savedAt,
      prompt:       params.prompt,
    };

    await fs.writeFile(path.join(dir, filename), JSON.stringify(artifact, null, 2), "utf8");

    idx.entries.push({ index, agentTaskId: params.agentTaskId, filename, savedAt });
    await writeIndex(dir, idx);

    logger.debug({ index, agentTaskId: params.agentTaskId, filename }, "[PromptPersistence] Prompt saved");
    return artifact;
  } catch (err) {
    logger.warn({ err }, "[PromptPersistence] Failed to save prompt artifact");
    return null;
  }
}

/**
 * After a task has started, back-fill the agentTaskId on a prompt artifact that
 * was saved before the task was created (agentTaskId was null at that point).
 * Also updates the index entry so future retrieval by agentTaskId works.
 * Resolves by boardTaskId match across all entries.
 */
export async function linkPromptToAgentTask(
  boardTaskId: string,
  agentTaskId: string
): Promise<boolean> {
  const dir = promptDir();
  if (!dir) return false;

  try {
    const idx = await readIndex(dir);
    let changed = false;

    for (const entry of idx.entries) {
      if (entry.agentTaskId !== null) continue;
      // Read the artifact to check boardTaskId linkage.
      try {
        const filePath = path.join(dir, entry.filename);
        const raw      = await fs.readFile(filePath, "utf8");
        const artifact = JSON.parse(raw) as PromptArtifact;
        if (artifact.boardTaskId !== boardTaskId) continue;

        // Patch artifact on disk.
        artifact.agentTaskId = agentTaskId;
        await fs.writeFile(filePath, JSON.stringify(artifact, null, 2), "utf8");

        // Patch index entry.
        entry.agentTaskId = agentTaskId;
        changed = true;
      } catch { /* skip unreadable files */ }
    }

    if (changed) await writeIndex(dir, idx);
    return changed;
  } catch {
    return false;
  }
}

/**
 * Retrieve all prompts for a given agent task, ordered by index ascending.
 * Also returns any prompts saved with agentTaskId=null that share the same
 * boardTaskId (pre-task prompt capture).
 */
export async function getPromptsForTask(
  agentTaskId: string | null | undefined,
  boardTaskId?: string
): Promise<PromptArtifact[]> {
  const dir = promptDir();
  if (!dir) return [];

  try {
    const idx     = await readIndex(dir);
    const seen    = new Set<string>();
    const matched: typeof idx.entries = [];

    for (const entry of idx.entries) {
      if (entry.agentTaskId === agentTaskId && !seen.has(entry.filename)) {
        matched.push(entry);
        seen.add(entry.filename);
      }
    }

    // Also include pre-task prompts keyed by boardTaskId (agentTaskId still null).
    if (boardTaskId) {
      for (const entry of idx.entries) {
        if (!seen.has(entry.filename) && entry.agentTaskId === null) {
          try {
            const raw      = await fs.readFile(path.join(dir, entry.filename), "utf8");
            const artifact = JSON.parse(raw) as PromptArtifact;
            if (artifact.boardTaskId === boardTaskId) {
              matched.push(entry);
              seen.add(entry.filename);
            }
          } catch { /* skip */ }
        }
      }
    }

    matched.sort((a, b) => a.index - b.index);

    const prompts: PromptArtifact[] = [];
    for (const entry of matched) {
      try {
        const raw      = await fs.readFile(path.join(dir, entry.filename), "utf8");
        const artifact = JSON.parse(raw) as PromptArtifact;
        prompts.push(artifact);
      } catch {
        // Skip missing files
      }
    }
    return prompts;
  } catch {
    return [];
  }
}

/**
 * Retrieve all prompts for the workspace, ordered by index ascending.
 */
export async function getAllPrompts(): Promise<PromptArtifact[]> {
  const dir = promptDir();
  if (!dir) return [];

  try {
    const idx     = await readIndex(dir);
    const entries = [...idx.entries].sort((a, b) => a.index - b.index);

    const prompts: PromptArtifact[] = [];
    for (const entry of entries) {
      try {
        const raw      = await fs.readFile(path.join(dir, entry.filename), "utf8");
        const artifact = JSON.parse(raw) as PromptArtifact;
        prompts.push(artifact);
      } catch {
        // Skip
      }
    }
    return prompts;
  } catch {
    return [];
  }
}
