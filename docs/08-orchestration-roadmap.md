# Post-Orchestration Feature Roadmap for VenomGPT

**Last updated**: April 6, 2026

---

## Purpose

This document is the post-core-orchestration feature roadmap for VenomGPT. It supersedes the previous Phase 4–5 open-scope framing. All four core orchestration phases (Phases 1–4) are now closed. This roadmap frames what comes next from that position.

---

## Completed Core Orchestration Arc

All four orchestration phases are confirmed complete. Each is summarised below.

### Phase 1 — Actual Parallel Dispatch Foundations — COMPLETED (Task #7)

**What it delivered**:
- `parallelDispatcher.ts`: bounded dispatch lane with `parallelEligibilityGate` (checks side effects, dependency class, verification status), `executeWave` (concurrent cohort execution), `joinLanes` (join semantics), and `DispatchMode` (`parallel` / `serial_fallback`)
- Failure isolation per lane: one lane failure triggers policy-controlled abort of dependent sibling lanes; does not unconditionally halt the run
- Cancellation propagation via `AbortController` across lanes
- Scheduling-truth events updated to reflect actual dispatch decisions, not just classification

### Phase 2 — Checkpoint-Aware Continuation Chains — COMPLETED (Task #8)

**What it delivered**:
- `continuationChain.ts`: continuation chain model linking each resumed run to its origin checkpoint with full ancestry
- `POST /agent/tasks/:taskId/resume-from-checkpoint`: structured resume endpoint, distinct from retry-from-start
- `buildWhatRemains`: grounded remaining-work model derived from original plan vs. confirmed-complete action history — avoids narrative heuristics
- `validateCheckpointForResume`: enforces invalidation rules (`checkpoint_applied_overwritten`, `checkpoint_discarded`, etc.)
- Continuation lineage (`ancestryDepth`, origin checkpoint ID) surfaced in evidence and replay endpoints

### Phase 3 — Operator Steering + Approval Workflows — COMPLETED (Task #9)

**What it delivered**:
- Approval gate model: `POST /agent/tasks/:taskId/register-gate` registers sign-off points, optionally scoped to specific `laneIds`
- Full approval lifecycle: `awaiting_approval` → `/approve` | `/deny` | `/approve-selective`
- New run lifecycle phases: `awaiting_approval`, `selectively_blocked`, `approval_denied`, `operator_overridden`
- `validateLaneSteering` (lane-safe pause/cancel); `validateSelectiveSafety` (no dangling dependencies in partial approvals)
- Recovery affordances: `resubmit_after_denial`, `view_approval_checkpoint`

### Phase 4 — Verification-Orchestrated Execution — COMPLETED (Task #10)

**What it delivered**:
- Verification plan per lane: each concurrent lane carries its own verification requirements as a first-class participant in the execution graph
- Post-merge verification: a merge event triggers a structured verification pass on the combined output
- Runtime-aware rechecks: verification re-triggered by state changes (file applied, command run, lane merged)
- Checkpoint-aware verification retries: re-verify from a known checkpoint state rather than from scratch
- Confidence shaping: aggregated evidence from multiple verification passes feeds a confidence model
- Failure-to-repair loops: a failed verification triggers a structured repair plan, not a raw error

---

## Current Strategic Position

VenomGPT is now a serious local execution-oriented AI coding workspace with a complete backend trust stack, real parallel dispatch, checkpoint-aware continuation chains, operator approval gates, and verification-orchestrated execution.

**Backend orchestration / execution trust / lifecycle maturity is very strong.**

The backend trust stack is approximately **97–98% toward serious Replit-style orchestration / execution trust / lifecycle maturity** — backend-wise only.

**What VenomGPT now is**:
- A full parallel execution engine with dependency-aware dispatch, failure isolation, and join semantics
- A checkpoint-first workspace where every write is staged, every resume is grounded, and rollback is safe
- An operator-steerable system with approval gates, lane-level steering, and structured denial / selective approval
- A verification-orchestrated executor where verification plans are per-lane, post-merge, and capable of triggering repair loops

**What VenomGPT still is not**:
- Full Replit product parity as a complete platform or ecosystem
- Multi-user / multi-tenant (intentionally single-workspace, local-first)
- A production SaaS deployment (single-server, local-first design)
- Fully polished on all remaining orchestration visualization surfaces (dependency graph view, scheduler reasoning, replay at orchestration scale — residual after Pass 4)

---

## Next Major Feature Directions

