/**
 * orchestrator/actionRouter.ts — Action gating and execution discipline.
 *
 * The action router sits between "model produces an action" and "action executes".
 * It enforces per-profile caps and execution discipline without the model knowing
 * the specific limits — violations produce a forced correction message injected
 * into the conversation rather than a hard error.
 *
 * Gates checked (in order):
 *   1. Shell read bypass — blocks shell commands that effectively read file content
 *      when the file-read cap is already reached or the file is already read.
 *      Closes the loophole where `cat`, `sed -n`, `head`, `tail` bypass read_file caps.
 *   2. Write class block — hard-blocks write_file on zero-write profiles (writesAllowed: false).
 *   3. Read cap      — blocks read_file once profile.maxFileReads is reached
 *   4. Redundant read — blocks re-reading a file already in the read set
 *   5. Write cap     — blocks write_file once profile.maxFileWrites is reached
 *   6. Command cap   — blocks run_command once profile.maxCommands is reached
 *   7. Post-verify read blocked — blocks read_file after verifying phase for files not in plan
 *   8. Verification  — blocks done when unverified writes exist (if profile.requiresVerify)
 *   9. Runtime proof — blocks done when profile.requiresRuntimeProof and ledger quality
 *      is below 'runtime_confirmed'
 *
 * Verification Quality Enforcement:
 *   Trivial commands (cat, echo, ls, pwd, true, date, whoami) do not constitute
 *   substantive verification of written files. When a trivial command is the only
 *   verification performed after a write, the unverifiedWrites set is NOT cleared,
 *   and the done gate continues to require a substantive verification step.
 *   Substantive verifications: build/compile commands, test runners, grep/awk over
 *   the file content for specific expected output, or targeted read-back via read_file.
 *
 * Side-Effect Classification + Runtime Lifecycle:
 *   Every run_command is classified by sideEffectClassifier before execution.
 *   For server_start/server_stop commands, a before-snapshot is captured, the
 *   command runs, and an after-snapshot is captured. The resulting diff is recorded
 *   in the VerificationLedger as a runtime_probe entry.
 *   All commands produce a VerificationEntry in the ledger (command_success or
 *   static_read-equivalent for read_only class).
 */

import type { RunState, GateRejectionReason, SideEffectEntry } from "./types.js";
import { recordPhaseTransition } from "./types.js";
import { classifyCommand }    from "./sideEffectClassifier.js";
import { captureSnapshot, diffSnapshots, extractTargetPort } from "./runtimeLifecycle.js";

// ─── Gate result ──────────────────────────────────────────────────────────────

export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: GateRejectionReason; forcedMessage: string };

// Re-export for convenience in agentLoop
export type { GateRejectionReason };

// ─── Trivial verification detection ──────────────────────────────────────────

/**
 * Detect whether a shell command is a trivial no-op that does NOT constitute
 * substantive verification of file content.
 *
 * Strategy: split the command into segments on `&&`, `||`, `;`, and bash wrapper
 * patterns (bash -lc, bash -c, sh -c). Evaluate each segment independently.
 * A command is trivial if ALL segments are trivial. If ANY segment is non-trivial
 * (e.g., a build, test, or content check), the overall command is non-trivial.
 *
 * Commands classified as TRIVIAL (do NOT clear unverifiedWrites):
 *   - cat FILE             (reads the file you just wrote — no compile/test)
 *   - echo / printf        (no-op print — cannot detect errors)
 *   - ls                   (directory listing — does not validate content)
 *   - pwd / true / date / whoami / sleep / wc (environment info or no-ops)
 *   - cd DIR               (directory change — zero verification signal)
 *
 * Commands classified as SUBSTANTIVE (DO clear unverifiedWrites):
 *   - Build/compile: tsc, npx tsc, pnpm build, npm run build, cargo build, go build
 *   - Test runners: npm test, pnpm test, jest, vitest, pytest, mocha
 *   - Type checks: npx tsc --noEmit
 *   - Lint: eslint, ruff, pylint, rubocop
 *   - Grep for specific content: grep "expectedString" file
 *   - Node/python validation: node -e "...", python -c "..."
 *   - Any command that could FAIL due to incorrect file content
 *
 * Returns true if the command is trivial (should NOT satisfy verification).
 */

