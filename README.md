# VenomGPT — AI Coding Workspace

A browser-based personal AI coding assistant. Give it a task in plain English and it executes it end-to-end on your local codebase: reads files, edits code, runs commands, fixes errors, and reports results — without constant approval prompts.

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set ZAI_API_KEY (required)

# 3. Start both API server and frontend
pnpm run dev
```

Open **http://localhost:5173** in your browser. Enter a workspace directory path when prompted, then describe a task.

---

## Running on External Platforms

For GitHub Codespaces, Gitpod, or other cloud IDEs, see [docs/EXTERNAL-PLATFORMS.md](docs/EXTERNAL-PLATFORMS.md) for detailed instructions.

**Quick start for external platforms:**
```bash
./start-external.sh
```

---

## Requirements

- **Node.js 20+**
- **pnpm** (`npm install -g pnpm`)
- **Z.AI API key** — get one at https://z.ai/manage-apikey/apikey-list

### Windows — Git Bash or WSL required

The AI agent executes shell commands (npm, git, tsc, etc.) via bash. On Windows you must install one of:

- **Git Bash**: https://git-scm.com/download/win
- **WSL**: https://learn.microsoft.com/en-us/windows/wsl/install

The app itself runs fine on Windows — only the agent's bash commands require Git Bash or WSL. The in-app workspace setup dialog shows this warning automatically when Windows is detected.

---

## Local Development

### What `pnpm run dev` does

The root `dev` script uses `concurrently` to start two processes simultaneously:

| Process | Port | Description |
|---|---|---|
| API server | **3001** | Express + WebSocket, file tools, agent loop |
| Frontend (Vite) | **5173** | React IDE with Monaco editor |

Vite automatically proxies all `/api` and `/api/ws` traffic from port 5173 to the API server at port 3001. You access everything through **http://localhost:5173** only.

### API server hot-reload

The API server uses `tsx watch`, so it automatically restarts when you edit files in `artifacts/api-server/src/`.

### Frontend hot-reload

Vite's HMR updates the browser instantly on any frontend file change.

### Running services individually

```bash
# API server only (port 3001)
PORT=3001 pnpm --filter @workspace/api-server run dev

# Frontend only (port 5173, proxying to API on 3001)
PORT=5173 BASE_PATH=/ VITE_API_PORT=3001 pnpm --filter @workspace/workspace-ide run dev
```

---

## Configuration

Edit `.env` (copied from `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `ZAI_API_KEY` | **Yes** | Your Z.AI API key — the only Z.AI variable you need to set |
| `WORKSPACE_ROOT` | No | Pre-configure workspace directory |

Endpoint and model selection are **fully automatic** — `ZAI_BASE_URL`, `ZAI_MODEL`, and `ZAI_VISION_MODEL` are not supported and have no effect.

The active endpoints are hardcoded internally:
- PAAS (OpenAI-compatible): `https://api.z.ai/api/coding/paas/v4/`
- Anthropic-compatible: `https://api.z.ai/api/anthropic`

### Provider selection logic

```
ZAI_API_KEY set?
  YES → Z.AI (primary)
        PAAS lane (coding):  https://api.z.ai/api/coding/paas/v4/
        Anthropic lane:      https://api.z.ai/api/anthropic
        Model selection:     automatic based on task type
  NO  → Replit AI integration (fallback, only when running inside Replit)
  NEITHER → startup error with setup instructions
```

Z.AI is always primary for local dev. The Replit AI integration is only a fallback when running inside Replit without a ZAI key.

### Z.AI model routing

| Task hint | Primary model | Lane | Fallback chain |
|---|---|---|---|
| `agentic` / `coding` | glm-5.1 | Anthropic | → glm-5 → glm-5-code → glm-4.7 → glm-4.7-flash |
| `coding_assistant` | glm-5-turbo | Anthropic | → glm-5.1 → glm-5 → glm-4.7-flash |
| `fast_chat` | glm-4.5-flash | PAAS | → glm-4.7-flash |
| `vision` | glm-4.6v | PAAS | → glm-4.6v-flash |
| `ocr_documents` | glm-4.5v | PAAS | → glm-4.6v |
| `cost_optimized` | glm-4.5-air | PAAS | → glm-4.5-flash |

