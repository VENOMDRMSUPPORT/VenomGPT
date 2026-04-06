# Pass 4: Premium Orchestration UI Surface

> **STATUS: COMPLETED** — All six tasks delivered and confirmed. OrchestrationBlock (lane dispatch data in Evidence Panel), continuation lineage view, ApprovalGateCard (with `checkpointId` + `APPROVAL_CHECKPOINT` source), SelectivelyBlockedLaneGrid (compact lane status grid), ProviderDiagnosticsPanel (wired to `GET /provider-diagnostics`), and runtime status wiring are all live. Pass closed April 2026.

## What & Why
The backend has four complete orchestration phases: parallel dispatch,
checkpoint-aware continuation chains, operator approval gates, and
verification-orchestrated execution. None of this is surfaced in the UI beyond
raw log events. This is the highest-leverage pass in the roadmap — it transforms
VenomGPT from "an agent with a transcript" into a genuine orchestration workspace.
This is the P1 direction from the post-orchestration roadmap.

**Product identity note**: this is the pass that defines what VenomGPT *is*.
The approval gate UI and continuation lineage view especially. Prioritise tasks
1 and 2 first — they are the highest product-defining items. Tasks 3–6 follow.

**Scope constraint**: text-based structured views only. No node-graph or D3
rendering. No backend changes.

---

## Execution order within this pass

Execute in this order to maximise visible product value early:

| Step | Task | Why first |
|------|------|-----------|
| A | Orchestration section in Evidence Panel | Grounds the lane model visually |
| B | Continuation lineage view | Defines task ancestry — core product identity |
| C | Approval gate UI card | Exposes operator control surface |
| D | Selectively blocked lane indicator | Companion to approval gate |
| E | Provider diagnostics panel | Operational utility |
| F | Runtime status wiring | Confirm or fix (may already be wired from Pass 1) |

---

## Done looks like
- The Evidence Panel has a dedicated "Orchestration" section showing lane-level
  dispatch data: dispatch mode (parallel vs serial_fallback), lane count,
  per-lane status (success / failed / cancelled), and any failure isolation events
- A continuation lineage view renders the ancestry chain for resumed tasks:
  origin task → checkpoint → resumed run, with depth badge and origin checkpoint ID
- When a task enters `awaiting_approval` phase, the task console shows an
  ApprovalGateCard with three wired actions: Approve all, Deny, and Approve selective
  (with lane selection for selective approval)
- When a task is in `selectively_blocked` state, a compact lane status grid shows
  which lanes are blocked vs proceeding
- A provider diagnostics panel (accessible from settings or a keyboard shortcut)
  shows active provider, model, lane config, and startup warnings — wired to
  `GET /provider-diagnostics`
- The runtime status bar reflects live data from `GET /runtime/status` including
  port, process list, and stale-after-apply state (note: this may already be done in
  Pass 1; confirm before re-implementing)

## Out of scope
- Visual graph rendering (node-graph / D3 / canvas layouts)
- Multi-workspace parallel views
- Editing or reconfiguring lanes from the UI
- Any backend changes

## Tasks
1. **Orchestration section in Evidence Panel** — Add an "Orchestration" section to
   `evidence-panel.tsx`. Render lane dispatch data from `TaskEvidence`: dispatch mode,
   lane count, per-lane status, failure isolation events.

2. **Continuation lineage view** — In the Evidence Panel (new tab or new section),
   render the continuation ancestry chain as a linear list with depth badges. Pull
   `ancestryDepth` and origin checkpoint ID from the evidence replay endpoint.

3. **Approval gate UI card** — When `livePhase.phase === "awaiting_approval"`, render
   an `ApprovalGateCard` in the TaskConsole. Wire three approval actions.
   **Verification required before coding**: read `lib/api-spec/openapi.yaml` and
   `lib/api-client-react` to confirm the exact endpoint paths and request body shapes
   for approve / deny / approve-selective. The paths written in this document
   (`/approve`, `/deny`, `/approve-selective`) are indicative — do not assume them.
   Use the spec as the source of truth. If the paths differ, follow the spec.

4. **Selectively blocked lane indicator** — When phase is `selectively_blocked`, show
   a compact lane status grid. Pull lane state from the `live_phase` WebSocket event.

5. **Provider diagnostics panel** — Wire `GET /provider-diagnostics` to a panel
   accessible from settings or a command shortcut. Show provider name, model,
   lane count, and any startup diagnostic messages.

6. **Runtime status wiring** — If not completed in Pass 1, confirm or fix the
   runtime status bar to reflect live data from `GET /runtime/status`.

## Relevant files
- `artifacts/workspace-ide/src/components/panels/evidence-panel.tsx`
- `artifacts/workspace-ide/src/components/panels/task-console.tsx`
- `artifacts/workspace-ide/src/components/panels/recovery-card.tsx`
- `artifacts/workspace-ide/src/store/use-ide-store.ts`
- `artifacts/workspace-ide/src/lib/evidenceTypes.ts`
- `artifacts/api-server/src/routes/providerDiagnostics.ts`
- `artifacts/api-server/src/routes/runtime.ts`
- `artifacts/api-server/src/routes/agent.ts`
- `lib/api-client-react`
