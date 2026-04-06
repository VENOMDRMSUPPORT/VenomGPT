# Pass 8: Remaining Orchestration Surfaces

> **STATUS: CLOSED** — Completed and reviewer-approved.

## What & Why

The orchestration foundation is complete and most of it is already surfaced in
the Evidence Panel (Inspect tab): `OrchestrationBlock`, `DependencyGraphBlock`,
`ApprovalWorkflowBlock`, continuation lineage view. The Transcript tab has a
full filter bar and action groups. Two surfaces remain unbuilt:

1. **Per-lane contribution summary** — When a parallel run completes, the
   Evidence Panel says "N lanes contributed to the merged result" but does not
   show *what* each lane produced. A lane-keyed breakdown of `WRITE_FILE` and
   `EXEC_COMMAND` action records per lane (with status and outcome) is the
   missing piece. `READ_FILE` records are explicitly excluded — they are
   observational, not contributions to the merged output.

2. **Scheduler reasoning deeplink from Transcript tab** — The
   `DependencyGraphBlock` (with scheduler reasoning narrative and dependency
   class breakdown) lives only in the Evidence Panel. When a user is reading
   the Transcript, there is no affordance to jump to that analysis. A small
   "View scheduling analysis →" link at the bottom of the Transcript's action
   summary row that switches to the Inspect tab is enough — no duplication of
   the block itself. The link is shown **only** when `dependencyAnalysis` is
   non-null in the currently displayed task's own evidence object — not inferred
   from store state, not inferred from route class, not shown for a different
   task.

**No backend changes. All data already exists in `TaskEvidence` and
`ActionRecord[]`. Pure UI pass.**

**Scope constraint**: structured text views only. No node-graph, no D3, no
canvas-based graph rendering. No replay-at-scale (deferred — requires a
dedicated lane-timeline replay endpoint that does not exist yet).

---

## Execution order within this pass

| Step | Task | Why first |
|------|------|-----------|
| A | Per-lane contribution summary | Data-rich; highest standalone value |
| B | Scheduler deeplink in Transcript | Small; caps the pass cleanly |

---

## Done looks like

- In the Evidence Panel "Orchestration" section, each lane row in
  `OrchestrationBlock` is expandable; when expanded it shows only the
  `WRITE_FILE` and `EXEC_COMMAND` `ActionRecord` entries attributed to that
  `laneId`, with success/failure status and outcome per item — `READ_FILE`
  records are not shown in this view
- For tasks that ran in `serial_fallback` mode (single lane or no `laneId`
  on records), the expansion shows the full `WRITE_FILE` + `EXEC_COMMAND`
  list under a "Lane 0" or "Serial" label with no misleading parallel framing
- No new `fetch()` calls are added — the data comes from the `ActionRecord[]`
  already available within `evidence-panel.tsx`
- At the bottom of the Transcript tab's `TaskSummaryCard`, a small
  "View scheduling analysis" link is shown **if and only if** the task evidence
  for the currently displayed task contains a non-null `dependencyAnalysis`
  field — the condition is checked against the task's own evidence, not any
  other state
- Clicking the deeplink calls the existing tab-switching mechanism to activate
  the "Inspect" tab — confirmed via the verification step before coding, not
  assumed
- The deeplink does not appear for tasks with null or absent `dependencyAnalysis`
  (older tasks, fast-path conversational tasks)
- TypeScript compiles clean after changes
- No visual regressions in the Evidence Panel or Transcript tab

## Out of scope

- Visual graph rendering (node-graph / D3 / canvas)
- Replay at orchestration scale (full lane-timeline replay) — deferred; needs
  a dedicated lane-timeline replay endpoint first
- Showing `READ_FILE` records in the per-lane contribution summary
- Editing or reconfiguring lanes from the UI
- Any backend changes

## Tasks

1. **Per-lane contribution summary** — Extend `OrchestrationBlock` in
   `evidence-panel.tsx` to make each lane row expandable. When expanded, filter
   the available `ActionRecord[]` to the current `laneId` and show only
   `WRITE_FILE` and `EXEC_COMMAND` entries with their status and outcome. Use
   data already in scope — no new fetch. For `serial_fallback` runs (single
   lane or records without a `laneId`), show the full `WRITE_FILE` +
   `EXEC_COMMAND` list under a "Serial" label.

2. **Scheduler deeplink from Transcript** — Add a "View scheduling analysis →"
   affordance in `TaskSummaryCard` (or equivalent footer area) in
   `task-console.tsx`. Before coding, read the tab-switching state and the
   exact tab key name for the Inspect tab in `task-console.tsx` to confirm the
   correct state setter — do not guess the key name. Render the link only when
   `dependencyAnalysis` is non-null in the currently displayed task's own
   evidence object. Clicking calls the confirmed tab-switch setter. No
   duplication of `DependencyGraphBlock`.

## Relevant files

- `artifacts/workspace-ide/src/components/panels/evidence-panel.tsx:991-1100`
- `artifacts/workspace-ide/src/components/panels/evidence-panel.tsx:1303-1381`
- `artifacts/workspace-ide/src/components/panels/task-console.tsx`
- `artifacts/workspace-ide/src/store/use-ide-store.ts`
- `artifacts/workspace-ide/src/lib/evidenceTypes.ts`
