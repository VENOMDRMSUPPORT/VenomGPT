# Execution Prompt — Pass 7: Projects / Workspace Manager

---

## Current confirmed state

- Passes 1–6 are complete.
- `artifacts/workspace-ide/src/pages/apps.tsx` renders a "Coming Soon" banner.
  No project management UI exists in the frontend.
- The backend has a complete project management system. All five routes are
  wired and production-ready:
  - `GET    /projects`           — list all projects
  - `POST   /projects`           — create a new project
  - `DELETE /projects/:name`     — delete a project (returns 409 if active)
  - `PATCH  /projects/:name`     — rename / update description
  - `POST   /projects/:name/select` — switch the active workspace
- The exact payload shapes, response shapes, and error codes for every route
  **must be read from `artifacts/api-server/src/routes/projects.ts` before
  any implementation step** — do not assume them.
- No backend changes are needed or permitted in this pass.

---

## Your mission

Replace the "Coming Soon" banner in `apps.tsx` with a working project
management UI. Execute the three bounded sub-groups in strict order:
**A → B → C**. Deliver evidence for each sub-group before starting the next.

---

## Forbidden actions

- Do not modify any file under `artifacts/api-server/src/`.
- Do not add drag-and-drop project reordering.
- Do not add project-level settings beyond name and description.
- Do not add file-system operations within a project.
- Do not invent state — read the verified backend and store sources first.
- **No optimistic workspace switching**: do not update the displayed workspace
  root before the backend/store refresh path is confirmed and applied. If the
  verified refresh path does not update the root immediately, the UI waits for
  the next confirmed state. No guessing.
- **One sub-group at a time**: do not start Sub-group B before Sub-group A
  evidence is delivered and confirmed. Do not start Sub-group C before
  Sub-group B evidence is delivered and confirmed.
- **Stop condition**: if any endpoint shape, store field, query key, or error
  code cannot be verified from code or spec, stop and report the blocker. Do
  not guess or invent.
- **Evidence rule**: any claimed completion without the required evidence items
  is considered incomplete. A sub-group is not closed until all its evidence
  is present.

---

## Sub-group A — List, Create, Empty / Error / Loading

Execute steps A1–A3 in order. Deliver Sub-group A evidence before starting
Sub-group B.

### Step A0 — Payload verification (required before any coding in this sub-group)

Read `artifacts/api-server/src/routes/projects.ts`. Record:

1. `GET /projects` — response array shape (fields returned per project).
2. `POST /projects` — exact request body fields (name required? description
   optional? any other fields?). Record every field name and type.
3. Error codes returned by `POST /projects` — record all of them (e.g.
   `invalid_name`, `already_exists`, and any others actually present in the
   route code).

Do not write any component code until these three items are confirmed.

### Step A1 — Projects list

In `apps.tsx`, replace the "Coming Soon" content with a live list fetched from
`GET /projects` on mount. Render for each project the fields confirmed in
Step A0. Show an explicit loading state while the fetch is in-flight. Show an
explicit error state if the fetch fails (no silent failure, no empty-state
fallback on error).

### Step A2 — Empty state

When `GET /projects` returns an empty array, render a clear empty state with a
call-to-action prompt to create the first project. This is distinct from the
error state.

### Step A3 — Create project

Add a "New project" button that reveals an inline form (not a modal). The form
contains:
- A name field (required).
- A description field (optional).

On submit, call `POST /projects` with the exact payload shape confirmed in
Step A0. On success, close the form and refresh the list. On failure, surface
errors inline:
- The `invalid_name` error code (if present in route) → show a name validation
  message.
- The `already_exists` error code (if present in route) → show a conflict
  message.
- Any other error codes found in Step A0 → surface them inline.
- Network error → show an inline error message (no silent failure).

**Sub-group A evidence**:
1. `GET /projects` response shape: confirmed field names from route file.
2. `POST /projects` payload: exact field names and types.
3. Error codes from `POST /projects`: complete list from route code.
4. List rendering: file:line of the fetch call and the list render.
5. Empty state: file:line of the empty-state render condition.
6. Create form: file:line of the `POST /projects` call and each error handler.
7. TypeScript: 0 errors in workspace-ide.

---

## Sub-group B — Workspace Select + Active Indicator + Refresh

Execute after Sub-group A is confirmed. Deliver Sub-group B evidence before
starting Sub-group C.

### Step B0 — Dual verification (required before any coding in this sub-group)

**Verification 1 — Active workspace source**:
Read `artifacts/workspace-ide/src/store/use-ide-store.ts` and
`artifacts/api-server/src/routes/workspace.ts`. Confirm exactly how the
currently active workspace root is exposed to the frontend (store field name,
or query, or both). Record the field name or query key. This is the only source
to be used — do not invent a new store field.