---

## Verification

After cloning, run these in order from the repo root:

```bash
pnpm install          # Install all dependencies
pnpm run test         # Run safety and model config tests (32 checks)
pnpm run typecheck    # TypeScript check across all packages
pnpm run dev          # Start API (port 3001) + frontend (port 5173)
```

Expected output from `pnpm run dev`:

```
[api] Server listening on port 3001
[ide] VITE ready in Xms ➜ Local: http://localhost:5173/
```

Open **http://localhost:5173** — you should see the workspace setup dialog.

---

## How the Agent Loop Works

When you submit a task, the agent routes it to a task category profile that sets the step budget and capability limits. For code editing tasks (`code_edit` profile), the agent executes up to 25 steps:

1. **Think** — reasons about the task and approach
2. **Inspect** — reads the file tree and relevant files before touching anything
3. **Edit** — writes files one at a time with full new content
4. **Verify** — runs build/lint/test commands and checks exit codes
5. **Fix** — if a command fails, reads the error and retries with a different approach
6. **Done** — sends a structured report: files changed, commands run, final status

All steps stream live to the browser via WebSocket.

**Task cancellation**: click Cancel while the agent is working.

---

## Architecture

```
Browser (React + Monaco, port 5173)
     │  HTTP /api/** → Vite proxy
     │  WebSocket /api/ws → Vite proxy
     ▼
API Server (Express, port 3001)
  ├── lib/
  │   ├── safety.ts              → workspace root scoping, command blocklist
  │   ├── fileTools.ts           → read / write / list / delete
  │   ├── terminal.ts            → shell commands (bash on Linux/Mac, cmd.exe on Windows)
  │   ├── modelAdapter.ts        → z.ai / OpenAI-compatible adapter (dual-lane)
  │   ├── agentLoop.ts           → task orchestration (routing → planning → execution)
  │   ├── sessionManager.ts      → in-memory task storage, events (300-cap), failure details
  │   ├── taskPersistence.ts     → saves/loads ~/.venomgpt/history.json (default 100; configurable 25/50/100/200)
  │   ├── projectIndex.ts        → file relevance scoring (TTL 60s)
  │   ├── responseNormalizer.ts  → JSON extraction + repair
  │   ├── wsServer.ts            → WebSocket server at /api/ws
  │   ├── agentLoop/
  │   │   ├── evidenceAssembler.ts → TaskEvidence assembly + persistence
  │   │   └── actionExecutor.ts    → action dispatch (reads, writes, commands)
  │   └── orchestrator/
  │       ├── actionModel.ts       → canonical ActionRecord schema
  │       ├── actionStore.ts       → in-memory action store singleton
  │       ├── actionRouter.ts      → action gating + gate trigger telemetry
  │       ├── checkpoint.ts        → staged commit/discard lifecycle
  │       ├── stagingStore.ts      → per-task staging layer
  │       ├── verificationLedger.ts → verification evidence accumulation
  │       ├── taskRouter.ts        → task routing (conversational vs. agentic)
  │       ├── planner.ts           → structured pre-execution planning phase
  │       └── sideEffectClassifier.ts → shell command side-effect classification
  └── routes/
      ├── agent.ts      → task CRUD, evidence, replay, actions, capabilities
      └── checkpoint.ts → checkpoint status, apply, discard
```

### WebSocket

The WebSocket endpoint is at `/api/ws`. Vite's dev proxy forwards WebSocket upgrades to this path through to the API server. The same path is used in production via Replit's infrastructure proxy.

---

## Project Structure

