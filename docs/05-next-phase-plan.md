# VenomGPT — 05 Next Phase Plan

## Current Position

The VenomGPT backend trust stack is materially complete through Tasks #1–#16 plus HITL Recovery, Orchestration Roadmap Phases 1–4 (Tasks #7–#10), P3 (per-file apply/discard, staging badges, checkpoint history, per-file diff view), P4 (runtime lifecycle depth), the Provider-Layer Stabilization Arc (Phases 0–2, Tasks #18–#22, repo cleanup), and the Backend Closeout Pass (route extraction into `agentContinuation.ts`, `agent.ts` reduced to 993 lines, 31 automated tests added and passing). Orchestration architecture, execution gating, staged isolation, durable checkpoint/rollback, runtime-aware verification, persistent observability, task replay, lifecycle maturity, action-level execution, live WebSocket action streaming, replay/evidence UI, execution history inspection, tool introspection, dependency classification groundwork, bounded semi-parallel read burst, runtime-impact signaling, operator intervention (pause/resume/proceed-as-partial), Human-in-the-Loop recovery, **parallel dispatch foundations, checkpoint-aware continuation chains, operator steering / approval workflows, verification-orchestrated execution, per-file checkpoint operator UX, runtime lifecycle depth, a stabilized Z.A.I-only provider runtime (`providerRouter.ts` + `ZaiDriver.ts`), a 31-test automated regression baseline, API base URL hardening (Pass 6), a live Projects/Workspace Manager UI (Pass 7), and per-lane orchestration contribution summaries + scheduling deeplink (Pass 8)** are all confirmed working.

Frontend and product experience are in a strong position. The remaining open areas are incremental rather than foundational.

---

## What Is Now Closed

These areas are effectively closed and should not be framed as upcoming work:

