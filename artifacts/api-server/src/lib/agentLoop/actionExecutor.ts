/**
 * agentLoop/actionExecutor.ts — Agent action execution.
 *
 * Extracted from agentLoop.ts — no behavior changes.
 *
 * Contains:
 *   - executeAction()         — dispatches agent JSON actions to their handlers
 *   - formatDirectoryTree()   — formats listDirectory() output for the agent
 *   - pruneMessages()         — trims the message history to fit the context window
 *
 * Staging guarantee: write_file calls writeStaged() / readStaged() — the live
 * workspace is NEVER touched during agent execution. AbortSignal threading and
 * terminal streaming (outputBuffer, flushTimer, scheduleFlush) are preserved exactly.
 *
 * Action-level instrumentation: run_command emits EXEC_COMMAND ActionRecords to
 * the ActionStore (orchestrator/actionStore.ts). read_file instrumentation is
 * delegated to the underlying fileTools.readFile() and stagingStore.readStaged()
 * call sites, which each emit READ_FILE records directly. Stage behavior is
 * fully preserved and unaffected.
 */

import { listDirectory, readFile } from "../fileTools.js";
import { runCommand } from "../terminal.js";
import { getSettings } from "../settingsStore.js";
import { logger } from "../logger.js";
import { broadcastTerminalOutput } from "../wsServer.js";
import { addEvent } from "../sessionManager.js";
import { broadcastAgentEvent } from "../wsServer.js";
import { writeStaged, readStaged } from "../orchestrator/stagingStore.js";
import { actionStore, ActionType } from "../orchestrator/actionStore.js";
import { classifyCommand } from "../orchestrator/sideEffectClassifier.js";
import { getWorkspaceRoot, isWorkspaceSet } from "../safety.js";
import type { Message } from "../modelAdapter.js";

// ─── Re-exported constants ────────────────────────────────────────────────────

export const MAX_CONTENT_CHARS             = 80_000;
export const MAX_CONSECUTIVE_PARSE_FAILURES = 3;
export const MAX_COMMAND_TIMEOUT_S          = 300;
/**
 * Inline write-content threshold.  When the agent writes a file whose content
 * exceeds this size, the response JSON is large enough that truncation by the
 * model's token budget becomes a real risk.  The write still proceeds via the
 * staging store, but we emit a visible "warning" status event so the operator
 * can see that a very large write occurred and manually verify completeness.
 */
export const SAFE_WRITE_THRESHOLD_BYTES    = 48 * 1024; // 48 KB

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  output: string;
  /**
   * The id of the ActionRecord created during execution, if any.
   * Populated for EXEC_COMMAND, READ_FILE (live), READ_FILE (staged), and WRITE_FILE actions.
   * Null for think, list_dir, and actions that create no record.
   * Used by agentLoop to stamp dependencyClass onto the record without heuristics.
   */
  actionRecordId: string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function emit(taskId: string, type: Parameters<typeof addEvent>[1], message: string, data?: Record<string, unknown>): void {
  const event = addEvent(taskId, type, message, data);
  broadcastAgentEvent(taskId, event);
}

// ─── Message pruning ──────────────────────────────────────────────────────────

export function pruneMessages(messages: Message[]): Message[] {
  const total = messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 500), 0);
  if (total <= MAX_CONTENT_CHARS) return messages;

  const system = messages[0];
  const rest   = messages.slice(1);
  const keepCount = 8;
  const kept = rest.slice(-keepCount);

  logger.warn({ before: rest.length, after: kept.length }, "Pruned message history to fit context window");
  return [system, ...kept];
}

// ─── Directory tree formatting ────────────────────────────────────────────────

export function formatDirectoryTree(entries: Awaited<ReturnType<typeof listDirectory>>, indent = ""): string {
  return entries
    .map((e) => {
      if (e.type === "directory") {
        const children = e.children ? formatDirectoryTree(e.children, indent + "  ") : "";
        return `${indent}${e.name}/\n${children}`;
      }
      return `${indent}${e.name}`;
    })
    .join("\n");
}

// ─── Action executor ──────────────────────────────────────────────────────────

