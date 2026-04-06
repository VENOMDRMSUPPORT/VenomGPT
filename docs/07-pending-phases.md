# VenomGPT — 07 Pending Phases

## Overview

This document lists pending and deferred work areas. Backend trust phases and UI surfaces that are effectively closed are not listed here as upcoming work. The list reflects the genuine current open areas after Tasks #1–#16 plus HITL Recovery, Orchestration Roadmap Phases 1–4 (Tasks #7–#10), P3 (per-file apply/discard, staging badges, checkpoint history, per-file diff view), P4 (runtime lifecycle depth), the Provider-Layer Stabilization Arc (Phases 0–2, Tasks #18–#22, repo cleanup), the Backend Closeout Pass (route extraction into `agentContinuation.ts`, `agent.ts` reduced to 993 lines, 31 automated tests added and passing), Pass 4 (Premium Orchestration UI — OrchestrationBlock, ApprovalGateCard, SelectivelyBlockedLaneGrid, ProviderDiagnosticsPanel), Pass 5 (Product Polish — settings toasts, history search/filter, board status-change buttons, prompt suggestions, integrations provider diagnostics), Pass 6 (API Base URL Audit — 33 fetch calls fixed across 12 files), Pass 7 (Projects / Workspace Manager — live project UI in `apps.tsx`), and Pass 8 (Remaining Orchestration Surfaces — per-lane contribution summary + scheduling deeplink), not historical priorities.

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
- API Base URL Audit (Pass 6): 33 root-relative `fetch('/api/…')` calls fixed across 12 frontend files; `const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? ''` pattern applied; no silent fallbacks; no backend changes
- Projects / Workspace Manager (Pass 7): `apps.tsx` "Coming Soon" banner replaced with live project list (`useListProjects()`), create form (`useCreateProject()`), workspace select (`useSelectProject()` + `getGetWorkspaceQueryKey()` + `getListFilesQueryKey()` invalidation), active indicator (`useGetWorkspace()` → `data?.root` vs `project.path`), inline description edit (raw PATCH), delete with 409 guard; no backend changes
- Remaining Orchestration Surfaces (Pass 8): `OrchestrationBlock` expandable per lane — WRITE_FILE + EXEC_COMMAND shown, READ_FILE excluded, serial fallback labeled "Serial"; "View scheduling analysis →" deeplink in Transcript tab conditioned on `dependencyAnalysis` presence, navigates to Inspect tab
- P2 / PP3 — Advanced Action Filtering / Search (Transcript Tab): confirmed delivered — filter chips by action type, text search by file path or command, collapse all / expand all are present in `task-console.tsx`; equivalent to EvidencePanel (Inspect tab) filter surface
- P1 — Premium Workspace Orchestration Surface (current arc closed): `DependencyGraphBlock` (serialReason, class breakdown, action ID cross-reference with readable rows via Pass 9A) + `OrchestrationBlock` per-lane expand + scheduling deeplink — all available data fully surfaced; per-step classification rows and per-step reasoning strings confirmed absent from data schema; replay-at-scale moved to "Intentionally Deferred" below

---

## Intentionally Deferred (No Timeline)

These items are explicitly deferred and should not be planned until the rationale changes.

| Item | Deferral reason |
|---|---|
| `summaryEmitter` extraction | Touches messages thread — higher risk than benefit at current size |
| Checkpoint duplication consolidation | Low incremental leverage; safe to defer indefinitely |
| `visualPipeline` extraction | Touches while-loop skeleton; stability risk outweighs benefit |
| Broader platform / ecosystem expansion | Longer horizon; depends on product maturity first |
| Multi-workspace parallel views | Switching between projects is supported; simultaneous multi-root views are out of scope |
| Replay at orchestration scale | Backend-first — no lane-timeline endpoint exists; re-enter only after endpoint shape is confirmed from stored data (`history.json`, `laneEvidence`, `ActionRecord[]`) |
| Per-step dependency classification rows | Data does not exist — `DependencyAnalysis` has aggregate counts only; requires a data schema change before any UI pass |
| Per-step scheduler reasoning strings | Data does not exist — `serialReason` is a single run-level string; requires a data schema change before any UI pass |
| Codex driver — Phase 3 (`OpenAICodexDriver`) | Explicitly deferred. Requires: (1) explicit product decision to re-enable Codex, (2) confirmation of correct `chatgpt.com/backend-api/codex` request/response schema before any code is written, (3) a dedicated implementation pass. Re-entry conditions are documented in the Z.A.I-Only Baseline Closeout Record (Task #21). |
| OpenAI Platform API driver — Phase 4 (`OpenAIPlatformDriver`) | Explicitly deferred. Gated on a post-Phase-3 decision. Only implemented if explicitly decided after Phase 3 completes. |
| Qwen integration — Phase 5 (`QwenDriver`) | Explicitly deferred. Qwen's actual integration mode (API key, OAuth, or OpenAI-compatible host) is unknown. No driver is implemented until the integration mode is confirmed. |

---

## Not in Scope

- Full Replit product parity (UI, integrations, deployment environment, ecosystem)
- SaaS / multi-tenant operation
- Cloud agent execution
