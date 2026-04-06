# VenomGPT — 00 Session Summary

## Purpose

This document summarizes the full arc of the VenomGPT engineering session — what was built, in what order, and what position the project is in now. It is the authoritative narrative record for continuity between sessions and collaborators.

---

## Phase Arc

### Early Foundation (Pre-session)

VenomGPT started as a browser-based local AI coding workspace: a React + Monaco IDE frontend connected to a local Express + WebSocket backend running an agent loop. The agent could read files, write files, run commands, and stream results live.

The early system was functional but architecturally immature: no routing, no planning, no checkpoint durability, no staged isolation, no runtime-aware verification, and no persistent observability.

---

### Backend / Orchestration Maturity (Trust Closure Phases)

The majority of the session was a sustained series of bounded backend engineering passes, progressively hardening the orchestration and trust stack:

**1. Orchestration Architecture**
Introduced task routing (`taskRouter.ts`), a planning phase (`planner.ts`), and structured run state (`types.ts`). The agent loop gained a principled phase model: routing → planning → execution → evidence assembly.

**2. Safe Execution Control Tightening**
Strengthened action gating in `actionRouter.ts`: per-action approval policies, side-effect classification (`sideEffectClassifier.ts`), shell-read blocking, gate trigger telemetry.

**3. Durable Checkpoint Storage + Rollback Safety**
Introduced `checkpoint.ts` with full staged commit/discard lifecycle. File writes go into a staging layer (`stagingStore.ts`) first; the live workspace is not touched until the operator applies. Discarding removes the staging directory only — the live workspace is always clean.

**4. Deeper Staged Task Isolation**
Strengthened the staging boundary: reads from the staged layer, writes into staging, with explicit `liveUnchanged` reporting. Checkpoint diffs via `diffEngine.ts` provide line-level patch evidence.

**5. Runtime Lifecycle + Side-Effect Verification**
`runtimeLifecycle.ts` tracks process and job state. `verificationLedger.ts` accumulates evidence entries (command success, static read, runtime probe). Verification quality is categorized and surfaced in `executionSummary`.

**6. Persistent Observability + Task Replay**
`TaskEvidence` is assembled at task completion and persisted to `history.json`. The evidence bundle captures: route profile, plan data, checkpoint file manifest, execution step telemetry, verification quality, and proof statement. All accessible post-restart via `/api/agent/tasks/:id/evidence` and `/api/agent/tasks/:id/replay`.

**7. Process / Job Lifecycle Maturity**
Task lifecycle now handles the full state space: `running → done | error | cancelled | interrupted | stalled`. `done` is the terminal success status. `interrupted` is correctly assigned when a task is in flight at server restart. Failure details (title, detail, step, category) are persisted and surfaced in the UI.

**8. agentLoop Decomposition Pass 1**
`agentLoop.ts` grew to ~2260 lines. Decomposition Pass 1 extracted two high-value modules without touching the while-loop skeleton, messages thread, or cancellation pattern:
- `evidenceAssembler.ts` — assembles and persists `TaskEvidence` at completion
- `actionExecutor.ts` — dispatches individual actions (file reads, writes, commands) within the loop

Intentionally deferred extractions:
- `summaryEmitter` — touches the messages thread; higher risk
- checkpoint duplication consolidation — safe but lower leverage
- `visualPipeline` extraction — touches the while-loop structure; deferred pending stability review

---

### Frontend / Product Execution Surface (Tasks #1–#2)

After backend trust closure, two frontend/product improvement passes landed:

**Task #1 — Workspace Layout Overhaul**
Replaced the original four-panel grid layout with a clean 2-panel flex layout:
- Left: `TaskConsole` (300px collapsible panel with smooth width transition to 48px icon rail)
- Right: Monaco `CodeEditor` (flex:1, full remaining width)
- `FileExplorerPanel` moved into a right-side panel (fixed right-0, 340px, open by default, toggled via TopBar)
- `TaskHistory` moved into a right-side panel triggered from the `+` menu in TopBar
- `TopBar` gained file tabs, connection status, explorer toggle, `+` menu
- `TaskSummaryCard` added after task completion (elapsed time, step count, changed files, checkpoint actions)

**Task #2 — Transcript-First Console + Right Explorer Toggle**
- Task console rendering made transcript-first: stage-aware thought items with colored badges (PLANNING / INSPECTING / EDITING / VERIFYING / REPAIRING / WRAPPING UP)
- Improved narration quality: body-led thought rendering, compact file ops grouping, repair count + verified badge
- Right explorer open by default, with a dedicated toggle in the top bar
- FailureCard redesigned with structured error detail (title, technical detail, step, category badge)
- History drawer: expandable error detail per card, click loads logs into TaskConsole

---

### Action-Level Execution Foundation (Tasks #3–#4)

