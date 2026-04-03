/**
 * orchestrator/verificationLedger.ts — Per-task verification evidence accumulator.
 *
 * Maintains an ordered list of VerificationEntry objects that record every
 * meaningful proof event during a task run:
 *   - Static file reads
 *   - Command successes (classified by side-effect class)
 *   - Runtime port probes (before/after snapshots)
 *
 * From the accumulated evidence, the ledger derives a VerificationQuality label
 * on the quality ladder:
 *
 *   none              — No evidence recorded yet
 *   static_only       — Only static file reads observed; no commands or probes
 *   command_success   — At least one substantive command succeeded
 *   runtime_confirmed — A runtime probe provides hard runtime evidence via
 *                       either of two paths:
 *
 *                       Path 1 — Port diff: runtimeDiff.hasChange === true
 *                         A port opened or closed between the before/after
 *                         snapshot, directly attributable to the preceding
 *                         server lifecycle command.
 *
 *                       Path 2 — Server live: serverLivePostCommand === true
 *                         The after-snapshot (taken immediately after a
 *                         server lifecycle command) found at least one
 *                         application port open in the probe set. This covers
 *                         the case where the server was already running when
 *                         the agent invoked it (e.g., restart of an existing
 *                         server, or `npm start` with a running server) — the
 *                         port shows as unchanged in the diff but IS live.
 *                         Note: the probe set is restricted to common dev-server
 *                         ports (3000–9000 range) so this is not triggered by
 *                         system ports like 22 or 80.
 */

import type { SideEffectClass } from "./sideEffectClassifier.js";
import type { RuntimeDiff }     from "./runtimeLifecycle.js";
import { actionStore, ActionType } from "./actionStore.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type VerificationQuality =
  | "none"
  | "static_only"
  | "command_success"
  | "runtime_confirmed";

export type VerificationEntryType =
  | "static_read"
  | "command_success"
  | "runtime_probe";

export interface VerificationEntry {
  type:             VerificationEntryType;
  /** Human-readable description of this evidence item. */
  detail:           string;
  /** The side-effect class of the command (present when type === 'command_success'). */
  sideEffectClass?: SideEffectClass;
  /** The runtime diff produced by this probe (present when type === 'runtime_probe'). */
  runtimeDiff?:     RuntimeDiff;
  /**
   * Server-live flag (present when type === 'runtime_probe').
   * True when the after-snapshot found at least one open port in the probe set,
   * indicating a server process is reachable on localhost — even if the diff
   * shows hasChange=false (the server was already running before the command).
   * This is Path 2 to runtime_confirmed quality.
   */
  serverLivePostCommand?: boolean;
  /** Unix millisecond timestamp. */
  timestamp:        number;
}

export interface LedgerSummary {
  quality:             VerificationQuality;
  entries:             VerificationEntry[];
  /** Count of static file reads. */
  staticReadCount:     number;
  /**
   * Count of successful substantive commands (compile_check, test_run,
   * server_start, server_stop, install, fs_mutation, db_mutation).
   * read_only and unknown class commands are intentionally excluded to
   * prevent trivial read commands from inflating the evidence count.
   */
  commandSuccessCount: number;
  /** Count of runtime probe entries. */
  runtimeProbeCount:   number;
  /** Port diffs from all runtime probes (may be empty). */
  runtimeEvidence:     RuntimeDiff[];
  /** Plain-English statement of what evidence backs this result. */
  proofStatement:      string;
  /**
   * Typed contributor labels derived strictly from recorded VerificationEntry objects.
   * Each element identifies a specific evidence item: "command_success:<class>:<detail>",
   * "runtime_probe:port_changed:<detail>", "runtime_probe:server_live:<detail>",
   * or "static_read:<detail>".
   * NEVER populated from plan steps, counts, or model narration.
   * Empty array when no evidence has been recorded (quality === "none").
   */
  contributors:        string[];
}

// ─── Classes that constitute 'command_success' evidence ───────────────────────
// These side-effect classes are substantive enough to advance quality from
// static_only → command_success (read_only and unknown do not advance quality).

const SUBSTANTIVE_CLASSES = new Set<SideEffectClass>([
  "compile_check",
  "test_run",
  "server_start",
  "server_stop",
  "install",
  "fs_mutation",
  "db_mutation",
]);

// ─── Ledger ───────────────────────────────────────────────────────────────────

export class VerificationLedger {
  private entries: VerificationEntry[] = [];

