/**
 * orchestrator/runtimeLifecycle.ts — Runtime process/port state tracking.
 *
 * Captures a snapshot of which local TCP ports are open before and after a
 * command that may start or stop a server. Diffing two snapshots reveals
 * newly opened and newly closed ports — providing real evidence that a server
 * was started or stopped.
 *
 * Implementation uses only Node.js built-ins (net module — no external deps).
 * Port probing is done with a short connection attempt; open ports accept the
 * TCP handshake and the socket is immediately destroyed.
 *
 * P4 extensions (task-9-closeout):
 *   - RuntimeSnapshot extended with envMeta (Node.js version, env var keys, process count)
 *   - captureEnhancedSnapshot() collects env metadata alongside port probe results
 *   - ProcessLinkageEntry: links a port change to the command responsible for it
 *   - RuntimeLifecycleRecord: the full lifecycle artifact stored in TaskEvidence
 */

import net  from "net";
import os   from "os";
import { execSync } from "child_process";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Environment metadata captured alongside port state.
 * Values are intentionally bounded:
 *   - nodeVersion: string from process.version
 *   - processCount: number of running processes (best-effort, may be null)
 *   - relevantEnvKeys: names (NOT values) of env vars relevant to the runtime
 *     (PORT, NODE_ENV, HOST, SERVER_*, DATABASE_URL shape detection)
 */
export interface RuntimeEnvMeta {
  nodeVersion:    string;
  processCount:   number | null;
  relevantEnvKeys: string[];
}

export interface RuntimeSnapshot {
  /** ISO timestamp of when the snapshot was taken. */
  timestamp:   string;
  /** Set of port numbers that were confirmed open (listening) at snapshot time. */
  openPorts:   number[];
  /** Environment metadata — present when captured via captureEnhancedSnapshot(). */
  envMeta?:    RuntimeEnvMeta;
}

export interface RuntimeDiff {
  /** Ports that were closed before and are now open. */
  newlyOpened:  number[];
  /** Ports that were open before and are now closed. */
  newlyClosed:  number[];
  /** Ports that were open in both snapshots. */
  unchanged:    number[];
  /** True when at least one port changed state (opened or closed). */
  hasChange:    boolean;
}

/**
 * Links a port change event to the command/step responsible for it.
 * Populated from verificationLedger runtime_probe entries that carry
 * the originating command detail.
 */
export interface ProcessLinkageEntry {
  /** Port number that changed state. */
  port:    number;
  /** Whether the port was opened or closed. */
  event:   "opened" | "closed";
  /** The command or description from the verificationLedger entry. */
  command: string;
}

/**
 * Full runtime lifecycle record stored in TaskEvidence.runtimeLifecycle.
 * All fields are optional so the record degrades honestly when data is absent.
 */
export interface RuntimeLifecycleRecord {
  /** Snapshot taken at task start (before any commands run). */
  taskStartSnapshot?:  RuntimeSnapshot;
  /** Snapshot taken after the checkpoint was applied to the live workspace. */
  postApplySnapshot?:  RuntimeSnapshot;
  /** Diff between taskStartSnapshot and postApplySnapshot (if both are present). */
  portDiff?:           RuntimeDiff;
  /** Port-to-command linkage entries derived from the verificationLedger. */
  processLinkage:      ProcessLinkageEntry[];
  /**
   * True when runtime-impacting files were applied AND the port state has not
   * changed since task start (proactive stale detection).
   * null when there is insufficient data to make the determination.
   */
  isStaleAfterApply:   boolean | null;
}

// ─── Well-known local ports to probe ─────────────────────────────────────────
//
// Covers the most common development server ports.
// Kept intentionally small to minimise probe latency (each probe is parallel
// with a tight timeout). The list should cover the ports most likely to be
// opened or closed by a server_start or server_stop command.

const PROBE_PORTS: number[] = [
  3000, 3001, 3002, 3003,
  4000, 4001,
  5000, 5001,
  5173,          // Vite default
  8000, 8080, 8081, 8888,
  9000,
];

const PROBE_TIMEOUT_MS = 300;  // Per-port TCP connect timeout

/**
 * Bounded set of env var key name patterns that are relevant to runtime
 * configuration. We capture KEY NAMES only — never values.
 */
const RELEVANT_ENV_PATTERNS: RegExp[] = [
  /^PORT$/i,
  /^HOST$/i,
  /^NODE_ENV$/i,
  /^SERVER_/i,
  /^DATABASE_URL$/i,
  /^REDIS_/i,
  /^API_/i,
  /^APP_/i,
  /^VITE_/i,
  /^NEXT_PUBLIC_/i,
];

