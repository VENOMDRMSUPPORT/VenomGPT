# VenomGPT — 04 Local Runbook

## Overview

This runbook covers verified local development procedures for VenomGPT. It reflects the current validated state through Tasks #1–#16 plus HITL Recovery, Orchestration Roadmap Phases 1–4, P3 (per-file apply/discard, staging badges, checkpoint history, per-file diff view), P4 (runtime lifecycle depth — task-start/post-apply snapshots, proactive stale detection, process linkage, Evidence Panel section), and the Provider-Layer Stabilization Arc (Phases 0–2, Tasks #18–#22, repo cleanup): durable checkpoint/replay, runtime-aware verification, staged isolation, lifecycle maturity, live WebSocket action streaming, replay/evidence inspection UI, tool introspection, dependency classification groundwork, bounded semi-parallel read burst, runtime-impact signaling, active-run operator intervention (pause/resume/proceed-as-partial), Human-in-the-Loop recovery, parallel dispatch foundations, checkpoint-aware continuation chains, operator steering / approval workflows, verification-orchestrated execution, and a Z.A.I-only provider runtime with `providerRouter.ts` + `ZaiDriver.ts`. It does not leave outdated language implying these surfaces are unverified.

---

## Prerequisites

- **Node.js 24+**
- **pnpm** (`npm install -g pnpm`)
- **Z.AI API key** — from https://z.ai/manage-apikey/apikey-list
- **Git Bash or WSL** (Windows only — required for shell command execution)

---

## Initial Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set ZAI_API_KEY (required for local agent)

# 3. Verify setup
pnpm run test       # 37 automated safety + model config tests
pnpm run typecheck  # TypeScript check across all packages
```

---

## Starting the Application

```bash
pnpm run dev
```

This starts two processes concurrently:
- API server on port 3001 (`tsx watch`, hot-reload on file changes)
- Frontend (Vite) on port 5173

Access via **http://localhost:5173** only. Vite proxies `/api` and `/api/ws` to the API server.

### Individual services

```bash
# API server only
PORT=3001 pnpm --filter @workspace/api-server run dev

# Frontend only (proxying to API on 3001)
PORT=5173 BASE_PATH=/ VITE_API_PORT=3001 pnpm --filter @workspace/workspace-ide run dev
```

---

## Environment Configuration

| Variable | Required | Description |
|---|---|---|
| `ZAI_API_KEY` | Yes | Z.AI API key — the only Z.AI variable required |
| `WORKSPACE_ROOT` | No | Pre-configure workspace (survives restart) |
| `VENOMGPT_DATA_DIR` | No | Task history directory (default: `~/.venomgpt`) |

> **Note:** `ZAI_BASE_URL`, `ZAI_MODEL`, and `ZAI_VISION_MODEL` are **not supported**. Endpoint and model selection are fully automatic and internal. Active endpoints are hardcoded: PAAS → `https://api.z.ai/api/coding/paas/v4/`, Anthropic → `https://api.z.ai/api/anthropic`.

The `.env` file must live at the repo root. `env-loader.ts` locates the repo root from the api-server package via `import.meta.url`.

### Provider selection

```
ZAI_API_KEY set?
  YES → Z.AI (primary)
        Agentic/coding: glm-5.1 (Anthropic-compat lane)
        Vision: glm-4.6v (PAAS lane)
  NO  → Replit OpenAI Integration (fallback, text-only, Replit environment only)
  NEITHER → startup error
```

---

## Verification Ladder

Run in this order after any non-trivial change:

```bash
# 1. TypeScript clean
pnpm run typecheck

# 2. Safety + model config tests (37 checks)
pnpm run test

# 3. Full dev start + manual smoke
pnpm run dev
# Open http://localhost:5173
# Set a workspace directory
# Submit a simple task
# Confirm: live streaming, task completion, checkpoint visible in UI
```

### Checkpoint verification

After a task completes with file writes:

```bash
# Check checkpoint status
curl http://localhost:3001/api/agent/tasks/{taskId}/checkpoint

# Verify staged files are isolated (live workspace untouched)
# Expected: liveUnchanged: true (before apply)

# Apply checkpoint to promote staged files to live workspace
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/apply

# Or discard (live workspace remains clean)
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/discard
```

### Evidence verification

```bash
# Full evidence bundle (persisted, survives restart)
# Includes: routeProfile, planData, checkpointSummary, executionSummary
# executionSummary includes: sideEffectsObserved, dependencyAnalysis (counts + potentiallyIndependentActionIds)
# checkpointSummary includes: runtimeImpactFiles (persisted list of server-affecting files from classifyRuntimeImpactFiles)
curl http://localhost:3001/api/agent/tasks/{taskId}/evidence

# Sequenced replay narrative
curl http://localhost:3001/api/agent/tasks/{taskId}/replay

# Action-level execution records (in-memory, current process only)
curl http://localhost:3001/api/agent/runs/{taskId}/actions
```

### WebSocket action event stream

Actions are pushed via WebSocket as they occur — no polling required. The `action_updated` event fires on each `ActionRecord` state transition. To observe live events during a task, connect to the WebSocket at `ws://localhost:3001/api/ws` and watch for:

