# Pass 5: Product Polish — Settings, History & Board

> **STATUS: COMPLETED** — All three sub-groups delivered and confirmed. Sub-group A: settings load/save/reset/history-clear with toast feedback. Sub-group B: task history search input, status filter chips, match count (bulk-delete disabled per Option C — no per-task delete endpoint). Sub-group C: board status-change buttons + plan association badges (`updateBoardTaskStatus` + `GET /board/plans`), live prompt suggestions (`GET /board/prompts`) in workspace composer, and ProviderDiagnosticsPanel on the integrations page. Pass closed April 2026.

## What & Why
The backend has complete settings management, full task board APIs, and provider
diagnostics. The frontend settings page and board view are partially wired but not
fully functional. This pass closes PP1 (Settings Page), PP2 (Task History UX), and
the board kanban surface, delivering the final product-completeness layer.

**Drift risk**: this pass contains the widest scope in the roadmap (6 distinct
delivery areas). To prevent scope creep and drift, it is split into three
**bounded sub-groups** below. Each sub-group is an independent unit that can be
reviewed and accepted before the next one starts.

**Exit condition per sub-group**: each sub-group has its own Done looks like.
Do not advance to the next sub-group until the current one is confirmed done.

---

## Sub-group A — Settings Page (deliver first)

**Scope**: settings page only. No history, no board.

**Done looks like**:
- Settings page loads current values from `GET /settings` on mount
- Model selection, verification threshold, and any other exposed settings save via
  `PATCH /settings` with success/error toast feedback
- "Reset to defaults" button calls `POST /settings/reset` with a confirmation dialog
- "Clear task history" calls `DELETE /settings/history` with a confirmation dialog
- TypeScript compiles clean after changes

**Tasks**:
1. **Wire settings load** — On mount, call `GET /settings` and populate all form
   controls with the returned values.
2. **Wire settings save** — On each control change or explicit Save action, call
   `PATCH /settings`. Show a success toast or inline error.
3. **Reset and history-clear actions** — Wire the reset and history-clear buttons to
   their endpoints. Both require a confirmation dialog before the call is made.

**Relevant files**:
- `artifacts/workspace-ide/src/pages/settings.tsx`
- `artifacts/workspace-ide/src/hooks/use-settings.ts`
- `artifacts/api-server/src/routes/settings.ts`

---

## Sub-group B — Task History UX (deliver second)

**Scope**: history drawer improvements only. No board, no settings.

**Done looks like**:
- History drawer has a search input that filters tasks by prompt text (client-side)
- Status filter chips (done, error, cancelled, interrupted) narrow the list
- Match count is shown when a filter is active
- Checkbox selection enables bulk-delete of completed tasks, with a confirmation dialog
  before any deletion is performed

**Tasks**:
1. **Search and status filter** — Add a search input and status chips to the history
   drawer. Wire to client-side filtering of the task list already in store. Show match
   count.
2. **Bulk-delete** — Add checkbox selection to history drawer items. "Delete selected"
   action calls the history delete endpoint for each selected task after a confirmation
   dialog. Show per-item error if any deletion fails.
   **Verification required before coding**: read `artifacts/api-server/src/routes/settings.ts`
   to confirm whether history deletion is per-task (DELETE with task id), batch
   (DELETE with id list in body), or a full-history wipe only. Implement exactly what
   the endpoint supports — do not add a per-task loop if only batch is available, and
   do not assume batch if only individual deletion exists.

**Relevant files**:
- `artifacts/workspace-ide/src/components/panels/task-list-panel.tsx`
- `artifacts/workspace-ide/src/store/use-ide-store.ts`
- `artifacts/api-server/src/routes/settings.ts`

---

## Sub-group C — Board & Integrations (deliver third)

**Scope**: board kanban + quick-start prompts + integrations provider status.

**Done looks like**:
- The board view renders all task status columns and pulls from `GET /board/tasks`
- Status changes (via button, not drag-and-drop) are wired to the correct PATCH
  endpoint; drag-and-drop is explicitly out of scope for this pass
- Plan associations are pulled from `GET /board/plans` and shown on board cards
- When the composer is empty and no task is active, up to 3 prompt suggestions from
  `GET /board/prompts` appear as clickable chips below the input
- The integrations page shows active provider (Z.A.I), model, lane config, and
  connection health from `GET /provider-diagnostics`

**Guardrail**: drag-and-drop status changes are explicitly deferred to a future pass.
Status changes in this pass use a button/dropdown only.

**Tasks**:
1. **Board kanban** — Ensure the board view pulls from `/board/tasks` and renders all
   status columns. Add status-change buttons (not drag-and-drop) wired to the PATCH
   endpoint. Show plan associations from `/board/plans` on each card.
2. **Board prompt suggestions** — Fetch `/board/prompts` when the composer is idle.
   Render up to 3 suggestions as clickable chips. Clicking fills the composer input.
3. **Integrations page — provider status** — Replace placeholder content with a live
   provider status view wired to `GET /provider-diagnostics`.

**Relevant files**:
- `artifacts/workspace-ide/src/components/panels/task-board.tsx`
- `artifacts/workspace-ide/src/components/layout/workspace-composer.tsx`
- `artifacts/workspace-ide/src/pages/integrations.tsx`
- `artifacts/api-server/src/routes/taskBoard.ts`
- `artifacts/api-server/src/routes/providerDiagnostics.ts`
- `lib/api-client-react`

---

## Global out of scope (entire Pass 5)
- Drag-and-drop board status changes (deferred)
- Multi-workspace board views
- Exporting task history to CSV or JSON
- Third-party integrations beyond Z.A.I provider status
- Any backend changes