  /**
   * Record a new verification evidence entry.
   *
   * Also emits a VERIFY_RESULT ActionRecord to the ActionStore when taskId is provided,
   * enabling action-level replay and evidence surfacing for future UI passes.
   *
   * @param type                 - Category of evidence.
   * @param detail               - Human-readable description.
   * @param sideEffectClass      - Side-effect class (for command_success entries).
   * @param runtimeDiff          - Port diff (for runtime_probe entries).
   * @param serverLivePostCommand - True if the after-snapshot found at least one
   *                               open probe-set port, indicating a server is live
   *                               post-command (for runtime_probe entries).
   * @param taskId               - Optional task run id for ActionStore instrumentation.
   */
  addEntry(
    type:                  VerificationEntryType,
    detail:                string,
    sideEffectClass?:      SideEffectClass,
    runtimeDiff?:          RuntimeDiff,
    serverLivePostCommand?: boolean,
    taskId?:               string,
    laneId?:               string,
  ): void {
    this.entries.push({
      type,
      detail,
      sideEffectClass,
      runtimeDiff,
      serverLivePostCommand,
      timestamp: Date.now(),
    });

    // ── Action-level instrumentation ────────────────────────────────────────
    if (taskId) {
      // Encode the verification method with as much specificity as possible.
      // For command_success entries, include the side-effect class so the
      // action record distinguishes substantive from trivial commands.
      const method = type === "runtime_probe"
        ? "runtime_probe"
        : type === "static_read"
          ? "static_read"
          : sideEffectClass
            ? `command_success:${sideEffectClass}`
            : "command_success";

      // Determine pass/fail semantics per entry type:
      //   static_read    — always passed (the read itself succeeded)
      //   runtime_probe  — passed when ports changed or server is live post-command
      //   command_success — passed when sideEffectClass is substantive (not read_only/unknown)
      let passed: boolean;
      if (type === "static_read") {
        passed = true;
      } else if (type === "runtime_probe") {
        passed = runtimeDiff?.hasChange === true || serverLivePostCommand === true;
      } else {
        // command_success: a substantive side-effect class means a real operation ran
        passed = sideEffectClass != null && SUBSTANTIVE_CLASSES.has(sideEffectClass);
      }

      const verifyRecord = actionStore.createAction(taskId, ActionType.VERIFY_RESULT, {
        type:   ActionType.VERIFY_RESULT,
        method,
        probe:  detail,
        passed,
      });
      // Tag with lane identity so deriveVerificationOutcome() can scope evidence
      // to the correct lane. Without this tag, all VERIFY_RESULT records appear
      // global and lane-scoped outcome derivation always returns "deferred".
      if (laneId) {
        actionStore.setLaneId(verifyRecord.id, laneId);
      }
      actionStore.startAction(verifyRecord.id);
      actionStore.completeAction(verifyRecord.id, {
        success: passed,
        summary: `${method}: ${detail.slice(0, 120)}`,
      });
    }
  }

  /**
   * Derive the current VerificationQuality from accumulated entries.
   *
   * Quality ladder (monotonically increasing — never decreases):
   *   none              — no entries
   *   static_only       — only static_read entries
   *   command_success   — at least one command_success with a substantive class
   *   runtime_confirmed — at least one runtime_probe satisfying:
   *                         • Path 1: runtimeDiff.hasChange === true (port opened/closed)
   *                         • Path 2: serverLivePostCommand === true (open port found
   *                           in after-snapshot — server confirmed live post-command,
   *                           even if it was already running before the command)
   */
  getQuality(): VerificationQuality {
    if (this.entries.length === 0) return "none";

    let hasStaticRead     = false;
    let hasCommandSuccess = false;
    let hasRuntimeProof   = false;

    for (const e of this.entries) {
      switch (e.type) {
        case "static_read":
          hasStaticRead = true;
          break;

        case "command_success":
          if (e.sideEffectClass && SUBSTANTIVE_CLASSES.has(e.sideEffectClass)) {
            hasCommandSuccess = true;
          }
          break;

        case "runtime_probe":
          // Path 1: a port opened or closed because of this command.
          if (e.runtimeDiff?.hasChange) {
            hasRuntimeProof = true;
          }
          // Path 2: the after-snapshot found a live server on a probe-set port.
          // Handles the case where the server was already running (unchanged) or
          // where `npm start` timed out but the server bound its port first.
          if (e.serverLivePostCommand) {
            hasRuntimeProof = true;
          }
          break;
      }
    }

    if (hasRuntimeProof)   return "runtime_confirmed";
    if (hasCommandSuccess) return "command_success";
    if (hasStaticRead)     return "static_only";
    return "none";
  }

