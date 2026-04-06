# Execution Prompt — Pass 9: Action ID Cross-Reference in DependencyGraphBlock

---

## Current confirmed state

- Passes 1–8 are complete.
- `DependencyGraphBlock` in `evidence-panel.tsx` already renders:
  - `serialReason` — shown as "Scheduler reasoning" ✅
  - `counts` breakdown table with per-class count and percentage ✅
  - `potentiallyIndependentActionIds` — collapsible chip list showing raw UUIDs ✅
- The raw UUID display is the only confirmed remaining gap: a user cannot tell
  from a UUID which file or command each ID refers to.
- `ActionRecord` is defined in `artifacts/workspace-ide/src/lib/actionSelectors.ts`
  (not `evidenceTypes.ts`). Confirmed fields: `id: string`, `type: ActionType`,
  `meta: ActionMeta` (where `meta.filePath` holds the file path for read/write
  actions), `status: ActionStatus`.
- `DependencyAnalysis.potentiallyIndependentActionIds` contains action `id` values
  that match `ActionRecord.id`.
- No per-step list exists in `DependencyAnalysis`. No per-step reasoning strings
  exist. Do not attempt to surface data that is not in the confirmed shape.
- No backend changes are needed or permitted in this pass.
- Sub-group B (replay at orchestration scale) is explicitly out of scope —
  no backend lane-timeline endpoint exists.

---

## Your mission

Deliver one bounded UI addition:

**Task A** — Replace the raw UUID chip list inside the collapsible
`potentiallyIndependentActionIds` section of `DependencyGraphBlock` with a
human-readable row per action: show `type` + `meta.filePath` (where applicable)
+ `status` looked up from `ActionRecord[]`.

Execute the verification step (A0) before writing any code.

---

## Forbidden actions

- Do not modify any file under `artifacts/api-server/src/`.
- Do not add per-step dependency classification rows — `DependencyAnalysis` has
  aggregate counts only; no per-step list exists.
- Do not add per-step scheduler reasoning strings — `serialReason` is a single
  run-level string; no per-step reasoning field exists.
- Do not add node-graph, D3, or canvas-based rendering.
- Do not add a replay-at-scale UI — no lane-timeline endpoint exists.
- Do not invent field names. If a field cannot be confirmed from the source files,
  stop and report the blocker.
- Do not add new fetch calls — all data is already in scope.
- **Stop condition**: if `ActionRecord[]` is not reachable in `DependencyGraphBlock`'s
  scope without significant prop threading, stop and report the minimum threading
  path needed. Do not thread props through layers that do not need them.

---

## Task A — Action ID cross-reference

### Step A0 — Verification (required before any coding)

Read `artifacts/workspace-ide/src/lib/actionSelectors.ts`. Confirm and record:

1. The exact field name that holds the action identifier — expected: `id`.
2. The exact field name for action type — expected: `type`.
3. The exact string values used for the action types that carry file paths
   (e.g. `READ_FILE`, `WRITE_FILE`) and for exec-command actions — record all
   values that are candidates for display.
4. The shape of `ActionMeta` and where `filePath` lives — expected:
   `meta.filePath` for read/write actions, absent or different for exec-command.
5. The exact field name for action status — expected: `status`.

Read `artifacts/workspace-ide/src/components/panels/evidence-panel.tsx` around
`DependencyGraphBlock` (line 1357 onward) and its call site. Confirm and record:

6. Whether `ActionRecord[]` is already in scope at `DependencyGraphBlock` — as
   a prop, a store selector, or a closure variable.
7. If NOT in scope: identify the nearest ancestor in the call chain that holds
   `ActionRecord[]` and the minimum prop threading required.
8. The exact variable name and shape of `potentiallyIndependentActionIds` as it
   arrives in the component.

Do not write any component code until all eight items are confirmed.

### Step A1 — Cross-reference implementation

Replace the raw UUID chip grid inside the collapsible section with a lookup
table. For each entry in `potentiallyIndependentActionIds`:

- Find the matching `ActionRecord` by `id`.
- If found: show `type` (as a readable label or badge) and `meta.filePath`
  (truncated to the filename or last path segment) and `status`.
- If `meta.filePath` is absent for the action type (e.g. exec-command), show
  the command or tool name from `meta` instead — use whichever field is
  confirmed in A0 item 4.
- If no matching `ActionRecord` is found (older tasks, ID mismatch): show the
  raw UUID with a visual indicator (e.g. dim styling, "unresolved" label) —
  do not crash, do not hide the row.

The expand/collapse toggle behavior is unchanged.
The collapsed state must be visually identical to the current baseline.

**Task A evidence**:
1. `ActionRecord.id` field name: confirmed from `actionSelectors.ts`.
2. `ActionRecord.type` field name and relevant type string values: confirmed.
3. `meta.filePath` path: confirmed (field chain from `ActionRecord` to file path).
4. Exec-command display field: confirmed (what is shown when `filePath` is absent).
5. `ActionRecord.status` field name: confirmed.
6. `ActionRecord[]` in scope at `DependencyGraphBlock`: confirmed (variable/prop
   name + file:line where it enters scope), OR minimum threading path described.
7. Cross-reference lookup: file:line of the `find`/`Map` lookup against
   `ActionRecord[]` using the confirmed ID field.
8. Fallback UUID row: file:line of the fallback render condition.
9. Expand toggle: unchanged behavior confirmed (file:line of toggle state).
10. TypeScript: 0 errors in `workspace-ide`.

---

## Final response format

```
## Pass 9 Completion Report

### Task A — Action ID cross-reference

A0. ActionRecord.id field: [field name + file:line in actionSelectors.ts]
A0. ActionRecord.type field + relevant type values: [confirmed strings]
A0. meta.filePath path: [confirmed field chain]
A0. Exec-command display field: [field name or N/A]
A0. ActionRecord.status field: [field name]
A0. ActionRecord[] in scope: [variable/prop name + file:line] OR [threading path]
A1. Cross-reference lookup: [file:line]
A1. Fallback UUID row: [file:line + condition]
A1. Expand toggle: unchanged — [file:line]
TypeScript: workspace-ide 0 errors ✅

### Pass status
[ ] PASS CLOSED — task complete, all evidence present, TypeScript clean
[ ] PARTIALLY CLOSED — evidence missing or incomplete, reason stated above
[ ] BLOCKED — implementation cannot proceed, blocker described below:
```