```
venomgpt/
├── artifacts/
│   ├── api-server/           # Express API + agent backend
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── safety.ts              # Path scoping + command blocklist
│   │       │   ├── fileTools.ts           # File operations
│   │       │   ├── terminal.ts            # Shell execution (cross-platform)
│   │       │   ├── modelAdapter.ts        # z.ai / OpenAI adapter (dual-lane)
│   │       │   ├── agentLoop.ts           # Task orchestration loop (profile-capped; code_edit: 25 steps)
│   │       │   ├── sessionManager.ts      # Task storage, events, failure details
│   │       │   ├── taskPersistence.ts     # Saves/loads ~/.venomgpt/history.json
│   │       │   ├── projectIndex.ts        # File relevance scoring
│   │       │   ├── responseNormalizer.ts  # JSON extraction + repair
│   │       │   ├── wsServer.ts            # WebSocket at /api/ws
│   │       │   ├── agentLoop/
│   │       │   │   ├── evidenceAssembler.ts # TaskEvidence assembly + persistence
│   │       │   │   └── actionExecutor.ts    # Action dispatch
│   │       │   └── orchestrator/
│   │       │       ├── actionModel.ts       # Canonical ActionRecord schema
│   │       │       ├── actionStore.ts       # In-memory action store singleton
│   │       │       ├── actionRouter.ts      # Action gating + gate trigger telemetry
│   │       │       ├── checkpoint.ts        # Staged commit/discard lifecycle
│   │       │       ├── stagingStore.ts      # Per-task staging layer
│   │       │       ├── verificationLedger.ts # Verification evidence accumulation
│   │       │       ├── taskRouter.ts        # Task routing
│   │       │       ├── planner.ts           # Structured pre-execution planning
│   │       │       └── sideEffectClassifier.ts # Shell side-effect classification
│   │       └── routes/
│   │           ├── workspace.ts      # GET/POST /api/workspace
│   │           ├── files.ts          # /api/files (list/read/write/delete)
│   │           ├── agent.ts          # Task CRUD, evidence, replay, actions, capabilities
│   │           └── checkpoint.ts     # Checkpoint status, apply, discard
│   └── workspace-ide/        # React + Vite IDE frontend
│       ├── vite.config.ts    # Proxy config: /api → localhost:3001 (local only)
│       └── src/
│           ├── components/
│           │   ├── panels/
│           │   │   ├── task-console.tsx   # Left collapsible console (transcript + composer)
│           │   │   └── code-editor.tsx    # Monaco editor (flex:1)
│           │   └── layout/
│           │       └── top-bar.tsx        # Tabs, status, drawer triggers
│           ├── lib/
│           │   └── actionSelectors.ts     # ActionGroup derivation from ActionRecord[]
│           ├── hooks/use-websocket.ts
│           └── store/use-ide-store.ts
├── lib/
│   ├── api-spec/             # OpenAPI spec + Orval codegen config
│   ├── api-client-react/     # Generated React Query hooks
│   └── api-zod/              # Generated Zod validation schemas
├── scripts/
│   └── src/
│       ├── test-safety.ts        # Path traversal + command blocklist tests
│       └── test-model-config.ts  # Model adapter config tests
├── .env.example              # Environment configuration template
└── README.md
```

---

## Root Scripts

