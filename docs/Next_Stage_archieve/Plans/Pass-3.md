# Pass 3: Advanced Action Filtering & Search

## What & Why
The backend captures rich per-action telemetry: type, file path, command text,
duration, success/failure, and phase grouping. The frontend already has
`actionSelectors.ts` with `filterActionGroups` infrastructure in place. However,
no filter or search UI exists in the transcript today. Users cannot locate a specific
file operation, command, or phase in a long run.

**Priority note**: this pass is self-contained and requires zero backend changes.
It is sequenced at Pass 3 because it is low-risk and fast. However, if resources
are constrained, it may be deferred until after the first half of Pass 4
(Orchestration section + Continuation lineage) without blocking anything.
It does not block Pass 4 or Pass 5.

**Scope constraint**: all filtering is client-side. No new backend calls are added.

---

## Done looks like
- A filter bar appears above the action transcript with chips for: Read, Write, Shell,
  Plan, Verify — each maps to one `ActionType` from `actionSelectors.ts`
- Selecting chips filters the transcript to matching action groups (OR logic);
  multiple chips can be active simultaneously
- A search input filters action groups whose `filePath` or `command` matches the
  typed string (case-insensitive substring, real-time)
- A "Collapse all / Expand all" toggle sets all action group expanded states at once
- Filter state is local to the component; resets when the user switches to a different task
- Phase section headers (PLANNING / EXECUTING / VERIFYING / REPAIRING) appear between
  action windows so users know where each group occurred in the run

## Out of scope
- Server-side filtering or search
- Saving or exporting filtered results
- Date/time range filtering
- Reordering action groups

## Tasks
1. **Filter chip bar** — Build a compact chip bar with one chip per `ActionType`.
   Active chips highlight; clicking toggles on/off. Place it at the top of the action
   transcript section inside `TaskConsole`.

2. **Text search input** — Add a search input next to the chip bar. Wire it to filter
   `ActionGroup` entries whose `filePath` or `command` field matches the typed string.

3. **Connect to filterActionGroups** — Pass the active chip set and search string into
   `filterActionGroups` in `actionSelectors.ts`. Extend the selector if needed to
   support text search on path/command fields.

4. **Collapse all / Expand all** — Add a single toggle button that sets all action
   group `expanded` flags simultaneously. Store in component-local state.

5. **Phase section headers** — Ensure the transcript renders clear phase-group headers
   between action windows. Use the existing `phase` metadata already present in
   `ActionGroup` records.

## Relevant files
- `artifacts/workspace-ide/src/components/panels/task-console.tsx`
- `artifacts/workspace-ide/src/lib/actionSelectors.ts`
- `artifacts/workspace-ide/src/store/use-ide-store.ts`