const MAX_RELEVANT_ENV_KEYS = 20;

// ─── Port probe ───────────────────────────────────────────────────────────────

/**
 * Attempt a TCP connection to localhost:port.
 * Resolves to true if the port is open (connection accepted), false otherwise.
 * The socket is immediately destroyed after a successful handshake.
 */
function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => settle(false), PROBE_TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timer);
      settle(true);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      settle(false);
    });

    socket.once("timeout", () => {
      clearTimeout(timer);
      settle(false);
    });

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.connect(port, "127.0.0.1");
  });
}

// ─── Environment metadata capture ────────────────────────────────────────────

/**
 * Collect bounded environment metadata for a runtime snapshot.
 * Never throws — all data collection is best-effort.
 */
function captureEnvMeta(): RuntimeEnvMeta {
  const nodeVersion = process.version;

  // Relevant env var key names (not values) — bounded to MAX_RELEVANT_ENV_KEYS
  const relevantEnvKeys: string[] = [];
  for (const key of Object.keys(process.env)) {
    if (RELEVANT_ENV_PATTERNS.some(re => re.test(key))) {
      relevantEnvKeys.push(key);
      if (relevantEnvKeys.length >= MAX_RELEVANT_ENV_KEYS) break;
    }
  }

  // Process count — best-effort, null on failure
  let processCount: number | null = null;
  try {
    // On POSIX systems, `ps aux` count is reliable; on others we skip.
    if (os.platform() !== "win32") {
      const output = execSync("ps aux 2>/dev/null | wc -l", { timeout: 500, encoding: "utf8" });
      const count = parseInt(output.trim(), 10);
      if (!isNaN(count) && count > 0) processCount = count;
    }
  } catch {
    // Silently ignore — processCount stays null
  }

  return { nodeVersion, processCount, relevantEnvKeys };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Capture a snapshot of which well-known local ports are currently open.
 * All ports are probed in parallel for minimal latency.
 *
 * @returns A RuntimeSnapshot with the list of open ports and timestamp.
 */
export async function captureSnapshot(): Promise<RuntimeSnapshot> {
  const results = await Promise.all(
    PROBE_PORTS.map(async (port) => ({ port, open: await probePort(port) }))
  );

  const openPorts = results
    .filter(r => r.open)
    .map(r => r.port)
    .sort((a, b) => a - b);

  return {
    timestamp: new Date().toISOString(),
    openPorts,
  };
}

/**
 * Capture an enhanced snapshot with both port state and environment metadata.
 * Use this at task-start and checkpoint-apply to capture the full runtime picture.
 * Falls back gracefully: if env metadata collection fails, openPorts are still returned.
 *
 * @returns A RuntimeSnapshot with openPorts, timestamp, and envMeta.
 */
export async function captureEnhancedSnapshot(): Promise<RuntimeSnapshot> {
  // Probe ports and collect env meta in parallel
  const [portResults, envMeta] = await Promise.all([
    Promise.all(PROBE_PORTS.map(async (port) => ({ port, open: await probePort(port) }))),
    Promise.resolve().then(captureEnvMeta),
  ]);

  const openPorts = portResults
    .filter(r => r.open)
    .map(r => r.port)
    .sort((a, b) => a - b);

  return {
    timestamp: new Date().toISOString(),
    openPorts,
    envMeta,
  };
}

/**
 * Diff two runtime snapshots to determine which ports changed state.
 *
 * @param before - Snapshot taken before the command ran.
 * @param after  - Snapshot taken after the command ran.
 * @returns A RuntimeDiff describing the changes.
 */
export function diffSnapshots(before: RuntimeSnapshot, after: RuntimeSnapshot): RuntimeDiff {
  const beforeSet = new Set(before.openPorts);
  const afterSet  = new Set(after.openPorts);

  const newlyOpened = after.openPorts.filter(p => !beforeSet.has(p));
  const newlyClosed = before.openPorts.filter(p => !afterSet.has(p));
  const unchanged   = before.openPorts.filter(p => afterSet.has(p));

  return {
    newlyOpened,
    newlyClosed,
    unchanged,
    hasChange: newlyOpened.length > 0 || newlyClosed.length > 0,
  };
}

/**
 * Attempt to extract the intended TCP port number from a server lifecycle command.
 *
 * Parses common port-specifying patterns:
 *   --port 3000 / --port=3000
 *   -p 8000 / -p=8000
 *   PORT=3000 prefix (e.g. "PORT=3000 npm start")
 *   :3000 in URL arguments (e.g. "--host http://localhost:3000")
 *
 * Returns the extracted port if it is within the probed port set, or null if
 * no port can be reliably identified. Returning null means callers should fall
 * back to diff-only confirmation (no live-server path).
 *
 * @param command - The shell command string to inspect.
 * @returns The intended port number (if found and in PROBE_PORTS), or null.
 */
export function extractTargetPort(command: string): number | null {
  const patterns: RegExp[] = [
    /(?:--port|-p)[=\s]+(\d{2,5})/i,           // --port 3000, -p 8080, --port=3000
    /\bPORT[=\s]+(\d{2,5})/i,                   // PORT=3000 or PORT 3000
    /:(\d{2,5})(?:\s|\/|$)/,                    // :3000 in URLs / trailing
    /--listen[=\s]+(?:\S+:)?(\d{2,5})/i,        // --listen 0.0.0.0:8000
    /--bind[=\s]+(?:\S+:)?(\d{2,5})/i,          // --bind 0.0.0.0:8000
  ];

  for (const re of patterns) {
    const m = command.match(re);
    if (m) {
      const port = parseInt(m[1], 10);
      if (!isNaN(port) && PROBE_PORTS.includes(port)) {
        return port;
      }
    }
  }
  return null;
}

/**
 * Format a RuntimeDiff as a plain-English summary for operator-visible output.
 *
 * @param diff - The RuntimeDiff to format.
 * @returns A short human-readable string describing port changes.
 */
export function formatDiffSummary(diff: RuntimeDiff): string {
  if (!diff.hasChange) {
    return "No port state changes detected";
  }

  const parts: string[] = [];

  if (diff.newlyOpened.length > 0) {
    const ports = diff.newlyOpened.join(", ");
    parts.push(`port${diff.newlyOpened.length > 1 ? "s" : ""} opened: ${ports}`);
  }

  if (diff.newlyClosed.length > 0) {
    const ports = diff.newlyClosed.join(", ");
    parts.push(`port${diff.newlyClosed.length > 1 ? "s" : ""} closed: ${ports}`);
  }

  return parts.join("; ");
}

/**
 * Build a RuntimeLifecycleRecord from captured snapshots and verificationLedger entries.
 *
 * @param taskStartSnapshot  - Snapshot taken at task start (may be undefined if unavailable).
 * @param postApplySnapshot  - Snapshot taken after checkpoint apply (may be undefined).
 * @param runtimeImpactFiles - Files classified as runtime-impacting (from checkpoint).
 * @param probeEntries       - runtime_probe VerificationEntry objects from the ledger.
 * @returns A RuntimeLifecycleRecord with all available data.
 */
export function buildRuntimeLifecycleRecord(
  taskStartSnapshot:  RuntimeSnapshot | undefined,
  postApplySnapshot:  RuntimeSnapshot | undefined,
  runtimeImpactFiles: string[],
  probeEntries: Array<{ runtimeDiff?: RuntimeDiff; detail: string }>,
): RuntimeLifecycleRecord {
  // Diff between snapshots (if both available)
  let portDiff: RuntimeDiff | undefined;
  if (taskStartSnapshot && postApplySnapshot) {
    portDiff = diffSnapshots(taskStartSnapshot, postApplySnapshot);
  }

  // Proactive stale detection:
  // Stale = runtime-impacting files were applied AND port state didn't change
  // (no server restart was observed since task-start).
  let isStaleAfterApply: boolean | null = null;
  if (postApplySnapshot && taskStartSnapshot && runtimeImpactFiles.length > 0) {
    // hasChange === false means port state is the same — no restart was detected
    isStaleAfterApply = portDiff ? !portDiff.hasChange : null;
  } else if (!postApplySnapshot || !taskStartSnapshot) {
    // Insufficient data — leave as null (honest absent-data handling)
    isStaleAfterApply = null;
  } else {
    // No runtime-impact files applied — not stale by definition
    isStaleAfterApply = false;
  }

  // Process linkage: extract port-to-command mappings from ledger probe entries
  const processLinkage: ProcessLinkageEntry[] = [];
  for (const entry of probeEntries) {
    const diff = entry.runtimeDiff;
    if (!diff) continue;
    for (const port of diff.newlyOpened) {
      processLinkage.push({ port, event: "opened", command: entry.detail });
    }
    for (const port of diff.newlyClosed) {
      processLinkage.push({ port, event: "closed", command: entry.detail });
    }
  }

  return {
    taskStartSnapshot,
    postApplySnapshot,
    portDiff,
    processLinkage,
    isStaleAfterApply,
  };
}
