# Pass 1: IDE Route + Core Backend Wiring

  ## What & Why
  The IDE page exists and the backend is fully trusted (97-98% maturity), but the frontend-to-backend wiring has gaps. The IDE route needs to be properly recovered and all 12 backend route surfaces confirmed wired, reachable, and consumed by the frontend. This is the foundational pass — nothing else can close cleanly without it.

  The docs/Next_Stage folder and all pass files must also be created as part of this pass, capturing the full roadmap for the next stage in the project documentation.

  ## Done looks like
  - Navigating to the IDE page loads the workspace correctly without blank screens or broken routes
  - Workspace setup flow (no workspace configured → HomeScreen → project selected → IDE) works end-to-end
  - All API client hooks used in the IDE are confirmed wired to their backend counterparts
  - The WebSocket connection establishes reliably and live_phase events update the IDE state correctly
  - The `docs/Next_Stage/` folder exists with all 5 pass files (Pass-1 through Pass-5) written as complete documentation
  - TypeScript compiles clean in both workspace-ide and api-server after any changes

  ## Out of scope
  - New UI features (those are Pass 2–5)
  - Backend changes (backend is trusted and closed)
  - Provider or model changes

  ## Tasks
  1. **Audit and fix IDE routing** — Confirm the `/ide` route renders correctly in all states (loading, no workspace, workspace set). Fix any blank-screen or stale-route issues introduced by prior layout changes.

  2. **Verify all API client hooks** — Enumerate every hook imported from `@workspace/api-client-react` in the IDE and confirm each one maps to a live backend endpoint. Flag and fix any hooks calling endpoints that have moved or been renamed.

  3. **Confirm WebSocket wiring** — Validate that `use-websocket.ts` correctly handles all event types the backend emits: `thought`, `action_updated`, `live_phase`, `task_complete`, `task_error`. Fix any unhandled or dropped event paths.

  4. **Wire runtime status bar** — Confirm the runtime status bar component is wired to `GET /runtime/status`. If it polls or uses a stale fallback, connect it to the live endpoint.

  5. **Create docs/Next_Stage with all pass files** — Create the `docs/Next_Stage/` folder and write Pass-1 through Pass-5 documentation files matching the full roadmap planned in this session.

  ## Relevant files
  - `artifacts/workspace-ide/src/pages/ide.tsx`
  - `artifacts/workspace-ide/src/App.tsx`
  - `artifacts/workspace-ide/src/hooks/use-websocket.ts`
  - `artifacts/workspace-ide/src/store/use-ide-store.ts`
  - `artifacts/workspace-ide/src/components/home-screen.tsx`
  - `artifacts/api-server/src/routes/index.ts`
  - `artifacts/api-server/src/routes/runtime.ts`
  - `lib/api-client-react`
  - `lib/api-spec`
  