const TRIVIAL_COMMANDS = new Set([
  "echo", "printf", "cat", "ls", "pwd", "true", "false",
  "date", "whoami", "sleep", "wc", "cd",
]);

function isTrivialSegment(segment: string): boolean {
  const s = segment.trim();
  if (!s) return true;

  // Strip bash/sh wrapper: `bash -lc "..."` or `bash -c "..."` or `sh -c "..."`
  // These wrap commands in a new shell — inspect the inner command string.
  const bashWrapMatch = s.match(/^(?:bash|sh)\s+(?:-[a-z]+\s+)*["'](.+)["']\s*$/);
  if (bashWrapMatch) {
    return isTrivialSegment(bashWrapMatch[1]);
  }

  // Pipes: for `a | b | c`, the terminal command (c) is the one that determines
  // whether the pipeline produces a meaningful verification signal. Evaluate the
  // last segment of a pipe chain — if it is substantive (e.g., grep, wc -l with
  // expected count, awk), the whole pipeline is non-trivial.
  if (s.includes("|")) {
    const parts = s.split("|");
    const terminalCmd = parts[parts.length - 1] ?? "";
    return isTrivialSegment(terminalCmd);
  }

  // Extract the base command (first word), stripping env-var prefixes (KEY=val cmd)
  const stripped = s.replace(/^(?:[A-Z_][A-Z0-9_]*=[^\s]*\s+)+/, "");
  const baseCmd  = stripped.split(/\s+/)[0] ?? "";

  return TRIVIAL_COMMANDS.has(baseCmd);
}

export function detectTrivialVerification(command: string): boolean {
  // Split into segments on `&&`, `||`, `;` — each segment is evaluated independently.
  // A chain is trivial only if ALL segments are trivial.
  // If ANY segment is non-trivial, the overall command is non-trivial.
  const segments = command.split(/&&|\|\||;/);
  return segments.every(seg => isTrivialSegment(seg));
}

// ─── Shell file-read detection ────────────────────────────────────────────────

/**
 * Detect whether a shell command is effectively reading file content.
 * Returns the primary file path being read, or null if not a content-read command.
 *
 * Commands counted as file reads:
 *   - `cat FILE` (without pipe to another command)
 *   - `sed -n 'X,Yp' FILE` or `sed -n 'Xp' FILE`
 *   - `head [-n N] FILE` (without additional pipe)
 *   - `tail [-n N] FILE` (without additional pipe)
 *   - `less FILE` / `bat FILE` / `more FILE`
 *
 * Commands NOT counted (info-only, not full content reads):
 *   - `wc -l FILE` (line count only)
 *   - `cat FILE | wc -c` (piped to counter)
 *   - `grep PATTERN FILE` (search / structural scan)
 *   - `ls FILE` / `stat FILE` (metadata only)
 */
export function detectShellFileRead(command: string): string | null {
  const cmd = command.trim();

  // Reject any command with a pipe — these are typically info transforms, not content reads.
  // The one exception: we still check if the base command is a naked read before the pipe.
  // Simple rule: if there's a pipe, it's not a raw content read.
  if (cmd.includes("|")) return null;

  // `cat FILE` — exact cat of a single file, no redirection
  const catMatch = cmd.match(/^cat\s+(['"]?)([^\s'"<>|;]+)\1\s*$/);
  if (catMatch) return catMatch[2];

  // `sed -n 'X[,Y]p' FILE` — partial or full content read via sed
  // Matches: sed -n '350,770p' file.tsx  OR  sed -n '1p' file
  const sedMatch = cmd.match(/^sed\b[^|<>]*\s-n\s+['"][\d,~$]+p['"]\s+(['"]?)([^\s'"<>|;]+)\1\s*$/);
  if (sedMatch) return sedMatch[2];

  // `head [-n N] FILE` or `head FILE` — reads top N lines
  const headMatch = cmd.match(/^head\s+(?:-[nql]\s+\d+\s+)?(['"]?)([^\s'"<>|;-][^\s'"<>|;]*)\1\s*$/);
  if (headMatch) return headMatch[2];

  // `tail [-n N] FILE` or `tail FILE` — reads bottom N lines
  const tailMatch = cmd.match(/^tail\s+(?:-[nf]\s+\d+\s+)?(['"]?)([^\s'"<>|;-][^\s'"<>|;]*)\1\s*$/);
  if (tailMatch) return tailMatch[2];

  // `less FILE` / `bat FILE` / `more FILE` — pager commands (full file content)
  const pagerMatch = cmd.match(/^(?:less|bat|more)\s+(['"]?)([^\s'"<>|;]+)\1\s*$/);
  if (pagerMatch) return pagerMatch[2];

  return null;
}

// ─── Main gate function ───────────────────────────────────────────────────────

/**
 * Check whether the action should be allowed given the current run state.
 * Returns `{ allowed: true }` to proceed, or `{ allowed: false, ... }` with a
 * corrective message to inject into the conversation.
 */
export function gateAction(
  action: Record<string, unknown>,
  state:  RunState,
): GateResult {
  const actionType = String(action["action"] ?? "");

  switch (actionType) {

    // ── Shell command: check for file-read bypass before allowing execution ──
    case "run_command": {
      const command = String(action["command"] ?? "");
      const readPath = detectShellFileRead(command);

      if (readPath !== null) {
        // Normalize the path for comparison (trim slashes, quotes)
        const normalizedPath = readPath.replace(/^["']|["']$/g, "");

        // Gate A: File already read this session (redundant shell read)
        if (normalizedPath && state.filesRead.has(normalizedPath)) {
          return {
            allowed: false,
            reason:  "shell_read_redundant",
            forcedMessage:
              `ORCHESTRATOR: Shell read blocked — "${normalizedPath}" was already read this session. ` +
              `Shell commands (cat, sed, head, tail) are subject to the same file-read policy as read_file. ` +
              `You already have the content of this file in context. ` +
              `Do not re-read it via shell commands. Proceed with the next action.`,
          };
        }

        // Gate B: Read cap exceeded (shell command would exceed budget)
        if (state.filesRead.size >= state.profile.maxFileReads) {
          const readList = [...state.filesRead].join(", ");
          return {
            allowed: false,
            reason:  "shell_read_cap_exceeded",
            forcedMessage:
              `ORCHESTRATOR: Shell read blocked — file-read cap reached ` +
              `(${state.profile.maxFileReads} reads for ${state.profile.category} tasks). ` +
              `Shell commands that read file content (cat, sed -n, head, tail) count against the same cap as read_file. ` +
              `Already read: ${readList || "(none)"}. ` +
              `Do not attempt to read additional file content via shell commands. ` +
              `Work with the information you have, or call done if the task is blocked.`,
          };
        }
      }

      // Gate C: Command budget exceeded (non-read commands)
      if (state.profile.maxCommands > 0 && state.commandsRun.length >= state.profile.maxCommands) {
        return {
          allowed: false,
          reason:  "command_cap_exceeded",
          forcedMessage:
            `ORCHESTRATOR: Command blocked — command budget reached ` +
            `(${state.profile.maxCommands} commands allowed for ${state.profile.category} tasks). ` +
            `Commands run so far: ${state.commandsRun.length}. ` +
            `No additional shell commands are authorized for this task profile. ` +
            `Call done with the results you have, or report what is blocking you.`,
        };
      }

      // Gate D: Profile allows zero commands at all (maxCommands === 0, not a read)
      if (state.profile.maxCommands === 0 && readPath === null) {
        return {
          allowed: false,
          reason:  "command_cap_exceeded",
          forcedMessage:
            `ORCHESTRATOR: Command blocked — this task profile (${state.profile.category}) does not allow shell commands. ` +
            `Complete the task using read_file and write_file actions only, then call done.`,
        };
      }

      return { allowed: true };
    }

    case "read_file": {
      const filePath = String(action["path"] ?? "");

      // Gate: Anti-phase-wander — after entering verifying phase, block reads of
      // files that were not already read during the execution phase.
      // With a plan: only block files that weren't in filesToRead.
      // Without a plan: block ALL new files not already read (prevent speculative drift).
      if (state.phase === "verifying" && filePath && !state.filesRead.has(filePath)) {
        const plannedReads = state.plan?.filesToRead;
        const withinPlan   = plannedReads != null
          ? plannedReads.includes(filePath)
          : false;  // no plan → any unread file in verifying phase is out-of-scope
        if (!withinPlan) {
          return {
            allowed: false,
            reason:  "post_verify_read_blocked",
            forcedMessage:
              `ORCHESTRATOR: Read blocked — you are in the verification phase and "${filePath}" was not read during the execution phase. ` +
              `Post-write reads of new files are an anti-pattern (phase wander). ` +
              `To verify correctness, run a build or test command rather than reading source files.`,
          };
        }
      }

      // Gate 1: Redundant read — same file already inspected this session.
      // Exception: allow read-back of a file that was written this task and is
      // still in unverifiedWrites — this is a legitimate verification step.
      if (filePath && state.filesRead.has(filePath)) {
        const isReadBackVerification = state.unverifiedWrites.has(filePath);
        if (!isReadBackVerification) {
          return {
            allowed: false,
            reason:  "redundant_read",
            forcedMessage:
              `ORCHESTRATOR: You already read "${filePath}" this session. ` +
              `Do not read the same file twice — you already know its contents. ` +
              `Proceed with the next action (write_file, run_command, or done).`,
          };
        }
        // Allow read-back for verification — fall through to let it execute.
      }

      // Gate 2: Read cap reached.
      // Exception: allow read-back of a file that was written this task and is still
      // in unverifiedWrites — read-back verification must remain available even at cap.
      const isReadBackVerification = state.unverifiedWrites.has(filePath);
      if (!isReadBackVerification && state.filesRead.size >= state.profile.maxFileReads) {
        const readList = [...state.filesRead].join(", ");
        return {
          allowed: false,
          reason:  "read_cap_exceeded",
          forcedMessage:
            `ORCHESTRATOR: File read cap reached (${state.profile.maxFileReads} reads allowed for ${state.profile.category} tasks). ` +
            `Already read: ${readList || "(none)"}. ` +
            `No additional file reads are authorized. ` +
            `Write the fix based on what you have already inspected, or call done if the task is complete.`,
        };
      }

      return { allowed: true };
    }

    case "write_file": {
      // Gate 0: Hard write-class block — profiles with writesAllowed: false cannot write at all.
      if (!state.profile.writesAllowed) {
        return {
          allowed: false,
          reason:  "write_class_blocked",
          forcedMessage:
            `ORCHESTRATOR: File write hard-blocked — the "${state.profile.category}" task profile does not permit any file writes. ` +
            `This is a class-level restriction, not a cap. No writes are authorized regardless of how many files have been written. ` +
            `Complete the task by reading and responding, then call done. Do not attempt to write files.`,
        };
      }

      // Gate 0.5: Continuation step-skip enforcement — hard-blocks re-writes of files
      // that were already completed in the prior run from which this task continues.
      // This is a deterministic runtime guard that supplements the prompt-level instruction,
      // ensuring completed steps are never re-executed regardless of model behavior.
      //
      // IMPORTANT: file paths are read from WhatRemainsStep.filePath (structured metadata),
      // NOT parsed from step labels. This avoids label-format coupling and brittleness.
      if (state.continuationChain) {
        const filePath = String(action["path"] ?? "");
        if (filePath) {
          // Build the completed-files set from typed filePath fields (not label parsing)
          const completedFilePaths = new Set<string>(
            state.continuationChain.whatRemainedAtResume.completedSteps
              .map(s => s.filePath)
              .filter((p): p is string => typeof p === "string" && p.length > 0)
          );
          if (completedFilePaths.has(filePath)) {
            return {
              allowed: false,
              reason:  "continuation_step_already_completed",
              forcedMessage:
                `ORCHESTRATOR: Write blocked — "${filePath}" was already written and confirmed in the prior run ` +
                `(parent task ${state.continuationChain.parentTaskId}, checkpoint ${state.continuationChain.originCheckpointId}). ` +
                `This is a continuation run. Do NOT re-write files that were completed in the prior run. ` +
                `Focus on the remaining steps that were not yet completed. ` +
                `Call done if all remaining work is finished.`,
            };
          }
        }
      }

      // Gate 3: Write cap reached.
      if (state.filesWritten.size >= state.profile.maxFileWrites) {
        const writeList = [...state.filesWritten].join(", ");
        return {
          allowed: false,
          reason:  "write_cap_exceeded",
          forcedMessage:
            `ORCHESTRATOR: File write cap reached (${state.profile.maxFileWrites} writes allowed for ${state.profile.category} tasks). ` +
            `Already written: ${writeList || "(none)"}. ` +
            `Consolidate remaining changes into the files you have already modified, or call done.`,
        };
      }

      return { allowed: true };
    }

    case "done": {
      // Gate 4: Verification required before done.
      if (state.profile.requiresVerify && state.unverifiedWrites.size > 0) {
        const unverified = [...state.unverifiedWrites].join(", ");
        const trivialAttempted = (state.trivialVerificationsBlocked ?? 0) > 0;
        const trivialHint = trivialAttempted
          ? `Commands like cat, echo, ls, and pwd do NOT count as verification — they cannot detect errors in written files. `
          : "";
        return {
          allowed: false,
          reason:  "verification_required",
          forcedMessage:
            `ORCHESTRATOR: Substantive verification required before done. ` +
            `You wrote ${state.unverifiedWrites.size} file(s) with no SUBSTANTIVE verification since: ${unverified}. ` +
            trivialHint +
            `Run a REAL verification: build/compile (npx tsc --noEmit, pnpm build, npm test), ` +
            `lint (eslint, ruff), or a grep/node -e check that would FAIL if the file content is wrong. ` +
            `Then call done.`,
        };
      }

      // Gate 5: Runtime proof required before done (requiresRuntimeProof profiles).
      //
      // When a profile is tagged requiresRuntimeProof=true (e.g. server_check),
      // this gate unconditionally blocks done until the verification ledger reaches
      // 'runtime_confirmed' quality. Two paths satisfy this requirement:
      //
      //   Path 1 — Port diff:   Run a server lifecycle command (npm start, npm run dev,
      //                         uvicorn, etc.). The orchestrator captures before/after
      //                         TCP port snapshots; if a new port opens or closes,
      //                         runtimeDiff.hasChange=true → runtime_confirmed.
      //
      //   Path 2 — Live server: Run a server lifecycle command that explicitly
      //                         specifies the target port (e.g. --port 3000,
      //                         PORT=3000, uvicorn app:app --port 8000). The
      //                         orchestrator extracts the target port from the
      //                         command args; if that port appears in the
      //                         after-snapshot (newly opened OR unchanged —
      //                         i.e. server was already running), the probe is
      //                         attributed to that port and serverLivePostCommand=true
      //                         → runtime_confirmed. Without an extractable port
      //                         in the command, path 2 is unavailable.
      //
      // To diagnose a stuck gate: check runtimeSnapshots in the execution summary.
      // If after.openPorts is empty after the server command, the server did not
      // bind any probe-set port — fix startup errors first. If the after-snapshot
      // has open ports but the gate still fires, either: (a) the target port is
      // not in the probe set (3000–9000 range), (b) no port argument was parseable
      // from the command (add --port N explicitly), or (c) the hasChange diff also
      // did not fire (port was already open before). In case (c), specify the port
      // explicitly so path 2 can confirm it.
      if (state.profile.requiresRuntimeProof && state.verificationQuality !== "runtime_confirmed") {
        const currentQuality = state.verificationQuality;
        const hasServerCmd = state.sideEffectsObserved.some(
          e => e.classification.sideEffectClass === "server_start" ||
               e.classification.sideEffectClass === "server_stop",
        );
        const hint = hasServerCmd
          ? `A server lifecycle command was run but the runtime probe did not confirm a live server. ` +
            `Possible causes: (a) the server failed to start (check command output for errors), ` +
            `(b) the server listens on a port not in the probe set (see runtimeSnapshots for which ports were checked), ` +
            `or (c) the server takes longer than the command timeout to bind — try a short 'sleep 2' then re-probe.`
          : `No server lifecycle command has been run yet. ` +
            `Run the server (e.g. npm start, npm run dev, uvicorn app:app) — ` +
            `the orchestrator will automatically capture a port snapshot before and after.`;
        return {
          allowed: false,
          reason:  "runtime_proof_required",
          forcedMessage:
            `ORCHESTRATOR: Runtime proof required before done. ` +
            `This task profile (${state.profile.category}) requires 'runtime_confirmed' verification quality ` +
            `but current quality is '${currentQuality}'. ${hint} ` +
            `Two paths to runtime_confirmed: ` +
            `(1) Port-diff path: Run a server lifecycle command — if a new port opens or closes, ` +
            `the before/after diff automatically records confirmation. ` +
            `(2) Live-server path: Run a server lifecycle command that explicitly includes the target port ` +
            `(e.g. npm start -- --port 3000, PORT=3000 node server.js, uvicorn app:app --port 8000). ` +
            `If that specific port is open in the after-snapshot (even if it was open before), ` +
            `the probe is attributed to the command and confirms the server is live. ` +
            `Without an explicit port in the command, only path (1) is available. ` +
            `Then call done.`,
        };
      }

      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

// ─── State updater ────────────────────────────────────────────────────────────

/**
 * Update the run state after an action completes.
 * Must be called after every action (successful or not) to keep tracking correct.
 *
 * For run_command actions, this function also:
 *   - Classifies the command via SideEffectClassifier
 *   - Records the classification in state.sideEffectsObserved
 *   - Adds a VerificationEntry to the ledger (command_success or runtime_probe)
 *   - Updates state.verificationQuality from the ledger
 *
 * Runtime lifecycle (port snapshots) for server_start/server_stop commands is
 * handled asynchronously by the agentLoop BEFORE calling updateStateAfterAction,
 * because it requires async port probing. The ledger entry with the diff is
 * added by recordRuntimeSnapshot (see below).
 */
export function updateStateAfterAction(
  state:          RunState,
  action:         Record<string, unknown>,
  success:        boolean,
  taskId?:        string,
  onPhaseChange?: (state: RunState) => void,
): void {
  const actionType = String(action["action"] ?? "");

  // Update failure tracking
  state.lastActionType   = actionType;
  state.lastActionFailed = !success;

  if (!success) {
    state.consecutiveFailures++;
  } else {
    state.consecutiveFailures = 0;
  }

  // Update phase hints based on action type
  switch (actionType) {
    case "think": {
      // Extract phase from thought text to update RunPhase
      const thought = String(action["thought"] ?? "").toUpperCase();
      if (thought.includes("[REPAIRING]"))        { recordPhaseTransition(state, "repairing");   onPhaseChange?.(state); }
      else if (thought.includes("[VERIFYING]"))  { recordPhaseTransition(state, "verifying");   onPhaseChange?.(state); }
      else if (thought.includes("[WRAPPING"))    { recordPhaseTransition(state, "wrapping_up"); onPhaseChange?.(state); }
      else if (thought.includes("[EDITING]"))    { recordPhaseTransition(state, "executing");   onPhaseChange?.(state); }
      else if (thought.includes("[PLANNING]"))   { recordPhaseTransition(state, "planning");    onPhaseChange?.(state); }
      else if (thought.includes("[INSPECTING]")) { recordPhaseTransition(state, "inspecting");  onPhaseChange?.(state); }
      break;
    }

    case "read_file": {
      if (success) {
        const path = String(action["path"] ?? "");
        if (path) {
          state.filesRead.add(path);
          // Read-back verification: if the file being read was written this task
          // and is pending verification, reading it back counts as a substantive
          // verification step (the operator can see whether the content matches).
          if (state.unverifiedWrites.has(path)) {
            state.unverifiedWrites.delete(path);
            state.verificationsDone++;
            if (state.unverifiedWrites.size === 0) {
              recordPhaseTransition(state, "verifying");
              onPhaseChange?.(state);
            }
          }
          // Add a static_read entry to the ledger for any successful file read
          state.verificationLedger.addEntry(
            "static_read",
            `Read file: ${path}`,
            undefined,
            undefined,
            undefined,
            taskId,
            state.currentLaneId ?? undefined,
          );
          state.verificationQuality = state.verificationLedger.getQuality();
        }
      }
      break;
    }

    case "write_file": {
      if (success) {
        const path = String(action["path"] ?? "");
        if (path) {
          state.filesWritten.add(path);
          state.unverifiedWrites.add(path);
        }
      }
      break;
    }

    case "run_command": {
      const command = String(action["command"] ?? "");
      state.commandsRun.push(command);

      // ── Side-effect classification ──────────────────────────────────────
      const classification = classifyCommand(command);
      const sideEffectEntry: SideEffectEntry = {
        command,
        classification,
        timestamp: Date.now(),
      };
      state.sideEffectsObserved.push(sideEffectEntry);

      if (success) {
        // If this command is a shell-based file read that was ALLOWED (passed the gate),
        // track the path in filesRead so subsequent reads of the same file are blocked.
        const readPath = detectShellFileRead(command);
        if (readPath !== null) {
          const normalizedPath = readPath.replace(/^["']|["']$/g, "");
          if (normalizedPath) state.filesRead.add(normalizedPath);
        }

        // ── Verification ledger update ────────────────────────────────────
        // Add a command_success entry to the ledger for successful commands.
        // The side-effect class is forwarded so the ledger can compute quality.
        state.verificationLedger.addEntry(
          "command_success",
          command.slice(0, 120),
          classification.sideEffectClass,
          undefined,
          undefined,
          taskId,
          state.currentLaneId ?? undefined,
        );
        state.verificationQuality = state.verificationLedger.getQuality();

        // ── Verification quality enforcement ──────────────────────────────
        // Trivial commands (cat, echo, ls, pwd, true, etc.) do NOT constitute
        // substantive verification of written files. Only substantive verifications
        // (build/compile/test/lint/grep commands) clear the unverifiedWrites set.
        const hadPendingWrites = state.unverifiedWrites.size > 0;
        const isTrivial = hadPendingWrites && detectTrivialVerification(command);

        if (isTrivial) {
          // Trivial command: count it but do NOT clear unverifiedWrites.
          // The agent will be required to run a substantive verification before done.
          state.trivialVerificationsBlocked = (state.trivialVerificationsBlocked ?? 0) + 1;
        } else {
          // Substantive command: clear unverifiedWrites and enter verifying phase.
          state.unverifiedWrites.clear();
          state.verificationsDone++;
          if (hadPendingWrites) {
            recordPhaseTransition(state, "verifying");
            onPhaseChange?.(state);
          }
        }
      }
      break;
    }

    case "done": {
      recordPhaseTransition(state, "complete");
      onPhaseChange?.(state);
      break;
    }
  }
}

// ─── Runtime lifecycle helpers ────────────────────────────────────────────────

/**
 * Capture a before-snapshot for a server_start or server_stop command.
 * Called by agentLoop BEFORE executing the command.
 * Returns the snapshot (stored in state.runtimeSnapshots.before by the caller).
 */
export async function captureBeforeSnapshot(state: RunState): Promise<void> {
  try {
    state.runtimeSnapshots.before = await captureSnapshot();
  } catch {
    // Port probing is best-effort — never block execution on snapshot failure
  }
}

/**
 * Capture an after-snapshot and compute the diff, then record a runtime_probe
 * entry in the ledger. Called by agentLoop AFTER a server_start/server_stop
 * command completes (success OR timeout/failure).
 *
 * Quality advancement requires runtimeDiff.hasChange === true — meaning a port
 * must have actually opened or closed between the before- and after-snapshots.
 * This is the only path to runtime_confirmed quality, ensuring the ledger only
 * records attribution-tied evidence:
 *
 *   - A server that binds its port during the command window → hasChange=true → confirmed
 *   - A pre-existing open port from an unrelated process → unchanged, hasChange=false → not confirmed
 *   - A failed server start that binds no port → hasChange=false → not confirmed
 *   - An already-running server restarted via npm start → unchanged → not confirmed
 *
 * We always probe (even on command failure/timeout) because:
 *   - Server start commands frequently time out in runCommand while the server
 *     IS running (the port bound just before the timeout deadline fired).
 *   - If the port opened during the timeout window, the diff will catch it.
 *   - If the server genuinely failed, no port opens and hasChange remains false.
 *
 * @param state            - Current RunState (must have runtimeSnapshots.before set).
 * @param command          - The command that was run (for ledger detail).
 * @param commandSucceeded - Whether the command exited cleanly (used for label only).
 */
export async function captureAfterSnapshotAndRecord(
  state:            RunState,
  command:          string,
  commandSucceeded: boolean = true,
  taskId?:          string,
): Promise<void> {
  try {
    const after = await captureSnapshot();
    state.runtimeSnapshots.after = after;

    if (state.runtimeSnapshots.before) {
      const diff = diffSnapshots(state.runtimeSnapshots.before, after);

      // serverLivePostCommand: Path 2 evidence — server confirmed live post-command.
      //
      // This flag is set ONLY when there is attributable evidence that the server
      // is live because of THIS command, not merely because some unrelated process
      // was already listening on a probed port.
      //
      // Attribution strategy:
      //   1. Try to extract the target port from the command (e.g. --port 3000,
      //      PORT=3001, :3000 in URL args). If a target port is found and it
      //      appears in the after-snapshot (whether newly opened or unchanged),
      //      the evidence is tied to that specific port.
      //   2. If no target port can be extracted from the command, serverLivePostCommand
      //      is false — callers must rely on runtimeDiff.hasChange (Path 1) for
      //      runtime_confirmed quality. This prevents pre-existing unrelated ports
      //      from falsely satisfying the gate.
      const targetPort = extractTargetPort(command);
      const serverLivePostCommand = targetPort !== null &&
        after.openPorts.includes(targetPort);

      const label = commandSucceeded
        ? `Runtime probe after: ${command.slice(0, 80)}`
        : `Runtime probe after (timed-out/failed command): ${command.slice(0, 80)}`;

      state.verificationLedger.addEntry(
        "runtime_probe",
        label,
        undefined,
        diff,
        serverLivePostCommand,
        taskId,
        state.currentLaneId ?? undefined,
      );
      state.verificationQuality = state.verificationLedger.getQuality();
    }
  } catch {
    // Port probing is best-effort — never block execution on snapshot failure
  }
}

// ─── Gate block counter ───────────────────────────────────────────────────────

/**
 * Increment the shell-reads-blocked counter. Called by agentLoop when a
 * shell read bypass is blocked, for operator-visible telemetry.
 */
export function recordShellReadBlocked(state: RunState): void {
  state.shellReadsBlocked++;
}

/**
 * Increment the gate trigger count for a specific rejection reason.
 * Used to build the execution summary event at task completion.
 */
export function recordGateTrigger(state: RunState, reason: GateRejectionReason): void {
  state.gateCounts[reason] = (state.gateCounts[reason] ?? 0) + 1;
}
