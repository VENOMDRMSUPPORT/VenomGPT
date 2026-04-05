# Pass 2: Code Editor & Staged Diff Integration

## What & Why
The code editor (Monaco) is wired for basic open/save, but the staged task isolation
system — one of the most powerful backend capabilities — is not surfaced in the editor.
Users cannot see what the agent changed vs the live file, cannot apply or discard
individual file changes from within the editor, and have no visual indicator of staged
vs live state. This pass closes that gap and makes the editor a first-class citizen of
the staged workflow.

---

## Task Context Clarification (critical behavior definition)

The apply/discard endpoints are scoped to a `taskId`. Before implementation, the
following behavioral rules must be established and enforced consistently:

| Scenario | Expected behavior |
|----------|-------------------|
| File has staged changes from the **currently active** task | Show diff view + apply/discard toolbar |
| File has staged changes from a **completed (pending)** task | Show diff view + apply/discard toolbar (use that task's checkpoint id) |
| File has staged changes from **multiple tasks** | Show diff for the **most recent pending checkpoint** only. Surface a note: "N other staged versions exist — view in Task History." |
| File has **no** staged changes | Show normal Monaco editor, no toolbar |
| A staged file is **discarded** while open in editor | Editor reverts to live file content immediately; diff view closes |
| A staged file is **applied** while open in editor | Diff view closes; editor now shows the (now-live) applied content |

These rules define the UI contract. Implementation must follow them exactly — no silent
fallbacks, no ambiguous states.

---

## Done looks like
- When a file has staged changes, the editor shows a Monaco DiffEditor (staged vs live)
- File tabs show a distinct staging badge (separate from the unsaved dirty dot) when
  that file has agent-staged changes pending
- A per-file toolbar above the editor shows Apply and Discard actions when staged
  changes exist; both are wired to the correct checkpoint endpoints
- Multiple-task scenario: the most recent pending checkpoint is shown; a note surfaces
  any additional pending versions
- Apply/discard actions refresh the editor state immediately on success
- Saving via Ctrl+S writes to the live workspace and clears the dirty indicator
- If a save fails, an error toast appears and the file stays marked dirty (no silent fallback)
- TypeScript compiles clean after all changes

## Out of scope
- Creating new files from the editor
- Multi-cursor or collaborative editing
- Terminal integration inside the editor
- Merging or comparing staged changes across multiple tasks (beyond surfacing the note)

## Tasks
1. **Staged file detection** — Query `GET /agent/tasks/:id/checkpoint` for any task
   with a pending checkpoint that includes the currently open file path. Expose a
   `stagedFileInfo` structure in the IDE store: `{ taskId, checkpointId, stagedContent }`.
   Apply the multi-task resolution rule from the table above.

2. **Diff view mode** — When `stagedFileInfo` is present for the active file, render
   a Monaco `DiffEditor` (original = live content, modified = staged content). Fall
   back to normal `Editor` when no staged info exists.

3. **Per-file apply/discard toolbar** — Render a compact toolbar above the diff editor
   only when staged changes exist. Wire Apply to
   `POST /agent/tasks/:id/checkpoint/apply-file` and Discard to
   `POST /agent/tasks/:id/checkpoint/discard-file`. On success, clear `stagedFileInfo`
   and reload live file content into the editor.

4. **File tab staging badges** — Update the file tab component to show a staging
   indicator (e.g. orange dot) distinct from the unsaved dirty indicator.

5. **Multi-task staged note** — When more than one pending checkpoint includes the
   open file, surface a read-only banner below the toolbar: "N other staged versions
   exist — view in Task History."

6. **Save error handling** — Ensure the `useWriteFile` failure path shows a toast and
   keeps the file marked dirty. Remove any silent success fallbacks.

## Relevant files
- `artifacts/workspace-ide/src/components/panels/code-editor.tsx`
- `artifacts/workspace-ide/src/store/use-ide-store.ts`
- `artifacts/workspace-ide/src/components/layout/workspace-header.tsx`
- `artifacts/api-server/src/routes/checkpoint.ts`
- `lib/api-client-react`
