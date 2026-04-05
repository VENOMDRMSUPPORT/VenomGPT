# Pass 3: Advanced Action Filtering & Search

  ## What & Why
  The backend captures rich per-action telemetry: action type, file path, command text, duration, success/failure, and phase grouping. The frontend already has `actionSelectors.ts` with `filterActionGroups` infrastructure. However, no filter or search UI exists in the transcript. Users cannot find a specific file operation, command, or phase in a long task run. This pass closes that UX gap with a light, no-backend-change filter layer.

  ## Done looks like
  - A filter bar appears above the action transcript with chips for action types: Read, Write, Shell, Plan, Verify
  - Selecting a chip filters the transcript to show only matching action groups; multiple chips can be selected (OR logic)
  - A search input allows free-text search across file paths and command text
  - A "Collapse all / Expand all" toggle controls the expanded state of all action groups at once
  - Filters and search are local state (no backend calls required); they update the view in real time as the user types
  - Filters persist while the task is being viewed but reset when the user switches to a different task

  ## Out of scope
  - Server-side filtering or search (all data is already in the frontend)
  - Saving or exporting filtered results
  - Date/time range filtering

  ## Tasks
  1. **Filter chip bar component** — Build a compact chip bar with one chip per `ActionType`. Chips toggle on/off; active chips highlight. Place it at the top of the action transcript section inside TaskConsole.

  2. **Text search input** — Add a search input next to the chip bar. Wire it to filter `ActionGroup` entries whose `filePath` or `command` field matches the search string (case-insensitive substring).

  3. **Connect filters to filterActionGroups** — Pass the active chip set and search string into the existing `filterActionGroups` selector in `actionSelectors.ts`. Extend the selector if needed to support text search on path/command.

  4. **Collapse all / Expand all control** — Add a toggle button that sets all action group `expanded` flags to true or false simultaneously. Store this state in component-local state.

  5. **Phase section headers** — Ensure the transcript renders clear phase-group headers (PLANNING / EXECUTING / VERIFYING etc.) between action windows so users know where in the run each group of actions occurred.

  ## Relevant files
  - `artifacts/workspace-ide/src/components/panels/task-console.tsx`
  - `artifacts/workspace-ide/src/lib/actionSelectors.ts`
  - `artifacts/workspace-ide/src/store/use-ide-store.ts`
  