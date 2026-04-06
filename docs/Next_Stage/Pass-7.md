# Pass 7: Projects / Workspace Manager

> **STATUS: OPEN** — Not yet started.

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

**No backend changes. No new backend routes.**

---

## Execution order within this pass

| Step | Task | Why first |
|------|------|-----------|
| A | Projects list view | Foundation — everything else hangs off the list |
| B | Create project flow | Most common action after viewing the list |
| C | Workspace select button | Core functional value — switches active workspace |
| D | Rename / description edit | Quality-of-life; depends on list being stable |
| E | Delete with confirmation | Destructive — implement last, with guard |
| F | Active workspace indicator | Visual polish; ties everything together |

---

## Done looks like

- Navigating to `/apps` shows a list of existing projects pulled from
  `GET /projects`, each displaying the project name, optional description,
  and creation date
- A "New project" button opens an inline form; submitting calls `POST /projects`
  with a name and optional description; the list refreshes on success
- Each project card has a "Use this workspace" button that calls
  `POST /projects/:name/select`; after selection the active workspace indicator
  updates and the file explorer reflects the new root
- Inline rename / description edit calls `PATCH /projects/:name`
- Delete button (with a confirmation dialog) calls `DELETE /projects/:name`;
  the currently active project cannot be deleted (the backend returns 409 —
  the UI must respect this and show a clear message)
- The currently active workspace is visually highlighted in the list (badge or
  border accent)
- Empty state renders correctly when no projects exist yet
- All error states (name conflict, invalid name, network error) show inline
  messages — no silent failures
- TypeScript compiles clean after changes

## Out of scope

- Drag-and-drop project reordering
- Project-level settings or metadata beyond name and description
- File-system operations within a project (that is the IDE's role)
- Multi-workspace parallel views
- Any backend changes

## Tasks

1. **Projects list** — Replace the "Coming Soon" content in `apps.tsx` with a
   live list fetched from `GET /projects` on mount. Show name, description, and
   creation date for each project. Show an empty state when the list is empty.
   Handle loading and error states explicitly.

2. **Create project** — Add a "New project" button that reveals an inline form
   with a name field and an optional description field. On submit, call
   `POST /projects`. Show validation errors inline (the backend returns
   `invalid_name` and `already_exists` error codes — surface both clearly).
   Refresh the list on success.

3. **Workspace select** — Add a "Use this workspace" (or "Activate") button to
   each project card that calls `POST /projects/:name/select`. Highlight the
   currently active project visually. After selecting, invalidate the file list
   query so the file explorer reflects the new workspace root immediately.

4. **Rename / description edit** — Add an inline edit affordance (pencil icon or
   double-click on name) that calls `PATCH /projects/:name` on confirm. Keep the
   edit in-place — no modal.

5. **Delete with confirmation** — Add a delete button (trash icon) to each
   project card. Show a confirmation dialog before calling
   `DELETE /projects/:name`. If the backend returns 409 (active project), show
   an inline message explaining why deletion is blocked. Refresh the list on
   success.

6. **Active workspace indicator** — Show which project is currently active by
   reading the active workspace root from the store or from the backend. Apply
   a visual accent (border, badge, or checkmark) to the active card.
   **Verification required before coding**: check `use-ide-store.ts` and the
   `/api/workspace` route to confirm how the current workspace root is exposed
   to the frontend. Use the existing mechanism — do not invent a new one.

## Relevant files

- `artifacts/workspace-ide/src/pages/apps.tsx`
- `artifacts/api-server/src/routes/projects.ts`
- `artifacts/workspace-ide/src/store/use-ide-store.ts`
- `artifacts/workspace-ide/src/components/layout/page-layout.tsx`
- `lib/api-client-react`