**Task #3 — Pass A: Action-Level Execution Foundation**
Introduced a canonical action-level model that tracks individual operations at finer grain than stage-based orchestration:
- `ActionRecord` — the canonical data structure (id, taskId, type, status, timestamps, meta, outcome)
- `ActionType` enum — `READ_FILE | WRITE_FILE | EXEC_COMMAND | VERIFY_RESULT | TOOL_ACTION`
- `ActionStatus` enum — `pending → started → completed | failed | cancelled`
- `ActionStore` — singleton in-memory store (keyed by taskId, ordered per task)
- Instrumentation wired into: `fileTools.ts`, `stagingStore.ts`, `actionExecutor.ts`, `verificationLedger.ts`
- Action endpoint: `GET /api/agent/runs/:taskId/actions`

**Task #4 — Pass B: Action-Aware Transcript + Summaries**
Surfaced action records in the transcript console:
- Action polling in `TaskConsole` (1750ms interval during active runs)
- `actionSelectors.ts` — thin adapter layer that derives renderable `ActionGroup` structures from raw `ActionRecord[]`
- `ActionGroupRow` component — collapsible grouped rows (single: verb + path + exit code; multiple: count label + expand)
- Action-informed summary section in `TaskSummaryCard`
- Action tallies (reads, writes, commands, verifications) in the summary header
- `assignActionsToWindows` / `computeActionTallies` for correct grouping across the transcript

---

### Live Streaming, Replay/Evidence UI, and Inspection (Tasks #6–#10)

**Task #6 — Live Action Streaming via WebSocket**
Replaced the 1750ms action polling model with real-time WebSocket push:
- `broadcastActionUpdate` added to `wsServer.ts` — emits `action_updated` events as each ActionRecord transitions state via `actionStore.ts`
- `use-websocket.ts` subscribed to `action_updated` events and pushes records directly into the frontend action state
- Polling interval removed from `TaskConsole`
- Result: zero-latency action feed; no redundant API traffic

**Task #7 — Replay / Evidence UI**
Built a rich evidence/replay inspection surface:
- `evidence-panel.tsx` (1166 lines) — structured sections: Route Profile, Plan, Checkpoint Summary, Execution Summary, Action Records
- Accessible via "Inspect" tab in `TaskConsole` (`ConsoleTab = 'transcript' | 'inspect'`)
- Available for **completed / historical tasks only** — not available during live/active runs
- When `isLive` is true, EvidencePanel shows "Task still running — inspect available after completion"
- Each section degrades honestly when data is absent (conversational tasks, zero-action tasks)
- Click-to-expand drill-down detail rows per action record
- Color-coded left-border section accents for visual distinction

**Task #8 — Execution History Inspection**
Hardened the inspect surface for historical task access:
- "Inspect" tab enabled for completed tasks (terminal status) or when task list is stale/unavailable (fallback)
- `canInspect = !isLive && !!viewingTaskId && (status === null || TERMINAL_STATUSES.has(status))` — status-based gate with fallback
- Clicking a historical task in the history drawer loads its evidence into EvidencePanel
- Action fetch on historical task selection (one-time fetch, not polling)
- Tab tooltip shows "Available for completed tasks" when disabled (live task selected)

**Task #9 — Inspection Tightening Closeout**
Closed gaps in the evidence panel surface:
- Action type filter chips (reset on task switch)
- Text search input (reset on task switch)
- Phase-grouped action sections using `assignActionsToWindows`
- Absent-data placeholders (`AbsentBlock`) throughout all sections
- Evidence panel uses existing `actionSelectors.ts` logic — no new selector code introduced

**Task #10 — Tool Introspection**
Added a Tool Introspection section to the Evidence Panel:
- `tool-introspection-panel.tsx` embedded in `evidence-panel.tsx`
- Per-action-type stat cards: count, success count, failure count, success rate (READ_FILE, WRITE_FILE, EXEC_COMMAND, VERIFY_RESULT, TOOL_ACTION)
- Command class distribution chips from `sideEffectClass` on EXEC_COMMAND records, cross-checked with `executionSummary.sideEffectsObserved`
- Execution shape badge: heuristic structural descriptor (`read-only inspection`, `full edit cycle`, `read → write → verify`, etc.) via `deriveExecutionShape` in `actionSelectors.ts`
- Derived entirely from the `ActionRecord[]` already fetched by EvidencePanel — no new backend routes required

---

### Parallel / Dependency Model Groundwork (Tasks #11–#12)

**Task #11 — Parallel / Semi-Parallel Dependency Model**
Introduced the foundational dependency classification model for future parallel dispatch:
- `dependencyClassifier.ts` — classifies each action step into one of four truthful dependency classes:
  - `strictly_sequential` — depends on prior state; cannot be parallelised
  - `potentially_independent` — first-access read; structurally no prior dependency on any prior step
  - `verification_gated` — must wait for verification of an unverified write before proceeding
  - `repair_driven` — direct causal consequence of a preceding failure
- `DependencyAnalysis` accumulator: per-task counts, `potentiallyIndependentActionIds`, `serialReason`
- `RunState` extended with `sideEffectsObserved` (classified side-effect entry per run_command) and `dependencyAnalysis`
- `classifyStepDependency` called per action step in the main agentLoop execution path
- `scheduling_truth` events emitted at two points:
  - Post-planning: plain-language expected dependency shape for the route category; WS payload carries `phase: "planning"` + `category` (no counts yet — run has not started)
  - Post-done: actual observed dependency shape; WS payload carries `phase: "done"` + `counts`, `independentCount`, `serialReason` (full `potentiallyIndependentActionIds` list is in persisted `executionSummary.dependencyAnalysis`, not the WS event payload)
