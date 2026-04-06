# VenomGPT — 01 Current State

## Overview

This document describes the confirmed current state of VenomGPT as of the closeout of Tasks #1–#16 plus HITL Recovery, Orchestration Roadmap Phases 1–4 (Tasks #7–#10), P3 (per-file apply/discard, staging badges, checkpoint history, per-file diff view), P4 (runtime lifecycle depth — task-start/post-apply snapshots, proactive stale detection, process linkage, Evidence Panel section), the Provider-Layer Stabilization Arc (Phases 0–2, Tasks #18–#22, repo cleanup), the Backend Closeout Pass (route extraction into `agentContinuation.ts`, `agent.ts` reduced to 993 lines, 31 automated tests added and passing), Pass 4 (Premium Orchestration UI — OrchestrationBlock, ApprovalGateCard with checkpointId + APPROVAL_CHECKPOINT source, SelectivelyBlockedLaneGrid, ProviderDiagnosticsPanel), Pass 5 (Product Polish — settings page toasts, task history search/filter chips + match count, board status-change buttons + plan association badges, live prompt suggestions, provider diagnostics on integrations page), Pass 6 (API Base URL Audit — 33 root-relative fetch calls fixed across 12 files), Pass 7 (Projects / Workspace Manager — live project list, create, select, inline description edit, delete with 409 guard in `apps.tsx`), Pass 8 (Remaining Orchestration Surfaces — per-lane contribution summary in OrchestrationBlock, scheduling analysis deeplink in Transcript tab), and Pass 9A (Action ID Cross-Reference — `potentiallyIndependentActionIds` UUIDs replaced with readable type + file path rows in DependencyGraphBlock; closes the current orchestration/workspace arc). It separates what is confirmed working, what is partially validated, what is still open, and what is intentionally deferred.

---

## Confirmed Working

### Backend / Orchestration / Trust

**Task Routing**
- `taskRouter.ts` categorizes tasks at intake: `conversational | visual_describe | visual_report | visual_fix | visual_improve | visual_analyze | code_edit | code_verify | server_check | text_explain`
- Route profile determines step budget, file read/write limits, writes allowed flag, planning phase flag, and verification requirement
- `code_edit`: 25 steps max, 10 reads, 8 writes, planning phase enabled, verification required
- `server_check`: 6 steps, runtime proof required (`requiresRuntimeProof: true`) — agent must provide hard evidence a server is live
- Conversational bypass: greetings and short factual questions skip the full agent loop entirely (saves ~2s workspace scan latency)

**Planning Phase**
- `planner.ts` runs a structured pre-execution planning call for agentic tasks
- Plan data: goal, approach, files to read, expected changes
- Plan data is captured in `TaskEvidence` and visible in the transcript as a structured `plan` log event

**Action Gating + Side-Effect Classification**
- `actionRouter.ts` enforces per-action policies: read limits, write limits, step budget
- `sideEffectClassifier.ts` categorizes shell commands by side-effect class
- Shell reads that would bypass the staged layer are blocked
- Gate triggers are counted and surfaced in `executionSummary.gateTriggers`

**Staged Task Isolation**
- All agent file writes go into a per-task staging directory (not live workspace)
- Live workspace is untouched until the operator explicitly applies via `POST /api/agent/tasks/:id/apply`
- Discard removes staging directory only — live workspace never touched
- `stagingStore.ts` provides staged read/write with fallthrough to live workspace for files not yet staged
- `checkpoint.ts` manages the full staged commit/discard lifecycle with `liveUnchanged` reporting

**Durable Checkpoint + Rollback**
- Checkpoint records a snapshot of each file before first write (original content, byte count, existence flag)
- Diff engine (`diffEngine.ts`) generates line-level patch evidence (lines added/removed)
- Checkpoint status: `pending | applied | discarded`
- Apply promotes staged files atomically into live workspace; discard removes staging safely
- Checkpoint summary persisted in `TaskEvidence.checkpointSummary` — survives server restart