The core orchestration arc is closed. The next maturity arc is the product surface and ecosystem that exposes the full orchestration capability cleanly to operators.

### Direction 1 — Premium Workspace Orchestration Surface

**What**: Expose the full orchestration capability in the product — advanced operator UX, rich inspect surfaces, and replay at orchestration scale.

**Delivered in Pass 4** (closed):
- Lane-level evidence panel (`OrchestrationBlock` in Evidence Panel)
- Continuation lineage view (ancestry chain with depth badges and origin checkpoint ID)
- Approval gate UI (`ApprovalGateCard` with Approve all / Deny / Approve selective; `SelectivelyBlockedLaneGrid`)
- Provider diagnostics panel (`ProviderDiagnosticsPanel` wired to `GET /provider-diagnostics`)

**Delivered in Pass 8** (closed):
- Per-lane contribution summary: `OrchestrationBlock` now expandable per lane; shows WRITE_FILE + EXEC_COMMAND actions per lane; READ_FILE excluded; serial fallback lanes labeled "Serial"
- Scheduling analysis deeplink: "View scheduling analysis →" in Transcript tab navigates to Inspect tab when `dependencyAnalysis` evidence is present

**Delivered in Pass 9A** (closed):
- Action ID cross-reference: `potentiallyIndependentActionIds` UUID list replaced with readable rows (`type` + `meta.filePath/command` + `status`) via `depActionLabel()` helper + `actionMap` lookup in `DependencyGraphBlock`
- Confirmed not surfaced (data absent): per-step classification rows, per-step reasoning strings — `DependencyAnalysis` has aggregate counts + single `serialReason` string only; no per-step list in schema
- **Direction 1 is effectively closed for the current arc.** All data that exists is now surfaced.

**Formally deferred (backend-first)**:
- Replay at orchestration scale: requires a lane-timeline endpoint not currently in `api-server/src/routes/`; no frontend pass until endpoint shape is confirmed

**Why closed**: All available orchestration data is now surfaced. Remaining items require data schema changes (per-step) or a new backend endpoint (replay). Neither is a frontend-only pass.

**Risk**: N/A — arc closed for current data shape.

---

### Direction 2 — Advanced Action Filtering / Search

**What**: Surface the existing action selector infrastructure in a filtering UI within the transcript console.

**Scope**:
- Filter by action type (reads only, writes only, commands only, verifications only)
- Search by file path or command text
- Collapse all / expand all action groups
- No backend changes required — all data already present in frontend action state
- Note: EvidencePanel (Inspect tab) already has filter chips and text search; this brings equivalent filtering to the Transcript tab

**Why now**: `actionSelectors.ts` already provides the computation layer. This is a low-risk, high-value UI pass.

**Risk**: Low — additive UI change, no backend dependencies.

---

### Direction 3 — Richer Checkpoint / Operator UX Polish — COMPLETED (P3)

**What it delivered**:
- `POST /api/agent/tasks/:taskId/apply-file` — promotes a single staged file to the live workspace
- `POST /api/agent/tasks/:taskId/discard-file` — removes a single file from the staging directory
- Per-file apply/discard buttons in the Output panel; visible only when task is not running
- `GET /api/agent/tasks/:taskId/checkpoint-history` — ordered list of checkpoint events per task
- Staging state badges: `runtimeImpactFiles` callout, staged-file badge count, and `liveUnchanged` flag in Output panel
- Per-file inline unified diff viewer: click-to-expand, `+{linesAdded}` / `-{linesRemoved}` badges, backed by `FileSnapshot.diff` from `patchSnapshotWithDiff()`

**Verified**: TypeScript typecheck 0 errors; 37 automated tests passing.

---

### Direction 4 — Environment / Runtime Lifecycle Depth — COMPLETED (P4)

**What it delivered**:
- `RuntimeLifecycleRecord` type: full lifecycle artifact (taskStart snapshot, postApply snapshot, portDiff, processLinkage, `isStaleAfterApply`)
- `captureEnhancedSnapshot()` in `runtimeLifecycle.ts`: port probe + env metadata in parallel; never throws
- `buildRuntimeLifecycleRecord()`: combines snapshots, `runtimeImpactFiles`, and probe entries into a record
- Task-start snapshot captured fire-and-forget in `agentLoop.ts` after `createRunState()`
- Post-apply snapshot captured asynchronously in `routes/checkpoint.ts`; lifecycle record merged into `TaskEvidence` via `setTaskEvidence()`
- Proactive stale-runtime detection: `isStaleAfterApply = true` when `runtimeImpactFiles.length > 0` AND `portDiff.hasChange === false`; `null` when snapshots absent (honest absent-data; no heuristic fallback)
- `runtime_stale_after_apply` outcome enriched with portDiff context in HITL recovery
- `TaskEvidence.runtimeLifecycle` persisted to `history.json` — survives server restart
- Runtime Lifecycle section in Evidence Panel (`RuntimeLifecycleBlock`): renders snapshots, port diff, stale signal, process linkage; honest absent-data degradation throughout

