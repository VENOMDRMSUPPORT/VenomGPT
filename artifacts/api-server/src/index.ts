import "./env-loader.js";
import http from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { initWebSocketServer } from "./lib/wsServer.js";
import { setWorkspaceRoot, getWorkspaceRoot } from "./lib/safety.js";
import { logProviderDiagnostic } from "./lib/modelAdapter.js";
import { initTaskPersistence, loadPersistedHistory, recoverInterruptedTasks } from "./lib/taskPersistence.js";
import { loadSettings } from "./lib/settingsStore.js";
import { loadRegistry } from "./lib/providerRegistry.js";
import { recoverCheckpointsFromDisk, getPendingCheckpointTaskIds } from "./lib/orchestrator/checkpoint.js";
import { recoverStagingDirs } from "./lib/orchestrator/stagingStore.js";
import { initTaskBoard } from "./lib/taskBoardPersistence.js";

const rawPort = process.env["PORT"] ?? "3001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if (process.env["WORKSPACE_ROOT"]) {
  setWorkspaceRoot(process.env["WORKSPACE_ROOT"]);
  logger.info({ root: process.env["WORKSPACE_ROOT"] }, "Workspace root initialized from env");
}

// Init the task board — either immediately (if workspace is already set) or
// deferred (workspace.ts POST /workspace will call initTaskBoard when user sets it).
// initTaskBoard is idempotent and safe to call with any valid root.
if (process.env["WORKSPACE_ROOT"]) {
  initTaskBoard(getWorkspaceRoot()).catch((err: unknown) => {
    logger.warn({ err }, "Task board init failed at startup — board will init when workspace is set");
  });
}

// Load operator settings first so all downstream modules see the correct values
await loadSettings();

// Load provider registry with error tolerance — missing ZAI_API_KEY does NOT block startup.
// Provider validation happens at request-time (see modelAdapter.ts:resolveProviderConfig).
// This allows the app to start and run in degraded mode when no provider is configured.
try {
  await loadRegistry();
} catch (err) {
  logger.warn({ err }, "Could not load provider registry — continuing with defaults");
}

// Register persistence hook before tasks can run, then load saved history.
// Sequencing is critical: history must be fully loaded before checkpoint
// recovery runs, so that recovered checkpoints don't inject stub tasks that
// are later overwritten/skipped by the history hydration pass.
initTaskPersistence();
try {
  await loadPersistedHistory();
} catch (err) {
  logger.warn({ err }, "Could not load persisted task history — continuing without it");
}
// Mark any tasks still in "running" status as "interrupted" — they were
// orphaned by a previous server crash or restart. Must run after history
// is loaded and persistence hook is registered so the transition is saved.
try {
  recoverInterruptedTasks();
} catch (err) {
  logger.warn({ err }, "Could not recover interrupted tasks — continuing");
}
try {
  await recoverCheckpointsFromDisk();
} catch (err) {
  logger.warn({ err }, "Could not recover checkpoints from disk — continuing without them");
}
// Recover staging directories left by a server crash or restart.
// Pass the set of pending checkpoint task IDs so orphaned staging dirs
// (those with no corresponding pending checkpoint) are automatically cleaned
// up rather than reported to the operator.
try {
  const pendingTaskIds = getPendingCheckpointTaskIds();
  await recoverStagingDirs(pendingTaskIds);
} catch (err) {
  logger.warn({ err }, "Could not recover staging directories — continuing without them");
}

logProviderDiagnostic();

const server = http.createServer(app);

initWebSocketServer(server);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
