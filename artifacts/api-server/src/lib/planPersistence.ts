/**
 * planPersistence.ts — Workspace-scoped plan artifact persistence.
 *
 * Writes structured plan artifacts to <workspace>/.plan/ with sequential
 * numeric indices and task/session linkage metadata.
 *
 * File naming: <index>-<agentTaskId>.json  (e.g. 001-abc123.json)
 * Index file:  .plan/_index.json  — maps index → filename for ordered retrieval
 */

import fs from "fs/promises";
import path from "path";
import { getWorkspaceRoot, isWorkspaceSet } from "./safety.js";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlanArtifact {
  /** Sequential index across all plans for this workspace. 1-based. */
  index:        number;
  /** The agent task ID that produced this plan. */
  agentTaskId:  string;
  /** Optional board task ID linking this plan to the board model. */
  boardTaskId?: string;
  /** ISO timestamp of when the plan was saved. */
  savedAt:      string;
  /** The structured plan content. */
  plan: {
    goal:            string;
    approach:        string;
    filesToRead:     string[];
    expectedChanges: string[];
    verification:    string;
  };
}

interface PlanIndex {
  version:   1;
  nextIndex: number;
  entries:   Array<{ index: number; agentTaskId: string; filename: string; savedAt: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function planDir(): string | null {
  if (!isWorkspaceSet()) return null;
  return path.join(getWorkspaceRoot(), ".plan");
}

async function readIndex(dir: string): Promise<PlanIndex> {
  try {
    const raw  = await fs.readFile(path.join(dir, "_index.json"), "utf8");
    const data = JSON.parse(raw) as PlanIndex;
    if (data.version !== 1 || !Array.isArray(data.entries)) throw new Error("bad version");
    return data;
  } catch {
    return { version: 1, nextIndex: 1, entries: [] };
  }
}

async function writeIndex(dir: string, idx: PlanIndex): Promise<void> {
  await fs.writeFile(path.join(dir, "_index.json"), JSON.stringify(idx, null, 2), "utf8");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a plan artifact to <workspace>/.plan/.
 * Returns the saved artifact (with its assigned index), or null on failure.
 */
export async function savePlan(params: {
  agentTaskId:  string;
  boardTaskId?: string;
  plan: PlanArtifact["plan"];
}): Promise<PlanArtifact | null> {
  const dir = planDir();
  if (!dir) {
    logger.debug("[PlanPersistence] No workspace root set — skipping plan save");
    return null;
  }

  try {
    await fs.mkdir(dir, { recursive: true });

    const idx      = await readIndex(dir);
    const index    = idx.nextIndex++;
    const savedAt  = new Date().toISOString();
    const filename = `${String(index).padStart(3, "0")}-${params.agentTaskId}.json`;

    const artifact: PlanArtifact = {
      index,
      agentTaskId:  params.agentTaskId,
      boardTaskId:  params.boardTaskId,
      savedAt,
      plan:         params.plan,
    };

    await fs.writeFile(path.join(dir, filename), JSON.stringify(artifact, null, 2), "utf8");

    idx.entries.push({ index, agentTaskId: params.agentTaskId, filename, savedAt });
    await writeIndex(dir, idx);

    logger.debug({ index, agentTaskId: params.agentTaskId, filename }, "[PlanPersistence] Plan saved");
    return artifact;
  } catch (err) {
    logger.warn({ err }, "[PlanPersistence] Failed to save plan artifact");
    return null;
  }
}

/**
 * Retrieve all plans for a given agent task, ordered by index ascending.
 */
export async function getPlansForTask(agentTaskId: string): Promise<PlanArtifact[]> {
  const dir = planDir();
  if (!dir) return [];

  try {
    const idx     = await readIndex(dir);
    const entries = idx.entries
      .filter(e => e.agentTaskId === agentTaskId)
      .sort((a, b) => a.index - b.index);

    const plans: PlanArtifact[] = [];
    for (const entry of entries) {
      try {
        const raw      = await fs.readFile(path.join(dir, entry.filename), "utf8");
        const artifact = JSON.parse(raw) as PlanArtifact;
        plans.push(artifact);
      } catch {
        // File missing — skip silently
      }
    }
    return plans;
  } catch {
    return [];
  }
}

/**
 * Retrieve all plans for the workspace, ordered by index ascending.
 */
export async function getAllPlans(): Promise<PlanArtifact[]> {
  const dir = planDir();
  if (!dir) return [];

  try {
    const idx     = await readIndex(dir);
    const entries = [...idx.entries].sort((a, b) => a.index - b.index);

    const plans: PlanArtifact[] = [];
    for (const entry of entries) {
      try {
        const raw      = await fs.readFile(path.join(dir, entry.filename), "utf8");
        const artifact = JSON.parse(raw) as PlanArtifact;
        plans.push(artifact);
      } catch {
        // Skip
      }
    }
    return plans;
  } catch {
    return [];
  }
}
