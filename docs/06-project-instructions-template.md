# VenomGPT — 06 Project Instructions Template

## Purpose

This is the project instructions template for starting a new ChatGPT or Replit session on VenomGPT. Copy this into the system prompt or the first user message. Update the "Current Project State" section before each new session.

---

## Template

---

### VenomGPT Project Context

You are working on **VenomGPT**, a browser-based local AI coding workspace. The user types a task in natural language; the backend executes it end-to-end on their local codebase (reads files, edits code, runs commands, detects errors, reports results) without constant approval prompts.

---

### Engineering Behavior (Mandatory)

1. **One bounded pass at a time.** Never combine multiple independent changes in a single pass. One objective, one set of target files, one verification criterion.

2. **Evidence hierarchy** (in order of strength):
   - TypeScript compiles clean (exit 0) — required for any backend change
   - Automated tests pass (`pnpm run test`) — required after safety/model changes
   - Runtime behavior confirmed manually — required for agent/UI changes
   - Static read-back — acceptable for non-compilable content only
   - "It looks right" — not evidence; never accept this as done

3. **Anti-drift rules:**
   - Do not touch files outside the stated target list
   - Do not add features not in the stated objective
   - Do not "improve" adjacent code unless explicitly asked
   - Do not skip verification because the change "seems simple"

4. **Confirmed/partial/open/deferred separation.** Every pass closes with an explicit statement of what is now confirmed, what is partial, what is still open, and what is intentionally deferred. Do not leave this implicit.

5. **Plan mode for complex passes.** Any pass that touches more than 3 files or changes more than 200 lines should start with a plan-mode review before implementation.

6. **Decomposition requires a plan first.** Before decomposing any large file, produce a written extraction plan with risk judgments. Do not implement decomposition without an accepted plan.

7. **Never claim unverified work is complete.** If verification failed or was skipped, state that explicitly. Partial completion is honest; fake completion is not.

---

### Current Project State

*Update this section before each new session.*

