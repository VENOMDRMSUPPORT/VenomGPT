# Execution Prompt — Pass 5: Product Polish — Settings, History & Board

---

## Current confirmed state

- Passes 1–4 are complete.
- Settings page (`settings.tsx`) and `use-settings.ts` hook exist but are partially wired.
- History drawer exists in `task-list-panel.tsx` with no search, no filter, no bulk-delete.
- Board view (`task-board.tsx`) exists and pulls from `/board/tasks` but status changes
  and plan associations may not be wired.
- `workspace-composer.tsx` exists with no prompt suggestions from `/board/prompts`.
- Integrations page (`integrations.tsx`) has placeholder content only.
- No backend changes are needed or permitted in this pass.

---

## Your mission

Close the three bounded sub-groups in sequence. Confirm each sub-group before
starting the next. Do not begin Sub-group B until Sub-group A is confirmed done.
Do not begin Sub-group C until Sub-group B is confirmed done.

---

## Forbidden actions

- Do not modify any file under `artifacts/api-server/src/`.
- Do not add drag-and-drop status changes (explicitly deferred).
- Do not add CSV/JSON export.
- Do not add multi-workspace views.
- Do not invent new endpoint behaviour — verify what the backend actually supports
  before implementing (each sub-group has a verification step).
- **One sub-group at a time**: do not begin Sub-group B before Sub-group A evidence is delivered and confirmed. Do not begin Sub-group C before Sub-group B evidence is delivered and confirmed.
- **Stop condition**: if any endpoint, hook, spec path, or store field cannot be verified from code or spec, stop that step and report the blocker. Do not guess or invent.
- **Evidence rule**: any claimed completion without the required evidence is considered incomplete. A sub-group is not closed until all its evidence items are present.

---

## Sub-group A — Settings Page

Execute steps in order. Deliver Sub-group A evidence before starting Sub-group B.

### Step A1 — Settings load
On mount in `settings.tsx`, call `GET /settings` via the appropriate hook from
`lib/api-client-react`. Populate all form controls with the returned values.
If the hook does not exist, read `lib/api-spec/openapi.yaml` first to confirm the
response shape, then use a direct `fetch` or TanStack Query call.

### Step A2 — Settings save
Wire each setting control so that changes are saved via `PATCH /settings`.
Determine from `lib/api-spec/openapi.yaml` whether this is a per-field PATCH or a
full-object PATCH. Implement exactly what the spec defines.
Show a success toast on save. Show an error toast if the request fails.

### Step A3 — Reset and history-clear
Wire "Reset to defaults" to `POST /settings/reset`.
Wire "Clear task history" to `DELETE /settings/history`.
Both must show a confirmation dialog (browser `confirm` is acceptable) before
the request is made. Show success/error toast after completion.

**Sub-group A evidence**:
1. Settings load: confirmed the hook or fetch used, and the response shape.
2. Settings save: PATCH strategy (per-field vs full-object) confirmed from spec.
3. Reset and history-clear: endpoint and dialog confirmed at file:line.
4. TypeScript: 0 errors in workspace-ide.

---

## Sub-group B — Task History UX

Execute after Sub-group A is confirmed. Deliver Sub-group B evidence before
starting Sub-group C.

### Step B1 — Search and status filter
In `task-list-panel.tsx`, add:
- A text input that filters tasks by prompt text (client-side, case-insensitive substring).
- Status filter chips: `done`, `error`, `cancelled`, `interrupted`.
- A match count label: "Showing N of M tasks" when any filter is active.
All filtering is client-side against the task list already in the store.

### Step B2 — Bulk-delete

**Verification required before coding**:
Read `artifacts/api-server/src/routes/settings.ts` to confirm exactly what the
history deletion endpoint supports:
- Option A: per-task deletion (DELETE with a single task id)
- Option B: batch deletion (DELETE with a list of ids in the request body)
- Option C: full-history wipe only (no per-task targeting)

Implement exactly what the endpoint supports. Do not build a per-task loop if only
batch is available. Do not assume batch if only individual deletion exists.
If only full-history wipe is available, disable the bulk-delete feature and note
it in evidence.

Implementation:
- Add checkbox selection to history drawer items.
- "Delete selected" button appears when at least one item is checked.
- Show a confirmation dialog before any deletion.
- Call the endpoint using the confirmed strategy from above.
- Show a per-item error toast if any deletion fails.

**Sub-group B evidence**:
1. Search filter: confirmed client-side, file:line of filter logic.
2. Status chips: confirmed list of status values used.
3. Bulk-delete endpoint type: confirmed from `settings.ts` — which option (A, B, or C).
4. Bulk-delete implementation: file:line of the deletion call.
5. TypeScript: 0 errors in workspace-ide.

---

## Sub-group C — Board & Integrations

Execute after Sub-group B is confirmed.

### Step C1 — Board kanban
Confirm `task-board.tsx` pulls from `GET /board/tasks`.
Add status-change buttons (not drag-and-drop) to each board card.
Determine from `lib/api-spec/openapi.yaml` the correct PATCH endpoint and body
for a task status change. Implement exactly that.
Pull plan associations from `GET /board/plans` and display the plan name on each
card where a plan association exists.

### Step C2 — Board prompt suggestions
In `workspace-composer.tsx`:
- When the composer input is empty AND no task is currently active (`activeTaskId === null`),
  fetch `GET /board/prompts` once.
- Render up to 3 prompt suggestions as clickable chips below the input.
- Clicking a chip fills the composer input with the prompt text.
- Suggestions disappear once the user starts typing or a task becomes active.

### Step C3 — Integrations page — provider status
In `integrations.tsx`, replace placeholder content with a live provider status section.
Wire to `GET /provider-diagnostics`.
Display:
- Active provider name
- Active model
- Lane count (if in response)
- Connection health: confirmed or any error messages from the response

Poll once on page mount. Add a manual refresh button.

**Sub-group C evidence**:
1. Board kanban: confirmed endpoint for status change from spec (VERB /path + body shape).
2. Board prompts: file:line where fetch is called, and condition for showing suggestions.
3. Integrations page: list of fields rendered from `/provider-diagnostics`.
4. TypeScript: 0 errors in workspace-ide.

---

## Final response format

Deliver three separate sub-group reports in sequence.

```
## Pass 5 Completion Report

### Sub-group A — Settings
1. Settings load: [hook or fetch used + response shape]
2. Settings save: [per-field or full-object PATCH]
3. Reset: [file:line] | History-clear: [file:line]
4. TypeScript: workspace-ide 0 errors ✅

### Sub-group B — History
1. Search filter: [file:line]
2. Status chips: [list of values]
3. Bulk-delete endpoint type: [Option A / B / C — confirmed from settings.ts]
4. Bulk-delete call: [file:line]
5. TypeScript: workspace-ide 0 errors ✅

### Sub-group C — Board & Integrations
1. Status change endpoint: VERB /path — body: { ... }
2. Prompt suggestions: [file:line + show condition]
3. Provider diagnostics fields: [list]
4. TypeScript: workspace-ide 0 errors ✅

### Pass status
[ ] PASS CLOSED — all 3 sub-groups complete, all evidence present, TypeScript clean
[ ] PARTIALLY CLOSED — N sub-groups incomplete or evidence missing, reason stated per sub-group
[ ] BLOCKED — implementation cannot proceed, blocker described below:
```