**Verified**: TypeScript typecheck 0 errors on both backend and frontend.

**Partially validated**: Task-start snapshot capture is fire-and-forget; in environments where port probe or `ps aux` fails, `taskStartRuntimeSnapshot` is absent and `isStaleAfterApply` remains `null` — honest handling confirmed; exhaustive failure-scenario coverage not tested.

---

### Direction 5 — Integrations / Ecosystem / MCP-Style Surfaces

**What**: Expand the action surface to include external integrations and protocol-compatible tool surfaces.

**Scope**:
- MCP-style tool surface: expose VenomGPT orchestration endpoints as a structured tool API accessible to external orchestrators
- Integration hooks: allow agent tasks to interact with external services (not just the local filesystem)
- Webhook / event surface: emit task lifecycle events to external consumers

**Why**: The core orchestration model is complete and stable. Exposing it outward is a natural next horizon.

**Risk**: Medium-Heavy — significant design work required before implementation; risk of scope explosion if not bounded tightly.

---

## What Remains Open / Deferred

### Honest Remaining Gaps

| Area | Status |
|---|---|
| Premium workspace orchestration surface (Direction 1) | Partially done (Pass 4 + Pass 8); remaining: dependency graph, scheduler reasoning, replay at scale |
| Advanced action filtering / search in transcript | Open — infrastructure exists; filter UI not wired |
| MCP / ecosystem / integration surfaces | Deferred — longer horizon; requires stable core first |
| `summaryEmitter` extraction | Intentionally deferred — touches messages thread |
| Checkpoint duplication consolidation | Intentionally deferred — low leverage |
| `visualPipeline` extraction | Intentionally deferred — touches while-loop skeleton |
| Broader platform / ecosystem expansion | Deferred — longer horizon |

### What Is Not In Scope

- Full Replit product parity (UI ecosystem, integrations, cloud deployment, multi-tenant operation)
- SaaS / multi-user support (single-workspace model is intentional for local-first design)
- Cloud agent execution

---

## Phased / Priority Summary

| Priority | Direction | Size | Risk | Status |
|---|---|---|---|---|
| P1 | Premium Workspace Orchestration Surface | Medium-Heavy | Medium | Open — highest-value post-core |
| P2 | Advanced Action Filtering / Search | Light | Low | Open — infrastructure ready |
| P3 | Richer Checkpoint / Operator UX Polish | Light-Medium | Low–Medium | **COMPLETED** — per-file apply/discard, staging badges, checkpoint history, per-file diff view |
| P4 | Environment / Runtime Lifecycle Depth | Medium | Medium | **COMPLETED** — RuntimeLifecycleRecord, task-start/post-apply snapshots, proactive stale detection, process linkage, Evidence Panel section |
| P5 | Integrations / Ecosystem / MCP-Style Surfaces | Heavy | Medium-Heavy | Deferred — longer horizon |

**Recommended sequence**: P1 (premium workspace surface) is the highest-leverage direction and should be the primary focus. P2 (advanced filtering) is lower risk and faster — it can be completed before or in parallel with P1 planning without blocking P1. P3 and P4 are confirmed complete. P5 is a longer-horizon pass.

---

## Reference

This roadmap was rewritten after the completion of all four core orchestration phases (April 1, 2026). For the current confirmed working state, see `01-current-state.md`. For the full list of open and deferred items, see `07-pending-phases.md`.

**Note**: After this roadmap was written, a Provider-Layer Stabilization Arc (Tasks #18–#22, April 2, 2026) was completed. The arc established a Z.A.I-only runtime with `providerRouter.ts` + `ZaiDriver.ts` as the active foundation, disconnected Codex/OpenAI provider surfaces from the live product, and deferred Phases 3–5 with documented re-entry conditions (recorded in the Z.A.I-Only Baseline Closeout Record, Task #21). The orchestration architecture described in this roadmap is unaffected by the provider-layer changes.
