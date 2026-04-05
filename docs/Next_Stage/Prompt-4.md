# Execution Prompt — Pass 4: Premium Orchestration UI Surface

---

## Current confirmed state

- Pass 1 is complete. Pass 2 is complete.
- `evidence-panel.tsx` (2346 lines) renders structured evidence sections but has no
  Orchestration section, no continuation lineage view.
- `task-console.tsx` handles `awaiting_approval` and `selectively_blocked` phase values
  in the store type but renders no approval UI for these states.
- `livePhase.phase` is in the store and updated via WebSocket `live_phase` events.
- `TaskEvidence` type exists in `lib/evidenceTypes.ts` — contains orchestration data.
- Backend approval endpoints exist — **exact paths must be verified from spec before coding** (see Step 3).
- No backend changes are needed or permitted in this pass.

---

## Your mission

Surface the four orchestration phases in the UI. Execute in the order A→F defined below.
Complete and confirm each step before moving to the next.

---

## Forbidden actions

- Do not modify any file under `artifacts/api-server/src/`.
- Do not add node-graph, D3, or canvas-based rendering.
- Do not edit or reconfigure lane settings from the UI.
- Do not assume endpoint paths — read the spec first (Step 3 has explicit instructions).

---

## Execution order: A → F (follow strictly)

### Step A — Orchestration section in Evidence Panel
Open `evidence-panel.tsx`. Add a new collapsible section labelled "Orchestration"
after the existing evidence sections.

Content to render from `TaskEvidence` (check `evidenceTypes.ts` for exact field names):
- Dispatch mode: `parallel` or `serial_fallback`
- Lane count: total number of lanes dispatched
- Per-lane status table: lane id | status (success / failed / cancelled) | failure reason if any
- Failure isolation events: list of any lane failures that triggered policy-controlled abort

If the orchestration data is absent (task predates orchestration or ran serially),
render a placeholder: "No parallel dispatch data for this task."

### Step B — Continuation lineage view
In the Evidence Panel, add a "Continuation Lineage" section (new collapsible section
or new tab — your choice, pick the less disruptive option for the existing layout).

Content from `TaskEvidence` / replay endpoint:
- `ancestryDepth`: integer, shown as a depth badge (e.g. "Depth 2")
- Origin checkpoint ID: the ID of the earliest checkpoint in the chain
- Render as a linear chain: `[Origin Task] → [Checkpoint #id] → [Resumed Run] → …`
- If `ancestryDepth === 0` or continuation data is absent, render:
  "This task was not resumed from a checkpoint."

### Step C — Approval gate UI card
Before writing any code for this step:
1. Read `lib/api-spec/openapi.yaml` — find the exact paths for approve, deny, and
   approve-selective endpoints. Note them down.
2. Read `lib/api-client-react` — find the generated hooks for these endpoints. Note
   their names and parameter shapes.
3. Only then implement the `ApprovalGateCard` component.

The card renders inside `task-console.tsx` when `livePhase.phase === "awaiting_approval"`.
It must contain:
- A heading: "Awaiting Approval"
- A summary of what the task is waiting for (pull from `livePhase.blockedContext` if available)
- Three action buttons:
  - **Approve all** → calls the approve endpoint (exact path from spec)
  - **Deny** → calls the deny endpoint (exact path from spec); shows a reason input first
  - **Approve selective** → opens a lane selection list, then calls approve-selective
    with the selected lane ids (exact path and body shape from spec)
- Loading state on the active button during the request
- Error toast on failure; card stays open

### Step D — Selectively blocked lane indicator
When `livePhase.phase === "selectively_blocked"`, render a compact lane status grid
below the task progress area in `task-console.tsx`.

Source: `live_phase` WebSocket event data (parse the lane state from the event payload).
Render: one row per lane with columns: Lane ID | Status (blocked / proceeding)
If lane data is absent from the event, render: "Lane detail unavailable."

### Step E — Provider diagnostics panel
Add a provider info panel accessible from the settings page (a collapsible card or
a dedicated "Provider" tab) or from a keyboard shortcut (e.g. `Ctrl+Shift+P`).

Wire to `GET /provider-diagnostics`. Display:
- Active provider name
- Active model
- Lane count (if present in response)
- Any startup diagnostic messages (list format)

Poll this endpoint once on panel open. Add a manual refresh button.

### Step F — Runtime status wiring (confirm or fix)
Check if `GET /runtime/status` was confirmed wired in Pass 1.
If already wired: write "Confirmed from Pass 1 — no change" in your report.
If not yet wired: fix the runtime status bar to call this endpoint live.
Do not re-implement what Pass 1 already confirmed.

---

## Required evidence

1. **Orchestration section** — describe what renders when dispatch data is present vs absent.
2. **Lineage section** — describe what renders for depth-2 vs depth-0 tasks.
3. **Approval endpoint verification** — the exact paths found in the spec (not assumed).
   Format: `VERB /path` for each of the three actions.
4. **ApprovalGateCard actions** — list the three buttons, their endpoint calls, and
   their parameter shapes (from the spec).
5. **Lane indicator source** — confirm which WebSocket event field contains lane state.
6. **Provider diagnostics** — the exact response fields rendered in the panel.
7. **Runtime status** — "Confirmed from Pass 1" or file:line of fix.
8. **TypeScript compilation** — 0 errors in workspace-ide.

---

## Final response format

```
## Pass 4 Completion Report

### A. Orchestration section
[present state vs absent state rendering]

### B. Lineage view
[depth-2 rendering / depth-0 rendering]

### C. Approval endpoints (from spec)
Approve all:  VERB /path
Deny:         VERB /path
Approve selective: VERB /path — body: { ... }

### D. Lane indicator
[source field from WebSocket event]

### E. Provider diagnostics fields
[list of fields rendered]

### F. Runtime status
[Confirmed from Pass 1 / fixed at file:line]

### TypeScript
workspace-ide: 0 errors ✅
```