**Verification 2 — Post-select refresh scope**:
Read `artifacts/api-server/src/routes/projects.ts`
(`POST /projects/:name/select` response shape and any side effects).
Read the existing query invalidation pattern used after file create/delete in
the file explorer (e.g. in `file-explorer-panel.tsx`) — confirm exactly which
query keys are invalidated. Determine whether a workspace switch requires
invalidating the file list only, or also the workspace/session state query.
Record: "invalidate [list of query keys]".

Do not write any component code until both verifications are recorded.

### Step B1 — Workspace select button

Add a "Use this workspace" (or "Activate") button to each project card. On
click, call `POST /projects/:name/select`. On success, invalidate exactly the
query keys confirmed in Verification 2. Show a loading state on the button
during the request. Show an error message inline on failure.

### Step B2 — Active workspace indicator

Highlight the currently active project card using the active workspace root
confirmed in Verification 1. Apply a visual accent (border, badge, or
checkmark) consistent with the existing design system. The indicator must
derive from the confirmed state source — not from local component state, not
from the last button clicked.

**Sub-group B evidence**:
1. Active workspace source: confirmed field/query name from `use-ide-store.ts`
   and/or `workspace.ts`.
2. Post-select invalidation: exact list of query keys to invalidate.
3. Select button: file:line of the `POST /projects/:name/select` call.
4. Query invalidation: file:line of the invalidation call(s) after select.
5. Active indicator: file:line of the condition that drives the visual accent,
   and the state source it reads from.
6. No optimistic state: confirm in evidence that the workspace root shown in
   the UI is read from the verified source, not from a locally invented field.
7. TypeScript: 0 errors in workspace-ide.

---

## Sub-group C — Rename / Edit + Delete

Execute after Sub-group B is confirmed.

### Step C0 — Mutation verification (required before any coding in this sub-group)

Read `artifacts/api-server/src/routes/projects.ts`. Record:

1. `PATCH /projects/:name` — exact request body fields (which fields are
   patchable? name? description? both? any constraints?).
2. `DELETE /projects/:name` — all error codes actually returned by the route
   (not assumed). Record at minimum: 409 (active project cannot be deleted),
   404 (not found), and any others present in the route code.

Do not write any component code until these are confirmed.

### Step C1 — Inline rename / description edit

Add an inline edit affordance (pencil icon or equivalent) to each project card.
On activate, the name and description become editable in-place — no modal.
On confirm, call `PATCH /projects/:name` with the exact payload shape from
Step C0. On success, update the displayed values immediately. On failure, show
an inline error and restore the previous values.

### Step C2 — Delete with confirmation and 409 handling

Add a delete button (trash icon) to each project card. On click, show a
confirmation dialog before making any request. On confirm, call
`DELETE /projects/:name`.

Handle all error codes confirmed in Step C0:
- 409 (active project cannot be deleted) → show a specific inline message
  explaining why deletion is blocked. Do not use a generic error.
- 404 (already gone) → treat as success; refresh the list.
- Any other codes from Step C0 → surface them with a meaningful message.

On success (2xx), refresh the list immediately.

**Sub-group C evidence**:
1. `PATCH /projects/:name` payload: exact field names and types.
2. `DELETE /projects/:name` error codes: complete list from route code.
3. Inline edit: file:line of the `PATCH` call and the in-place edit trigger.
4. Delete confirmation: file:line of the dialog and the `DELETE` call.
5. 409 handler: file:line and the exact message shown.
6. 404 handler: file:line (treated as success or list refresh).
7. TypeScript: 0 errors in workspace-ide.

---

## Final response format

```
## Pass 7 Completion Report

### Sub-group A — List, Create, States
A0. GET /projects response shape: [fields]
A0. POST /projects payload: [fields + types]
A0. POST /projects error codes: [list]
A1. List fetch: [file:line]
A2. Empty state: [file:line + condition]
A3. Create call: [file:line]
A3. Error handlers: [file:line per code]
TypeScript: workspace-ide 0 errors ✅

### Sub-group B — Select + Active Indicator
B0. Active workspace source: [field/query name + file confirmed from]
B0. Post-select invalidation: [list of query keys]
B1. Select call: [file:line]
B1. Invalidation: [file:line]
B2. Active indicator source: [field/query read + file:line]
B2. No optimistic state: confirmed ✅
TypeScript: workspace-ide 0 errors ✅

### Sub-group C — Rename + Delete
C0. PATCH payload: [fields + types]
C0. DELETE error codes: [complete list]
C1. Inline edit trigger: [file:line]
C1. PATCH call: [file:line]
C2. Confirmation dialog: [file:line]
C2. DELETE call: [file:line]
C2. 409 handler: [file:line — message text]
C2. 404 handler: [file:line]
TypeScript: workspace-ide 0 errors ✅

### Pass status
[ ] PASS CLOSED — all 3 sub-groups complete, all evidence present, TypeScript clean
[ ] PARTIALLY CLOSED — N sub-groups incomplete or evidence missing, reason stated per sub-group
[ ] BLOCKED — implementation cannot proceed, blocker described below:
```
