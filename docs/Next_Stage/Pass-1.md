# Pass 1: IDE Route + Core Backend Wiring

## What & Why
The IDE page exists and the backend is fully trusted (97–98% maturity), but the
frontend-to-backend wiring has gaps. The IDE route needs to be properly recovered
and every backend route surface confirmed reachable and consumed by the frontend.
This is the foundational pass — nothing else can close cleanly without it.

**Scope constraint**: this pass is wiring-only. No new UI features. No backend changes.

---

## Backend Endpoint Checklist (explicit, must be verified one by one)

| # | Route | Module | Frontend consumer |
|---|-------|--------|-------------------|
| 1 | `GET /healthz` | health.ts | connection status bar |
| 2 | `GET /workspace` | workspace.ts | `useGetWorkspace` hook |
| 3 | `POST /workspace` | workspace.ts | workspace setup form |
| 4 | `GET /projects` | projects.ts | project selector |
| 5 | `POST /projects` | projects.ts | new project action |
| 6 | `POST /projects/:name/select` | projects.ts | project select action |
| 7 | `GET /files/*` | files.ts | file explorer + editor open |
| 8 | `POST /files/*` | files.ts | `useWriteFile` hook |
| 9 | `DELETE /files/*` | files.ts | file delete action |
| 10 | `POST /agent/tasks` | agent.ts | task submission |
| 11 | `GET /agent/tasks` | agent.ts | task list |
| 12 | `GET /agent/tasks/:id` | agent.ts | task detail |
| 13 | `GET /agent/tasks/:id/events` | agent.ts | transcript event stream |
| 14 | `GET /agent/tasks/:id/evidence` | agent.ts | evidence panel |
| 15 | `GET /agent/tasks/:id/replay` | agent.ts | replay tab |
| 16 | `POST /agent/tasks/:id/pause` | agent.ts | pause intervention |
| 17 | `POST /agent/tasks/:id/resume` | agent.ts | resume intervention |
| 18 | `POST /agent/tasks/:id/proceed-as-partial` | agent.ts | partial proceed |
| 19 | `GET /agent/tasks/:id/recovery-options` | agentContinuation.ts | recovery card |
| 20 | `POST /agent/tasks/:id/retry-verify` | agentContinuation.ts | retry verification |
| 21 | `POST /agent/tasks/:id/continue-partial` | agentContinuation.ts | continue partial |
| 22 | `POST /agent/tasks/:id/recheck-runtime` | agentContinuation.ts | recheck runtime |
| 23 | `GET /agent/tasks/:id/checkpoint` | checkpoint.ts | checkpoint summary |
| 24 | `POST /agent/tasks/:id/checkpoint/apply` | checkpoint.ts | apply all |
| 25 | `POST /agent/tasks/:id/checkpoint/discard` | checkpoint.ts | discard all |
| 26 | `POST /agent/tasks/:id/checkpoint/apply-file` | checkpoint.ts | per-file apply |
| 27 | `POST /agent/tasks/:id/checkpoint/discard-file` | checkpoint.ts | per-file discard |
| 28 | `GET /agent/tasks/:id/checkpoint-history` | checkpoint.ts | checkpoint history |
| 29 | `GET /settings` | settings.ts | settings page load |
| 30 | `PATCH /settings` | settings.ts | settings save |
| 31 | `POST /settings/reset` | settings.ts | settings reset |
| 32 | `DELETE /settings/history` | settings.ts | history clear |
| 33 | `GET /runtime/status` | runtime.ts | runtime status bar |
| 34 | `GET /provider-diagnostics` | providerDiagnostics.ts | diagnostics panel |
| 35 | `GET /providers` | providerRegistry.ts | provider list |
| 36 | `GET /board` | taskBoard.ts | board master session |
| 37 | `GET /board/tasks` | taskBoard.ts | board task list |
| 38 | `GET /board/plans` | taskBoard.ts | board plan list |
| 39 | `GET /board/prompts` | taskBoard.ts | prompt suggestions |

**Exit condition for this checklist**: every row has a confirmed frontend consumer or is
explicitly marked "deferred to Pass N" with a reason.

---

## Done looks like
- Navigating to `/ide` loads the workspace correctly in all three states: loading,
  no workspace configured (→ HomeScreen), workspace set (→ full IDE)
- Workspace setup flow (HomeScreen → project selected → IDE) works end-to-end
  without blank screens or stale routes
- Every endpoint in the checklist above is accounted for (wired or documented-deferred)
- The WebSocket connection establishes reliably; `thought`, `action_updated`,
  `live_phase`, `task_complete`, and `task_error` events all update IDE state correctly
- The runtime status bar reflects live data from `GET /runtime/status` — no stale fallback
- TypeScript compiles clean (0 errors) in both workspace-ide and api-server

## Out of scope
- New UI features (Pass 2–5)
- Backend changes (backend is trusted and closed)
- Provider or model changes
- Creating or editing documentation files (docs/Next_Stage already exists)

## Tasks
1. **Fix IDE routing** — Confirm `/ide` route renders correctly in all three states.
   Fix any blank-screen or stale-route regressions from prior layout changes.

2. **Endpoint wiring audit** — Walk the checklist above row by row. For each endpoint,
   confirm the frontend hook or component that calls it. Mark any that are missing,
   renamed, or calling a stale URL.

3. **Fix gaps found in audit** — For each unmarked row, either wire the missing
   consumer or add a "deferred to Pass N" note with a reason. No row may be left blank.

4. **WebSocket event coverage** — Confirm `use-websocket.ts` handles all five event
   types listed above. Add handler stubs for any that are silently dropped.

5. **Runtime status bar** — Confirm the bar polls or subscribes to `GET /runtime/status`.
   Replace any hardcoded or stale fallback with the live endpoint.

## Relevant files
- `artifacts/workspace-ide/src/pages/ide.tsx`
- `artifacts/workspace-ide/src/App.tsx`
- `artifacts/workspace-ide/src/hooks/use-websocket.ts`
- `artifacts/workspace-ide/src/store/use-ide-store.ts`
- `artifacts/workspace-ide/src/components/home-screen.tsx`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/runtime.ts`
- `lib/api-client-react`
- `lib/api-spec`