**Runtime-Impact Signaling**
- `runtimeImpactFiles` field in `TaskEvidenceCheckpointSummary`: persisted list of staged files classified as potentially server-affecting (server entry points, config files, env files, etc.)
- Set by `classifyRuntimeImpactFiles` in `checkpoint.ts` at checkpoint creation time — not a runtime heuristic
- `evidenceAssembler.ts` extracts `runtimeImpactFiles` from the `checkpoint` event when assembling `TaskEvidence`
- Used by the HITL recovery endpoint to surface the `recheck_runtime` affordance with grounded evidence

**Verification Ledger + Runtime-Aware Verification Quality**
- `verificationLedger.ts` accumulates evidence entries during task execution
- Evidence entry types: `command_success`, `static_read`, `runtime_probe`
- Verification quality ladder: `none` (no evidence) | `static_only` (file read-backs only) | `command_success` (substantive command succeeded) | `runtime_confirmed` (runtime probe with port/process evidence)
- Quality + proof statement captured in `executionSummary.verificationQuality` and `executionSummary.proofStatement`

**Persistent Observability + Task Replay**
- `TaskEvidence` assembled at completion, persisted to `~/.venomgpt/history.json`
- Evidence bundle: `routeProfile`, `planData`, `checkpointSummary`, `executionSummary`
- `executionSummary` includes: steps used/max, reads/writes/commands used, phase, exit reason, verification quality, proof statement, gate triggers, runtime evidence, sideEffectsObserved, dependencyAnalysis
- `GET /api/agent/tasks/:id/evidence` — raw evidence bundle
- `GET /api/agent/tasks/:id/replay` — sequenced narrative reconstruction from evidence
- Evidence is readable post-server-restart (persisted, not derived from in-memory events)

