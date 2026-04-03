# VenomGPT Documentation Pack

**Last validated**: April 2, 2026 (post Tasks #1–#16 + HITL Recovery + Orchestration Roadmap Phases 1–4 + P3/P4 Closeout + Provider-Layer Stabilization Arc Tasks #18–#22 + Repo Cleanup)

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

The backend trust stack — orchestration routing, planning, action gating, staged task isolation, durable checkpoint/rollback, runtime-aware verification, persistent observability, task replay, lifecycle maturity, live action broadcasting, dependency classification, bounded semi-parallel read burst, runtime-impact signaling, active-run operator intervention (pause/resume/proceed-as-partial), Human-in-the-Loop Recovery, **actual parallel dispatch foundations** (`parallelDispatcher.ts`), **checkpoint-aware continuation chains** (`continuationChain.ts`, resume-from-checkpoint), **operator steering / approval workflows** (approval gates, `awaiting_approval` / `selectively_blocked` / `approval_denied` / `operator_overridden` lifecycle), and **verification-orchestrated execution** (verification plan per lane, post-merge verification, runtime-aware rechecks, checkpoint-aware retries, confidence shaping, failure-to-repair loops) — is approximately **97–98% toward serious Replit-style backend orchestration / execution trust maturity**.

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

### What Is Still Open

- Premium workspace orchestration surface — expose the full orchestration capability in the product; lane-level evidence panel, dependency graph view, scheduler reasoning surface, continuation lineage view, approval gate UI, replay at orchestration scale
- Advanced action filtering in transcript (filter by type, search by path/command text)
- Product polish (settings page, task history UX)

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

1. **Premium Workspace Orchestration Surface** — expose the full orchestration capability in the product; lane-level evidence panel, dependency graph view, scheduler reasoning surface, continuation lineage view, approval gate UI, and replay at orchestration scale; all four orchestration phases are complete and the model is stable
2. **Advanced action filtering / search** — filter transcript by action type, search by file path or command; infrastructure is in place
3. **Product polish** — settings page, task history UX (opportunistic)

---

## How to Use These Documents

- **Starting a new session**: use `06-project-instructions-template.md` as the session starter. Update the current state section before copying.
- **Understanding what is built**: start with `01-current-state.md`.
- **Planning the next pass**: use `05-next-phase-plan.md` and `07-pending-phases.md`.
- **Debugging Replit drift**: use `02-replit-workflow.md` and `03-prompting-style.md`.
- **Local environment issues**: use `04-local-runbook.md`.