  /**
   * Produce a full ledger summary for operator-visible telemetry.
   *
   * commandSuccessCount only counts substantive commands (compile_check, test_run,
   * server_start, server_stop, install, fs_mutation, db_mutation). read_only and
   * unknown class commands are intentionally excluded to keep this count meaningful.
   */
  getSummary(): LedgerSummary {
    const quality = this.getQuality();

    const staticReadCount = this.entries.filter(e => e.type === "static_read").length;

    // Only count substantive commands — read_only/unknown are excluded
    const commandSuccessCount = this.entries.filter(
      e => e.type === "command_success" &&
           e.sideEffectClass != null &&
           SUBSTANTIVE_CLASSES.has(e.sideEffectClass),
    ).length;

    const runtimeProbeCount = this.entries.filter(e => e.type === "runtime_probe").length;

    const runtimeEvidence = this.entries
      .filter(e => e.type === "runtime_probe" && e.runtimeDiff != null)
      .map(e => e.runtimeDiff as RuntimeDiff);

    const proofStatement = this._buildProofStatement(quality);

    // ── Contributors — typed labels from real VerificationEntry objects only ─
    // Never populated from plan steps, counts, or model narration.
    // Each label identifies a specific evidence item with method:class:detail.
    const contributors: string[] = [];
    for (const e of this.entries) {
      if (e.type === "command_success" && e.sideEffectClass) {
        contributors.push(`command_success:${e.sideEffectClass}:${e.detail.slice(0, 80)}`);
      } else if (e.type === "runtime_probe") {
        const sub = e.runtimeDiff?.hasChange ? "port_changed"
          : e.serverLivePostCommand           ? "server_live"
          : "no_change";
        contributors.push(`runtime_probe:${sub}:${e.detail.slice(0, 80)}`);
      } else if (e.type === "static_read") {
        contributors.push(`static_read:${e.detail.slice(0, 80)}`);
      }
    }

    return {
      quality,
      entries:             this.entries,
      staticReadCount,
      commandSuccessCount,
      runtimeProbeCount,
      runtimeEvidence,
      proofStatement,
      contributors,
    };
  }

  /** Return a shallow copy of all current entries. */
  getEntries(): VerificationEntry[] {
    return [...this.entries];
  }

  /** Reset the ledger (useful for testing). */
  reset(): void {
    this.entries = [];
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _buildProofStatement(quality: VerificationQuality): string {
    switch (quality) {
      case "none":
        return "No verification evidence recorded";

      case "static_only": {
        const count = this.entries.filter(e => e.type === "static_read").length;
        return `Verified by: ${count} static file read${count !== 1 ? "s" : ""}`;
      }

      case "command_success": {
        const commands = this.entries
          .filter(e => e.type === "command_success" && e.sideEffectClass && SUBSTANTIVE_CLASSES.has(e.sideEffectClass))
          .map(e => `${e.detail} (${e.sideEffectClass ?? "unknown"})`);
        return `Verified by: ${commands.join(", ")}`;
      }

      case "runtime_confirmed": {
        const runtimeParts: string[] = [];

        // Commands that ran
        const commands = this.entries
          .filter(e => e.type === "command_success" && e.sideEffectClass && SUBSTANTIVE_CLASSES.has(e.sideEffectClass))
          .map(e => `${e.detail} (${e.sideEffectClass ?? "unknown"})`);
        if (commands.length > 0) {
          runtimeParts.push(commands.join(", "));
        }

        // Path 1: port diffs
        const diffs = this.entries
          .filter(e => e.type === "runtime_probe" && e.runtimeDiff?.hasChange)
          .map(e => {
            const d = e.runtimeDiff!;
            if (d.newlyOpened.length > 0) {
              return `runtime probe confirmed port${d.newlyOpened.length > 1 ? "s" : ""} ${d.newlyOpened.join(", ")} opened`;
            }
            return `runtime probe confirmed port${d.newlyClosed.length > 1 ? "s" : ""} ${d.newlyClosed.join(", ")} closed`;
          });
        if (diffs.length > 0) {
          runtimeParts.push(...diffs);
        }

        // Path 2: live-server confirmations (no diff but server is up)
        const liveEntries = this.entries.filter(
          e => e.type === "runtime_probe" &&
               e.serverLivePostCommand &&
               !e.runtimeDiff?.hasChange,
        );
        if (liveEntries.length > 0) {
          const livePorts = liveEntries
            .flatMap(e => [...(e.runtimeDiff?.unchanged ?? []), ...(e.runtimeDiff?.newlyOpened ?? [])])
            .filter((p, i, arr) => arr.indexOf(p) === i); // unique
          if (livePorts.length > 0) {
            runtimeParts.push(`server confirmed live on port${livePorts.length > 1 ? "s" : ""} ${livePorts.join(", ")}`);
          } else {
            runtimeParts.push("server confirmed live post-command (open port in probe set)");
          }
        }

        return runtimeParts.length > 0
          ? `Verified by: ${runtimeParts.join(" + ")}`
          : "Verified by: runtime probe (port state confirmed)";
      }
    }
  }
}
