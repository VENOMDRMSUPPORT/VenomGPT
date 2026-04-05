# Pass 2: Code Editor & Staged Diff Integration

  ## What & Why
  The code editor (Monaco) is wired for basic open/save, but the staged task isolation system — one of the most powerful backend capabilities — is not surfaced in the editor. Users cannot see what the agent changed vs the live file, cannot apply or discard individual file changes from within the editor, and have no visual indicator of staged vs live state. This pass closes that gap and makes the editor a first-class citizen of the staged workflow.

  ## Done looks like
  - When an agent task has staged changes, the editor shows a visual diff between the staged version and the live file (inline or side-by-side)
  - File tabs show a staging badge (e.g. orange dot or "staged" label) for files that have agent-staged changes pending
  - A per-file toolbar in the editor allows Apply (promote staged → live) and Discard (remove staged copy) directly from within the editor
  - Saving a file via Ctrl+S writes to the live workspace (not staging) and clears the dirty/unsaved indicator correctly
  - If a save fails, an error toast appears and the file remains in dirty state (no silent fallback)
  - The editor correctly switches between diff view (when staged changes exist) and normal edit view (no staged changes)

  ## Out of scope
  - Creating new files from the editor (file creation is via the agent or file explorer)
  - Multi-cursor collaborative editing
  - Terminal integration inside the editor

  ## Tasks
  1. **Staged file detection in editor** — Query the checkpoint/staged state for the currently open file and expose a `hasStagedChanges` flag in the IDE store. Poll or subscribe to this state so it updates when the agent writes to staging.

  2. **Diff view mode** — When `hasStagedChanges` is true for the active file, render a Monaco diff editor (DiffEditor component) showing staged vs live content side by side or inline. Fall back to normal editor when no staged changes exist.

  3. **Per-file apply/discard toolbar** — Add a small action toolbar above the editor (or as an overlay) that appears only when staged changes exist. Wire Apply to `POST /agent/tasks/:id/checkpoint/apply-file` and Discard to `POST /agent/tasks/:id/checkpoint/discard-file`. Refresh editor state on success.

  4. **File tab staging badges** — Update the file tab component to show a visual staging indicator (distinct from the unsaved dirty dot) when that file has agent-staged changes.

  5. **Save error handling** — Ensure `useWriteFile` failure path shows a toast and keeps the file marked dirty. Remove any silent success fallbacks.

  ## Relevant files
  - `artifacts/workspace-ide/src/components/panels/code-editor.tsx`
  - `artifacts/workspace-ide/src/store/use-ide-store.ts`
  - `artifacts/workspace-ide/src/components/layout/workspace-header.tsx`
  - `artifacts/api-server/src/routes/checkpoint.ts`
  - `lib/api-client-react`
  