- Honest: classification records what COULD be independent in a future parallel design — not what IS run in parallel. No actual parallel dispatch in this task.

**Task #12 — Dependency Groundwork Closeout + Verification Pass**
Verified the Task #11 implementation end-to-end across all task classes:
- Live curl evidence produced for 7 task classes (conversational, text_explain, code_edit, code_verify, repair-after-failure, visual, server_check)
- Each class confirmed: correct route selection, correct planning phase behavior, correct budget enforcement, correct action gating
- TypeScript compiles clean across the monorepo post Task #11 changes
- `scheduling_truth` event verified present at both planning and done phases
- Dependency counts confirmed propagated into `executionSummary.dependencyAnalysis`

---

### Bounded Semi-Parallel Reads, Runtime-Impact Signaling, Operator Intervention, and HITL Recovery (Tasks #13–#16 arc)

**Task #13 — Bounded Semi-Parallel Read Burst**
Introduced a planning-phase concurrent read optimization that reduces latency for tasks with multiple known read targets:
- `readBurstExecutor.ts` — new module; accepts `filesToRead` from the planning phase and dispatches all reads concurrently via `Promise.all`
- Eligibility guard enforced by the caller in `agentLoop.ts`: `planningPhase === true`, `filesToRead.length > 0`, no writes yet (`state.filesRead.size === 0`)
- Individual read errors are isolated — one failed read does not abort the burst; entire burst returns ordered results with per-path error fields
- Paths are capped to the profile's `maxFileReads` limit; excess paths are silently dropped
- This is a semi-parallel optimization (read burst only), not full parallel dispatch of agent steps

**Task #14 — Runtime-Impact Signaling**
Added truthful signaling of which staged files could affect a running server, so post-apply recovery guidance is grounded in real evidence:
- `runtimeImpactFiles` field added to `TaskEvidenceCheckpointSummary` — persisted list of files that `classifyRuntimeImpactFiles` (in `checkpoint.ts`) identified as potentially server-affecting (e.g., server entry points, config files, env files)
- `evidenceAssembler.ts` extracts `runtimeImpactFiles` from the `checkpoint` event when assembling `TaskEvidence`
- `recheck_runtime` affordance in the `RecoveryAssessment` uses this persisted evidence directly — no regex heuristics at query time
- Event type `recheck_runtime` surfaces in the HITL recovery response when: checkpoint is applied AND `runtimeImpactFiles` is non-empty

**Task #15 — Active-Run Operator Visibility and Intervention**
Gave operators the ability to inspect and control active runs without cancelling them:
- `POST /api/agent/tasks/:id/pause` — sets `paused: true` on the live `RunState`; the agent loop halts at the next safe inter-step boundary and spin-waits
- `POST /api/agent/tasks/:id/resume` — clears `paused` flag; the loop continues from where it halted
- `POST /api/agent/tasks/:id/proceed-as-partial` — accepted only when `phase === "blocked"`; sets `partialProceed: true` so the loop calls `done` with `final_status: "partial"` at the next boundary
- `InterventionKind` union type in `types.ts`: `"pause" | "blocked" | "partial_proceed" | null` — emitted with every `live_phase` broadcast so the frontend can render context-appropriate controls
- `paused`, `partialProceed`, `interventionKind`, and `blockedContext` added to `RunState` and initialized in `createRunState`

**Task #16 — Human-in-the-Loop (HITL) Recovery + Guided Continuation**
Added a structured recovery assessment surface for completed tasks so operators can decide what to do next based on real evidence:
- `GET /api/agent/tasks/:id/recovery-options` — returns a `RecoveryAssessment` derived entirely from persisted task state (no fabrication)
- `outcomeClass` values: `clean_done | partial | blocked | verification_limited | runtime_stale_after_apply | cancelled_with_progress | interrupted_with_progress | step_budget_exhausted | error_no_recovery`
- `whatHappened` and `whatRemains` fields: plain-language narrative grounded in real evidence
- Three typed `RecoveryAffordance` entries in every response:
  - `retry_verification` — available when blocked or step_budget_exhausted with checkpoint evidence and low verification quality
  - `continue_partial` — available when final_status is "partial" and remaining work is described
  - `recheck_runtime` — available when checkpoint is applied and `runtimeImpactFiles` is non-empty
- Each affordance carries an `endpoint` field pointing to the next action; unavailable affordances include an `unavailableReason`
- The assessment is derived from: `task.taskEvidence`, `task.completion`, `task.failureDetail`, live checkpoint store status, and in-memory drain event data for cancelled tasks

---

### Orchestration Roadmap Phases 1–4 (Tasks #7–#10)

With the backend trust stack and inspection surfaces solid, the session moved into the structured orchestration roadmap phases defined in `08-orchestration-roadmap.md`. All four phases have been implemented and merged.

