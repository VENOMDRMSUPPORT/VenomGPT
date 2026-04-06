# Pass 8: Remaining Orchestration Surfaces

> **STATUS: OPEN** — Not yet started.

## What & Why

The orchestration foundation is complete and most of it is already surfaced in
the Evidence Panel (Inspect tab): `OrchestrationBlock`, `DependencyGraphBlock`,
`ApprovalWorkflowBlock`, continuation lineage view. The Transcript tab has a
full filter bar and action groups. Two surfaces remain unbuilt:

1. **Per-lane contribution summary** — When a parallel run completes, the
   Evidence Panel says "N lanes contributed to the merged result" but does not
   show *what* each lane produced. A lane-keyed breakdown of file writes and
   commands per lane is the missing piece.

2. **Scheduler reasoning deeplink from Transcript tab** — The
   `DependencyGraphBlock` (with scheduler reasoning narrative and dependency
   class breakdown) lives only in the Evidence Panel. When a user is reading
   the Transcript, there is no affordance to jump to that analysis. A small
   "View scheduling analysis →" link at the bottom of the Transcript's action
   summary row that switches to the Inspect tab is enough — no duplication of
   the block itself.

**No backend changes. All data already exists in `TaskEvidence` and
`ActionRecord[]`. Pure UI pass.**

**Scope constraint**: structured text views only. No node-graph, no D3, no
canvas-based graph rendering.

---

## Execution order within this pass

| Step | Task | Why first |
|------|------|-----------|
| A | Per-lane contribution summary | Data-rich; highest standalone value |
| B | Scheduler deeplink in Transcript | Small; caps the pass cleanly |

---

## Done looks like

- In the Evidence Panel "Orchestration" section, each lane row is expandable to
  show the file writes and shell commands attributed to that lane (from
  `ActionRecord[]` filtered by `laneId`), with success/failure status per item
- When a task ran in `serial_fallback` mode (single lane), the expansion shows
  the full action list under "Lane 0" with no misleading parallel framing
- At the bottom of the Transcript tab's `TaskSummaryCard` (or action group
  footer), a small "View scheduling analysis" link is shown when
  `dependencyAnalysis` is present in the task evidence; clicking it switches
  the active tab to "Inspect" — no new component, just a tab switch
- The deeplink does not appear for tasks with no dependency analysis (older
  tasks, fast-path conversational tasks)
- TypeScript compiles clean after changes
- No visual regressions in the Evidence Panel or Transcript tab

## Out of scope

- Visual graph rendering (node-graph / D3 / canvas)
- Replay at orchestration scale (full lane-timeline replay) — deferred; data
  model needs a dedicated replay endpoint first
- Editing or reconfiguring lanes from the UI
- Any backend changes

## Tasks

1. **Per-lane contribution summary** — Extend the `OrchestrationBlock` in
   `evidence-panel.tsx` to make each lane row expandable. When expanded, show
   the `ActionRecord[]` entries for that `laneId` — file writes (`WRITE_FILE`)
   and commands (`EXEC_COMMAND`) with their status and outcome. Use the existing
   `ActionRecord` data already available in the component's scope; no new fetch
   required. For `serial_fallback` tasks (single lane), label the section
   clearly rather than hiding it.

2. **Scheduler deeplink from Transcript** — Add a small "View scheduling
   analysis →" affordance in the `TaskSummaryCard` (or the Transcript tab
   footer) in `task-console.tsx`. Show it only when the active task's evidence
   contains a non-null `dependencyAnalysis`. Clicking it calls the existing tab-
   switch mechanism to set the active tab to `"inspect"`. No duplication of
   `DependencyGraphBlock` — the link navigates to the existing block in the
   Evidence Panel.
   **Verification required before coding**: read `task-console.tsx` around the
   `TaskSummaryCard` render and the tab-switching state to confirm the exact
   state setter and tab key name before writing code.

## Relevant files

- `artifacts/workspace-ide/src/components/panels/evidence-panel.tsx:991-1100`
- `artifacts/workspace-ide/src/components/panels/evidence-panel.tsx:1303-1381`
- `artifacts/workspace-ide/src/components/panels/task-console.tsx`
- `artifacts/workspace-ide/src/store/use-ide-store.ts`
- `artifacts/workspace-ide/src/lib/evidenceTypes.ts`
