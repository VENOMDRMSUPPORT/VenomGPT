# VenomGPT — 07 Pending Phases

## Overview

This document lists pending and deferred work areas. Backend trust phases and UI surfaces that are effectively closed are not listed here as upcoming work. The list reflects the genuine current open areas after Tasks #1–#16 plus HITL Recovery, Orchestration Roadmap Phases 1–4 (Tasks #7–#10), P3 (per-file apply/discard, staging badges, checkpoint history, per-file diff view), P4 (runtime lifecycle depth), the Provider-Layer Stabilization Arc (Phases 0–2, Tasks #18–#22, repo cleanup), the Backend Closeout Pass (route extraction into `agentContinuation.ts`, `agent.ts` reduced to 993 lines, 31 automated tests added and passing), Pass 4 (Premium Orchestration UI — OrchestrationBlock, ApprovalGateCard, SelectivelyBlockedLaneGrid, ProviderDiagnosticsPanel), and Pass 5 (Product Polish — settings toasts, history search/filter, board status-change buttons, prompt suggestions, integrations provider diagnostics), not historical priorities.

---

## Effectively Closed (Not Upcoming Work)

The following areas were previously pending and are now done. They should not reappear in upcoming phase planning:

- Task routing and planning phase
- Action gating and side-effect classification
- Staged task isolation
- Durable checkpoint and rollback safety
- Runtime lifecycle and side-effect verification
- Persistent observability and task evidence replay
- Task lifecycle state machine (interrupted / stalled / cancelled / error)
- Failure detail persistence and UI surfacing
- agentLoop decomposition pass 1 (evidenceAssembler, actionExecutor)
- Action-level execution model (ActionRecord, ActionType, ActionStatus, ActionStore)
- Action endpoint and action-aware transcript
- Grouped action rendering and action-informed summaries
- Workspace layout overhaul (2-panel flex, collapsible TaskConsole)
- Transcript-first rendering and stage-aware thought items
- TaskSummaryCard with action tallies
- Live action streaming via WebSocket (`action_updated` events, polling removed)
- Replay / Evidence UI (`evidence-panel.tsx`, Inspect tab in TaskConsole — available for completed/historical tasks only, disabled during live/active runs)
- Execution history inspection (Inspect tab for completed and historical tasks; status-based `canInspect` gate with null/stale fallback)
- Inspection tightening (filter chips, text search, phase-grouped sections, absent-data placeholders)
- Tool Introspection panel (per-type stat cards, execution shape badge, command class chips)
- Dependency classification model (`dependencyClassifier.ts`, `DependencyAnalysis`, `scheduling_truth` events)
- Dependency groundwork closeout and verification pass (7 task classes confirmed with live curl evidence)
- Bounded semi-parallel read burst (`readBurstExecutor.ts` — planning-phase `filesToRead` dispatched via `Promise.all`; individual error isolation; profile cap enforcement)
- Runtime-impact signaling (`runtimeImpactFiles` in `TaskEvidenceCheckpointSummary`; set by `classifyRuntimeImpactFiles` at checkpoint creation; used by HITL recovery `recheck_runtime` affordance)
- Operator intervention endpoints (`POST /agent/tasks/:id/pause`, `POST /agent/tasks/:id/resume`, `POST /agent/tasks/:id/proceed-as-partial`; `InterventionKind` in RunState; `live_phase` broadcast)
- Human-in-the-Loop Recovery (`GET /agent/tasks/:id/recovery-options`; `RecoveryAssessment` with `outcomeClass`, `whatHappened`, `whatRemains`, three typed `RecoveryAffordance` entries)
- Parallel Dispatch Foundations (`parallelDispatcher.ts`; bounded dispatch lane with `parallelEligibilityGate`, `executeWave`, `joinLanes`, `DispatchMode`; failure isolation per lane; cancellation propagation via AbortController) — Phase 1, Task #7
- Checkpoint-Aware Continuation Chains (`continuationChain.ts`; `POST /agent/tasks/:taskId/resume-from-checkpoint`; `buildWhatRemains`; `validateCheckpointForResume`; continuation lineage in evidence/replay) — Phase 2, Task #8
- Operator Steering + Approval Workflows (approval gate model: `register-gate`, `/approve`, `/deny`, `/approve-selective`; `awaiting_approval`, `selectively_blocked`, `approval_denied`, `operator_overridden` lifecycle phases; lane-level steering; `resubmit_after_denial`, `view_approval_checkpoint` recovery affordances) — Phase 3, Task #9
- Verification-Orchestrated Execution (verification plan per lane; post-merge verification pass triggered on lane merge; runtime-aware rechecks; checkpoint-aware verification retries; confidence shaping model; failure-to-repair loops) — Phase 4, Task #10
- Per-file Apply/Discard, Staging Badges, Checkpoint History, Per-file Diff View (P3): `POST /api/agent/tasks/:taskId/apply-file`, `/discard-file`; per-file buttons in Output panel; `GET /api/agent/tasks/:taskId/checkpoint-history`; staging badges; inline unified diff viewer with `+{linesAdded}` / `-{linesRemoved}` per staged file
- Runtime Lifecycle Depth (P4): `RuntimeLifecycleRecord`, `captureEnhancedSnapshot()`, `buildRuntimeLifecycleRecord()`; task-start/post-apply snapshots; proactive stale detection (`isStaleAfterApply`); process linkage; `TaskEvidence.runtimeLifecycle` persisted in `history.json`; Runtime Lifecycle section in Evidence Panel (`RuntimeLifecycleBlock`)
- Provider-Layer Reset (Phases 0–2, Tasks #18–#22): damage assessment and freeze (Phase 0); `ProviderContract.ts`, `providerRouter.ts`, `ProviderStateStore.ts`, `ModelRegistry.ts` skeleton (Phase 1); `ZaiDriver.ts` implemented and wired, Z.AI execution through new router confirmed (Phase 2); Codex-specific state removed from `providerRegistry.ts`; `codexAuth.ts` unmounted; `modelAdapter.ts` retained as documented temporary shim; repo cleaned
- Backend Closeout Pass: `routes/agentContinuation.ts` extracted from `agent.ts` (continuation/recovery routes — `recovery-options`, `retry-verify`, `continue-partial`, `recheck-runtime`); `agent.ts` reduced from 1905 lines to 993 lines; 31 automated tests added and passing (`src/tests/health.test.ts`, `responseNormalizer.test.ts`, `safety.test.ts`); TypeScript clean (0 errors) post-extraction
- Premium Orchestration UI Surface (Pass 4): `OrchestrationBlock` (lane dispatch data in Evidence Panel), continuation lineage view, `ApprovalGateCard` (with `checkpointId` + `APPROVAL_CHECKPOINT` source, three wired approval actions), `SelectivelyBlockedLaneGrid` (compact lane status grid for `selectively_blocked` phase), `ProviderDiagnosticsPanel` (wired to `GET /provider-diagnostics`, accessible from settings and integrations pages), runtime status bar wired to `GET /runtime/status`
- PP1 — Settings Page (Pass 5 Sub-group A): settings load from `GET /settings` on mount; save via `PATCH /settings` with success/error toast; "Reset to defaults" via `POST /settings/reset` with confirmation; "Clear task history" via `DELETE /settings/history` with confirmation
- PP2 — Task History UX (Pass 5 Sub-group B): search input filters tasks by prompt text (client-side); status filter chips (done, error, cancelled, interrupted); match count when filter active; bulk-delete deferred (no per-task delete endpoint)
- Board kanban + prompt suggestions + integrations provider status (Pass 5 Sub-group C): status-change buttons via `updateBoardTaskStatus` (no drag-and-drop); plan association badges from `GET /board/plans`; up to 3 prompt suggestions from `GET /board/prompts` as clickable chips in workspace composer; `ProviderDiagnosticsPanel` on integrations page

---

## Pending: Near-Term (Highest Leverage)

### P1 — Premium Workspace Orchestration Surface (Remaining)

**Status**: Partially done. Pass 4 delivered: lane-level evidence panel, continuation lineage view, approval gate UI (`ApprovalGateCard` + `SelectivelyBlockedLaneGrid`), and `ProviderDiagnosticsPanel`. Remaining scope below.

**What**: Expose the remaining orchestration capability in the product.

**Scope (remaining)**:
- Dependency graph view: visual or structured representation of the dispatch graph for a run
- Scheduler reasoning surface: per-step explanation of why a step was parallelized or serialized
- Merge result explanation: per-lane contribution summary in the merged output
- Replay at orchestration scale: replay a parallel run's lane sequence, not just a linear action list

**Why**: The foundation is in place and the model is stable. The remaining surfaces are additive UI work with no backend risk.

**Risk**: Medium — UI work, no backend architectural risk. Individual pieces are additive.

---

### P2 — Advanced Action Filtering / Search

**Status**: Open — selector infrastructure exists; filter UI not wired in transcript.

**What**: Surface the existing action selector infrastructure in a filtering UI within the transcript console.

**Scope**:
- Filter by action type (reads only, writes only, commands only, verifications only)
- Search by file path or command text
- Collapse all / expand all action groups
- No backend changes required — all data already present in frontend action state
- Note: EvidencePanel (Inspect tab) already has filter chips and text search; this brings equivalent filtering to the Transcript tab

**Why**: The data and computation layers (`actionSelectors.ts`) are already in place. This is a UI pass only.

**Risk**: Low — additive UI change, no backend dependencies.

---

## Pending: Product Polish (Opportunistic)

PP1 (Settings Page) and PP2 (Task History UX) are **effectively closed** — delivered in Pass 5. See "Effectively Closed" section above.

### PP3 — Advanced Action Filtering (Transcript)

Overlaps with P2 above. Listed here for completeness:
- Filter by action type in transcript tab (EvidencePanel already has this)
- Search by file path or command text in transcript tab
- Collapse all / expand all

---

## Intentionally Deferred (No Timeline)

These items are explicitly deferred and should not be planned until the rationale changes.

| Item | Deferral reason |
|---|---|
| `summaryEmitter` extraction | Touches messages thread — higher risk than benefit at current size |
| Checkpoint duplication consolidation | Low incremental leverage; safe to defer indefinitely |
| `visualPipeline` extraction | Touches while-loop skeleton; stability risk outweighs benefit |
| Broader platform / ecosystem expansion | Longer horizon; depends on product maturity first |
| Multi-workspace support | Single workspace per server instance is intentional for local-first design |
| Codex driver — Phase 3 (`OpenAICodexDriver`) | Explicitly deferred. Requires: (1) explicit product decision to re-enable Codex, (2) confirmation of correct `chatgpt.com/backend-api/codex` request/response schema before any code is written, (3) a dedicated implementation pass. Re-entry conditions are documented in the Z.A.I-Only Baseline Closeout Record (Task #21). |
| OpenAI Platform API driver — Phase 4 (`OpenAIPlatformDriver`) | Explicitly deferred. Gated on a post-Phase-3 decision. Only implemented if explicitly decided after Phase 3 completes. |
| Qwen integration — Phase 5 (`QwenDriver`) | Explicitly deferred. Qwen's actual integration mode (API key, OAuth, or OpenAI-compatible host) is unknown. No driver is implemented until the integration mode is confirmed. |

---

## Not in Scope

- Full Replit product parity (UI, integrations, deployment environment, ecosystem)
- SaaS / multi-tenant operation
- Cloud agent execution
