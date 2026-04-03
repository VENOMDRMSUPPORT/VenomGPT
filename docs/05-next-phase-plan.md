# VenomGPT — 05 Next Phase Plan

## Current Position

The VenomGPT backend trust stack is materially complete through Tasks #1–#16 plus HITL Recovery, Orchestration Roadmap Phases 1–4 (Tasks #7–#10), P3 (per-file apply/discard, staging badges, checkpoint history, per-file diff view), P4 (runtime lifecycle depth), and the Provider-Layer Stabilization Arc (Phases 0–2, Tasks #18–#22, repo cleanup). Orchestration architecture, execution gating, staged isolation, durable checkpoint/rollback, runtime-aware verification, persistent observability, task replay, lifecycle maturity, action-level execution, live WebSocket action streaming, replay/evidence UI, execution history inspection, tool introspection, dependency classification groundwork, bounded semi-parallel read burst, runtime-impact signaling, operator intervention (pause/resume/proceed-as-partial), Human-in-the-Loop recovery, **parallel dispatch foundations, checkpoint-aware continuation chains, operator steering / approval workflows, verification-orchestrated execution, per-file checkpoint operator UX, runtime lifecycle depth, and a stabilized Z.A.I-only provider runtime (`providerRouter.ts` + `ZaiDriver.ts`)** are all confirmed working.

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

---

## Highest-Value Next Directions

### 1. Premium Workspace Orchestration Surface

**What it is**: Expose the full orchestration capability cleanly in the product — advanced operator UX, rich inspect surfaces, and replay at orchestration scale.

**Why now**: All four orchestration phases are complete and the underlying model is stable. Exposing these surfaces before the model was stable would have created UI drift. Now the UI pass is both safe and high-leverage.

**Scope**:
- Lane-level evidence panel: separate evidence streams per dispatch lane in the Inspect tab
- Dependency graph view: visual or structured representation of the dispatch graph for a run
- Scheduler reasoning surface: per-step explanation of why a step was parallelized or serialized
- Continuation lineage view: structured ancestry chain for resumed runs
- Merge result explanation: per-lane contribution summary in the merged output
- Verification evidence per branch / lane in evidence panel
- Advanced operator UX: approval gate UI, lane control affordances, selective continuation controls
- Replay at orchestration scale: replay a parallel run's lane sequence, not just a linear action list

**Risk**: Medium — UI work with no backend architectural risk. Surface area is large but individual pieces are additive.

---

### 2. Advanced Action Filtering / Search

**What it is**: Surface the existing action selector infrastructure in a filtering UI within the transcript console.

**Why now**: `actionSelectors.ts` already provides the computation layer. `evidence-panel.tsx` already has filter chips and text search (added in Task #9). The transcript tab has no equivalent.

**Scope**:
- Filter by action type (reads only, writes only, commands only, verifications only)
- Search by file path or command text
- Collapse all / expand all action groups
- No backend changes required — all data already present in frontend action state

**Risk**: Low — additive UI pass, no backend dependencies.

---

### 3. Product Polish (Strategic, Not Automatic)

**What it is**: Additional improvements to the product experience.

**When to prioritize**: Only when the above two areas are either complete or blocked. Product polish has a lower leverage ceiling than the infrastructure investments above.

**Specific areas**:
- Settings page: model selection, workspace configuration, verification thresholds, history management
- Task history UX: search, filtering by status, bulk operations
- Advanced action filtering in transcript (overlaps with direction #2 above)

---

## Out of Scope (Near Term)

- `summaryEmitter` extraction — deferred, touches messages thread
- Checkpoint duplication consolidation — deferred, low leverage at current size
- `visualPipeline` extraction — deferred, touches while-loop skeleton
- Broader platform / ecosystem expansion — longer horizon

---

## Recommended Sequence

The Premium Workspace Orchestration Surface (Phase B) is the strategic top priority. Advanced Action Filtering (Phase A) is sequenced first only because it is low-risk, fast, and clears obvious user-facing friction before committing to the heavier UI pass. It does not displace premium orchestration as the highest-leverage direction. Phase C (Richer Checkpoint / Operator UX Polish) and Phase D (Environment / Runtime Lifecycle Depth) are now confirmed complete (P3 and P4 respectively) and are not part of the remaining sequence.

```
Phase A: Advanced Action Filtering / Search
  - Short, low-risk, no backend work
  - High user-facing value relative to effort
  - Clears low-hanging friction before the heavier UI pass

Phase B: Premium Workspace Orchestration Surface  ← strategic top priority
  - Medium-Heavy — UI pass exposing all four orchestration phases in the product
  - Start with the highest-leverage sections: lane-level evidence panel,
    dependency graph view, and continuation lineage view
  - Approval gate UI and replay at orchestration scale can be sequenced after

(Phase C and Phase D are COMPLETE — closed as P3 and P4)
```

Each phase should be a single bounded engineering pass with an explicit exit condition.