- Task routing and planning phase
- Action gating and side-effect classification
- Staged task isolation and checkpoint durability
- Rollback safety (apply / discard lifecycle)
- Runtime lifecycle and verification ledger
- Persistent observability and task evidence replay
- Task lifecycle state machine (interrupted, stalled, cancelled, error)
- Failure detail persistence and UI surfacing
- agentLoop decomposition pass 1 (evidenceAssembler, actionExecutor extracted)
- Action-level execution model (ActionRecord, ActionType, ActionStatus, ActionStore)
- Action endpoint and action-aware transcript rendering
- Grouped action rendering and action-informed summaries
- Live action streaming via WebSocket (Task #6 — `action_updated` events, polling removed)
- Replay / Evidence UI (Task #7 — `evidence-panel.tsx` with structured sections, inspect tab in TaskConsole)
- Execution History Inspection (Task #8 — inspect tab enabled for completed/historical tasks; disabled during live/active runs; status-based `canInspect` gate)
- Inspection tightening (Task #9 — filter chips, text search, absent-data placeholders, phase-grouped sections)
- Tool Introspection panel (Task #10 — per-type stat cards, execution shape badge, command class chips)
- Dependency classification model (Task #11 — `dependencyClassifier.ts`, `DependencyAnalysis`, `scheduling_truth` events)
- Dependency groundwork closeout + verification pass (Task #12 — live curl evidence for 7 task classes confirmed)
- Bounded semi-parallel read burst (`readBurstExecutor.ts` — planning-phase `filesToRead` dispatched via `Promise.all`; individual read error isolation; profile cap enforcement)
- Runtime-impact signaling (`runtimeImpactFiles` in checkpoint summary; `classifyRuntimeImpactFiles` called at checkpoint creation; `recheck_runtime` affordance grounded in persisted evidence)
- Operator intervention endpoints (`POST /agent/tasks/:id/pause`, `POST /agent/tasks/:id/resume`, `POST /agent/tasks/:id/proceed-as-partial`; `InterventionKind` in RunState; `live_phase` broadcast)
- Human-in-the-Loop Recovery (`GET /agent/tasks/:id/recovery-options`; `RecoveryAssessment` with `outcomeClass`, `whatHappened`, `whatRemains`, three typed affordances)
- Parallel Dispatch Foundations (`parallelDispatcher.ts`: bounded dispatch lane, `parallelEligibilityGate`, `executeWave`, `joinLanes`, failure isolation, cancellation propagation, `DispatchMode`) — Phase 1, Task #7
- Checkpoint-Aware Continuation Chains (`continuationChain.ts`: continuation chain model, `POST /agent/tasks/:taskId/resume-from-checkpoint`, `buildWhatRemains`, `validateCheckpointForResume`, continuation lineage in evidence/replay) — Phase 2, Task #8
- Operator Steering + Approval Workflows (approval gate model: `register-gate`, `/approve`, `/deny`, `/approve-selective`; `awaiting_approval`, `selectively_blocked`, `approval_denied`, `operator_overridden` phases; lane-level steering; `resubmit_after_denial` and `view_approval_checkpoint` affordances) — Phase 3, Task #9
- Verification-Orchestrated Execution (verification plan per lane; post-merge verification pass; runtime-aware rechecks; checkpoint-aware verification retries; confidence shaping; failure-to-repair loops) — Phase 4, Task #10
- Per-file Apply/Discard, Staging Badges, Checkpoint History, Per-file Diff View (`POST /api/agent/tasks/:taskId/apply-file`, `/discard-file`; per-file buttons in Output panel; `GET .../checkpoint-history`; staging badges; inline unified diff viewer) — P3
- Runtime Lifecycle Depth (`RuntimeLifecycleRecord`, `captureEnhancedSnapshot()`, `buildRuntimeLifecycleRecord()`; task-start/post-apply snapshots; proactive `isStaleAfterApply` detection; process linkage; `TaskEvidence.runtimeLifecycle` persisted in `history.json`; Runtime Lifecycle section in Evidence Panel) — P4
- Route extraction and test scaffolding (Backend Closeout Pass): `routes/agentContinuation.ts` extracted from `agent.ts` (continuation/recovery routes — `recovery-options`, `retry-verify`, `continue-partial`, `recheck-runtime`); `agent.ts` reduced from 1905 to 993 lines; 31 automated tests added and passing (`health.test.ts`, `responseNormalizer.test.ts`, `safety.test.ts`)
- Premium Orchestration UI Surface (Pass 4): `OrchestrationBlock` (lane dispatch data in Evidence Panel), continuation lineage view, `ApprovalGateCard` (with `checkpointId` + `APPROVAL_CHECKPOINT` source, Approve all / Deny / Approve selective wired), `SelectivelyBlockedLaneGrid` (compact lane status grid for `selectively_blocked` phase), `ProviderDiagnosticsPanel` (wired to `GET /provider-diagnostics`, accessible from settings and integrations pages), runtime status bar wired to `GET /runtime/status`
- Product Polish (Pass 5): settings page load/save/reset/clear with toast feedback; task history search + status filter chips + match count; board status-change buttons (`updateBoardTaskStatus`) + plan association badges (`GET /board/plans`); workspace composer prompt suggestions (`GET /board/prompts`); `ProviderDiagnosticsPanel` on integrations page — closes PP1 (Settings) and PP2 (Task History UX)
- API Base URL Audit (Pass 6): 33 root-relative `fetch('/api/…')` calls fixed across 12 frontend files; `API_BASE` pattern applied consistently; no silent fallbacks
- Projects / Workspace Manager (Pass 7): "Coming Soon" banner in `apps.tsx` replaced with live project list, create form, workspace select (active indicator), inline description edit, delete with 409 active-project guard — all wired to confirmed `/projects` backend routes; no backend changes
- Remaining Orchestration Surfaces (Pass 8): `OrchestrationBlock` expandable per lane (WRITE_FILE + EXEC_COMMAND, READ_FILE excluded, serial fallback labeled "Serial"); "View scheduling analysis →" deeplink in Transcript tab (condition: `dependencyAnalysis` present in evidence; target: Inspect tab)
- Advanced Action Filtering / Search (Transcript Tab): filter chips by action type, text search by file path or command, collapse all / expand all — confirmed present in `task-console.tsx`; equivalent to EvidencePanel filter surface

---

## Highest-Value Next Directions

### 1. Premium Workspace Orchestration Surface (Remaining)

**What it is**: Expose the remaining orchestration capability cleanly in the product.

**What is already done (Pass 4 + Pass 8)**: Lane-level evidence panel (`OrchestrationBlock`), continuation lineage view, approval gate UI (`ApprovalGateCard` + `SelectivelyBlockedLaneGrid`), `ProviderDiagnosticsPanel`, per-lane contribution summary (expandable WRITE_FILE + EXEC_COMMAND per lane), "View scheduling analysis →" deeplink.

**Why now**: The foundation is fully in place. The remaining surfaces are additive UI passes with no backend architectural risk.

**Scope (remaining)**:
- Dependency graph view: visual or structured representation of the dispatch graph for a run
- Scheduler reasoning surface: per-step explanation of why a step was parallelized or serialized
- Replay at orchestration scale: replay a parallel run's lane sequence, not just a linear action list

**Risk**: Medium — UI work with no backend architectural risk. Individual pieces are additive.

---

## Out of Scope (Near Term)

- `summaryEmitter` extraction — deferred, touches messages thread
- Checkpoint duplication consolidation — deferred, low leverage at current size
- `visualPipeline` extraction — deferred, touches while-loop skeleton
- Broader platform / ecosystem expansion — longer horizon

---

## Recommended Sequence

The Backend Closeout Pass (route extraction, test scaffolding) is complete. The backend is confirmed trusted. Pass 4–8 are all complete. The only remaining high-leverage direction is the residual orchestration surfaces.

```
(Phase A: Advanced Action Filtering / Search — COMPLETE: filter chips, text search,
 collapse all / expand all confirmed in task-console.tsx)

(Phase B: Premium Workspace Orchestration Surface — partially done: lane-level evidence,
 continuation lineage, approval gate UI, per-lane contribution summary, and scheduling deeplink
 are all delivered in Pass 4 + Pass 8. Remaining: dependency graph view, scheduler reasoning
 surface, replay at orchestration scale)

(Phase C and Phase D are COMPLETE — closed as P3 and P4)
(Pass 4, Pass 5, Pass 6, Pass 7, Pass 8 are COMPLETE — see "What Is Now Closed" above)
```

Each phase should be a single bounded engineering pass with an explicit exit condition.
