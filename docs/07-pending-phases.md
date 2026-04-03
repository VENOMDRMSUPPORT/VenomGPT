# VenomGPT — 07 Pending Phases

## Overview

This document lists pending and deferred work areas. Backend trust phases and UI surfaces that are effectively closed are not listed here as upcoming work. The list reflects the genuine current open areas after Tasks #1–#16 plus HITL Recovery, Orchestration Roadmap Phases 1–4 (Tasks #7–#10), P3 (per-file apply/discard, staging badges, checkpoint history, per-file diff view), P4 (runtime lifecycle depth), and the Provider-Layer Stabilization Arc (Phases 0–2, Tasks #18–#22, repo cleanup), not historical priorities.

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

---

## Pending: Near-Term (Highest Leverage)

### P1 — Premium Workspace Orchestration Surface

**Status**: Open — highest-value next direction post-core-orchestration. All four orchestration phases are complete; the underlying model is stable and ready for a product surface pass.

**What**: Expose the full orchestration capability cleanly in the product — advanced operator UX, rich inspect surfaces, and replay at orchestration scale.

**Scope**:
- Lane-level evidence panel: separate evidence streams per dispatch lane in the Inspect tab
- Dependency graph view: visual or structured representation of the dispatch graph for a run
- Scheduler reasoning surface: per-step explanation of why a step was parallelized or serialized
- Continuation lineage view: structured ancestry chain for resumed runs
- Merge result explanation: per-lane contribution summary in the merged output
- Verification evidence per branch / lane in evidence panel
- Advanced operator UX: approval gate UI, lane control affordances, selective continuation controls
- Replay at orchestration scale: replay a parallel run's lane sequence, not just a linear action list

**Why**: The full orchestration foundation is in place. Exposing the model cleanly in the product is the highest-leverage remaining investment.

**Risk**: Medium — UI work with no backend architectural risk. Individual pieces are additive.

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

These are real improvements but should not displace P1–P2 unless those areas are blocked.

### PP1 — Settings Page

A proper settings page covering:
- Model selection (agentic model, vision model overrides)
- Workspace configuration
- Verification threshold settings
- History management (clear, export)

### PP2 — Task History UX

Improvements to the history drawer:
- Search and filter by status, date, prompt text
- Bulk operations (delete, export)
- Persistent history selection state

### PP3 — Advanced Action Filtering (Transcript)

Overlaps with P2 above. Listed here for completeness:
- Filter by action type in transcript
- Search by file path or command text
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
