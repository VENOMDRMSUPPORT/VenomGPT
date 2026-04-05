# Execution Prompt — Pass 3: Advanced Action Filtering & Search

---

## Current confirmed state

- Pass 1 is complete. All wiring is confirmed.
- `actionSelectors.ts` has `filterActionGroups`, `assignActionsToWindows`,
  `computeActionTallies`, and `ActionGroup` / `ActionType` types — all in place.
- `task-console.tsx` renders action groups but has no filter UI.
- Zero backend changes are needed or permitted in this pass.
- This pass may be executed after the first half of Pass 4 (Steps A and B) if
  resources are constrained — it does not block Pass 4 or Pass 5.

---

## Your mission

Add a client-side filter and search layer to the action transcript in `TaskConsole`.
No backend calls. No new data fetching. All filtering operates on data already in
the Zustand store.

---

## Forbidden actions

- Do not add any new API calls or modify any hook in `lib/api-client-react`.
- Do not modify any file under `artifacts/api-server/src/`.
- Do not add drag-to-reorder or date-range filtering.
- Do not persist filter state across task switches — it must reset on task change.

---

## Step-by-step execution

### Step 1 — Filter chip bar
Add a compact chip bar at the top of the action transcript section inside `TaskConsole`.
One chip per `ActionType`: `read`, `write`, `shell`, `plan`, `verify`.
- Chips are toggleable. Active chips are visually highlighted.
- Multiple chips can be active simultaneously (OR logic: show groups matching any active chip).
- When no chips are active, all groups are shown (no filter applied).
- Store active chip set in component-local state (`useState<Set<ActionType>>`).

### Step 2 — Text search input
Add a search input next to the chip bar.
- Filter `ActionGroup` entries whose `filePath` or `command` field contains the
  search string (case-insensitive substring match).
- Filtering is real-time (on every keystroke, no debounce required).
- Store search string in component-local state (`useState<string>`).

### Step 3 — Connect to filterActionGroups
In `actionSelectors.ts`, extend or wrap `filterActionGroups` to accept:
- `activeTypes: Set<ActionType>` — if non-empty, keep only groups where `type` is in the set.
- `searchText: string` — if non-empty, keep only groups where `filePath` or `command`
  includes the string (case-insensitive).
Both filters compose with AND logic (a group must pass both to appear).
Pass both values from the component state into this selector.

### Step 4 — Collapse all / Expand all
Add a single toggle button in the filter bar area.
- Label alternates: "Collapse all" when any group is expanded; "Expand all" when all are collapsed.
- Clicking sets all action group `expanded` flags simultaneously.
- Store in component-local state (`useState<boolean>`).
- This overrides individual group toggle state.

### Step 5 — Phase section headers
Confirm that the transcript renders a phase header (e.g. `── PLANNING ──`,
`── EXECUTING ──`) between action windows that belong to different phases.
Use the `phase` field already present on `ActionGroup` records.
If headers are missing or inconsistent, add them.

---

## Required evidence

1. **Chip bar confirmation** — list of the exact `ActionType` values rendered as chips.
2. **Filter composition rule** — one sentence: how chip filter and text search compose (AND/OR).
3. **filterActionGroups extension** — the updated function signature showing the two new parameters.
4. **Reset behavior confirmation** — where in the code the filter state resets on task switch.
5. **Phase headers confirmation** — confirmed present or added, with file:line reference.
6. **TypeScript compilation** — 0 errors in workspace-ide.

---

## Final response format

```
## Pass 3 Completion Report

### 1. Chip types
[list of ActionType values rendered as chips]

### 2. Filter composition
[one sentence]

### 3. filterActionGroups signature
[updated function signature]

### 4. Reset on task switch
[file:line where state resets]

### 5. Phase headers
[confirmed / added — file:line]

### 6. TypeScript
workspace-ide: 0 errors ✅
```
