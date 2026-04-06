# VenomGPT Documentation Pack

**Last validated**: April 6, 2026 (post Tasks #1–#16 + HITL Recovery + Orchestration Roadmap Phases 1–4 + P3/P4 Closeout + Provider-Layer Stabilization Arc Tasks #18–#22 + Repo Cleanup + Backend Closeout Pass: agentContinuation.ts extraction, agent.ts 993 lines, 31 tests passing + Pass 4: Premium Orchestration UI — OrchestrationBlock, ApprovalGateCard, SelectivelyBlockedLaneGrid, ProviderDiagnosticsPanel + Pass 5: Product Polish — settings toasts, task history search/filter chips, board status-change buttons + plan badges, live prompt suggestions, provider diagnostics panel on integrations page + Pass 6: API Base URL Audit — 33 fetch calls fixed across 12 files + Pass 7: Projects / Workspace Manager — live project UI in apps.tsx + Pass 8: Remaining Orchestration Surfaces — per-lane contribution summary + scheduling deeplink)

## What This Is

This is the documentation pack for VenomGPT — a browser-based local AI coding workspace. These documents are the authoritative reference for project state, engineering workflow, local operation, and next-phase planning.

They are written for manual paste into Google Drive. The numbering is intentional.

---

## Document Index

| File | Title | Purpose |
|---|---|---|
| `00-session-summary.md` | Session Summary | Full arc of the engineering session — what was built, in what order, current position |
| `01-current-state.md` | Current State | Confirmed working / partially validated / open / deferred separation |
| `02-replit-workflow.md` | Replit Workflow | How to work effectively in Replit for VenomGPT passes |
| `03-prompting-style.md` | Prompting Style | Proven prompt patterns for engineering sessions |
| `04-local-runbook.md` | Local Runbook | Verified local development procedures |
| `05-next-phase-plan.md` | Next Phase Plan | Highest-value next directions with scopes and risks |
| `06-project-instructions-template.md` | Project Instructions Template | Session starter template for new ChatGPT or Replit sessions |
| `07-pending-phases.md` | Pending Phases | Open work items, deferred items, and out-of-scope items |
| `08-orchestration-roadmap.md` | Post-Orchestration Feature Roadmap | Post-core-orchestration feature roadmap with completed arc summary and next directions |

---

## Current Project State Summary

VenomGPT is a serious local execution-oriented AI coding workspace with strong backend orchestration, execution trust, lifecycle maturity, and a rich evidence/inspection surface.

### Backend Maturity

The backend trust stack — orchestration routing, planning, action gating, staged task isolation, durable checkpoint/rollback, runtime-aware verification, persistent observability, task replay, lifecycle maturity, live action broadcasting, dependency classification, bounded semi-parallel read burst, runtime-impact signaling, active-run operator intervention (pause/resume/proceed-as-partial), Human-in-the-Loop Recovery, **actual parallel dispatch foundations** (`parallelDispatcher.ts`), **checkpoint-aware continuation chains** (`continuationChain.ts`, resume-from-checkpoint), **operator steering / approval workflows** (approval gates, `awaiting_approval` / `selectively_blocked` / `approval_denied` / `operator_overridden` lifecycle), **verification-orchestrated execution** (verification plan per lane, post-merge verification, runtime-aware rechecks, checkpoint-aware retries, confidence shaping, failure-to-repair loops), and the **Backend Closeout Pass** (`agentContinuation.ts` route extraction, `agent.ts` reduced to 993 lines, **31 automated tests passing as the regression protection baseline**) — is approximately **97–98% toward serious Replit-style backend orchestration / execution trust maturity**.

This judgment is **backend-wise only**. It is not a claim of parity with Replit as a complete product, UI, platform, or ecosystem.

### What Is Confirmed Working

**Backend / Orchestration**
- Task routing and planning phase
- Action gating and side-effect classification
- Staged task isolation (live workspace untouched until explicit apply)
- Durable checkpoint + rollback (staged commit / discard)
- Verification ledger (command_success / static_read / runtime_probe)
- Persistent task evidence (TaskEvidence persisted to history.json, survives restart)
- Task replay endpoint (sequenced narrative from persisted evidence)
- Task lifecycle state machine (`pending → running → done | error | cancelled | interrupted | stalled`)
- agentLoop decomposition pass 1 (evidenceAssembler, actionExecutor extracted)
- Action-level execution model (ActionRecord, ActionType, ActionStatus, ActionStore)
- Action instrumentation (fileTools, stagingStore, actionExecutor, verificationLedger)
- Action endpoint (GET /api/agent/runs/:taskId/actions)
- Live action broadcasting via WebSocket (`action_updated` events, no polling)
- `sideEffectsObserved` tracking per run_command in RunState
- Dependency classifier (`dependencyClassifier.ts`): classifies each step as `strictly_sequential | potentially_independent | verification_gated | repair_driven`
- `DependencyAnalysis` accumulator wired into agentLoop; `scheduling_truth` events emitted at planning and task-done phases
- Bounded semi-parallel read burst (`readBurstExecutor.ts`): planning-phase `filesToRead` dispatched concurrently via `Promise.all`
- Runtime-impact signaling: `runtimeImpactFiles` in checkpoint summary (set by `classifyRuntimeImpactFiles`); `recheck_runtime` affordance surfaces in recovery assessment
- Operator intervention endpoints: `POST /agent/tasks/:id/pause`, `POST /agent/tasks/:id/resume`, `POST /agent/tasks/:id/proceed-as-partial`
- `InterventionKind` in RunState (`pause | blocked | partial_proceed | null`); broadcasts via `live_phase` events
- Human-in-the-Loop Recovery: `GET /agent/tasks/:id/recovery-options` returns a `RecoveryAssessment` with `outcomeClass`, `whatHappened`, `whatRemains`, and three typed affordances (`retry_verification`, `continue_partial`, `recheck_runtime`)
- Parallel Dispatch Foundations (Phase 1): `parallelDispatcher.ts` — bounded dispatch lane with `parallelEligibilityGate`, `executeWave`, `joinLanes`, `DispatchMode` (`parallel` / `serial_fallback`); failure isolation per lane; cancellation propagation via `AbortController`
- Checkpoint-Aware Continuation Chains (Phase 2): `continuationChain.ts` — continuation chain model; `POST /agent/tasks/:taskId/resume-from-checkpoint`; `buildWhatRemains`; `validateCheckpointForResume`; continuation lineage surfaced in evidence/replay
- Operator Steering + Approval Workflows (Phase 3): `POST /agent/tasks/:taskId/register-gate`, `/approve`, `/deny`, `/approve-selective`; `awaiting_approval`, `selectively_blocked`, `approval_denied`, `operator_overridden` lifecycle phases; `validateLaneSteering`, `validateSelectiveSafety`; `resubmit_after_denial` and `view_approval_checkpoint` recovery affordances
- Verification-Orchestrated Execution (Phase 4): verification plan per lane (first-class execution graph participant); post-merge verification pass triggered on lane merge; runtime-aware rechecks (re-triggered by state changes); checkpoint-aware verification retries (re-verify from known checkpoint); confidence shaping (aggregated evidence from multiple passes); failure-to-repair loops (structured repair plan on verification failure)

**Frontend / Product**
- 2-panel flex layout (TaskConsole 300px collapsible + CodeEditor flex:1)
- FileExplorerPanel (right-side panel, open by default, toggle in TopBar) and TaskHistory panel
- Transcript-first rendering with stage-aware thought items (colored badges)
- TaskSummaryCard with elapsed time, step count, changed files, action tallies
- Action-aware transcript (grouped action rendering, expandable ActionGroupRow)
- WebSocket action streaming (no polling; `action_updated` consumed in `use-websocket.ts`)
- Replay / Evidence UI: `evidence-panel.tsx` accessible via "Inspect" tab in TaskConsole
  - Available for **completed / historical tasks only** — disabled during active/live runs
  - Sections: Route Profile, Plan, Checkpoint Summary, Execution Summary, Action Records
  - Action type filter chips, text search, phase-grouped action sections
  - Degrades honestly when data is absent (conversational / zero-action tasks)
- Tool Introspection panel (`tool-introspection-panel.tsx`) embedded in EvidencePanel
  - Per-type action stat cards with success/failure rate indicators
  - Command class distribution chips (from `sideEffectClass` on EXEC_COMMAND records)
  - Execution shape badge (heuristic structural descriptor)
  - Derived entirely from existing `ActionRecord[]` — no new backend endpoint
- Per-file Apply/Discard + Staging Badges + Checkpoint History + Per-file Diff View (P3)
  - `POST /api/agent/tasks/:taskId/apply-file` and `/discard-file` per-file routes
  - Checkpoint history endpoint (`GET /api/agent/tasks/:taskId/checkpoint-history`)
  - Staging state badges and inline unified diff viewer in Output panel
- Runtime Lifecycle Depth (P4)
  - `RuntimeLifecycleRecord`: task-start snapshot, post-apply snapshot, port diff, process linkage, `isStaleAfterApply`
  - `captureEnhancedSnapshot()` and `buildRuntimeLifecycleRecord()` in `runtimeLifecycle.ts`
  - Proactive stale-runtime detection: `isStaleAfterApply` in stored `TaskEvidence` (persisted, survives restart)
  - Runtime Lifecycle section in Evidence Panel (`RuntimeLifecycleBlock`) with honest absent-data degradation
  - Partially validated: task-start snapshot capture is fire-and-forget; in environments where port probe or `ps aux` fails, `taskStartRuntimeSnapshot` is absent and `isStaleAfterApply` remains `null` — honest absent-data handling confirmed; exhaustive failure-scenario coverage not tested
- Premium Orchestration UI Surface (Pass 4)
  - `OrchestrationBlock` in Evidence Panel: lane dispatch mode, lane count, per-lane status, failure isolation events
  - Continuation lineage view in Evidence Panel: ancestry chain with depth badge and origin checkpoint ID
  - `ApprovalGateCard` in TaskConsole: rendered when `livePhase.phase === "awaiting_approval"`; Approve all / Deny / Approve selective wired; `checkpointId` + `APPROVAL_CHECKPOINT` source
  - `SelectivelyBlockedLaneGrid`: compact lane status grid shown when phase is `selectively_blocked`
  - `ProviderDiagnosticsPanel` on settings and integrations pages: wired to `GET /provider-diagnostics`; shows provider name, model, lane config, startup warnings
  - Runtime status bar confirmed wired to live `GET /runtime/status` data
- Product Polish (Pass 5)
  - Settings page: loads values from `GET /settings` on mount; saves via `PATCH /settings`; success/error toast feedback; "Reset to defaults" calls `POST /settings/reset` with confirmation; "Clear task history" calls `DELETE /settings/history` with confirmation
  - Task history UX: search input filters tasks by prompt text (client-side); status filter chips (done, error, cancelled, interrupted) narrow the list; match count shown when filter is active; bulk-delete deferred (no per-task delete endpoint)
  - Board kanban: status-change buttons wired via `updateBoardTaskStatus` (button-based, not drag-and-drop); plan association badges from `GET /board/plans` shown on each card
  - Workspace composer prompt suggestions: up to 3 suggestions from `GET /board/prompts` appear as clickable chips when composer is idle
  - Integrations page: `ProviderDiagnosticsPanel` replaces placeholder content; shows Z.A.I provider status, model, lanes, and connection health

### What Is Still Open

- Premium workspace orchestration surface (remaining) — dependency graph view, scheduler reasoning surface, replay at orchestration scale; lane-level evidence, continuation lineage, approval gate UI, per-lane contribution summary, and scheduling deeplink are done (Pass 4 + Pass 8)
- Advanced action filtering in transcript (filter by type, search by path/command text in transcript tab — EvidencePanel already has this)

### Provider / Runtime

- **Live provider: Z.A.I only.** `providerRouter.ts` + `ZaiDriver.ts` are the active foundation. The dual-lane Z.A.I path (PAAS + Anthropic-compat) is the only wired execution path.
- Codex/OpenAI provider surfaces are **disconnected from the live product**. `codexAuth.ts` is unmounted. `modelAdapter.ts` is a temporary shim pending Phase 6 cleanup.
- Phase 3 (Codex driver), Phase 4 (OpenAI Platform driver), and Phase 5 (Qwen) are explicitly deferred. Re-entry conditions are documented in the Z.A.I-Only Baseline Closeout Record (Task #21).
- The Replit OpenAI integration key is a passive emergency fallback only — not an active provider.

### What Is Intentionally Deferred

- `summaryEmitter` extraction (touches messages thread)
- Checkpoint duplication consolidation (low leverage)
- `visualPipeline` extraction (touches while-loop skeleton)
- Broader platform / ecosystem expansion
- Codex/OpenAI provider phases (Phase 3+) — explicitly deferred

---

## Next Highest-Value Directions

1. **Premium Workspace Orchestration Surface (remaining)** — dependency graph view, scheduler reasoning surface, replay at orchestration scale; lane-level evidence, continuation lineage, approval gate UI, provider diagnostics, per-lane contribution summary, and scheduling deeplink are now done (Pass 4 + Pass 8)
2. **Advanced action filtering / search in transcript** — filter transcript tab by action type, search by file path or command; EvidencePanel (Inspect tab) already has this; transcript tab does not

---

## How to Use These Documents

- **Starting a new session**: use `06-project-instructions-template.md` as the session starter. Update the current state section before copying.
- **Understanding what is built**: start with `01-current-state.md`.
- **Planning the next pass**: use `05-next-phase-plan.md` and `07-pending-phases.md`.
- **Debugging Replit drift**: use `02-replit-workflow.md` and `03-prompting-style.md`.
- **Local environment issues**: use `04-local-runbook.md`.
