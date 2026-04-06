# Pass 9: Residual Orchestration Surfaces

> **STATUS: OPEN** — Last planned pass in the current orchestration arc.

## What & Why

Pass 4 and Pass 8 together delivered the full orchestration evidence infrastructure
and the per-lane contribution summary. The `DependencyGraphBlock` exists in the
Evidence Panel and renders dependency class breakdowns. Three surfaces remain:

1. **Dependency graph view** — A structured, human-readable view of the *inter-step*
   dispatch graph for a parallel run: which steps were independent, which were
   sequenced, and how the scheduler grouped them into lanes. `DependencyGraphBlock`
   currently shows aggregate class counts (parallel/sequential/unknown). What is
   missing is a per-step list view that shows, for each step, its dependency class,
   its assigned lane, and whether it was the blocking step that caused a lane to
   serialize. No D3, no canvas rendering — structured text/table view only, in line
   with the rest of the Evidence Panel.

2. **Scheduler reasoning surface** — The `dependencyAnalysis` field in `TaskEvidence`
   carries per-step reasoning that is not yet surfaced. This sub-group exposes it:
   for each step in the dispatch graph, show why the scheduler assigned its class
   (the reasoning string from the analysis). This is additive to the dependency
   graph view — both live inside `DependencyGraphBlock` or a sibling block.

3. **Replay at orchestration scale** — Replay a parallel run's lane sequence, not
   just a flat linear action list. The existing replay mechanism replays actions
   sequentially; it has no concept of lanes or timing across lanes. This sub-group
   requires a backend lane-timeline endpoint that does not currently exist.
   **Sub-group C is the hardest item in this pass and may be split into a
   separate backend-first pass if the endpoint surface proves large.**

---

## Execution order within this pass

| Step | Task | Notes |
|------|------|-------|
| A | Dependency graph step list view | Pure UI; data in `dependencyAnalysis` already |
| B | Scheduler reasoning per step | Additive to A; same data source |
| C | Replay at orchestration scale | Backend endpoint required first; assess before coding |

Sub-groups A and B share the same data source and can be built in a single
bounded pass. Sub-group C must be assessed independently — if the backend endpoint
surface is non-trivial, open a dedicated backend spike before touching the frontend.

---

## Done looks like

**Sub-group A (Dependency graph step list view)**
- Inside `DependencyGraphBlock` (or a sibling `DispatchGraphBlock`), each step in
  the parallel dispatch graph is listed with: step index, dependency class
  (`parallel` / `sequential` / `unknown`), assigned lane ID, and whether it was a
  blocking step
- The list is sorted by execution order, not by lane — reading top-to-bottom
  reflects the scheduler's decision sequence
- Only shown when `dependencyAnalysis` is non-null and contains at least one step
- No new backend calls — data already in `TaskEvidence.executionSummary.dependencyAnalysis`

**Sub-group B (Scheduler reasoning per step)**
- Each step row in the dispatch graph list is expandable; when expanded, shows the
  reasoning string for why that step received its dependency class
- If a step has no reasoning string (older tasks, fast-path), the expand affordance
  is not shown for that row
- No new backend calls

**Sub-group C (Replay at orchestration scale)**
- A lane-timeline replay view shows each lane's action sequence side-by-side (or
  sequentially with lane labels) as replay progresses
- A `GET /api/agent/tasks/:taskId/lane-timeline` (or equivalent) endpoint exists
  and returns per-lane action sequences with timing metadata
- The frontend replay controller drives the lane-timeline view, not the existing
  flat action list
- Replay can be paused, scrubbed, and reset — same controls as current replay
- TypeScript compiles clean; no regressions in existing replay (flat action list)
  for tasks that ran without parallel dispatch

---

## Out of scope

- Visual node-graph / D3 / canvas graph rendering
- Editing or re-ordering steps from the UI
- Drag-and-drop of lanes or steps
- Any changes to the parallel dispatch logic or the scheduler itself
- Multi-task cross-run comparison

---

## Prerequisite check (before Sub-group C)

Before writing any frontend code for Sub-group C, verify:
1. Does a lane-timeline endpoint exist in `artifacts/api-server/src/routes/`? If not,
   what data is needed and can it be derived from `history.json`?
2. Is per-lane timing metadata stored anywhere in `TaskEvidence` or `ActionRecord`?
3. If neither exists, open a backend spike pass first — do not invent data shapes.

---

## Relevant files

- `artifacts/workspace-ide/src/components/panels/evidence-panel.tsx` — `DependencyGraphBlock`, `OrchestrationBlock`
- `artifacts/workspace-ide/src/lib/evidenceTypes.ts` — `TaskEvidence`, `ActionRecord`, `dependencyAnalysis` shape
- `artifacts/workspace-ide/src/store/use-ide-store.ts` — replay state and controls
- `artifacts/api-server/src/routes/` — where lane-timeline endpoint would live (Sub-group C)
- `artifacts/api-server/src/data/history.json` — source of truth for persisted task evidence
