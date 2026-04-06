# Pass 6: API Base URL Audit & Fetch Hardening

> **STATUS: OPEN** — Not yet started.

## What & Why

Every `fetch()` call in the frontend that uses a root-relative path like
`/api/...` will break when VenomGPT is served under a non-root base path
(Replit proxy sets `BASE_PATH` to a sub-path). The fix pattern is already
confirmed: derive `const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? ''`
at module level and prefix every fetch with `${API_BASE}/api/...`.

This exact bug was already fixed in `file-explorer-panel.tsx` (Pass 5 bug
closeout). This pass finds and fixes every remaining instance across the
frontend. The highest-priority known instance is `use-optimize-prompt.ts`,
which calls `POST /api/prompt/optimize` without the prefix, used in both the
main workspace composer and the home page.

**No backend changes. No new UI surfaces. Pure correctness pass.**

---

## Execution order within this pass

| Step | Task | Why first |
|------|------|-----------|
| A | Audit all fetch() calls | Find every root-relative path before touching code |
| B | Fix `use-optimize-prompt.ts` | Highest-impact: used in two pages |
| C | Fix remaining instances | Any other calls found in the audit |
| D | TypeScript + runtime verify | Confirm clean compile and no new errors |

---

## Done looks like

- `use-optimize-prompt.ts` calls `${API_BASE}/api/prompt/optimize`
- A full-codebase grep for `fetch('/api/` returns zero results in
  `artifacts/workspace-ide/src/` (all instances either fixed or confirmed
  already using `API_BASE`)
- TypeScript compiles clean (0 errors) after changes
- The "Optimize prompt" button in the workspace composer and home page continues
  to function correctly

## Out of scope

- Any backend changes
- New UI features
- Changing the `API_BASE` derivation pattern itself (it is confirmed correct)

## Tasks

1. **Audit** — Run a full grep for `fetch('/api/` and `fetch(\`/api/` across
   `artifacts/workspace-ide/src/` to produce an exhaustive list of all
   root-relative fetch calls. Cross-reference each against the existing
   `file-explorer-panel.tsx` fix to confirm the pattern and enumerate
   everything that still needs fixing.

2. **Fix `use-optimize-prompt.ts`** — Add the `API_BASE` constant at module
   level (after imports) and update the `fetch('/api/prompt/optimize', ...)`
   call to `fetch(\`${API_BASE}/api/prompt/optimize\`, ...)`. Verify that
   both `workspace-composer.tsx` and `home.tsx` (which consume this hook) do
   not need their own changes — the fix lives in the hook, not the consumers.

3. **Fix remaining instances** — Apply the same `API_BASE` prefix to every
   other root-relative fetch call found in step 1. Each fix follows the
   identical pattern: add `API_BASE` constant at module level if not present,
   prefix every `/api/` path.

4. **Verify** — Confirm TypeScript compiles clean. Confirm the optimize button
   produces a network request to the correct path.

## Relevant files

- `artifacts/workspace-ide/src/hooks/use-optimize-prompt.ts`
- `artifacts/workspace-ide/src/components/layout/workspace-composer.tsx`
- `artifacts/workspace-ide/src/pages/home.tsx`
- `artifacts/workspace-ide/src/components/panels/file-explorer-panel.tsx`
- `artifacts/workspace-ide/src/components/panels/code-editor.tsx`
