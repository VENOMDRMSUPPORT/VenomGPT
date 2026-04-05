# Pass 5: Product Polish — Settings, History & Board

  ## What & Why
  The backend has complete settings management (`GET/PATCH /settings`, `POST /settings/reset`, `DELETE /settings/history`) and a full task board model (`/board`, `/board/tasks`, `/board/plans`, `/board/prompts`). The frontend settings page and board view are partially wired but not fully functional. This pass closes PP1 (Settings Page), PP2 (Task History UX), and the board kanban surface, delivering the final layer of product completeness needed for the IDE to feel like a finished product.

  ## Done looks like
  - The settings page is fully functional: users can change the agentic model, adjust verification threshold, and clear task history — all wired to backend endpoints with success/error feedback
  - The task history drawer supports search by prompt text and filter by status (done, error, cancelled, interrupted)
  - The history drawer shows a count badge and supports bulk-delete of selected completed tasks
  - The board view (kanban surface) renders tasks in the correct status columns, supports drag-and-drop status changes, and shows plan/prompt associations from the board API
  - Board prompts (`/board/prompts`) are surfaced as quick-start suggestions in the composer when no active task is running
  - The integrations page shows the active provider (Z.A.I) and its connection status, wired to provider diagnostics

  ## Out of scope
  - Multi-workspace board views
  - Exporting task history to CSV or JSON (future)
  - Third-party integrations beyond Z.A.I provider status

  ## Tasks
  1. **Settings page completion** — Wire model selection, verification threshold, and history management controls to `GET/PATCH /settings` and `DELETE /settings/history`. Add confirmation dialog for history clear. Show success/error toast feedback.

  2. **Task history search and filter** — Add a search input and status filter chips to the history drawer. Wire to client-side filtering of the task list already in store. Show match count.

  3. **History bulk operations** — Add checkbox selection to history drawer items. Provide a "Delete selected" action that calls the appropriate endpoint for each selected task. Show a confirmation dialog before deletion.

  4. **Board kanban completeness** — Ensure the board view renders all task status columns and pulls from `/board/tasks`. Wire status changes (drag or button) to the correct PATCH endpoint. Pull plan associations from `/board/plans`.

  5. **Board prompts as quick-start suggestions** — When the composer is empty and no task is running, fetch `/board/prompts` and show up to 3 prompt suggestions below the input as clickable chips.

  6. **Integrations page — provider status** — Replace any placeholder content on the integrations page with a live view of the active provider (Z.A.I), its model config, and connection health from the provider diagnostics endpoint.

  ## Relevant files
  - `artifacts/workspace-ide/src/pages/settings.tsx`
  - `artifacts/workspace-ide/src/pages/integrations.tsx`
  - `artifacts/workspace-ide/src/hooks/use-settings.ts`
  - `artifacts/workspace-ide/src/components/panels/task-board.tsx`
  - `artifacts/workspace-ide/src/components/panels/task-list-panel.tsx`
  - `artifacts/workspace-ide/src/components/layout/workspace-composer.tsx`
  - `artifacts/api-server/src/routes/settings.ts`
  - `artifacts/api-server/src/routes/taskBoard.ts`
  - `lib/api-client-react`
  