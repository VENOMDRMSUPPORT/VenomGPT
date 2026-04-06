# Pass 9: Residual Orchestration Surfaces

> **STATUS: OPEN** — Last planned pass in the current orchestration arc.

---

## Confirmed data shapes (verified before writing this pass)

**`DependencyAnalysis`** (frontend: `evidenceTypes.ts`, backend: `dependencyClassifier.ts`):
```
counts: Record<StepDependencyClass, number>          // aggregate class counts only
potentiallyIndependentActionIds: string[]             // action UUIDs, not file paths
serialReason: string                                  // single plain-language string, not per-step
readBurstUsed?: boolean
readBurstCount?: number
```
No per-step list. No per-step reasoning strings. One `serialReason` for the whole run.

**`LaneSummary`** (frontend: `evidenceTypes.ts`):
```
laneId, stepId, filePath, status, durationMs, error, verificationOutcome, dependencyClass, stepCount
```
Per-lane, not per-step within a lane. No replay timing metadata.

---

## What is already done (do not re-implement)

`DependencyGraphBlock` in `evidence-panel.tsx` currently renders:
- **"Scheduler reasoning"** — `serialReason` string shown prominently ✅
- **"Dependency class breakdown"** — `counts` table with per-class count and percentage ✅
- **"Read-only (first-access) action IDs"** — collapsible list of `potentiallyIndependentActionIds`
  as raw UUIDs (shown up to all, expandable via toggle) ✅

`LaneEvidenceBlock` and `OrchestrationBlock` (extended in Pass 8) already render
`laneEvidence` per-lane summaries with expand per lane. ✅

---

## What & Why

### Sub-group A — Action ID → file path cross-reference (confirmed buildable today)

**The gap**: `potentiallyIndependentActionIds` lists raw action UUIDs. A user reading
the Evidence Panel cannot tell from a UUID which file or command each ID refers to.
`ActionRecord[]` is already in scope in `evidence-panel.tsx` and carries `filePath`
and `actionType` for each action. Cross-referencing the two arrays would replace
opaque UUIDs with readable `filePath` + `actionType` pairs.

**Data sources confirmed in scope** (no new fetch needed):
- `analysis.potentiallyIndependentActionIds: string[]` — the IDs to look up
- `actions: ActionRecord[]` — already passed into the evidence panel; carries `id`,
  `filePath`, `actionType`, `status`, `outcome`

**Scope**:
- Replace the raw UUID chip list in `DependencyGraphBlock` with a lookup against
  `ActionRecord[]`: for each ID, find the matching action and show `actionType` +
  `filePath` (truncated) + `status`
- If an ID has no matching `ActionRecord` (older tasks, mismatched data), fall back
  to showing the raw UUID — do not crash or hide the row
- Collapsed by default (same toggle behavior as today)
- No new fetch calls; no backend changes
- `ActionRecord[]` availability in the component's prop chain must be verified before
  coding — confirm the prop is already threaded into `DependencyGraphBlock` or
  determine the minimal threading needed

**Risk**: Low — additive UI change, no backend dependencies.

---

### Sub-group B — Replay at orchestration scale (backend-first prerequisite)

**Status**: Not buildable as a frontend pass. Deferred until backend spike is complete.

**Why not now**:
- `LaneSummary[]` exists but carries no replay timing sequence — it is a summary, not
  a timeline. `durationMs` per lane is available, but there is no per-action timestamp
  within each lane, no inter-lane wall-clock ordering, and no endpoint that exposes
  lane-sequence data in replay-ready form.
- No `GET /api/agent/tasks/:taskId/lane-timeline` (or equivalent) endpoint exists.
- Writing a frontend replay controller before the data shape is defined would invent
  a schema.

**Pre-conditions for a future backend spike**:
1. Decide what "lane-timeline replay" means exactly: does it replay action events in
   wall-clock order across lanes, or step by step per lane? Nail down the user story first.
2. Check whether `ActionRecord[]` already carries enough timestamp data to reconstruct
   a cross-lane timeline without a new endpoint.
3. If a new endpoint is needed, design the response shape from confirmed stored data
   (`history.json`, `laneEvidence`, `ActionRecord[]`) — do not invent fields.
4. Only after the endpoint exists and the data shape is confirmed: open a new
   frontend-only pass to build the replay UI.

---

## Execution order

| Step | Task | Prerequisite | Type |
|------|------|-------------|------|
| A | Action ID → file path cross-reference in `DependencyGraphBlock` | None | Frontend only |
| B | Replay at orchestration scale | Backend spike must complete first | Blocked |

Sub-group A is the only item that can be implemented in this pass.
Sub-group B is formally deferred to a future backend spike + frontend pass.

---

## Done looks like (Sub-group A only)

- The collapsible section in `DependencyGraphBlock` labeled "Read-only (first-access)
  action IDs" now shows, for each entry in `potentiallyIndependentActionIds`, the
  matching `actionType` and `filePath` from `ActionRecord[]` instead of the raw UUID
- If no matching `ActionRecord` is found for an ID, the UUID is shown as a fallback
  (with a visual indicator that it is unresolved) — no crash, no hidden row
- The expand/collapse toggle behavior is unchanged
- `ActionRecord[]` is available in `DependencyGraphBlock` via props or via the nearest
  confirmed parent that already holds the array — verify this before coding; do not
  thread unnecessary props through layers that don't need them
- TypeScript compiles clean after changes
- No visual regressions elsewhere in the Evidence Panel

---

## Out of scope

- Per-step dependency classification rows (data does not exist — `DependencyAnalysis`
  has aggregate counts only, no per-step list)
- Per-step scheduler reasoning strings (data does not exist — `serialReason` is a
  single run-level string)
- Visual node-graph / D3 / canvas rendering
- Replay at orchestration scale (backend-first; see Sub-group B above)
- Any backend changes in this pass

---

## Relevant files

- `artifacts/workspace-ide/src/components/panels/evidence-panel.tsx` — `DependencyGraphBlock` (line 1357), prop threading to verify
- `artifacts/workspace-ide/src/lib/evidenceTypes.ts` — `DependencyAnalysis`, `LaneSummary`, `ActionRecord`
- `artifacts/api-server/src/lib/orchestrator/dependencyClassifier.ts` — backend `DependencyAnalysis` shape (reference only)