| Script | Description |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm run dev` | Start API (3001) + frontend (5173) concurrently |
| `pnpm run test` | Run 32 automated safety + model config tests |
| `pnpm run typecheck` | TypeScript check across all packages |
| `pnpm run build` | Full production build (typecheck + esbuild) |

---

## Filesystem Safety

- All file operations are **strictly sandboxed** to the configured workspace root via `path.resolve` + prefix checks. No path traversal is possible.
- **Absolute paths** from the client are explicitly rejected — only relative paths are accepted.
- **URL-encoded traversal** (`..%2F..`) is decoded before checking.
- **Windows backslash traversal** (`..\..`) is normalized before checking.
- **System directories** (`/`, `/etc`, `C:\Windows`, etc.) are blocked as workspace roots.
- A blocklist of ~15 shell patterns blocks `rm -rf /`, fork bombs, `curl | bash`, `shutdown`, Windows `del /s`, and more.
- All commands run with the workspace root as their `cwd`.
- Command timeout defaults to 120 seconds; agent can request up to 300 seconds.

---

## Known Limitations

- **No API hot-reload without restart**: The `tsx watch` dev server restarts the API process on file changes. In-flight tasks are interrupted on restart.
- **Task history is file-persisted**: Task events (300 cap) are in-memory only. Task evidence and summary are persisted to `~/.venomgpt/history.json`. Set `WORKSPACE_ROOT` in `.env` to auto-restore workspace after restart.
- **Action records are in-memory**: `ActionStore` records live for the current process. Evidence summaries are persisted; full action record lists are not.
- **No interactive terminal**: The terminal panel shows command output but is not a PTY shell.
- **No streaming action transport yet**: Actions are polled at 1750ms intervals. WebSocket-pushed action events are not yet implemented.
- **No action-level replay UI**: The replay endpoint exists; a timeline UI surface has not been built yet.
- **No multi-workspace support**: One workspace root per server instance.
- **Windows bash requirement**: The agent's shell commands require Git Bash or WSL on Windows.
- **Context window pruning**: For very long tasks, old messages are pruned. The system prompt and last 8 messages are always kept.

---

## What Is Fully Working

**IDE / Frontend**
- 2-panel layout: collapsible TaskConsole (300px → 48px icon rail) + Monaco CodeEditor (flex:1)
- FileExplorerPanel: right-side panel (fixed right-0, 340px), open by default, toggled via TopBar
- TaskHistory: right-side panel triggered from the `+` menu in TopBar
- TopBar: file tabs, connection status, explorer toggle, + menu
- Workspace directory picker with validation and Windows detection
- Monaco editor: open, read, save files with syntax highlighting and Ctrl+S
- Files edited by the agent automatically refresh in the editor if open

**Transcript Console**
- Transcript-first rendering with stage-aware thought items (PLANNING / INSPECTING / EDITING / VERIFYING / REPAIRING / WRAPPING UP colored badges)
- Compact file-read grouping, structured plan cards, FailureCard with category badge
- TaskSummaryCard: elapsed time, step count, changed files, checkpoint actions, action tallies
- Action-aware transcript: grouped action rendering (ActionGroupRow), expandable per action type
- Action polling during active runs (1750ms interval)

**Agent Loop**
- Real multi-step execution: routing → planning → inspect → edit → verify → fix → summarize
- Task routing (conversational bypass, agentic, planning, repair categories)
- Planning phase: structured pre-execution plan with goal, approach, files, expected changes
- WebSocket streaming: all agent events appear in real time
- Task cancellation via AbortController

**Staged Isolation + Checkpoint**
- All agent file writes go to a staging directory (live workspace untouched until apply)
- Checkpoint apply: promotes staged files atomically to live workspace
- Checkpoint discard: removes staging directory, live workspace stays clean
- Checkpoint status endpoint with `liveUnchanged` reporting
- Diff engine: line-level patch evidence (lines added/removed) per staged file

**Persistent Observability**
- TaskEvidence persisted to `~/.venomgpt/history.json` (survives restart)
- Evidence bundle: route profile, plan data, checkpoint summary, execution step telemetry
- Verification quality ladder: `none` | `static_only` | `command_success` | `runtime_confirmed`
- `GET /api/agent/tasks/:id/evidence` and `GET /api/agent/tasks/:id/replay` endpoints

**Action-Level Execution Tracking**
- ActionRecord model: id, taskId, type, status, timestamps, typed metadata, outcome
- ActionType: READ_FILE, WRITE_FILE, EXEC_COMMAND, VERIFY_RESULT, TOOL_ACTION
- ActionStore singleton: in-memory, keyed by taskId, ordered per task
- Instrumented in fileTools, stagingStore, actionExecutor, verificationLedger
- `GET /api/agent/runs/:taskId/actions` endpoint

**Safety**
- All file ops strictly sandboxed to workspace root (path.resolve + prefix checks)
- URL-encoded and Windows backslash traversal blocked
- ~15 shell command patterns block dangerous commands
- All commands run with workspace root as cwd