- `action_updated` — fires as each action transitions (pending → started → completed/failed)
- `scheduling_truth` — fired twice per task:
  - At planning phase: payload contains `{ phase: "planning", category }` and a plain-language expected dependency shape summary
  - At task completion: payload contains `{ phase: "done", counts, independentCount, serialReason }` and the actual observed dependency shape
  - Note: `potentiallyIndependentActionIds` (full list of IDs) is in `executionSummary.dependencyAnalysis` (persisted evidence), not in the WS event payload
- `live_phase` — emitted on each intervention state change; payload includes `interventionKind` (`"pause" | "blocked" | "partial_proceed" | null`)

The Inspect tab in the UI surfaces all evidence data via the Evidence Panel. No curl tooling is required for normal use.

### Capability check

```bash
curl http://localhost:3001/api/agent/capabilities
# Returns: provider, agentic model chain, vision capability, multimodal flags
```

---

## Operator Intervention

While a task is running, operators can pause, resume, or accept partial completion without cancelling the task.

### Pause a running task

```bash
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/pause
# Response: { success: true, paused: true, message: "Task paused — will halt at next inter-step boundary" }
```

The agent loop will halt at the next safe inter-step boundary and spin-wait. The task remains in `running` status. A `live_phase` event is broadcast with `interventionKind: "pause"`.

### Resume a paused task

```bash
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/resume
# Response: { success: true, paused: false, message: "Task resumed" }
```

Clears the paused flag; the loop continues from where it halted. `interventionKind` returns to `null`.

### Proceed as partial (blocked tasks only)

```bash
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/proceed-as-partial
# Response: { success: true, message: "Proceed-as-partial accepted — task will complete with final_status 'partial'" }
```

Only accepted when `phase === "blocked"` (i.e., the agent called `done` with `final_status: "blocked"`). Sets `partialProceed: true` so the loop calls `done` with `final_status: "partial"` at the next boundary. Returns `400` with `error: "not_blocked"` if the task is not in blocked phase.

---

## HITL Recovery

After a task reaches a terminal state, the recovery assessment endpoint returns a structured analysis of what happened and what the operator can do next.

```bash
curl http://localhost:3001/api/agent/tasks/{taskId}/recovery-options
```

### Response structure

```json
{
  "taskId": "...",
  "outcomeClass": "blocked",
  "whatHappened": "Task is blocked: verification was required before completion...",
  "whatRemains": "The agent needs operator input...",
  "affordances": [
    {
      "kind": "retry_verification",
      "label": "Retry Verification",
      "description": "Start a new task to verify the changes written by this task.",
      "endpoint": "/api/agent/tasks/{taskId}/retry-verification",
      "available": true
    },
    {
      "kind": "continue_partial",
      "label": "Continue from Partial",
      "description": "Start a new task to complete the remaining work described by this task.",
      "endpoint": "/api/agent/tasks/{taskId}/continue-partial",
      "available": false,
      "unavailableReason": "Continue is only available for tasks that ended with partial status."
    },
    {
      "kind": "recheck_runtime",
      "label": "Re-check Runtime",
      "description": "Start a new task to verify the runtime state after applying changes from this task.",
      "endpoint": "/api/agent/tasks/{taskId}/recheck-runtime",
      "available": false,
      "unavailableReason": "Checkpoint has not been applied to the workspace — apply the checkpoint first."
    }
  ]
}
```

### `outcomeClass` values

| outcomeClass | Meaning |
|---|---|
| `clean_done` | Task completed successfully with verification evidence |
| `partial` | Task completed partially; `remaining` describes unfinished work |
| `blocked` | Agent called done with `final_status: "blocked"` — gate condition not met |
| `verification_limited` | Completed but verification quality is below `command_success` |
| `runtime_stale_after_apply` | Checkpoint applied; runtime-impacting files were changed — server may be stale |
| `cancelled_with_progress` | Cancelled after files were written |
| `interrupted_with_progress` | Server restarted mid-run with staged files |
| `step_budget_exhausted` | Ran out of steps without calling done |
| `error_no_recovery` | Unrecoverable error or cancelled before any writes |

### Affordance kinds

| kind | When available |
|---|---|
| `retry_verification` | `blocked` or `step_budget_exhausted` with checkpoint evidence and low verification quality |
| `continue_partial` | `final_status === "partial"` and remaining work is described |
| `recheck_runtime` | Checkpoint applied AND `runtimeImpactFiles` is non-empty |

---

## Parallel Dispatch + Continuation + Approval Workflows (Phases 1–3)

### Parallel dispatch lane verification

After a task completes with `potentially_independent` steps, scheduling-truth events reflect actual dispatch decisions (not just classification). To observe live:

```bash
# Connect to WebSocket and watch for scheduling_truth events
# Post-planning payload: { phase: "planning", category, expectedShape }
# Post-done payload:    { phase: "done", counts, independentCount, serialReason, dispatchMode }
```

The `dispatchMode` field (`"parallel"` or `"serial_fallback"`) indicates whether actual parallel execution occurred.

### Resume from checkpoint (continuation chain)

