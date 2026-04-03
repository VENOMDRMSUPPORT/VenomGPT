# Startup Architecture

## Service Port Map

| Port | Service | Process | Mandatory | Purpose |
|------|---------|---------|-----------|---------|
| 3001 | API Server | api-server/src/index.ts | Yes | Express backend for agent loop, file ops, shell commands, WebSocket interface |
| 5173 | Workspace IDE | workspace-ide/ (Vite) | Yes | React frontend with Monaco editor, proxies /api to localhost:3001 |
| 8081 | Mockup Sandbox | mockup-sandbox/ (Vite) | Yes | UI prototyping server for component previews |

## Startup Sequence

1. **Environment Loading** (`env-loader.ts`)
   - Loads .env from repo root
   - Does NOT throw if missing (relies on platform env)
   - Logs key count or warning

2. **API Server Bootstrap** (`api-server/src/index.ts`)
   - Validates PORT (must be valid number > 0)
   - Sets WORKSPACE_ROOT if provided
   - Loads settings (with defaults if missing)
   - Loads provider registry **with error tolerance** (try-catch, continues)
   - Inits task persistence, history, checkpoints **with error tolerance**
   - Starts HTTP server on configured port

3. **Provider Registry** (`providerRegistry.ts`)
   - Checks for ZAI_API_KEY presence
   - Sets state to "connected" or "disconnected"
   - Does NOT validate key format or make network calls
   - Persists state to disk

4. **Lazy Provider Initialization**
   - Provider client is NOT constructed at startup
   - First call to `getModelProvider()` or `getModelConfig()` triggers validation
   - `resolveProviderConfig()` throws `ProviderNotConfiguredError` if no key
   - This is REQUEST-TIME validation, not startup validation

## Configuration Categories

### Required for Startup
- `PORT` (API server) - must be valid number > 0
- `PORT` (IDE) - defaults to 5173 if not set
- `PORT` (Sandbox) - defaults to 8081 if not set

### Required for Provider Use (Request-Time)
- `ZAI_API_KEY` - required for Z.AI provider, validated on first provider call
- `AI_INTEGRATIONS_OPENAI_API_KEY` - emergency fallback only

### Optional
- `WORKSPACE_ROOT` - workspace directory path
- `BASE_PATH` - base path for frontend routing
- `NODE_ENV` - development/production

## Degraded Mode

The application can start and run in degraded mode when ZAI_API_KEY is not set:
- Server starts successfully
- Provider registry shows "disconnected" state
- `/api/provider-diagnostics` returns 503 with clear message
- `/api/agent/capabilities` returns honest "not configured" state
- Any operation requiring AI will fail with `ProviderNotConfiguredError`

## Error Handling

- **Startup errors**: Throw and prevent server start (e.g., invalid PORT)
- **Provider errors**: Return error response, don't crash server
- **Request-time provider errors**: `ProviderNotConfiguredError` with clear message

## Key Design Principles

1. **Lazy Validation**: Provider credentials are validated at request-time, not startup
2. **Error Tolerance**: Startup continues with warnings for non-critical failures
3. **Honest Degradation**: System reports "not configured" state instead of crashing
4. **Explicit Boundaries**: Clear distinction between startup config and runtime requirements