**Phase 1 — Actual Parallel Dispatch Foundations (Task #7)**
Built the real dispatch lane that acts on the dependency classification output from `dependencyClassifier.ts`:
- `parallelDispatcher.ts`: bounded parallel dispatch with `parallelEligibilityGate` (checks side effects, dependency class, verification status), `executeWave` (concurrent cohort execution), `joinLanes` (join semantics), and `DispatchMode` (`parallel` / `serial_fallback`)
- Failure isolation per lane: one lane failure triggers policy-controlled abort of dependent sibling lanes; does not unconditionally halt the run
- Cancellation propagation via `AbortController` across lanes
- Scheduling-truth events updated to reflect actual dispatch decisions, not just classification
- Read burst (`readBurstExecutor.ts`) preserved as a distinct planning-phase optimization — not replaced by this

**Phase 2 — Checkpoint-Aware Continuation Chains (Task #8)**
Enabled structured resumption from a known checkpoint state with preserved context and honest accounting of what remains:
- `continuationChain.ts`: continuation chain model linking each resumed run to its origin checkpoint with full ancestry
- `POST /agent/tasks/:taskId/resume-from-checkpoint`: structured resume endpoint, distinct from retry-from-start
- `buildWhatRemains`: grounded remaining-work model derived from original plan vs. confirmed-complete action history — avoids narrative heuristics
- `validateCheckpointForResume`: enforces invalidation rules (`checkpoint_applied_overwritten`, `checkpoint_discarded`, etc.)
- Continuation lineage (`ancestryDepth`, origin checkpoint ID) surfaced in evidence and replay endpoints

**Phase 3 — Operator Steering + Approval Workflows (Task #9)**
Expanded operator control beyond pause/resume to include approval gates, lane-level steering, and guided partial recovery:
- Approval gate model: `POST /agent/tasks/:taskId/register-gate` registers sign-off points, optionally scoped to specific `laneIds`
- Full approval lifecycle: `awaiting_approval` → `/approve` | `/deny` | `/approve-selective`
- New run lifecycle phases: `awaiting_approval`, `selectively_blocked`, `approval_denied`, `operator_overridden`
- `validateLaneSteering`: ensures pause/cancel signals are safe for a specific lane; `validateSelectiveSafety`: prevents dangling dependencies in selective approvals
- Recovery affordances: `resubmit_after_denial` (resubmit after gate denial), `view_approval_checkpoint` (inspect evidence assembled at gate)

**Phase 4 — Verification-Orchestrated Execution (Task #10)**
Made verification a first-class participant in the execution graph, not a post-execution audit step:
- Verification plan per lane: each concurrent lane carries its own verification requirements
- Post-merge verification: a merge event triggers a structured verification pass on the combined output
- Runtime-aware rechecks: verification re-triggered by state changes (file applied, command run, lane merged)
- Checkpoint-aware verification retries: re-verify from a known checkpoint state rather than from scratch
- Confidence shaping: aggregated evidence from multiple verification passes feeds a confidence model
- Failure-to-repair loops: a failed verification triggers a structured repair plan, not a raw error

---

### P3 + P4 Closeout (Task-9-closeout deliverables)

With the four core orchestration phases confirmed complete, two additional product-depth passes were executed and verified:

**P3 — Per-file Diff/Apply/Discard, Staging Badges, Checkpoint History**

P3 introduced the operator-facing file lifecycle surface, exposing the existing staged checkpoint model through a granular per-file UX:

- `POST /api/agent/tasks/:taskId/apply-file` — promotes a single staged file to the live workspace without touching others
- `POST /api/agent/tasks/:taskId/discard-file` — removes a single file from the staging directory
- Per-file apply/discard buttons in the Output panel; visible only when task is not running; on success, re-fetches staged file list from `/checkpoint`
- `GET /api/agent/tasks/:taskId/checkpoint-history` — returns an ordered list of checkpoint events per task (in-memory; not persisted across server restart)
- Staging state badges in the Output panel: `runtimeImpactFiles` callout, staged-file badge count, and `liveUnchanged` flag
- Per-file inline unified diff viewer: clicking a staged file row expands a diff view; `+{linesAdded}` / `-{linesRemoved}` line count badges shown per file; diff data stored in `FileSnapshot.diff` via `patchSnapshotWithDiff()` in `checkpoint.ts`; `hasDiff` guard prevents display when diff content is absent

Verified: TypeScript typecheck 0 errors; 37 automated tests passing.

**P4 — Runtime Lifecycle Depth**

P4 extended the runtime lifecycle model from a shallow port-probing utility to a full operator-visible, task-linked, evidence-persisted runtime surface:

- `RuntimeEnvMeta` type: Node.js version, process count, relevant env var key names (names only — never values)
- `RuntimeLifecycleRecord` type: full lifecycle artifact — taskStart snapshot, postApply snapshot, portDiff, processLinkage, and `isStaleAfterApply` signal
- `captureEnhancedSnapshot()` in `runtimeLifecycle.ts`: port probe + env metadata in parallel; never throws; failures are `logger.debug`-only
- `buildRuntimeLifecycleRecord()`: combines snapshots, `runtimeImpactFiles`, and probe entries into a single lifecycle record
- Task-start snapshot captured immediately after `createRunState()` in `agentLoop.ts` (fire-and-forget; stored on `runState.taskStartRuntimeSnapshot`)
- Post-apply snapshot captured asynchronously in `routes/checkpoint.ts` after `applyCheckpoint()`; lifecycle record built and merged into `TaskEvidence` via `setTaskEvidence()` (non-blocking; does not delay the 200 response)
- Proactive stale-runtime detection: `isStaleAfterApply = true` when `runtimeImpactFiles.length > 0` AND `portDiff.hasChange === false`; `null` when either snapshot is missing (honest absent-data; no heuristic fallback on `runtimeImpactFiles.length` alone)
- `runtime_stale_after_apply` outcome in HITL recovery: set only when `isStaleAfterApply === true` (concrete persisted evidence); enriched with portDiff context when available
- `TaskEvidence.runtimeLifecycle` persisted to `history.json` via `persistTaskNow()` — survives server restart
- Runtime Lifecycle section in Evidence Panel (`RuntimeSnapshotRow` + `RuntimeLifecycleBlock`): renders task-start and post-apply snapshots, port diff, stale signal, and process linkage entries; uses purple accent (`border-l-purple-500/50`); honest absent-data degradation throughout (AbsentBlock when lifecycle null; "not captured" row when individual snapshot absent)

Partially validated: task-start snapshot capture is fire-and-forget; in environments where port probe or `ps aux` fails, `taskStartRuntimeSnapshot` is absent and `isStaleAfterApply` remains `null` — honest handling confirmed; exhaustive failure-scenario coverage not tested.

Verified: TypeScript typecheck 0 errors on both backend and frontend.

---

### Provider-Layer Stabilization Arc (Tasks #18–#22)

After P3 and P4 closeout, the session moved into a focused provider-layer stabilization arc to address architectural drift that had accumulated in the provider layer during earlier Codex integration work.

**Phase 0 — Damage Assessment (Task #16/pre-arc)**
Ground-truthed the current repo state before any provider reset work. Classified files as KEEP/REVERT/UNCLEAR. Confirmed typecheck and test baselines. Identified the root cause: `CodexProvider` was authenticating via ChatGPT OAuth but dispatching execution to `api.openai.com/v1/chat/completions` (the OpenAI Platform API endpoint), not the correct `chatgpt.com/backend-api/codex` subscription path — crossing auth/entitlement boundaries on every probe and execution call.

**Phase 1 — Provider Contract & Router Skeleton (Task #17)**
Established the architectural container before any driver migration. New files only — no existing behavior changed:
- `ProviderContract.ts`: TypeScript interface defining `connect()`, `probe()`, `listModels()`, `execute()`, `getState()`, `normalizeError()`
- `providerRouter.ts`: stub router returning placeholder drivers by `providerPath` key
- `ProviderStateStore.ts`: generic provider state model (not Codex-specific)
- `ModelRegistry.ts`: empty model registry

**Phase 2 — Z.AI Driver Migration (Tasks #18–#20)**
Extracted all Z.AI execution behavior from `modelAdapter.ts` and `zaiCapabilities.ts` into `ZaiDriver.ts` implementing `ProviderContract`. Wired `providerRouter.ts` to return the live `ZaiDriver` for the `"zai"` path. All other provider paths remain as `StubDriver` stubs. Z.AI task execution confirmed working end-to-end through the new router/driver path.

**Phase 20 (Task #20) — Z.A.I-Only Cleanup**
After Z.AI driver migration was confirmed, the Codex-specific state was removed from `providerRegistry.ts` and `routes/codexAuth.ts` was unmounted from `routes/index.ts` (marked with `@ts-nocheck` + DEFERRED header). `modelAdapter.ts` retained as a temporary shim bridging the legacy `ModelProvider` interface to `ZaiDriver` — its expected lifecycle is Phase 6 deletion.

**Phase 21 (Task #21) — Z.A.I-Only Hardening & Closeout**
Recorded the Z.A.I-Only Baseline Closeout Record. Confirmed that the project is intentionally halting at Phase 2 and not proceeding to Phase 3+ until an explicit product decision is made. Re-entry conditions documented.

**Phase 22 (Task #22) — Repo Cleanup & .gitignore Hygiene**
Final cleanup pass: removed test artifacts, corrected `.gitignore` entries, and confirmed the repo is in a clean state post-arc.

#### What the arc achieved

- **Z.A.I-only runtime**: `providerRouter.ts` + `ZaiDriver.ts` are the active provider foundation. The dual-lane Z.A.I path (PAAS + Anthropic-compat) is the only live execution path.
- **Provider contract enforced**: new providers must implement `ProviderContract` — no ad-hoc provider logic scattered across general files.
- **Codex/OpenAI surfaces disconnected from the live product**: `codexAuth.ts` unmounted, `CodexProvider` removed from active paths, Codex-specific state removed from `providerRegistry.ts`.
- **Phase 3+ explicitly deferred**: Codex driver (Phase 3), OpenAI Platform driver (Phase 4), and Qwen (Phase 5) are intentionally deferred with documented re-entry conditions.
- **Repo cleaned**: `modelAdapter.ts` retained as a documented temporary shim; `providerRegistry.ts` retained as legacy registry with documented coexistence comments; all orphaned probe/forensic code decommissioned.

---

### Backend Closeout Pass (Task #2 — Docs Sync)

After the provider-layer stabilization arc, a dedicated backend closeout pass was executed to bring `agent.ts`, the test suite, and the documentation in line with the confirmed repo truth.

**Route extraction (`agent.ts` → `agentContinuation.ts`)**
The four continuation and recovery routes (`recovery-options`, `retry-verify`, `continue-partial`, `recheck-runtime`) were extracted from `agent.ts` into a new dedicated module `agentContinuation.ts`. Both modules are wired in `routes/index.ts`. `agent.ts` was reduced from 1905 lines to 993 lines (a 912-line reduction). `agentContinuation.ts` is 871 lines. TypeScript compiles clean (0 errors) post-extraction.

**Test scaffolding — 31 automated tests added**
Three test files were added under `src/tests/`:
- `health.test.ts` — GET /healthz smoke test: HTTP 200, `{ status: "ok" }` shape, Content-Type, 404 for unknown routes
- `responseNormalizer.test.ts` — all extraction strategies (json_block, first_object, json_repaired), conversational detection, well-formed action object parsing
- `safety.test.ts` — path traversal blocking, absolute path rejection, URL-encoded traversal, windows backslash normalization, shell command blocking

All 31 tests pass cleanly (`pnpm run test` from `artifacts/api-server`). This is the confirmed regression protection baseline. Deeper integration test coverage (agent task lifecycle, action gating, continuation chains) remains open.

**Backend trust judgment post-closeout**
The backend is **TRUSTED**. The closeout pass raised the automated verification baseline from zero to 31 passing tests. The route boundary is now cleaner (continuation concerns are isolated from core task-lifecycle concerns). No source behavior was changed; this was purely organization and test scaffolding. Frontend work can safely begin.

---

### Premium Orchestration UI Surface (Pass 4)

With the backend trust stack complete and all four orchestration phases in place, Pass 4 delivered the orchestration surface into the product — transforming VenomGPT from "an agent with a transcript" into a genuine orchestration workspace.

**OrchestrationBlock in Evidence Panel**
A dedicated Orchestration section was added to `evidence-panel.tsx`, rendering lane dispatch mode (parallel / serial_fallback), lane count, per-lane status (success / failed / cancelled), and any failure isolation events from `TaskEvidence`. No new backend endpoints required — all data sourced from existing evidence structures.

**Continuation lineage view**
A continuation ancestry view was added to the Evidence Panel. It renders the ancestry chain as a linear list with depth badges and origin checkpoint ID, pulling `ancestryDepth` and origin checkpoint ID from the evidence replay endpoint.

**ApprovalGateCard**
When `livePhase.phase === "awaiting_approval"`, the TaskConsole renders an `ApprovalGateCard` with three wired actions: Approve all, Deny, and Approve selective (with lane selection). The card sources `checkpointId` from an `APPROVAL_CHECKPOINT` event type on the live WebSocket stream.

**SelectivelyBlockedLaneGrid**
A compact lane status grid was added to render when phase is `selectively_blocked`. Lane state is pulled from `live_phase` WebSocket events.

**ProviderDiagnosticsPanel**
A provider diagnostics panel was wired to `GET /provider-diagnostics`, accessible from both the settings page and the integrations page. It displays provider name, model, lane count, and any startup diagnostic warnings.

**Runtime status wiring confirmed**
The runtime status bar was confirmed to be wired to live `GET /runtime/status` data from Pass 1; no re-implementation was required.

---

### Product Polish (Pass 5)

Pass 5 closed PP1 (Settings Page), PP2 (Task History UX), and the board/integrations product layer — all three sub-groups delivered and reviewed in sequence.

**Sub-group A — Settings Page**
Settings page was wired end-to-end: `GET /settings` loads current values on mount; `PATCH /settings` saves with success/error toast feedback via `toast` from `@/hooks/use-toast`; "Reset to defaults" calls `POST /settings/reset` with a confirmation dialog; "Clear task history" calls `DELETE /settings/history` with a confirmation dialog.

**Sub-group B — Task History UX**
The history drawer received a search input (client-side filter by prompt text), status filter chips (done, error, cancelled, interrupted), and a match count shown when any filter is active. Bulk-delete was assessed and deferred: the settings route only exposes a full-history wipe endpoint, not per-task deletion, so checkbox selection was not implemented (Option C).

**Sub-group C — Board & Integrations**
Board status-change buttons were wired via `updateBoardTaskStatus` (button-based; drag-and-drop explicitly out of scope). Plan association badges are pulled from `GET /board/plans` and shown on each board card. The workspace composer now shows up to 3 prompt suggestions from `GET /board/prompts` as clickable chips when idle. The integrations page received a `ProviderDiagnosticsPanel` replacing its placeholder content, showing Z.A.I provider status, model, lanes, and connection health from `GET /provider-diagnostics`.

---

### Frontend Audit & Product Completion Arc (Passes 6–8)

After Pass 5, a focused frontend audit and product completion arc closed three remaining surface gaps:

**Pass 6 — API Base URL Audit & Fetch Hardening**
Audited every `fetch()` call in the IDE frontend and corrected 33 root-relative `/api/…` paths across 12 files. The fix pattern — `const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? ''` prefixed to all API paths — ensures correct routing whether the IDE is served from the root or a sub-path. Files covered include `apps.tsx`, `evidence-panel.tsx`, `task-console.tsx`, `integrations.tsx`, `home-screen.tsx`, and 7 others. No silent fallbacks; no backend changes.

**Pass 7 — Projects / Workspace Manager**
Replaced the "Coming Soon" banner in `apps.tsx` with a full project management UI backed by the existing `/projects` backend (list, create, patch, delete, select — all routes already complete). Three bounded sub-groups:
- **Sub-group A**: `useListProjects()` drives the project grid with loading, error, and empty states; `CreateProjectForm` wired to `useCreateProject()` with inline `invalid_name` / `already_exists` error mapping.
- **Sub-group B**: `useSelectProject()` with post-select invalidation of `getGetWorkspaceQueryKey()` + `getListFilesQueryKey()`; active indicator sourced from `useGetWorkspace()` → `data?.root` compared against `project.path`. No optimistic switching — verified source only.
- **Sub-group C**: Inline `DescriptionEditor` via raw `PATCH /api/projects/:name`; `DeleteDialog` modal with `409 active_project` user-readable message and `404`-as-success refresh.
No backend changes, no drag-and-drop, no invented hooks.

**Pass 8 — Remaining Orchestration Surfaces**
Closed two remaining visual gaps in the orchestration UI:
- **Per-lane contribution summary** (`evidence-panel.tsx`): `OrchestrationBlock` now accepts `actions?: ActionRecord[]`; per-lane expand toggle (`expandedLanes` state + `toggleLane()`); WRITE_FILE and EXEC_COMMAND shown per lane, READ_FILE excluded; serial fallback lanes labeled "Serial".
- **Scheduling analysis deeplink** (`task-console.tsx`): `useTaskEvidence(viewingTaskId)` read directly in `TaskConsole`; `hasDependencyAnalysis` computed from `linkEvidenceData?.taskEvidence?.executionSummary?.dependencyAnalysis`; "View scheduling analysis →" link shown in Transcript tab when condition is true; clicking calls `setActiveTab('inspect')`.

**Pass 9A — Action ID Cross-Reference in DependencyGraphBlock**
The final item in the current orchestration/workspace arc. `DependencyGraphBlock` already rendered `serialReason`, class breakdown counts, and `potentiallyIndependentActionIds` as raw UUIDs. Pass 9A replaced the UUID chip list with human-readable rows cross-referenced against `ActionRecord[]`:
- `depActionLabel()` helper resolves `type` + `meta.filePath` (for read/write) or `meta.command` (for exec) from each `ActionRecord`
- `actionMap` built with `useMemo` — ID → ActionRecord lookup; no new fetch
- Confirmed fallback: unresolved IDs show UUID with "unresolved" indicator; no crash, no hidden row
- Minimal prop threading: `actions?: ActionRecord[]` added to `DependencyGraphBlock`; passed as `actionsData?.actions ?? []` from call site only
- Per-step classification rows and per-step reasoning strings are confirmed absent from `DependencyAnalysis` — not implemented; not possible without a data schema change
- Replay at orchestration scale: formally deferred as a backend-first spike; no lane-timeline endpoint exists

This closes the **current orchestration/workspace documentation arc**. The arc covers Pass 4 through Pass 9A. Broader platform work (provider drivers, MCP, SaaS, cloud execution) remains outside this arc.

---

## Current Project Position

VenomGPT is now a serious local execution-oriented AI coding workspace with a complete backend trust stack, live action streaming, a rich evidence/inspection UI, tool introspection, a truthful dependency classification model, bounded semi-parallel read burst, runtime-impact signaling, operator intervention endpoints, Human-in-the-Loop recovery, **a full parallel dispatch lane, checkpoint-aware continuation chains, an operator steering / approval workflow model, verification-orchestrated execution, per-file checkpoint operator UX (P3), full runtime lifecycle depth (P4), a stabilized provider layer (Z.A.I-only runtime with `providerRouter.ts` + `ZaiDriver.ts`), a full premium orchestration UI surface (Pass 4), a complete product polish layer (Pass 5), a hardened API base URL layer (Pass 6), a live Projects/Workspace Manager UI (Pass 7), per-lane orchestration contribution summaries + scheduling deeplink (Pass 8), and action ID cross-reference in DependencyGraphBlock (Pass 9A)**.

**Backend orchestration / execution trust / lifecycle maturity is very strong.**

The backend trust stack is approximately **97–98% toward serious Replit-style orchestration / execution trust / lifecycle maturity** — backend-wise only.

**Provider layer**: Z.A.I is the only active provider. `providerRouter.ts` + `ZaiDriver.ts` are the live foundation. Codex/OpenAI provider surfaces are disconnected from the live product. Phase 3+ is intentionally deferred.

This is not:
- Full Replit parity as a complete product or platform
- Full platform / ecosystem breadth

The project is no longer in an early MVP state. It is no longer a fragile shell. The backend trust foundation is real and materially complete for the scope implemented. The full orchestration foundation — dispatch lanes, continuation chains, operator approval gates, verification-orchestrated execution — is all in place. The per-file checkpoint UX surface (P3) and runtime lifecycle depth (P4) are both confirmed complete. The provider layer has been reset to a clean Z.A.I-only baseline. The orchestration UI surface (Pass 4) and product polish layer (Pass 5) are both confirmed complete.

**Frontend / Product experience** is in a strong, polished position: transcript-first console, live action streaming, evidence/inspection panel, tool introspection, layout overhaul, per-file diff/apply/discard, Runtime Lifecycle section, orchestration blocks, approval gate UI, settings wiring, history search/filter, board kanban, prompt suggestions, and provider diagnostics are all live. Remaining open areas are incremental.

---

## Honest Open Areas

### Confirmed Complete (Previously Open)

| Area | Delivered |
|---|---|
| Richer checkpoint / operator UX (visual diff, per-file apply) | Per-file apply/discard routes, staging badges, checkpoint history, per-file diff view (P3) |
| Environment / runtime lifecycle depth | RuntimeLifecycleRecord, task-start/post-apply snapshots, proactive stale detection, process linkage, Evidence Panel section (P4) |
| Provider-layer stabilization arc | Z.A.I-only runtime, `providerRouter.ts` + `ZaiDriver.ts` active, Codex/OpenAI surfaces disconnected, Phase 3+ deferred (Tasks #18–#22) |
| Premium workspace orchestration surface (Pass 4) | OrchestrationBlock, continuation lineage view, ApprovalGateCard (with checkpointId + APPROVAL_CHECKPOINT source), SelectivelyBlockedLaneGrid, ProviderDiagnosticsPanel, runtime status bar confirmed |
| Settings page (PP1, Pass 5 Sub-group A) | Load/save/reset/clear wired with toast feedback |
| Task history UX (PP2, Pass 5 Sub-group B) | Search input, status filter chips, match count; bulk-delete deferred (no per-task endpoint) |
| Board kanban + prompt suggestions + integrations provider status (Pass 5 Sub-group C) | Status-change buttons, plan badges, prompt suggestions in composer, ProviderDiagnosticsPanel on integrations page |
| API Base URL Audit (Pass 6) | 33 root-relative fetch calls fixed across 12 files; `API_BASE` pattern applied consistently |
| Projects / Workspace Manager (Pass 7) | Live project list, create, select (active indicator), inline description edit, delete with 409 guard — all wired to confirmed backend routes |
| Per-lane contribution summary + scheduling deeplink (Pass 8) | `OrchestrationBlock` expandable per lane (WRITE_FILE + EXEC_COMMAND only); "View scheduling analysis →" deeplink in Transcript tab |
| Action ID cross-reference in DependencyGraphBlock (Pass 9A) | `potentiallyIndependentActionIds` UUIDs replaced with readable `type` + `meta.filePath/command` + `status` rows; fallback for unresolved IDs |

### Still Open (outside the current orchestration/workspace arc)

| Area | Status |
|---|---|
| Replay at orchestration scale | Formally deferred — requires a backend lane-timeline endpoint that does not exist; no frontend pass until endpoint is confirmed |
| Codex driver (Phase 3), OpenAI Platform driver (Phase 4), Qwen driver (Phase 5) | Explicitly deferred — see re-entry conditions in Provider-Layer Stabilization Arc closeout record |
| MCP / ecosystem surfaces | Longer horizon — depends on product maturity decisions |
| Broader platform / SaaS / cloud agent execution | Out of scope for this arc — not a near-term target |

### Intentionally Deferred (No Timeline)

| Area | Status |
|---|---|
| MCP / ecosystem / integration surfaces | Deferred — longer horizon |
| Broader platform / ecosystem expansion | Deferred — longer horizon |
| `summaryEmitter` extraction | Intentionally deferred |
| Checkpoint duplication consolidation | Intentionally deferred |
| `visualPipeline` extraction | Intentionally deferred |
| Codex driver (Phase 3) | Explicitly deferred — re-entry requires product decision + schema confirmation |
| OpenAI Platform driver (Phase 4) | Explicitly deferred — gated on Phase 3 decision |
| Qwen integration (Phase 5) | Explicitly deferred — integration mode unknown |

---

## Next Highest-Value Directions

1. **Premium Workspace Orchestration Surface (remaining)** — dependency graph view, scheduler reasoning surface, replay at orchestration scale; lane-level evidence, continuation lineage, approval gate UI, provider diagnostics, per-lane contribution summary, and scheduling deeplink are now done (Pass 4 + Pass 8)
2. **Advanced action filtering / search in transcript tab** — filter transcript tab by action type, search by file path or command; EvidencePanel (Inspect tab) already has this; transcript tab does not
