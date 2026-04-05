/**
 * applyDiff.ts — Apply a unified diff patch to an original string.
 *
 * Implements the standard unified diff format as produced by diffEngine.ts.
 * Handles context lines, additions, removals, and multiple hunks.
 */

/**
 * Applies a unified diff patch to the original content and returns the modified
 * (staged) content. Used to reconstruct the agent's staged file content from
 * the diff stored in the checkpoint event.
 *
 * @param original - The live/original file content (before agent writes).
 * @param diff     - The unified diff string from CheckpointFileSummary.diff.
 * @returns The patched content reflecting the agent's staged changes.
 */
export function applyUnifiedDiff(original: string, diff: string): string {
  if (!diff) return original;

  const originalLines = original.split('\n');
  const diffLines = diff.split('\n');
  const result: string[] = [];
  let origIdx = 0;
  let i = 0;

  while (i < diffLines.length) {
    const line = diffLines[i];

    if (line.startsWith('---') || line.startsWith('+++')) {
      i++;
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      const origStart = parseInt(hunkMatch[1], 10) - 1;

      while (origIdx < origStart) {
        result.push(originalLines[origIdx]);
        origIdx++;
      }

      i++;
      while (i < diffLines.length) {
        const hunkLine = diffLines[i];
        if (hunkLine.startsWith('@') || hunkLine.startsWith('---') || hunkLine.startsWith('+++')) {
          break;
        }
        if (hunkLine.startsWith(' ')) {
          result.push(originalLines[origIdx]);
          origIdx++;
        } else if (hunkLine.startsWith('-')) {
          origIdx++;
        } else if (hunkLine.startsWith('+')) {
          result.push(hunkLine.slice(1));
        }
        i++;
      }
      continue;
    }

    i++;
  }

  while (origIdx < originalLines.length) {
    result.push(originalLines[origIdx]);
    origIdx++;
  }

  return result.join('\n');
}
