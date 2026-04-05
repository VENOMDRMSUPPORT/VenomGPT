# Execution Prompt — Pass 2: Code Editor & Staged Diff Integration

---

## Current confirmed state

- Pass 1 is complete. All 39 backend endpoints are wired or documented-deferred.
- Monaco editor (`code-editor.tsx`) is wired for basic open/save only (96 lines).
- `useWriteFile` exists but has no error toast on failure.
- Staged task isolation is fully functional on the backend (checkpoint endpoints confirmed wired in Pass 1).
- No staged diff view, no per-file toolbar, no staging badge in file tabs exists yet.

---

## Your mission

Surface the staged task isolation system inside the code editor.
Make the editor a first-class participant in the staged workflow.

---

## Forbidden actions

- Do not modify any file under `artifacts/api-server/src/`.
- Do not add a terminal panel or collaborative editing.
- Do not create a file-creation UI in the editor.
- Do not invent new state management patterns — use the existing Zustand store (`use-ide-store.ts`).

---

## Behavioral contract (enforce exactly — no deviations)

| Scenario | Required behavior |
|----------|-------------------|
| File has staged changes from active task | Show `DiffEditor` (staged vs live) + apply/discard toolbar |
| File has staged changes from completed pending task | Show `DiffEditor` + apply/discard toolbar (use that task's checkpoint) |
| File has staged changes from multiple tasks | Show `DiffEditor` for **most recent pending checkpoint only** + banner: "N other staged versions exist — view in Task History" |
| File has no staged changes | Show normal `Editor`, no toolbar |
| Staged file discarded while open | Revert editor to live content immediately; close diff view |
| Staged file applied while open | Close diff view; show applied (now-live) content in normal editor |

No scenario may be handled differently. This table is the UI contract.

---

## Step-by-step execution

### Step 1 — Staged file detection
Add a `stagedFileInfo` field to the IDE store for the currently active file:
```
stagedFileInfo: { taskId: string; checkpointId: string; stagedContent: string } | null
```
Query `GET /agent/tasks/:id/checkpoint` for all tasks with a pending checkpoint.
Filter by files that include the currently open file path.
Apply the multi-task resolution rule: use the most recent pending checkpoint.
Update `stagedFileInfo` when the open file changes or when a WebSocket event signals
a staging change.

### Step 2 — Diff view mode
In `code-editor.tsx`, when `stagedFileInfo` is not null for the active file:
- Replace the `<Editor>` with Monaco's `<DiffEditor>` component.
- `original` = live file content (from the current `openFile.content`).
- `modified` = `stagedFileInfo.stagedContent`.
- Keep the same theme and font settings as the normal editor.
When `stagedFileInfo` is null, render the normal `<Editor>` as before.

### Step 3 — Per-file apply/discard toolbar
Render a compact action bar above the diff editor, visible only when `stagedFileInfo` is not null.
- **Apply** button → `POST /agent/tasks/:taskId/checkpoint/apply-file` with `{ filePath }`.
  On success: clear `stagedFileInfo`, reload live content into editor.
- **Discard** button → `POST /agent/tasks/:taskId/checkpoint/discard-file` with `{ filePath }`.
  On success: clear `stagedFileInfo`, revert editor to live content.
- Show a loading spinner on the active button during the request.
- Show an error toast if either request fails. Do not close the toolbar on failure.

### Step 4 — Multi-task staged note banner
When more than one pending checkpoint includes the open file path, render a read-only
banner below the toolbar:
`"N other staged versions exist — view in Task History"`
where N = number of additional checkpoints beyond the one being shown.

### Step 5 — File tab staging badge
In the file tab component, add a staging indicator (distinct from the unsaved dirty dot):
- Unsaved dirty: existing indicator (unchanged).
- Has staged agent changes: add an orange dot or "staged" chip alongside the tab label.
Query the same `stagedFileInfo` or a per-path map in the store.

### Step 6 — Save error handling
In the `handleSave` function in `code-editor.tsx`, confirm the `onError` callback
of `useWriteFile` shows a toast with message "Failed to save [filename]" and does
NOT call `markFileClean`. Verify the file remains marked dirty. Fix if missing.

---

## Required evidence

1. **State shape confirmation** — the exact `stagedFileInfo` type added to `use-ide-store.ts`, shown as a code snippet.
2. **Multi-task resolution confirmation** — describe in one sentence how the most-recent-checkpoint rule is implemented.
3. **Diff view screenshot description** — describe what the DiffEditor renders for a file with staged changes (which side is original, which is modified).
4. **Apply/discard request confirmation** — exact URLs called, with `taskId` and `filePath` parameters.
5. **Banner behavior confirmation** — when does the "N other staged versions" banner appear; what is N.
6. **Save error path confirmation** — file:line where the error toast is triggered.
7. **TypeScript compilation** — 0 errors in workspace-ide.

---

## Final response format

```
## Pass 2 Completion Report

### 1. State shape
[stagedFileInfo type definition]

### 2. Multi-task resolution
[one sentence description of implementation]

### 3. Diff view
[description of DiffEditor render]

### 4. Apply/Discard endpoints
[exact URLs and parameters]

### 5. Multi-task banner
[when it appears and what N is]

### 6. Save error path
[file:line]

### 7. TypeScript
workspace-ide: 0 errors ✅
```
