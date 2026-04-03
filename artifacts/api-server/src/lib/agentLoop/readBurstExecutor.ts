/**
 * agentLoop/readBurstExecutor.ts — Semi-parallel read burst executor.
 *
 * Accepts a list of file paths from the planning phase's `filesToRead` list and
 * dispatches all reads concurrently with Promise.all, returning an ordered array
 * of results.
 *
 * Eligibility guard (enforced by the caller in agentLoop.ts):
 *   (a) profile.planningPhase === true
 *   (b) filesToRead.length > 0
 *   (c) no writes have occurred yet (state.filesRead.size === 0)
 *
 * Safety properties:
 *   - Individual file errors are isolated; one failed read does not abort the burst.
 *   - Paths are bounded to the profile's maxFileReads limit (excess paths are ignored).
 *   - Only pure read operations are dispatched — no shared mutable state is touched.
 */

import { readFile as readFileFromDisk } from "../fileTools.js";
import { logger } from "../logger.js";

export interface BurstReadResult {
  path:    string;
  content: string | null;
  error:   string | null;
}

/**
 * Execute a burst of concurrent file reads.
 *
 * @param paths      List of file paths to read (from ExecutionPlan.filesToRead).
 * @param maxReads   Profile cap — only the first `maxReads` paths are dispatched.
 * @param taskId     Used for logging and action record emission inside readFile.
 * @returns          Ordered array of results, one per path (in input order).
 */
export async function readBurst(
  paths:    string[],
  maxReads: number,
  taskId:   string,
): Promise<BurstReadResult[]> {
  const capped = paths.slice(0, maxReads);

  if (capped.length === 0) return [];

  logger.info(
    { taskId, count: capped.length, paths: capped },
    "[ReadBurst] Dispatching concurrent reads"
  );

  const results = await Promise.all(
    capped.map(async (path): Promise<BurstReadResult> => {
      try {
        const { content } = await readFileFromDisk(path, taskId);
        return { path, content, error: null };
      } catch (err) {
        const msg = String(err);
        logger.warn({ taskId, path, err: msg }, "[ReadBurst] Individual read failed — continuing burst");
        return { path, content: null, error: msg };
      }
    })
  );

  const succeeded = results.filter(r => r.error === null).length;
  logger.info(
    { taskId, total: capped.length, succeeded, failed: capped.length - succeeded },
    "[ReadBurst] Concurrent read burst complete"
  );

  return results;
}
