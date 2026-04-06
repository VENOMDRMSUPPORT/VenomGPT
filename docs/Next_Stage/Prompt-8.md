# Execution Prompt — Pass 8: Remaining Orchestration Surfaces

---

## Current confirmed state

- Passes 1–7 are complete.
- `evidence-panel.tsx` has a working `OrchestrationBlock` that renders a
  per-lane status table (lane id, status, failure reason). Each lane row is
  **not** expandable — no breakdown of what each lane actually produced is
  shown.
- `ActionRecord[]` data attributed to each lane is already available within the
  scope of `evidence-panel.tsx`. No new fetch is required.
- `task-console.tsx` has a `TaskSummaryCard` (or equivalent footer area) in the
  Transcript tab. There is no "View scheduling analysis" affordance in it.
- `DependencyGraphBlock` exists in the Evidence Panel (Inspect tab) and renders
  when `dependencyAnalysis` is non-null in `TaskEvidence`.
- `evidenceTypes.ts` defines the `TaskEvidence` type — the exact field name for
  dependency analysis data must be confirmed from this file before coding.
- The tab key name for the Inspect tab and the tab-switching state setter must
  be confirmed from `task-console.tsx` before coding.
- No backend changes are needed or permitted in this pass.

---

## Your mission

Deliver two bounded UI additions:

**Task A** — Make each lane row in `OrchestrationBlock` expandable. When
expanded, show the `WRITE_FILE` and `EXEC_COMMAND` action records for that
lane. `READ_FILE` records are explicitly excluded.

**Task B** — Add a "View scheduling analysis →" deeplink in the Transcript tab
that switches to the Inspect tab. Show it only when the current task's own
evidence contains a non-null dependency analysis field.

Execute A before B. Deliver Task A evidence before starting Task B.

---

## Forbidden actions

- Do not modify any file under `artifacts/api-server/src/`.
- Do not add node-graph, D3, or canvas-based rendering.
- Do not show `READ_FILE` records in the per-lane contribution summary.
- Do not duplicate `DependencyGraphBlock` — the deeplink navigates to the
  existing block, it does not render a new one.
- Do not invent new fetch calls — all data for Task A is already in scope.
- Do not infer the deeplink condition from route class, task type, or any
  store field other than the current task's own evidence object.
- Do not guess the tab key name or state setter — verify from `task-console.tsx`
  before writing any tab-switching code.
- **Stop condition**: if any `ActionRecord` field name, `TaskEvidence` field
  name, tab key, or state setter cannot be confirmed from the source files,
  stop and report the blocker. Do not guess.
- **Evidence rule**: Task A evidence must be present before Task B begins. Task B
  is not closed until all its evidence items are present.

---

## Task A — Per-lane contribution summary

### Step A0 — Field verification (required before any coding)

Read `artifacts/workspace-ide/src/lib/evidenceTypes.ts`. Record:

1. The field name and shape of the `ActionRecord` type — specifically:
   - The field that identifies the action type (e.g. `type` or `kind`).
   - The exact string values used for write-file and exec-command actions.
   - The field that identifies which lane an action belongs to (e.g. `laneId`).
   - The field(s) that carry outcome / status.
2. Confirm that `READ_FILE` actions have a distinct type value (to be excluded).

Read `evidence-panel.tsx` around the `OrchestrationBlock` render (lines
991–1100 as a starting reference). Record:

3. Where `ActionRecord[]` data enters scope (prop name, store selector, or
   variable name) and whether it is already filtered or raw.
4. The exact structure of the per-lane loop — what variable holds the lane list
   and what each lane entry looks like.

Do not write any component code until all four items are confirmed.

### Step A1 — Expandable lane rows

Extend the per-lane rows in `OrchestrationBlock` to be expandable (toggle on
click). When collapsed, the row shows the same content as today. When expanded,
it shows the filtered action list for that lane.

### Step A2 — Action list per lane

When a lane row is expanded, render the `ActionRecord[]` entries that match:
- `laneId === <this lane's id>` (using the confirmed field name from A0)
- `type` is `WRITE_FILE` or `EXEC_COMMAND` (using the confirmed values from A0)
- `READ_FILE` entries are excluded

For each action record show: action type, target path or command, and
status/outcome.

For `serial_fallback` tasks (single lane, or records without a `laneId`), show
all `WRITE_FILE` + `EXEC_COMMAND` records under a "Serial" label. Do not use
"Lane 0" or any parallel framing.