export async function executeAction(
  action:  Record<string, unknown>,
  taskId:  string,
  signal?: AbortSignal,
  wsRoot?: string,
): Promise<ActionResult> {
  const actionType = String(action["action"] ?? "");

  switch (actionType) {
    case "think": {
      const thought = String(action["thought"] ?? "");
      logger.debug({ taskId, actionType: "think" }, `Think: ${thought.slice(0, 120)}`);
      // Respect the showThinkEvents operator setting — suppress thought events when off.
      // The think action still counts as a step and the model still reasons; only the
      // event emission is suppressed so the output panel stays cleaner.
      if (getSettings().showThinkEvents) {
        emit(taskId, "thought", thought);
      }
      return { success: true, output: "Thought noted.", actionRecordId: null };
    }

    case "list_dir": {
      const relPath = String(action["path"] ?? "");
      logger.debug({ taskId, actionType: "list_dir", path: relPath }, "Listing directory");
      try {
        const entries = await listDirectory(relPath);
        const tree = formatDirectoryTree(entries);
        return { success: true, output: `Directory listing:\n${tree || "(empty)"}`, actionRecordId: null };
      } catch (err) {
        logger.warn({ taskId, path: relPath, err }, "list_dir failed");
        return { success: false, output: `Error listing directory: ${String(err)}`, actionRecordId: null };
      }
    }

    case "read_file": {
      const filePath = String(action["path"] ?? "");
      logger.debug({ taskId, actionType: "read_file", path: filePath }, "Reading file");
      emit(taskId, "file_read", `Reading: ${filePath}`, { path: filePath });
      // Snapshot record count before the call so we can identify new records created inside
      const priorRecordCount = actionStore.getActions(taskId).length;
      try {
        // Staged read: check the staging layer first so the agent sees its own
        // in-progress edits. Falls through to the live workspace if not staged.
        // Both readStaged() and readFile() emit their own READ_FILE action records
        // directly, so no additional instrumentation is needed here.
        const stagedContent = await readStaged(taskId, filePath);
        let content: string;
        let fromStaging = false;
        if (stagedContent !== null) {
          content = stagedContent;
          fromStaging = true;
          logger.debug({ taskId, filePath }, "[StagingStore] read_file served from staging layer");
        } else {
          const result = await readFile(filePath, taskId);
          content = result.content;
        }
        const MAX_CHARS = 12_000;
        const preview = content.length > MAX_CHARS
          ? content.slice(0, MAX_CHARS) + `\n...[truncated — file is ${content.length} chars total]`
          : content;
        const stagingNote = fromStaging ? " [staged — live workspace unchanged]" : "";
        // Find the newly created action record id (first new record after our snapshot)
        const afterRecords = actionStore.getActions(taskId);
        const newRecord = afterRecords[priorRecordCount] ?? null;
        return {
          success: true,
          output: `File contents of ${filePath}${stagingNote}:\n\`\`\`\n${preview}\n\`\`\``,
          actionRecordId: newRecord?.id ?? null,
        };
      } catch (err) {
        logger.warn({ taskId, path: filePath, err }, "read_file failed");
        const afterRecords = actionStore.getActions(taskId);
        const newRecord = afterRecords[priorRecordCount] ?? null;
        return { success: false, output: `Error reading file: ${String(err)}`, actionRecordId: newRecord?.id ?? null };
      }
    }

    case "write_file": {
      const filePath = String(action["path"] ?? "");
      const content  = String(action["content"] ?? "");
      logger.debug({ taskId, actionType: "write_file", path: filePath, bytes: content.length }, "Staging file");
      emit(taskId, "status", `Writing: ${filePath}`);
      // Warn when the write payload is large enough that model token-budget
      // truncation may have silently cut the content.  The write still proceeds;
      // this is purely a visibility signal for the operator.
      if (content.length > SAFE_WRITE_THRESHOLD_BYTES) {
        const kb = Math.round(content.length / 1024);
        emit(taskId, "status",
          `Large write: ${filePath} (${kb} KB) — verify content is complete`,
          { eventClass: "warning", largeWrite: true, bytes: content.length, thresholdBytes: SAFE_WRITE_THRESHOLD_BYTES },
        );
      }
      const priorRecordCount = actionStore.getActions(taskId).length;
      try {
        // Staging write: redirect to staging directory — live workspace is NOT touched.
        // This is the central isolation guarantee of the staging layer.
        // writeStaged() emits WRITE_FILE action records directly.
        await writeStaged(taskId, filePath, content);
        const afterRecords = actionStore.getActions(taskId);
        const newRecord = afterRecords[priorRecordCount] ?? null;
        return {
          success: true,
          output: `File staged: ${filePath} (${content.length} chars) — live workspace unchanged until applied. Now verify this change is correct.`,
          actionRecordId: newRecord?.id ?? null,
        };
      } catch (err) {
        logger.warn({ taskId, path: filePath, err }, "write_file (staging) failed");
        const afterRecords = actionStore.getActions(taskId);
        const newRecord = afterRecords[priorRecordCount] ?? null;
        return { success: false, output: `Error staging file: ${String(err)}`, actionRecordId: newRecord?.id ?? null };
      }
    }

    case "run_command": {
      const command           = String(action["command"] ?? "");
      const requestedTimeoutS = Number(action["timeout"]) || getSettings().commandTimeoutSecs;
      const timeoutMs         = Math.min(Math.max(requestedTimeoutS, 5), MAX_COMMAND_TIMEOUT_S) * 1000;

      logger.info({ taskId, actionType: "run_command", command, timeoutS: timeoutMs / 1000 }, "Running command");
      emit(taskId, "command", `Running: ${command}`, { command, timeoutS: timeoutMs / 1000 });

      const workingDir = isWorkspaceSet() ? getWorkspaceRoot() : process.cwd();

      // Classify the command upfront so the metadata is available from the start
      const classification = classifyCommand(command);

      // ── Action-level instrumentation ────────────────────────────────────
      const cmdRecord = actionStore.createAction(taskId, ActionType.EXEC_COMMAND, {
        type:            ActionType.EXEC_COMMAND,
        command,
        workingDir,
        sideEffectClass: classification.sideEffectClass,
      });
      actionStore.startAction(cmdRecord.id);

      let outputBuffer = "";
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flushOutput = () => {
        if (outputBuffer) {
          const chunk = outputBuffer;
          outputBuffer = "";
          broadcastTerminalOutput(chunk);
        }
      };

      const scheduleFlush = () => {
        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null;
            flushOutput();
          }, 150);
        }
      };

      try {
        const result = await runCommand(
          command,
          (data) => { outputBuffer += data; scheduleFlush(); },
          timeoutMs,
          signal
        );

        if (flushTimer) clearTimeout(flushTimer);
        flushOutput();

        logger.info({ taskId, command, exitCode: result.exitCode }, "Command finished");

        const stdoutPreview = result.stdout.slice(0, 4_000);
        const stderrPreview = result.stderr.slice(0, 2_000);
        const output = [
          `Exit code: ${result.exitCode}`,
          result.stdout ? `stdout:\n${stdoutPreview}${result.stdout.length > 4_000 ? "\n...[truncated]" : ""}` : "",
          result.stderr ? `stderr:\n${stderrPreview}${result.stderr.length > 2_000 ? "\n...[truncated]" : ""}` : "",
        ].filter(Boolean).join("\n");

        const exitLabel = result.exitCode === 0 ? "✓" : `✗ exit ${result.exitCode}`;
        emit(taskId, "command_output", `${exitLabel}: ${command.slice(0, 80)}`);

        const succeeded = result.exitCode === 0;
        actionStore.completeAction(cmdRecord.id, {
          success:  succeeded,
          exitCode: result.exitCode,
          summary:  `${classification.sideEffectClass} exit ${result.exitCode}: ${command.slice(0, 80)}`,
        });

        return { success: succeeded, output, actionRecordId: cmdRecord.id };
      } catch (err) {
        if (flushTimer) clearTimeout(flushTimer);
        flushOutput();
        logger.warn({ taskId, command, err }, "Command threw an error");
        actionStore.failAction(cmdRecord.id, String(err));
        return { success: false, output: `Command error: ${String(err)}`, actionRecordId: cmdRecord.id };
      }
    }

    case "done": {
      return { success: true, output: String(action["summary"] ?? "Task complete."), actionRecordId: null };
    }

    default: {
      return {
        success: false,
        output: `Unknown action: "${actionType}". Valid: think, list_dir, read_file, write_file, run_command, done.`,
        actionRecordId: null,
      };
    }
  }
}