```bash
# Start a structured continuation from a prior task's checkpoint
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/resume-from-checkpoint \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Continue the remaining work"}'
# Response includes: continuationLineage { ancestryDepth, originCheckpointId, parentTaskId }
```

The response task carries the full continuation lineage. Evidence and replay endpoints on the new task include the ancestry chain.

### Approval gate workflow

```bash
# Register an approval gate (optionally scoped to specific lanes)
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/register-gate \
  -H "Content-Type: application/json" \
  -d '{"label": "Review changes before applying", "laneIds": []}'

# Task enters awaiting_approval phase — a live_phase event is broadcast with the gate context

# Standard approval (proceed all lanes)
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/approve

# Deny the gate (transitions to approval_denied)
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/deny

# Selective approval (specific lanes proceed; others are selectively_blocked)
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/approve-selective \
  -H "Content-Type: application/json" \
  -d '{"approvedLaneIds": ["lane-1"]}'
```

### Approval workflow lifecycle phases

| Phase | Meaning |
|---|---|
| `awaiting_approval` | Task halted at a registered gate; waiting for operator action |
| `selectively_blocked` | Partial approval; specific lanes held; others proceeding |
| `approval_denied` | Gate explicitly denied; run halted |
| `operator_overridden` | One or more steps substituted or skipped by operator |

Use `GET /api/agent/tasks/{taskId}/recovery-options` after `approval_denied` — the `resubmit_after_denial` affordance will be available.

---

## Task History

Task history is persisted to `~/.venomgpt/history.json` (default 100 tasks, configurable to 25/50/100/200 via settings). Set `VENOMGPT_DATA_DIR` to change the directory.

History loads at server startup. The frontend hydrates events for historical tasks via `GET /api/agent/tasks/:id/events`.

Legacy `~/.devmind` is migrated automatically on first run.

---

## Checkpoint Lifecycle

VenomGPT uses a staged file isolation model. This is the full lifecycle:

```
Agent runs task
  │
  ├── File write → goes to staging directory (not live workspace)
  │   stagingStore.ts writes to ~/.venomgpt/staging/{taskId}/...
  │
  └── Task completes
        │
        ├── liveUnchanged: true (staged files exist, live workspace clean)
        │
        ├── POST /apply → commitStaged() → promotes staged files to live workspace
        │   Live workspace now reflects the changes; project index invalidated
        │
        └── POST /discard → removes staging directory
            Live workspace untouched (unless partial-apply recovery path triggered)
```

### Partial-apply recovery

If apply is interrupted mid-flight, discard will detect files that were partially promoted and restore them from snapshots, then clean up. This is logged and reported via `liveFilesModified: true` in the discard response.

---

## Runtime Behavior Notes

### Hot-reload behavior

The API server uses `tsx watch`. In-flight tasks are cancelled on restart. The frontend uses Vite HMR — no restart required for frontend changes.

### Task cancellation

Cancel a running task via:
```bash
curl -X POST http://localhost:3001/api/agent/tasks/{taskId}/cancel
```
The task transitions to `cancelled` status. Staged files from the cancelled task remain in staging until explicitly applied or discarded.

### Task lifecycle states

| Status | Meaning |
|---|---|
| `running` | Task is actively executing |
| `done` | Task finished and produced a `done` action with evidence |
| `error` | Task failed with a structured failure detail |
| `cancelled` | Task was explicitly cancelled via AbortController |
| `interrupted` | Task was in flight when the server restarted |
| `stalled` | Task exhausted its step budget without `done` |

---

## Verification Quality Reference

After a task completes, the `executionSummary.verificationQuality` field reflects the highest quality tier reached:

| Quality | Meaning |
|---|---|
| `none` | No evidence recorded — no reads, commands, or probes run |
| `static_only` | Only static file read-backs observed; no commands |
| `command_success` | At least one substantive shell command succeeded (build, test, lint, etc.) |
| `runtime_confirmed` | Runtime probe confirmed a live server or port — hardest evidence available |

`runtime_confirmed` requires a runtime-aware probe (e.g., port check after server start). The agent system prompt enforces verification requirements per profile.

---

## Windows-Specific Notes

- Git Bash or WSL required for shell command execution
- The workspace setup dialog shows this warning automatically when Windows is detected
- Vite dev server and TypeScript tooling work natively on Windows — only agent shell commands require Git Bash/WSL
- File path normalization handles Windows backslash traversal before safety checks

---

## Common Issues

| Symptom | Likely cause | Resolution |
|---|---|---|
| `missing_api_key` error | ZAI_API_KEY not set | Set in `.env` at repo root |
| No streaming in browser | WebSocket not connecting | Check Vite proxy is running; confirm `/api/ws` path |
| Task stuck in `running` after restart | Server restarted mid-task | Task should be `interrupted` — check `/api/agent/tasks` |
| Checkpoint apply fails | Task still running | Cancel first, then apply |
| Agent uses absolute paths | Model regression | System prompt enforces relative paths; report as a bug |
| `proceed-as-partial` returns 400 `not_blocked` | Task is not in blocked phase | Only valid when agent called done with `final_status: "blocked"` |
