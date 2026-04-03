# VenomGPT — 02 Replit Workflow

## Overview

This document describes how the Replit agent environment has been used effectively throughout the VenomGPT session. It captures what patterns work, what patterns fail, and the practical lessons learned from executing sustained heavy engineering passes.

---

## What Replit Is Good At for VenomGPT

### Heavy Bounded Engineering Passes

Replit performs best when given a single, clearly scoped engineering objective with:
- A concrete target file list
- A specific technical outcome to achieve
- A verification criterion (typecheck, test, or manual inspection)
- An explicit boundary (what is out of scope)

The backend trust closure phases — orchestration architecture, checkpoint durability, staged isolation, runtime verification, observability, lifecycle maturity — all succeeded under this model. Each pass had a clear entry condition, a clear exit condition, and no scope creep.

### Plan Mode for Heavy Backend Passes

Plan mode is especially effective for large backend changes. Use it when:
- The change touches multiple modules simultaneously
- The correct implementation order is non-obvious
- There is significant state to reason about before writing code
- You want to validate the approach before any code is written

Plan mode catches drift before it compounds. It surfaces assumptions that need to be challenged. Always prefer plan mode over "just write the code" for backend passes that exceed a few hundred lines.

### Closure Passes

Once an implementation pass is accepted, a closure pass solidifies it:
- Confirms all evidence is present and accurate
- Catches missed edge cases
- Identifies any remaining surface that was implied but not implemented
- Produces the final verification state

The backend trust stack accumulated multiple closure passes, each one raising the quality ceiling without regressing the foundation.

### Validation + Next-Step Passes

A validation pass after a major change does two things:
1. Confirms the change is actually working (not just accepted in principle)
2. Identifies the correct next highest-value action

Skipping validation passes leads to accumulated drift — work that was assumed to be complete but has silent gaps. VenomGPT avoided this by running validation passes after each major backend phase.

### Decomposition Planning Passes

For large files that need to be broken up (like `agentLoop.ts`), a planning pass first is essential. Do not attempt decomposition without a written plan that:
- Lists all candidate extractions
- Judges each one for risk (does it touch the while-loop skeleton? the messages thread? cancellation logic?)
- Identifies a safe first extraction set
- Explicitly marks high-risk extractions as deferred

The `agentLoop.ts` decomposition pass 1 succeeded because it followed this pattern: plan first, extract only `evidenceAssembler` and `actionExecutor` (low risk, clean boundaries), and explicitly defer `summaryEmitter`, checkpoint consolidation, and `visualPipeline` extraction.

### Bounded Decomposition Implementation Passes

After the plan, the implementation pass must respect the plan's boundaries exactly. Do not decompose more than planned, even if additional extractions look easy in the moment. Each unplanned extraction is a new risk surface.

---

## What Replit Struggles With for VenomGPT

### Open-Ended Passes Without a Bounded Target

If you give Replit a vague objective ("improve the orchestration"), it will over-engineer in unpredictable directions. Always bound the pass: "improve X specifically, leave Y and Z untouched."

### Multi-Phase Work in a Single Pass

Combining a backend change with a frontend change in the same pass increases the risk of both regressing. When both need to change, do them in sequence with a validation checkpoint between them.

### Passes That Touch the Core Loop

The `agentLoop.ts` while-loop skeleton, messages thread, and cancellation pattern are the highest-risk areas in the codebase. Any pass that touches these must be extremely bounded. Prefer to extract modules that sit outside the loop rather than refactoring the loop itself.

---

## Practical Workflow Template for VenomGPT Sessions

```
1. State entry condition
   - What is the current confirmed state?
   - What was the last accepted pass?

2. Define the bounded objective
   - Single sentence: "This pass implements X in Y, leaving Z unchanged."
   - Target files (specific list)
   - Out-of-scope (explicit list)

3. Run plan mode if the pass is complex (>200 lines changed or >3 files)

4. Execute the implementation pass

5. Verify
   - TypeScript clean? (pnpm run typecheck)
   - Tests pass? (pnpm run test)
   - Runtime behavior correct?
   - Evidence present?

6. Run a closure pass if any gaps remain

7. Update documentation before the next pass

8. State exit condition
   - What is now confirmed?
   - What is intentionally deferred?
   - What is the next highest-value action?
```

---

## Specific Patterns That Have Worked

| Pattern | When to use |
|---|---|
| Heavy super prompts | When the objective needs precise boundaries and the agent tends to drift |
| Trust closure passes | After a major implementation to harden the last 5–10% |
| Validation + next-step passes | After any major merged pass to confirm state before deciding next action |
| Bounded decomposition planning | Before touching any large file (>500 lines) |
| Bounded decomposition implementation | After the plan is confirmed — implement only what was planned |
| Strong evidence requirements | Always — "done" without exit codes or read-back evidence is not done |
| Anti-drift enforcement | When a pass tends to expand scope — be explicit that expansion is forbidden |

---

## Evidence Requirements for Accepting Any Pass

A pass is not accepted until:

1. TypeScript compiles clean (`pnpm run typecheck`)
2. Safety + model config tests pass (`pnpm run test`)
3. Any new runtime behavior has been manually verified
4. Documentation is updated to reflect the new state
5. The confirmed/partial/open/deferred separation is explicit in the close-out

Accepting a pass without evidence is how technical debt accumulates silently. Every accepted pass must have an explicit evidence record.
