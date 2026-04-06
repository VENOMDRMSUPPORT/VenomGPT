# Pass 7: Projects / Workspace Manager

> **STATUS: CLOSED** — Completed and reviewer-approved.

## What & Why

The backend has a complete project management system at `/projects`: list,
create, delete, rename, and select (switch active workspace). This is wired,
tested, and production-ready. The frontend `/apps` page shows only a
"Coming Soon" banner — none of the backend capability is exposed.

This pass replaces the banner with a real project management UI. A "project"
in VenomGPT is a named directory under `<repo-root>/projects/` that becomes
the active workspace when selected. Selecting a project changes the root that
the file explorer, agent file tools, and staging layer operate against.

This is the **largest remaining UI gap** in the product. Everything needed to
close it exists in the backend — this is a pure frontend pass.

**Drift risk**: this pass has 6 distinct surfaces that touch workspace root
state, query invalidation, and store sync. To prevent scope creep and
conflicting state assumptions, it is split into three **bounded sub-groups**.
Each sub-group has its own done looks like and must be confirmed before the
next starts.

**No backend changes. No new backend routes.**

---

## Execution order within this pass

| Step | Sub-group | Why first |
|------|-----------|-----------|
| A | List + Create + empty/error/loading | Foundation — everything else hangs off the list |
| B | Select + active indicator + workspace refresh | Core functional value — workspace switching |
| C | Rename/edit + Delete with 409 handling | Quality-of-life; destructive action last |

---

## Sub-group A — List, Create, Empty/Error/Loading States

**Scope**: read and create only. No workspace switching, no deletion, no editing.

**Verification required before coding**: read `artifacts/api-server/src/routes/projects.ts`
to confirm the exact shape of `POST /projects` request body (`name`, optional
`description`) and the response shape. Do not assume — use the route file as
the single source of truth for payload shapes.

**Done looks like**:
- Navigating to `/apps` shows a list of projects from `GET /projects`, each
  displaying name, optional description, and creation date
- Empty state renders a clear call-to-action when no projects exist
- Loading state is shown while the fetch is in-flight
- A "New project" button opens an inline form with a name field and optional
  description field
- Submitting calls `POST /projects` with the exact payload shape confirmed from
  the route file
- Success refreshes the list; the new project appears immediately
- `invalid_name` error from the backend shows an inline validation message
- `already_exists` error shows an inline conflict message
- Network errors show an inline error (no silent failure)

**Tasks**:
1. **Projects list** — Replace the "Coming Soon" content in `apps.tsx` with a
   live list fetched from `GET /projects` on mount. Render name, description,
   and creation date for each card. Explicit loading and error states required.
2. **Empty state** — When `GET /projects` returns an empty array, render an
   empty state with a clear prompt to create the first project.
3. **Create project** — Add a "New project" button that reveals an inline form.
   On submit call `POST /projects`. Surface `invalid_name` and `already_exists`
   errors inline. Refresh the list on success.

---

## Sub-group B — Workspace Select + Active Indicator + Refresh

**Scope**: workspace switching and active state display only. No deletion, no
editing.

**Verification required before coding (two checks)**:
1. Read `artifacts/workspace-ide/src/store/use-ide-store.ts` and
   `artifacts/api-server/src/routes/workspace.ts` to confirm how the current
   active workspace root is exposed to the frontend. Use the existing mechanism
   — do not invent a new store field.
2. Read `artifacts/api-server/src/routes/projects.ts` (`POST /projects/:name/select`
   response shape) and the existing file-list query invalidation pattern in the
   codebase (used after file create/delete in the file explorer) to confirm
   exactly which queries must be invalidated after a workspace switch — file
   list only, or workspace/session state too.

**Done looks like**:
- Each project card has a "Use this workspace" button that calls
  `POST /projects/:name/select`
- After a successful select, the correct queries are invalidated so the file
  explorer immediately reflects the new workspace root — based on confirmed
  behavior from the verification step, not assumed
- **No optimistic workspace switching state is invented**: the workspace root
  displayed in the UI is not updated before the backend/store refresh path is
  confirmed and applied; if the verified refresh path does not update the root
  immediately, the UI waits for the next confirmed state — no guessing
- The currently active project is visually highlighted (border accent, badge,
  or checkmark) using the active workspace root sourced from the mechanism
  confirmed in the verification step
- No visual regression on projects that are not active

**Tasks**:
4. **Workspace select** — Add a "Use this workspace" button to each project card
   that calls `POST /projects/:name/select`. After success, invalidate the
   correct queries (confirmed via verification above).
5. **Active workspace indicator** — Highlight the currently active project card
   using the active workspace source confirmed in verification. Apply a visual
   accent consistent with the existing design system.

---

## Sub-group C — Rename/Edit + Delete

**Scope**: mutating operations on existing projects. Depends on Sub-group A
being confirmed stable.

**Verification required before coding**: read `artifacts/api-server/src/routes/projects.ts`
(`PATCH /projects/:name` and `DELETE /projects/:name`) to confirm the exact
patch payload shape and all error codes returned by delete (specifically: `409`
for active project, `404` for not found, any others). Implement exactly what
the endpoint documents — no invented error handling.

**Done looks like**:
- Each project card has an inline rename / description-edit affordance (pencil
  icon or equivalent) that calls `PATCH /projects/:name` on confirm; edit is
  in-place, no modal
- A delete button (trash icon) on each card shows a confirmation dialog before
  calling `DELETE /projects/:name`
- If delete returns 409 (active project cannot be deleted), an inline message
  explains why — no generic error
- If delete returns 404, the list refreshes (project was already gone)
- Successful rename / description update reflects immediately in the list

**Tasks**:
6. **Rename / description edit** — Add an inline edit affordance to each project
   card. On confirm, call `PATCH /projects/:name` with the confirmed payload
   shape. Reflect the updated values immediately.
7. **Delete with confirmation** — Add a delete button. Show a confirmation dialog.
   On confirm, call `DELETE /projects/:name`. Handle 409 (active project) with
   a specific inline message. Refresh the list on success or 404.

---

## Global out of scope (entire Pass 7)

- Drag-and-drop project reordering
- Project-level settings or metadata beyond name and description
- File-system operations within a project (that is the IDE's role)
- Multi-workspace parallel views
- Any backend changes

## Relevant files

- `artifacts/workspace-ide/src/pages/apps.tsx`
- `artifacts/api-server/src/routes/projects.ts`
- `artifacts/api-server/src/routes/workspace.ts`
- `artifacts/workspace-ide/src/store/use-ide-store.ts`
- `artifacts/workspace-ide/src/components/layout/page-layout.tsx`
- `lib/api-client-react`
