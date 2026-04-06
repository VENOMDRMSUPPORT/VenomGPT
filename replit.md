# VenomGPT — AI Coding Workspace

## Overview

VenomGPT is a browser-based personal AI coding assistant that executes end-to-end coding tasks on a local codebase. It functions as an agent that can read files, edit code, run shell commands, and fix errors autonomously based on natural language instructions.

## Architecture

This is a **pnpm monorepo** with two primary applications:

- **`artifacts/api-server/`** — Express backend API (port 3001). Handles the agent loop, file system operations (sandboxed), shell command execution, and WebSocket interface for real-time updates.
- **`artifacts/workspace-ide/`** — React + Vite frontend (port 5173). Monaco-powered code editor and transcript console.
- **`artifacts/mockup-sandbox/`** — Secondary frontend for UI prototyping.
- **`lib/`** — Shared libraries (api-spec, api-client-react, api-zod, db).

## Tech Stack

- **Runtime**: Node.js 24
- **Backend**: Express 5, WebSocket (`ws`), Drizzle ORM, OpenAI SDK (for Z.AI), Pino logging
- **Frontend**: React 19, Vite 7, TanStack Query, Monaco Editor, Tailwind CSS 4, Framer Motion, Radix UI
- **AI Provider**: Z.AI (GLM models via Anthropic and PAAS lanes)

## Key Configuration

### Environment Variables
- `ZAI_API_KEY` — Z.AI API key (set as Replit shared secret) — the only required Z.AI variable
- `WORKSPACE_ROOT` — Directory the agent operates on (optional, configurable via UI)

Endpoint and model selection are fully automatic — `ZAI_BASE_URL`, `ZAI_MODEL`, and `ZAI_VISION_MODEL` are NOT supported and have no effect.

### Ports
- API server: **3001**
- Frontend (Vite): **5173**

## Running the Project

```bash
pnpm install
pnpm run dev
```

The workflow starts both services concurrently:
- API: `cross-env PORT=3001 pnpm --filter @workspace/api-server run dev`
- IDE: `cross-env PORT=5173 BASE_PATH=/ VITE_API_PORT=3001 pnpm --filter @workspace/workspace-ide run dev`

## Agent Safety Features

- **Sandboxing**: File operations are restricted to the configured `WORKSPACE_ROOT`
- **Command Blocklist**: Prevents dangerous shell commands
- **Staged Execution**: File writes go to a staging area first and require checkpoint apply

## Agent Loop

Routing → Planning → Inspecting → Editing → Verifying

## IDE Layout (Task 6 — UX Correction Pass)

The workspace-ide layout follows the Replit reference design with a single task surface:

- **TaskConsole**: Leftmost, collapsible to icon-only rail. Has a state-aware outer glow that reacts to the active/viewing task status color (blue=active, green=done/ready, red=cancelled).
- **TaskListPanel** (Task Rail): Left of main content area, 240px wide. Contains session card at top, `+ New task` button (navigates to editor), scrollable task list, and a footer with Plans/Tasks filter toggle, creator filter stub, and "Open board" button.
- **Main content area** (`mainView` state in Zustand store): Switches between:
  - `'editor'` — CodeEditor (Monaco) — the default view
  - `'board'` — TaskBoard (full-width horizontal kanban, replaces main content area entirely)
- **FileExplorerPanel**: Rightmost; shown only in `'editor'` view. In board view, completely hidden (no overlay, no tab/drawer).
- **Single task surface**: All task-opening actions (from board, task rail) navigate to the Task Console in editor view. There is no secondary task surface.

### Key Behaviors (Task 6)
- Clicking a task in the board returns to editor view and opens that task in the Task Console
- "New task" from board or task rail navigates to editor view (Task Console is ready to receive input)
- "Open board" replaces the main content area as a full-page board view
- Status colors: Draft=gray, Active=blue, Ready=green, Done=green, Archived=gray, Cancelled=red

### Key Components
- `src/components/panels/task-board.tsx` — Horizontal kanban with columns: Drafts, Active, Ready, Done, Archived, Cancelled (separate columns); clicking cards returns to editor
- `src/components/panels/task-console.tsx` — Main task surface with state-aware glow based on viewing task status
- `src/store/use-ide-store.ts` — `mainView: MainView` state ('editor' | 'board') + `setMainView` action

## Development History — Completed Passes

### Pass 4 — Premium Orchestration UI Surface (CLOSED)
- `OrchestrationBlock` — visual surface for orchestration events
- `ApprovalGateCard` — approval checkpoint UI with `checkpointId` wired to `PATCH /api/agent/runs/:id/approval` using authoritative `APPROVAL_CHECKPOINT` source
- `SelectivelyBlockedLaneGrid` — blocked lane visualization

### Pass 5 — Product Polish: Settings, History & Board (CLOSED)

**Sub-group A — Settings Page (CLOSED)**
- Toast notifications (success + error) for save / reset / clear actions in `settings.tsx`
- All settings hooks pre-wired; full-object PATCH strategy confirmed

**Sub-group B — Task History UX (CLOSED)**
- Search input + status filter chips (done / error / cancelled / interrupted) in `task-list-panel.tsx`
- AND-combined filtering (search × chips), match count display (`N of M`)
- Bulk-delete disabled per Option C (full clear available from Settings)

**Sub-group C — Board & Integrations (CLOSED)**
- C1 (`task-board.tsx`): Plan association badges from `GET /api/board/plans` (by `boardTaskId`); contextual status-change buttons via `updateBoardTaskStatus` → `PATCH /api/board/tasks/:id`; `STATUS_TRANSITIONS` map per card state (Retry / Archive / Restore / Cancel); no drag-and-drop
- C2 (`workspace-composer.tsx`): Static `SUGGESTED_PROMPTS` removed; live fetch from `GET /api/board/prompts` when `activeTaskId === null`; up to 3 deduplicated chips shown only when `!isRunning && !prompt.trim()`; disappear on typing or task activation
- C3 (`integrations.tsx`): `ProviderDiagnosticsPanel` added — fetches `GET /api/provider-diagnostics` on mount, shows active provider name / active model / lane count / connection health / per-lane rows; Refresh button also increments `diagRefreshKey` to retrigger diagnostics

## Shared Design System

- **`artifacts/workspace-ide/src/lib/theme.ts`** — Canonical shared theme module. Exports `VGTheme` type and `darkTheme` / `lightTheme` objects used by both `home.tsx` and `workspace.tsx`. All visual design tokens live here: backgrounds, surfaces, borders, text, accent colors, shadows, gradients, and atmospheric effects. Adding new themes or tokens should happen in this single file.

## Artifacts

- `workspace-ide`: Preview at `/` (port 5173)
- `api-server`: API at `/api` (port 3001)
- `mockup-sandbox`: Preview at `/__mockup` (port 8081)