**Task Lifecycle Maturity**
- Full state machine: `pending → running → done | error | cancelled | interrupted | stalled`
- `done` is the terminal success status (produced by the agent's `done` action completing successfully)
- `interrupted` correctly assigned for tasks in flight at server restart
- `stalled` for tasks that exhaust their step budget without `done`
- `cancelled` for tasks explicitly cancelled via AbortController
- Failure details (title, detail, step, category) persisted with task; surfaced in UI failure card
- Failure categories: `model | tool | command | workspace | orchestration | cancelled`

**agentLoop Decomposition Pass 1**
- `evidenceAssembler.ts` extracted: assembles and persists `TaskEvidence` at completion
- `actionExecutor.ts` extracted: dispatches individual actions within the loop

**Route Boundary Extraction (Backend Closeout Pass)**
- `routes/agentContinuation.ts` (871 lines): continuation and recovery route module extracted from `agent.ts` — contains `recovery-options`, `retry-verify`, `continue-partial`, `recheck-runtime`
- `routes/agent.ts` reduced from 1905 lines to 993 lines
- Both modules mounted in `routes/index.ts`; route registration behavior unchanged
- TypeScript compiles clean (0 errors) post-extraction

**Automated Test Baseline (Backend Closeout Pass)**
- 31 automated tests pass: `src/tests/health.test.ts` (GET /healthz smoke test), `responseNormalizer.test.ts` (all extraction strategies, conversational detection, action object parsing), `safety.test.ts` (path traversal, absolute path rejection, URL-encoded traversal, shell command blocking)
- Run via `pnpm run test` from `artifacts/api-server`
- This is the confirmed regression protection baseline; deeper integration test coverage remains open

**Bounded Semi-Parallel Read Burst**
- `readBurstExecutor.ts`: accepts `filesToRead` from the planning phase and dispatches all reads concurrently via `Promise.all`
- Eligibility guard: `planningPhase === true`, `filesToRead.length > 0`, pre-execution (no reads have occurred yet in this run — `state.filesRead.size === 0`)
- Individual read errors are isolated — one failed read does not abort the burst
- Paths capped to profile's `maxFileReads` limit; excess paths silently dropped
- This is a planning-phase semi-parallel optimization — not full parallel dispatch of agent execution steps

**Operator Intervention Endpoints**
- `POST /api/agent/tasks/:id/pause` — sets `paused: true` on the live `RunState`; the agent loop halts at the next safe inter-step boundary and spin-waits
- `POST /api/agent/tasks/:id/resume` — clears `paused` flag; the loop continues
- `POST /api/agent/tasks/:id/proceed-as-partial` — accepted only when `phase === "blocked"`; sets `partialProceed: true` so the loop calls `done` with `final_status: "partial"` at the next boundary
- All three endpoints reject non-running tasks with structured error responses

**InterventionKind in RunState**
- `InterventionKind` union type: `"pause" | "blocked" | "partial_proceed" | null`
- `paused`, `partialProceed`, `interventionKind`, and `blockedContext` fields in `RunState`, initialized in `createRunState`
- `interventionKind` emitted with every `live_phase` WebSocket broadcast for frontend control rendering

**Human-in-the-Loop Recovery (HITL)**
- `GET /api/agent/tasks/:id/recovery-options` — returns a `RecoveryAssessment` for any terminal task
- `outcomeClass` values: `clean_done | partial | blocked | verification_limited | runtime_stale_after_apply | cancelled_with_progress | interrupted_with_progress | step_budget_exhausted | error_no_recovery`
- `whatHappened` and `whatRemains`: plain-language narrative grounded in real persisted evidence
- Three typed `RecoveryAffordance` entries per response:
  - `retry_verification`: available when blocked or step_budget_exhausted with checkpoint evidence and low verification quality
  - `continue_partial`: available when final_status is "partial" and remaining work is described
  - `recheck_runtime`: available when checkpoint is applied and `runtimeImpactFiles` is non-empty
- Each affordance includes an `endpoint`, `available` flag, and `unavailableReason` when not applicable
- Assessment derived from: `task.taskEvidence`, `task.completion`, `task.failureDetail`, live checkpoint store status, and in-memory drain event data for cancelled tasks — no fabrication

**Action-Level Execution Foundation**
- `ActionRecord` canonical model: id, taskId, type, status, timestamps, meta (discriminated union per type), outcome
- `ActionType`: `READ_FILE | WRITE_FILE | EXEC_COMMAND | VERIFY_RESULT | TOOL_ACTION`
- `ActionStatus`: `pending → started → completed | failed | cancelled`
- `ActionStore` singleton: in-memory, keyed by taskId, ordered per task
- Instrumented in: `fileTools.ts`, `stagingStore.ts`, `actionExecutor.ts`, `verificationLedger.ts`
- `GET /api/agent/runs/:taskId/actions` endpoint

**Live Action Streaming via WebSocket**
- `broadcastActionUpdate` in `wsServer.ts` emits `action_updated` events as each ActionRecord transitions state
- `use-websocket.ts` subscribes to `action_updated` and pushes records directly into frontend action state
- 1750ms polling interval removed from `TaskConsole` — replaced entirely by WebSocket push
- Zero-latency action feed; no redundant polling traffic

**Side-Effect Observation**
- `sideEffectsObserved` field in `RunState`: accumulates one `SideEffectEntry` per `run_command` action
- Each entry includes: `command` (the shell command text), `classification` (the `SideEffectClassification` object — class, trust level, reason), `timestamp`
- No explicit success boolean on the entry; success is tracked separately by the action outcome
- Surfaced in `executionSummary.sideEffectsObserved` and consumed by Tool Introspection panel

**Dependency Classification (Parallel Groundwork)**
- `dependencyClassifier.ts` classifies each action step into one of four truthful dependency classes:
  - `strictly_sequential` — depends on prior state; cannot be parallelised
  - `potentially_independent` — first-access read; structurally no prior dependency
  - `verification_gated` — must wait for verification of an unverified write
  - `repair_driven` — direct consequence of a preceding failure
- `DependencyAnalysis` accumulator: per-task counts, `potentiallyIndependentActionIds`, `serialReason`
- `classifyStepDependency` called per action step in the main agentLoop execution path
- `scheduling_truth` events emitted at two points: post-planning (expected shape, `phase: "planning"` + `category`; no counts yet) and post-done (actual observed shape, `phase: "done"` + `counts`, `independentCount`, `serialReason`; full ID list is in persisted `executionSummary.dependencyAnalysis`)
- Classification records what COULD be independent — does not implement parallel dispatch

**Parallel Dispatch Lane (Phase 1)**
- `parallelDispatcher.ts`: bounded parallel dispatch lane with `parallelEligibilityGate`, `executeWave` for concurrent cohort execution, and `DispatchMode` (`parallel` / `serial_fallback`)
- Join semantics via `joinLanes`: all lanes must reach completion before merge
- Failure isolation per lane: one lane failure triggers policy-controlled abort of dependent sibling lanes; does not unconditionally halt the run
- Cancellation propagation via `AbortController` across lanes
- Scheduling-truth events updated to reflect actual dispatch decisions (not just dependency classification)
- Read burst (`readBurstExecutor.ts`) preserved and distinct — planning-phase concurrent read optimization only

**Checkpoint-Aware Continuation Chains (Phase 2)**
- `continuationChain.ts`: continuation chain model linking each resumed run to its origin checkpoint and full ancestry
- `POST /agent/tasks/:taskId/resume-from-checkpoint`: structured resume endpoint, distinct from retry-from-start
- `buildWhatRemains`: grounded remaining-work model derived from original plan vs. confirmed-complete action history (avoids narrative heuristics)
- `validateCheckpointForResume`: enforces invalidation rules (`checkpoint_applied_overwritten`, `checkpoint_discarded`, etc.)
- Continuation lineage (`ancestryDepth`, origin checkpoint ID) surfaced in `GET /api/agent/tasks/:id/evidence` and `GET /api/agent/tasks/:id/replay`

**Operator Steering + Approval Workflow Lifecycle (Phase 3)**
- Approval gate model: `POST /agent/tasks/:taskId/register-gate` registers operator sign-off points, optionally scoped to specific `laneIds`
- Full approval lifecycle endpoints: `/approve`, `/deny`, `/approve-selective`
- New run lifecycle phases: `awaiting_approval` (halted at gate), `selectively_blocked` (partial approval; some lanes held), `approval_denied` (gate explicitly denied; run halted), `operator_overridden` (step substituted or skipped by operator)
- Lane-level steering: `validateLaneSteering` ensures pause/cancel signals are safe for a specific lane; `validateSelectiveSafety` prevents dangling dependencies in selective approvals
- Recovery affordances: `resubmit_after_denial` (resubmit after gate denial), `view_approval_checkpoint` (inspect evidence assembled at gate)

**Verification-Orchestrated Execution (Phase 4)**
- Verification plan per lane: each concurrent lane carries its own verification requirements as a first-class participant in the execution graph
- Post-merge verification: a merge event triggers a structured verification pass on the combined output
- Runtime-aware rechecks: verification re-triggered by state changes (file applied, command run, lane merged)
- Checkpoint-aware verification retries: re-verify from a known checkpoint state rather than from scratch
- Confidence shaping: aggregated evidence from multiple verification passes feeds a confidence model
- Failure-to-repair loops: a failed verification triggers a structured repair plan, not a raw error

**Model Adapter + Provider Resolution**
- Z.AI (only active provider): two lanes — PAAS lane (vision + fast chat models) and Anthropic-compat lane (agentic/coding models)
- Replit AI integration key (AI_INTEGRATIONS_OPENAI_API_KEY): passive emergency fallback only — NOT an active provider, not shown in UI, no Anthropic lane, no vision. Correct action when ZAI_API_KEY is absent is to set ZAI_API_KEY, not rely on this path.
- Model errors categorized: `missing_api_key | invalid_api_key | model_not_found | base_url_error | network_error | rate_limit | context_length | unexpected_response | unknown`
- `GET /api/agent/capabilities` — honest capability descriptor, no hardcoded values

**Response Normalization**
- `responseNormalizer.ts` extracts JSON from model responses using 3 strategies: `json_block`, `first_object`, `json_repaired`
- `json_repaired`: strips trailing commas, JS comments, BOM before parsing
- Parse failures on attempts 1–2 emit quiet status events; only final failure shows error card

**Task Persistence**
- `taskPersistence.ts` saves/loads `~/.venomgpt/history.json` (default 100 tasks; configurable to 25/50/100/200 via settings)
- Migrates legacy `~/.devmind` on first run
- Frontend hydrates events on historical task click via `GET /api/agent/tasks/:id/events`

**Safety**
- All file ops scoped to `WORKSPACE_ROOT` via `path.resolve` + prefix checks
- Absolute paths from clients explicitly rejected
- URL-encoded traversal decoded and re-checked
- Windows backslash traversal normalized and checked
- ~15 shell command regex patterns block dangerous commands
- All commands run with workspace root as `cwd`

**Multimodal (Visual Analysis Pipeline)**
- 5-type intent classification: `describe | report | fix | improve | analyze`
- Two-phase: vision model (PAAS lane) → text analysis → coding agent (Anthropic-compat lane)
- Vision capability honest reporting (`isVisionCapable()`)
- Explicit stop on vision failure: no silent text-only fallback
- `visionStatus` metadata: `"success" | "degraded" | "unavailable"`
- Image intake: up to 5 images, 4 MB each, JPEG compression (max 1280px, 85% quality)

---

### Frontend / Product

**Layout**
- 2-panel flex layout: `TaskConsole` (300px) + `CodeEditor` (flex:1)
- `TaskConsole` collapses to 48px icon rail via smooth width transition
- `FileExplorerPanel` is a right-side panel (`fixed right-0`, 340px) with toggle (open by default, `explorerOpen: true`)
- `TaskHistory` is a right-side panel triggered from the `+` menu in TopBar
- `TopBar`: file tabs, connection status, explorer toggle, `+` menu

**Transcript Console**
- Transcript-first rendering: stage-aware thought items with colored badges (PLANNING / INSPECTING / EDITING / VERIFYING / REPAIRING / WRAPPING UP)
- Compact file-read grouping (3+ consecutive reads → collapsible group)
- Structured plan card, route label, failure card with category badge
- `TaskSummaryCard` after completion: elapsed time, step count, changed files, checkpoint actions, action tallies

**Action-Aware Transcript**
- WebSocket action streaming (`action_updated` events, no polling)
- `actionSelectors.ts` derives `ActionGroup` structures from raw `ActionRecord[]`
- `ActionGroupRow`: single item shows verb + path + exit code; multiple shows count label + expandable list
- Action tallies in summary: reads, writes, commands, verifications

**Replay / Evidence UI (Inspect Tab)**
- `evidence-panel.tsx` accessible via "Inspect" tab in `TaskConsole`
- Sections: Route Profile, Plan, Checkpoint Summary, Execution Summary, Action Records
- Action type filter chips and text search (both reset on task switch)
- Phase-grouped action sections via `assignActionsToWindows`
- Click-to-expand drill-down per action record
- Available for **completed / historical tasks only** — Inspect tab is disabled for active/live runs
- `canInspect = !isLive && !!viewingTaskId && (status === null || TERMINAL_STATUSES.has(status))` — status-based gate, not evidence-presence-based
- When a live task is selected, EvidencePanel shows "Task still running — inspect available after completion"
- Honest absent-data placeholders throughout — no silent empty states

**Tool Introspection Panel**
- `tool-introspection-panel.tsx` embedded as a section in EvidencePanel
- Per-action-type stat cards (READ_FILE, WRITE_FILE, EXEC_COMMAND, VERIFY_RESULT, TOOL_ACTION): count, success count, failure count, success rate
- Command class distribution chips from `sideEffectClass` on EXEC_COMMAND records
- Execution shape badge: structural descriptor derived from action mix
- No new backend routes — derived entirely from existing `ActionRecord[]`

**Per-file Apply/Discard, Staging Badges, Checkpoint History, Per-file Diff View (P3)**
- `POST /api/agent/tasks/:taskId/apply-file` — promotes a single staged file to the live workspace
- `POST /api/agent/tasks/:taskId/discard-file` — removes a single file from the staging directory
- Per-file apply/discard buttons in the Output panel; visible only when `task.status !== "running"`; re-fetches staged file list from `/checkpoint` on success
- `GET /api/agent/tasks/:taskId/checkpoint-history` — ordered list of checkpoint events per task (stored in-memory; survives within the 300-event cap; not persisted across server restart)
- Staging state badges: `runtimeImpactFiles` callout, staged-file badge count, and `liveUnchanged` flag surfaced in Output panel
- Per-file inline unified diff view: clicking a staged file row expands a diff viewer; `+{linesAdded}` / `-{linesRemoved}` line count badges shown per file; diff data in `FileSnapshot.diff` (populated by `patchSnapshotWithDiff()` in `checkpoint.ts`); `hasDiff` guard prevents display when diff content is absent

**Runtime Lifecycle Depth (P4)**
- `RuntimeEnvMeta` type: Node.js version, process count, relevant env var key names (names only — never values)
- `RuntimeSnapshot.envMeta`: optional env metadata on every snapshot
- `ProcessLinkageEntry`: port → command linkage derived from `verificationLedger` runtime probe entries
- `RuntimeLifecycleRecord`: full lifecycle artifact — taskStart snapshot, postApply snapshot, portDiff, processLinkage, and `isStaleAfterApply` signal
- `captureEnhancedSnapshot()`: port probe + env metadata captured in parallel; never throws; failures are `logger.debug`-only
- `buildRuntimeLifecycleRecord()`: combines snapshots, `runtimeImpactFiles`, and probe entries into a `RuntimeLifecycleRecord`
- Task-start snapshot captured immediately after `createRunState()` in `agentLoop.ts` (fire-and-forget; stored on `runState.taskStartRuntimeSnapshot`)
- Post-apply snapshot captured asynchronously after `applyCheckpoint()` in `routes/checkpoint.ts`; lifecycle record built and merged into `TaskEvidence` via `setTaskEvidence()` (non-blocking)
- Proactive stale-runtime detection: `isStaleAfterApply = true` when `runtimeImpactFiles.length > 0` AND `portDiff.hasChange === false`; `null` when either snapshot is missing (honest absent-data; no heuristic fallback)
- `runtime_stale_after_apply` outcome class in HITL recovery: set only when `isStaleAfterApply === true` (concrete evidence); enriched with port diff context when available
- `TaskEvidence.runtimeLifecycle` field: `TaskEvidenceRuntimeLifecycle` interface; persisted in `history.json` via `persistTaskNow()`; survives server restart
- Runtime Lifecycle section in Evidence Panel (`RuntimeSnapshotRow` + `RuntimeLifecycleBlock`): renders task-start and post-apply snapshots, port diff, stale signal, and process linkage entries; uses purple accent (`border-l-purple-500/50`); honest absent-data degradation throughout

**Premium Orchestration UI Surface (Pass 4)**
- `OrchestrationBlock` component in Evidence Panel: renders lane dispatch mode (parallel / serial_fallback), lane count, per-lane status (success / failed / cancelled), and any failure isolation events from `TaskEvidence`
- Continuation lineage view in Evidence Panel: renders the ancestry chain as a linear list with depth badge and origin checkpoint ID; pulls `ancestryDepth` and origin checkpoint ID from evidence replay endpoint
- `ApprovalGateCard` in TaskConsole: rendered when `livePhase.phase === "awaiting_approval"`; three wired actions — Approve all, Deny, Approve selective (with lane selection); includes `checkpointId` field sourced from `APPROVAL_CHECKPOINT` event type
- `SelectivelyBlockedLaneGrid`: compact lane status grid rendered when phase is `selectively_blocked`; lane state pulled from `live_phase` WebSocket events
- `ProviderDiagnosticsPanel`: accessible from settings page and integrations page; wired to `GET /provider-diagnostics`; shows provider name, model, lane count, and any startup diagnostic warnings
- Runtime status bar wired to live data from `GET /runtime/status` (confirmed, not re-implemented)

**Product Polish (Pass 5)**
- Settings page: loads current values from `GET /settings` on mount; saves via `PATCH /settings` with success/error toast feedback using `toast` from `@/hooks/use-toast`; "Reset to defaults" calls `POST /settings/reset` with confirmation dialog; "Clear task history" calls `DELETE /settings/history` with confirmation dialog
- Task history UX: search input in history drawer filters tasks by prompt text (client-side); status filter chips (done, error, cancelled, interrupted) narrow the list; match count shown when filter is active; bulk-delete deferred (no per-task delete endpoint confirmed via settings route inspection — only full-history wipe available)
- Board kanban: status-change buttons wired via `updateBoardTaskStatus` (button-based, no drag-and-drop); plan association badges shown on each board card pulled from `GET /board/plans`
- Workspace composer prompt suggestions: up to 3 suggestions from `GET /board/prompts` appear as clickable chips when composer is idle and no task is active; clicking fills the composer input
- Integrations page `ProviderDiagnosticsPanel`: replaces placeholder content; shows Z.A.I provider status, model, lanes, and connection health from `GET /provider-diagnostics`

**API Base URL Audit (Pass 6)**
- 33 root-relative `fetch('/api/…')` calls fixed across 12 frontend files
- Pattern: `const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? ''` — prepended to every `/api/` path
- Files: `apps.tsx`, `evidence-panel.tsx`, `task-console.tsx`, `integrations.tsx`, `home-screen.tsx`, and 7 others
- No silent fallbacks; no backend changes

**Projects / Workspace Manager (Pass 7)**
- `apps.tsx` — "Coming Soon" banner replaced with a live project management UI
- `useListProjects()`: drives the project grid with loading, error, and empty states
- `CreateProjectForm`: wired to `useCreateProject()` with inline `invalid_name` / `already_exists` error mapping; invalidates `getListProjectsQueryKey()` on success
- `useSelectProject()`: post-select invalidation of `getGetWorkspaceQueryKey()` + `getListFilesQueryKey()`; confirmed pattern from home-screen.tsx
- Active indicator: sourced from `useGetWorkspace()` → `data?.root` vs `project.path` (no optimistic switching)
- `DescriptionEditor`: inline PATCH via raw fetch; save on Enter, cancel on Escape
- `DeleteDialog`: modal confirmation; `409 active_project` → user-readable message; `404` → success (list refresh)
- No backend changes; no drag-and-drop; no invented hooks

**Remaining Orchestration Surfaces (Pass 8)**
- `OrchestrationBlock` (`evidence-panel.tsx`): expandable per-lane contribution summary; accepts `actions?: ActionRecord[]`; `expandedLanes` state + `toggleLane()`; WRITE_FILE + EXEC_COMMAND shown per lane; READ_FILE excluded; serial fallback lanes labeled "Serial"
- Scheduling analysis deeplink (`task-console.tsx`): `useTaskEvidence(viewingTaskId)` read directly; `hasDependencyAnalysis` from `linkEvidenceData?.taskEvidence?.executionSummary?.dependencyAnalysis`; "View scheduling analysis →" link in Transcript tab; clicking `setActiveTab('inspect')`

**Action ID Cross-Reference in DependencyGraphBlock (Pass 9A)**
- `DependencyGraphBlock` (`evidence-panel.tsx`): `potentiallyIndependentActionIds` UUID chip list replaced with cross-referenced readable rows
- `depActionLabel()` helper at line 1360: resolves `type` + `meta.filePath` (READ_FILE/WRITE_FILE) or `meta.command` (EXEC_COMMAND) from each `ActionRecord`
- `actionMap` built with `useMemo` from `actions?: ActionRecord[]` prop — ID → ActionRecord; no new fetch
- Fallback: unresolved IDs (older tasks, ID mismatch) shown as dim UUID chip with "unresolved" label; no crash
- Minimal threading: `actions?: ActionRecord[]` added to `DependencyGraphBlock` props; passed as `actionsData?.actions ?? []` from call site (line 2554–2558)
- Confirmed not implemented (data absent): per-step classification rows, per-step reasoning strings — `DependencyAnalysis` has aggregate counts only
- Confirmed deferred: replay at orchestration scale — backend lane-timeline endpoint does not exist; formally a backend-first spike

**WebSocket Streaming**
- All agent events stream live via WebSocket
- `status`, `thought`, `file_read`, `file_write`, `command`, `command_output`, `error`, `done` event types
- `route`, `plan`, `checkpoint`, `execution_summary`, `scheduling_truth` structured event types
- `action_updated` events for live action feed (replaces polling)
- Events capped at 300 per task in session manager

---

## Partially Validated

| Area | Status |
|---|---|
| Action data persistence | In-memory only; survives the process but not restart. Evidence summary is persisted; full record list is not. |
| `verificationLedger` evidence quality | Quality categorization works; edge cases in `runtime_probe` classification may need review |
| Dependency classification accuracy | Classification logic is confirmed instrumented and emitting; full accuracy across all edge cases not exhaustively tested |
| HITL Recovery affordance accuracy | `buildRecoveryAssessment` logic is confirmed instrumented; affordance edge cases (e.g., cancelled drain data availability) may need review under low-event-cap conditions |
| Runtime lifecycle snapshot availability | Task-start snapshot capture is fire-and-forget; in environments where the port probe or `ps aux` fails, `taskStartRuntimeSnapshot` will be absent and `isStaleAfterApply` will remain `null` — honest absent-data handling is confirmed; exhaustive coverage of all failure scenarios not tested |

---

## Still Open

| Area | Notes |
|---|---|
| Premium workspace orchestration surface (remaining) | Lane-level evidence, continuation lineage, approval gate UI, and provider diagnostics are now done (Pass 4); remaining: dependency graph view, scheduler reasoning surface, replay at orchestration scale |
| Advanced action filtering / search in transcript | No filtering UI in transcript tab; infrastructure exists in actionSelectors; EvidencePanel (Inspect tab) already has filter chips and text search |

---

## Intentionally Deferred

| Area | Reason |
|---|---|
| `summaryEmitter` extraction from agentLoop | Touches messages thread — higher risk; deferred pending stability review |
| Checkpoint duplication consolidation | Safe but low incremental leverage at current size |
| `visualPipeline` extraction | Touches while-loop skeleton; deferred pending risk assessment |
| Broader platform / ecosystem expansion | Longer horizon; not a near-term priority |

---

## Maturity Judgment

**Backend orchestration / execution trust / lifecycle:** ~97–98% of serious Replit-style maturity.

This judgment is **backend-wise only**. It does not imply:
- Full Replit product parity
- Full premium product / orchestration UI surface (the next maturity arc)
- Full UI/UX parity with Replit's task console
- Full platform or ecosystem breadth

All four orchestration phases (parallel dispatch, continuation chains, operator steering / approval workflows, verification-orchestrated execution) are confirmed complete. P3 (per-file apply/discard, staging badges, checkpoint history, per-file diff view) and P4 (runtime lifecycle depth — task-start/post-apply snapshots, proactive stale detection, process linkage, Evidence Panel section) are confirmed complete. VenomGPT is no longer an early MVP. The backend trust foundation is real and production-grade for the scope implemented. The evidence/inspection UI is rich and honest. The next maturity arc is the premium workspace orchestration surface — exposing the full orchestration capability cleanly in the product UI.
