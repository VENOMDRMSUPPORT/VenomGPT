# Execution Prompt — Pass 1: IDE Route + Core Backend Wiring

---

## Current confirmed state

- Backend: 39 route surfaces mounted and trusted. TypeScript compiles clean. Server starts clean.
- Frontend: IDE page (`/ide`) exists and renders but has known wiring gaps.
- `docs/Next_Stage/` exists with Pass-1 through Pass-5 plan files.
- No workflow changes, backend changes, or new UI features are needed or permitted in this pass.

---

## Your mission

Wire the IDE frontend to the backend completely. This is a read-and-fix pass only.
You are not building new features. You are confirming or repairing existing wiring.

---

## Forbidden actions

- Do not add new UI components or pages.
- Do not modify any file under `artifacts/api-server/src/`.
- Do not install new packages unless a wiring gap cannot be closed without one (justify in evidence).
- Do not leave any checklist row blank.
- **Stop condition**: if any endpoint, hook, or file path cannot be verified from code or spec, stop implementation for that item and report it as a blocker in the evidence. Do not guess or invent.
- **Evidence rule**: any claimed completion without the required evidence is considered incomplete. Do not report a step as done without its corresponding evidence item.

---

## Step-by-step execution

### Step 1 — Fix IDE routing
Open `artifacts/workspace-ide/src/pages/ide.tsx` and `src/App.tsx`.
Confirm the `/ide` route renders correctly in all three states:
- State A: `isLoading === true` → spinner shown
- State B: `!workspace?.isSet` → `HomeScreen` shown
- State C: workspace is set → full IDE layout shown

Fix any blank-screen or stale-route issue. Document what was broken and what you changed.

### Step 2 — Endpoint wiring audit
Walk every row in the table below. For each route, find the frontend hook, component,
or fetch call that calls it. Confirm the URL matches the backend route exactly.

Fill in Status and Evidence for every row:

| # | Route | Consumer | Status | Evidence |
|---|-------|----------|--------|----------|
| 1 | `GET /healthz` | connection status bar | | |
| 2 | `GET /workspace` | `useGetWorkspace` hook | | |
| 3 | `POST /workspace` | workspace setup form | | |
| 4 | `GET /projects` | project selector | | |
| 5 | `POST /projects` | new project action | | |
| 6 | `POST /projects/:name/select` | project select action | | |
| 7 | `GET /files/*` | file explorer + editor open | | |
| 8 | `POST /files/*` | `useWriteFile` hook | | |
| 9 | `DELETE /files/*` | file delete action | | |
| 10 | `POST /agent/tasks` | task submission | | |
| 11 | `GET /agent/tasks` | task list | | |
| 12 | `GET /agent/tasks/:id` | task detail | | |
| 13 | `GET /agent/tasks/:id/events` | transcript event stream | | |
| 14 | `GET /agent/tasks/:id/evidence` | evidence panel | | |
| 15 | `GET /agent/tasks/:id/replay` | replay tab | | |
| 16 | `POST /agent/tasks/:id/pause` | pause intervention | | |
| 17 | `POST /agent/tasks/:id/resume` | resume intervention | | |
| 18 | `POST /agent/tasks/:id/proceed-as-partial` | partial proceed | | |
| 19 | `GET /agent/tasks/:id/recovery-options` | recovery card | | |
| 20 | `POST /agent/tasks/:id/retry-verify` | retry verification | | |
| 21 | `POST /agent/tasks/:id/continue-partial` | continue partial | | |
| 22 | `POST /agent/tasks/:id/recheck-runtime` | recheck runtime | | |
| 23 | `GET /agent/tasks/:id/checkpoint` | checkpoint summary | | |
| 24 | `POST /agent/tasks/:id/checkpoint/apply` | apply all | | |
| 25 | `POST /agent/tasks/:id/checkpoint/discard` | discard all | | |
| 26 | `POST /agent/tasks/:id/checkpoint/apply-file` | per-file apply | | |
| 27 | `POST /agent/tasks/:id/checkpoint/discard-file` | per-file discard | | |
| 28 | `GET /agent/tasks/:id/checkpoint-history` | checkpoint history | | |
| 29 | `GET /settings` | settings page load | | |
| 30 | `PATCH /settings` | settings save | | |
| 31 | `POST /settings/reset` | settings reset | | |
| 32 | `DELETE /settings/history` | history clear | | |
| 33 | `GET /runtime/status` | runtime status bar | | |
| 34 | `GET /provider-diagnostics` | diagnostics panel | | |
| 35 | `GET /providers` | provider list | | |
| 36 | `GET /board` | board master session | | |
| 37 | `GET /board/tasks` | board task list | | |
| 38 | `GET /board/plans` | board plan list | | |
| 39 | `GET /board/prompts` | prompt suggestions | | |

Status values: `✅ wired` | `⚠️ gap` | `🔁 deferred→PassN`

### Step 3 — Fix all gaps
For every row marked `⚠️ gap`: fix the consumer or the URL.
For every row marked `🔁 deferred`: write the reason in the Evidence column.
No row may remain with a blank Status.

### Step 4 — WebSocket event coverage
Open `artifacts/workspace-ide/src/hooks/use-websocket.ts`.
Confirm handlers exist for all five event types:
`thought` | `action_updated` | `live_phase` | `task_complete` | `task_error`

For any that are silently dropped or missing, add a handler stub and note it in evidence.

### Step 5 — Runtime status bar
Confirm the runtime status bar component calls `GET /runtime/status` live.
If it uses a hardcoded or stale fallback, replace it with the live endpoint.

---

## Required evidence (must be present in your completion report)

1. **Routing fix summary** — what was wrong in Step 1 and what changed (or "no change needed").
2. **Completed checklist table** — all 39 rows filled with Status + Evidence. No blanks.
3. **Gap fix log** — for each `⚠️ gap` row: file name, old URL or missing call, new URL or added call.
4. **WebSocket coverage confirmation** — list of all 5 event types with confirmed/added status.
5. **Runtime status bar confirmation** — confirmed live or fixed with file:line reference.
6. **TypeScript compilation result** — run `tsc --noEmit` in both workspace-ide and api-server. Output must show 0 errors.

---

## Final response format

Respond with these sections in order. Do not skip any section.

```
## Pass 1 Completion Report

### 1. Routing
[what was wrong / what changed / "no change needed"]

### 2. Endpoint Checklist (all 39 rows)
[completed table]

### 3. Gap Fix Log
[list of changes per gap row, or "no gaps found"]

### 4. WebSocket Events
[confirmed or added for each of the 5 types]

### 5. Runtime Status Bar
[confirmed live or fixed — file:line]

### 6. TypeScript
workspace-ide: 0 errors ✅
api-server: 0 errors ✅

### Pass status
[ ] PASS CLOSED — all 39 rows filled, all steps evidenced, TypeScript clean
[ ] PARTIALLY CLOSED — N rows blocked or deferred, reason stated
[ ] BLOCKED — implementation cannot proceed, blocker described below:
```