**Confirmed completed (backend / orchestration)**
- Task routing (taskRouter.ts): categorizes tasks — `conversational | visual_describe | visual_report | visual_fix | visual_improve | visual_analyze | code_edit | code_verify | server_check | text_explain`
- Planning phase (planner.ts): structured pre-execution plan with goal, approach, files, expected changes
- Action gating (actionRouter.ts): per-action policies, side-effect classification, gate trigger telemetry
- Staged task isolation (stagingStore.ts): all writes go to staging; live workspace untouched until apply
- Durable checkpoint + rollback (checkpoint.ts): staged commit/discard lifecycle, diff evidence
- Verification ledger (verificationLedger.ts): command_success / static_read / runtime_probe evidence
- Persistent observability (TaskEvidence): route profile, plan data, checkpoint summary, execution summary
- Task replay (GET /api/agent/tasks/:id/replay): sequenced narrative from persisted evidence
- Lifecycle maturity: `pending → running → done | error | cancelled | interrupted | stalled`
- agentLoop decomposition pass 1: evidenceAssembler.ts, actionExecutor.ts extracted
- Action-level execution model: ActionRecord, ActionType, ActionStatus, ActionStore
- Action instrumentation: fileTools.ts, stagingStore.ts, actionExecutor.ts, verificationLedger.ts
- Action endpoint: GET /api/agent/runs/:taskId/actions
- Live action streaming via WebSocket: broadcastActionUpdate in wsServer.ts; action_updated events subscribed in use-websocket.ts; polling removed
- sideEffectsObserved tracking: classified side-effect entry per run_command in RunState, surfaced in executionSummary
- Dependency classifier (dependencyClassifier.ts): classifies each step as strictly_sequential | potentially_independent | verification_gated | repair_driven
- DependencyAnalysis accumulator: per-task counts, potentiallyIndependentActionIds, serialReason
- scheduling_truth events: post-planning (expected shape, phase + category; no counts) and post-done (actual shape, counts + independentCount + serialReason; full ID list in persisted executionSummary.dependencyAnalysis)
- Bounded semi-parallel read burst (readBurstExecutor.ts): planning-phase filesToRead dispatched concurrently via Promise.all; individual read error isolation; paths capped to maxFileReads profile limit
- Runtime-impact signaling: runtimeImpactFiles in TaskEvidenceCheckpointSummary; set by classifyRuntimeImpactFiles at checkpoint creation; extracted by evidenceAssembler.ts; used by HITL recovery recheck_runtime affordance
- Operator intervention endpoints: POST /agent/tasks/:id/pause (sets paused=true, loop halts at next inter-step boundary), POST /agent/tasks/:id/resume (clears paused flag, loop continues), POST /agent/tasks/:id/proceed-as-partial (sets partialProceed=true when phase==="blocked", loop calls done with final_status "partial")
- InterventionKind in RunState: "pause" | "blocked" | "partial_proceed" | null; broadcast with every live_phase event; paused, partialProceed, interventionKind, blockedContext fields added to RunState and initialized in createRunState
- HITL Recovery: GET /agent/tasks/:id/recovery-options returns RecoveryAssessment with outcomeClass (clean_done | partial | blocked | verification_limited | runtime_stale_after_apply | cancelled_with_progress | interrupted_with_progress | step_budget_exhausted | error_no_recovery), whatHappened, whatRemains, and three typed RecoveryAffordance entries (retry_verification, continue_partial, recheck_runtime); derived from persisted task state only — no fabrication
- Parallel Dispatch Foundations (Phase 1): parallelDispatcher.ts — bounded dispatch lane with parallelEligibilityGate, executeWave (concurrent cohort execution), joinLanes (join semantics), DispatchMode (parallel / serial_fallback), failure isolation per lane, cancellation propagation via AbortController; scheduling-truth events updated to reflect actual dispatch decisions
- Checkpoint-Aware Continuation Chains (Phase 2): continuationChain.ts — continuation chain model; POST /agent/tasks/:taskId/resume-from-checkpoint (structured resume, distinct from retry-from-start); buildWhatRemains (grounded remaining-work model from original plan vs. confirmed-complete actions); validateCheckpointForResume (invalidation rules: checkpoint_applied_overwritten, checkpoint_discarded); continuation lineage (ancestryDepth, origin checkpoint ID) surfaced in evidence and replay endpoints
- Operator Steering + Approval Workflows (Phase 3): POST /agent/tasks/:taskId/register-gate (approval gate, optionally scoped to laneIds); /approve, /deny, /approve-selective; run lifecycle phases: awaiting_approval, selectively_blocked, approval_denied, operator_overridden; validateLaneSteering (lane-safe pause/cancel); validateSelectiveSafety (no dangling dependencies in partial approvals); recovery affordances: resubmit_after_denial, view_approval_checkpoint
- Verification-Orchestrated Execution (Phase 4): verification plan per lane (each lane carries own verification requirements as first-class execution graph participant); post-merge verification pass triggered on lane merge; runtime-aware rechecks (re-triggered by state changes: file applied, command run, lane merged); checkpoint-aware verification retries (re-verify from known checkpoint state); confidence shaping (aggregated evidence from multiple verification passes); failure-to-repair loops (failed verification triggers structured repair plan, not raw error)

**Confirmed completed (frontend / product)**
- Workspace layout overhaul: 2-panel flex (TaskConsole 300px + CodeEditor flex:1)
- TaskConsole collapses to 48px icon rail; FileExplorerPanel is a right-side panel (fixed right-0, 340px, open by default)
- TopBar: file tabs, connection status, explorer toggle, + menu
- Transcript-first rendering: stage-aware thought items with colored badges
- Compact file-read grouping; structured plan card; FailureCard with category badge
- TaskSummaryCard: elapsed time, step count, changed files, checkpoint actions, action tallies
- WebSocket action streaming (no polling) and action-aware transcript (ActionGroupRow, action selectors)
- Grouped action rendering: single verb+path+exit; multiple count label + expandable
- Replay / Evidence UI: evidence-panel.tsx with Route Profile, Plan, Checkpoint Summary, Execution Summary, Action Records sections; accessible via "Inspect" tab in TaskConsole
- Inspect tab: available for completed/historical tasks only; disabled during active/live runs; canInspect is status-based (terminal status or null/fallback), not evidence-presence-based
- Action type filter chips + text search in EvidencePanel (reset on task switch)
- Phase-grouped action sections via assignActionsToWindows; absent-data placeholders throughout
- Tool Introspection panel (tool-introspection-panel.tsx): per-type stat cards, execution shape badge, command class chips; derived from existing ActionRecord[] only
- Per-file apply/discard (POST /api/agent/tasks/:taskId/apply-file, /discard-file); per-file buttons in Output panel; staging badges; checkpoint history endpoint (GET .../checkpoint-history); inline unified diff viewer with +/- line count badges (P3)
- Runtime Lifecycle section in Evidence Panel (RuntimeLifecycleBlock): task-start snapshot, post-apply snapshot, port diff, stale signal, process linkage; honest absent-data degradation (P4)