**Task A evidence**:
1. `ActionRecord` type field name and WRITE_FILE / EXEC_COMMAND value strings:
   confirmed from `evidenceTypes.ts`.
2. `READ_FILE` value string: confirmed (to be excluded).
3. Lane ID field name on `ActionRecord`: confirmed from `evidenceTypes.ts`.
4. `ActionRecord[]` data source in `evidence-panel.tsx`: variable/prop name
   and file:line where it enters scope.
5. Expand toggle: file:line of the toggle state and the expand condition.
6. Action filter: file:line of the `laneId` filter and the type filter
   (WRITE_FILE + EXEC_COMMAND only).
7. Serial fallback label: file:line of the "Serial" label condition.
8. TypeScript: 0 errors in workspace-ide.

---

## Task B — Scheduler reasoning deeplink from Transcript

Execute after Task A evidence is confirmed.

### Step B0 — Verification (required before any coding)

Read `artifacts/workspace-ide/src/lib/evidenceTypes.ts`. Record:

1. The exact field name in `TaskEvidence` that holds dependency analysis data
   (e.g. `dependencyAnalysis`, `schedulerAnalysis`, or similar). This is the
   field that drives the show/hide condition for the deeplink.

Read `artifacts/workspace-ide/src/components/panels/task-console.tsx`. Record:

2. The exact string key used for the Inspect tab (e.g. `"inspect"`,
   `"evidence"`, or other).
3. The exact state setter or action that switches the active tab — its name,
   its call signature, and where it lives (local state, store action, prop).

Do not write any component code until all three items are confirmed.

### Step B1 — Deeplink affordance

In `task-console.tsx`, add a "View scheduling analysis →" link (or small
button) in the `TaskSummaryCard` footer area (or equivalent Transcript tab
footer). The link:

- Is shown **only** when the currently displayed task's own `TaskEvidence`
  object contains a non-null value at the field confirmed in Step B0 item 1.
  The condition must read from the task's own evidence — not from route class,
  not from any other store field.
- On click, calls the tab-switch setter confirmed in Step B0 item 3 with the
  tab key confirmed in Step B0 item 2.
- Does not render a new `DependencyGraphBlock`. It navigates to the existing
  block in the Evidence Panel.
- Does not appear for tasks where the dependency analysis field is null or
  absent.

**Task B evidence**:
1. `dependencyAnalysis` field name in `TaskEvidence`: confirmed from
   `evidenceTypes.ts` (exact name).
2. Inspect tab key: confirmed from `task-console.tsx` (exact string).
3. Tab-switch setter: confirmed name, call signature, and file:line.
4. Deeplink render condition: file:line — confirm it reads from the current
   task's own evidence, not from any inferred state.
5. Tab-switch call: file:line of the onClick handler.
6. No `DependencyGraphBlock` duplication: confirm in evidence that no new block
   is rendered.
7. TypeScript: 0 errors in workspace-ide.

---

## Final response format

```
## Pass 8 Completion Report

### Task A — Per-lane contribution summary
A0. ActionRecord type field: [field name]
A0. WRITE_FILE value: [string] | EXEC_COMMAND value: [string] | READ_FILE value: [string — excluded]
A0. Lane ID field: [field name]
A0. ActionRecord[] source: [variable/prop name + file:line]
A1. Expand toggle: [file:line]
A2. Lane ID filter: [file:line]
A2. Type filter (WRITE_FILE + EXEC_COMMAND only): [file:line]
A2. Serial fallback label: [file:line + condition]
TypeScript: workspace-ide 0 errors ✅

### Task B — Scheduler deeplink
B0. dependencyAnalysis field name: [exact name from evidenceTypes.ts]
B0. Inspect tab key: [exact string from task-console.tsx]
B0. Tab-switch setter: [name + call signature + file:line]
B1. Render condition: [file:line — reads from task's own evidence ✅]
B1. onClick tab-switch: [file:line]
B1. No DependencyGraphBlock duplication: confirmed ✅
TypeScript: workspace-ide 0 errors ✅

### Pass status
[ ] PASS CLOSED — both tasks complete, all evidence present, TypeScript clean
[ ] PARTIALLY CLOSED — N tasks incomplete or evidence missing, reason stated per task
[ ] BLOCKED — implementation cannot proceed, blocker described below:
```
