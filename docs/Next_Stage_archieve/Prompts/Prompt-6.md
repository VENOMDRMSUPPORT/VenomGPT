# Execution Prompt — Pass 6: API Base URL Audit & Fetch Hardening

---

## Current confirmed state

- Passes 1–5 are complete.
- `artifacts/workspace-ide/src/hooks/use-optimize-prompt.ts` calls
  `fetch('/api/prompt/optimize', ...)` without the `API_BASE` prefix. This hook
  is consumed in `workspace-composer.tsx` and `home.tsx`.
- The correct fix pattern is confirmed and already in production in
  `file-explorer-panel.tsx` and `code-editor.tsx`:
  ```ts
  const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
  ```
  Every `/api/` path is then prefixed with `${API_BASE}`.
- A full audit for any other root-relative `/api/` fetch calls has not yet been
  done — the count of remaining instances is unknown.
- No backend changes are needed or permitted in this pass.

---

## Your mission

Audit every `fetch()` call in the frontend for root-relative paths. Fix every
instance that targets `/api/` without `API_BASE`. Document any root-relative
fetch that is intentional and does not require fixing. Verify the workspace
compiles clean with zero new TypeScript errors.

Execute the five steps in order. Deliver evidence before marking the pass
closed.

---

## Forbidden actions

- Do not modify any file under `artifacts/api-server/src/`.
- Do not add new UI features or change any component behaviour.
- Do not change the `API_BASE` derivation pattern — it is confirmed correct.
- Do not fix root-relative fetch calls that target non-`/api/` paths without
  first confirming they are broken — if intentional, document them instead.
- **Stop condition**: if any fetch call is ambiguous (unclear whether root-relative
  is intentional or a bug), stop and report it. Do not guess.
- **Evidence rule**: a step is not closed until all its evidence items are
  present. Do not advance to the next step without the current step's evidence.

---

## Step A — Full audit

Run a complete grep across `artifacts/workspace-ide/src/` for:

```
fetch('/api/
fetch(`/api/
```

Also grep for any other root-relative fetch patterns (`fetch('/'`, `fetch(\`/`)
that do **not** start with `/api/`, to catch any non-API root-relative calls.

Produce two lists:

1. **Root-relative `/api/` calls** (must be fixed): every file:line that calls
   fetch with a `/api/` path and no `API_BASE` prefix.
2. **Other root-relative calls** (confirm intent before touching): every
   file:line that calls fetch with a root-relative path not starting with
   `/api/` — for each one, state whether it is a bug or intentional.

Do not touch any code in this step. Audit only.

**Step A evidence**:
1. Complete list of root-relative `/api/` fetch calls found: file:line for each.
2. Complete list of other root-relative fetch calls found (or "none found").
3. For each item in list 2: "intentional" or "bug" with a one-line reason.

---

## Step B — Fix `use-optimize-prompt.ts`

This is the highest-impact known instance. Fix it first.

In `artifacts/workspace-ide/src/hooks/use-optimize-prompt.ts`:

1. Add after the existing imports:
   ```ts
   const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
   ```
2. Change `fetch('/api/prompt/optimize', ...)` to
   `fetch(\`${API_BASE}/api/prompt/optimize\`, ...)`.

Confirm that `workspace-composer.tsx` and `home.tsx` (the two consumers of
this hook) require no changes — the fix lives in the hook, not the consumers.
If either consumer also has a root-relative fetch of its own (found in Step A),
fix it in Step C, not here.

**Step B evidence**:
1. File:line of the `API_BASE` constant in `use-optimize-prompt.ts`.
2. File:line of the fixed fetch call.
3. Confirmation that `workspace-composer.tsx` and `home.tsx` need no changes
   (or, if they do, note it for Step C).

---

## Step C — Fix remaining `/api/` instances

Fix every other root-relative `/api/` fetch call from the Step A list, applying
the identical pattern:

- Add `API_BASE` constant at module level (after imports) if not already present.
- Prefix every `/api/` path with `${API_BASE}`.

Do not change anything else in each file. One fix per file:line — no refactors.

If Step A returned zero additional instances beyond `use-optimize-prompt.ts`,
write "No additional instances found" and proceed to Step D.

**Step C evidence**:
1. For each fixed file: file:line of the `API_BASE` constant and file:line of
   each fixed fetch call.
2. Or: "No additional instances found — Step A list was exhausted by Step B."

---

## Step D — Document intentional non-`/api/` fetches

For every root-relative fetch that does not target `/api/` and was determined
to be intentional in Step A, add a short inline comment directly above or on
the same line as the fetch call:

```ts
// intentional: <one-line reason why this does not use API_BASE>
fetch('/some-other-path', ...)
```

This makes future audits unambiguous and prevents the call from being
"fixed" in a later pass.

If Step A found no other root-relative calls, write "No non-API root-relative
fetches found — Step D is a no-op."

**Step D evidence**:
1. For each documented call: file:line and the comment text added.
2. Or: "No non-API root-relative fetches found."

---

## Step E — Verify

1. Confirm TypeScript compiles with 0 errors in the workspace-ide package.
2. Re-run the Step A grep. Confirm it returns zero unfixed `/api/` results.
3. Confirm that any non-`/api/` root-relative fetches either have an
   `// intentional:` comment (Step D) or were fixed (Step C).

**Step E evidence**:
1. TypeScript: 0 errors in workspace-ide ✅
2. Grep result: zero root-relative `/api/` fetches remaining ✅
3. Non-`/api/` root-relative fetches: all accounted for (documented or fixed) ✅

---

## Final response format

```
## Pass 6 Completion Report

### Step A — Audit
Root-relative /api/ fetches found:
- [file:line — description]
- (or "none beyond use-optimize-prompt.ts")

Other root-relative fetches found:
- [file:line — intentional/bug — reason]
- (or "none found")

### Step B — use-optimize-prompt.ts
API_BASE constant: [file:line]
Fixed fetch call: [file:line]
Consumers (workspace-composer, home): [no changes needed / changes noted for Step C]

### Step C — Remaining /api/ instances
- [file:line — API_BASE added / fetch fixed]
- (or "No additional instances found")

### Step D — Intentional non-/api/ fetches
- [file:line — comment text]
- (or "No non-API root-relative fetches found")

### Step E — Verification
TypeScript: workspace-ide 0 errors ✅
Grep: zero root-relative /api/ fetches remaining ✅
Non-/api/ fetches: all accounted for ✅

### Pass status
[ ] PASS CLOSED — all 5 steps complete, all evidence present, TypeScript clean
[ ] PARTIALLY CLOSED — N steps incomplete or evidence missing, reason stated per step
[ ] BLOCKED — implementation cannot proceed, blocker described below:
```