**Intentionally deferred**
- summaryEmitter extraction — touches messages thread
- Checkpoint duplication consolidation — low leverage at current size
- visualPipeline extraction — touches while-loop skeleton
- Broader platform / ecosystem expansion

**Current open areas (not deferred, but not started)**
- Premium workspace orchestration surface — expose the full orchestration capability in the product; lane-level evidence panel, dependency graph view, scheduler reasoning surface, continuation lineage view, approval gate UI, replay at orchestration scale
- Advanced action filtering / search in transcript (infrastructure in place; filter UI not wired)
- Product polish: settings page, task history UX

**Backend maturity judgment**
~97–98% toward serious Replit-style orchestration / execution trust / lifecycle maturity — **backend-wise only**. Not full Replit product parity. Not full premium product UI surface (next maturity arc). All four orchestration phases (Phases 1–4: parallel dispatch, continuation chains, operator steering / approval workflows, verification-orchestrated execution) are confirmed complete. P3 (per-file apply/discard, staging badges, checkpoint history, per-file diff view) and P4 (runtime lifecycle depth — task-start/post-apply snapshots, proactive stale detection, process linkage, Evidence Panel section) are confirmed complete.

---

### Stack Reference

- Monorepo: pnpm workspaces
- Backend: Express 5, WebSocket (`ws`), TypeScript, esbuild
- Frontend: React + Vite, Monaco, Tailwind CSS, Zustand, TanStack Query, Wouter
- AI: Z.AI primary (glm-5.1 agentic, glm-4.6v vision); Replit OpenAI fallback
- Database: PostgreSQL + Drizzle ORM (available, not core to MVP)
- Key directories: `artifacts/api-server/src/`, `artifacts/workspace-ide/src/`

### Key files (backend)
- `lib/agentLoop.ts` — orchestrator (do not touch skeleton/thread/cancellation without plan)
- `lib/agentLoop/evidenceAssembler.ts` — TaskEvidence assembly (extracts runtimeImpactFiles from checkpoint event)
- `lib/agentLoop/actionExecutor.ts` — action dispatch
- `lib/agentLoop/readBurstExecutor.ts` — semi-parallel planning-phase read burst (Promise.all over filesToRead)
- `lib/orchestrator/actionModel.ts` — canonical ActionRecord schema
- `lib/orchestrator/actionStore.ts` — in-memory action store singleton (calls broadcastActionUpdate on each transition)
- `lib/orchestrator/checkpoint.ts` — staged commit/discard lifecycle; classifyRuntimeImpactFiles sets runtimeImpactFiles
- `lib/orchestrator/stagingStore.ts` — per-task staging layer
- `lib/orchestrator/actionRouter.ts` — action gating + gate triggers
- `lib/orchestrator/verificationLedger.ts` — verification evidence accumulation
- `lib/orchestrator/dependencyClassifier.ts` — step dependency class classifier
- `lib/orchestrator/types.ts` — RunState, InterventionKind, createRunState (paused, partialProceed, interventionKind, blockedContext)
- `lib/sessionManager.ts` — task storage, events, failure details
- `lib/taskPersistence.ts` — ~/.venomgpt/history.json
- `lib/wsServer.ts` — WebSocket broadcast (broadcastActionUpdate, broadcastLivePhase, action_updated events)
- `routes/agent.ts` — task CRUD, evidence, replay, actions, capabilities, pause/resume/proceed-as-partial, recovery-options endpoints
- `routes/checkpoint.ts` — checkpoint status, apply, discard endpoints

### Key files (frontend)
- `pages/ide.tsx` — main IDE page (2-panel flex layout)
- `components/panels/task-console.tsx` — transcript console, composer, inspect tab
- `components/panels/evidence-panel.tsx` — Replay/Evidence inspection surface (Inspect tab content)
- `components/panels/tool-introspection-panel.tsx` — Tool Introspection section within EvidencePanel
- `components/layout/top-bar.tsx` — tabs, status, drawer triggers
- `hooks/use-websocket.ts` — WebSocket client (handles action_updated, scheduling_truth, live_phase events)
- `lib/actionSelectors.ts` — ActionGroup derivation, assignActionsToWindows, computeActionTallies, deriveExecutionShape
- `store/use-ide-store.ts` — Zustand global IDE state

---

### Session Objective

*Replace this with the specific bounded objective for this session.*

```
This session: [one-sentence objective]
Target files: [list]
Out of scope: [explicit list]
Verification: [typecheck | tests | runtime behavior | specific check]
Done means: [evidence statement]
```

---
