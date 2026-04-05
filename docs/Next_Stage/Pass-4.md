# Pass 4: Premium Orchestration UI Surface

  ## What & Why
  The backend has four complete orchestration phases: parallel dispatch, checkpoint-aware continuation chains, operator approval gates, and verification-orchestrated execution. None of this is cleanly surfaced in the UI beyond raw log events. This is the highest-leverage pass in the roadmap — it transforms VenomGPT from an agent with a transcript into a genuine orchestration workspace. This is the P1 direction from the post-orchestration roadmap.

  ## Done looks like
  - The Evidence Panel has a dedicated "Orchestration" section showing lane-level dispatch data: how many lanes ran in parallel, which succeeded/failed, and the dispatch mode (parallel vs serial_fallback)
  - A continuation lineage view shows the ancestry chain for resumed tasks: origin task → checkpoint → resumed run, with depth indicator
  - When a task enters `awaiting_approval` phase, the task console shows an Approval Gate card with Approve / Deny / Approve Selective actions wired to the backend endpoints
  - When a task is in `selectively_blocked` state, the UI shows which lanes are blocked and which are proceeding
  - The provider diagnostics view (accessible from settings or a dev panel) is wired to `GET /provider-diagnostics` and shows active provider, model, lane config, and any startup warnings
  - The runtime status panel is fully wired to `GET /runtime/status` and shows server port, running processes, and stale detection state

  ## Out of scope
  - Visual graph rendering (node-graph / D3 layouts) — text-based structured views are sufficient for this pass
  - Multi-workspace parallel views
  - Editing or reconfiguring lanes from the UI

  ## Tasks
  1. **Orchestration section in Evidence Panel** — Add a new "Orchestration" section to `evidence-panel.tsx` that renders lane dispatch data from `TaskEvidence`. Show dispatch mode, lane count, per-lane status, and any failure isolation events.

  2. **Continuation lineage view** — In the Evidence Panel or a dedicated tab, render the continuation ancestry chain. Pull `ancestryDepth` and origin checkpoint ID from the evidence replay endpoint and display as a linear chain with depth badges.

  3. **Approval gate UI card** — When `livePhase.phase === "awaiting_approval"`, render an ApprovalGateCard in the TaskConsole. Wire three actions: Approve all (`POST /approve`), Deny (`POST /deny`), and Approve selective (`POST /approve-selective` with lane selection UI).

  4. **Selectively blocked lane indicator** — When phase is `selectively_blocked`, show which lanes are blocked vs proceeding. Pull lane state from the live phase broadcast and render a compact lane status grid.

  5. **Provider diagnostics panel** — Wire `GET /provider-diagnostics` to a provider info panel accessible from the settings page or a command palette shortcut. Display active provider name, model, lane count, and diagnostic messages.

  6. **Runtime status wiring** — Confirm `GET /runtime/status` is polled or subscribed to and the runtime status bar reflects current server state including port, process list, and stale-after-apply detection.

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
  