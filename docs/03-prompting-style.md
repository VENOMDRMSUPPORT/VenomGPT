# VenomGPT — 03 Prompting Style

## Overview

This document defines the strict prompting style for VenomGPT engineering execution.

It is not a generic prompting guide.
It is the operating standard for writing prompts that are meant to make Replit execute heavy engineering work correctly, verify it honestly, repair what fails, and close the pass with a truthful final state.

The goal is not to produce a "good prompt."
The goal is to produce a prompt that gives Replit the best possible chance of succeeding in one serious pass with minimal follow-up prompting.

---

## Core Principle

**Write complete execution prompts, not partial prompts.**

A VenomGPT execution prompt must not stop at:
- analysis
- implementation
- partial verification
- "looks correct"
- "main work is done"
- "remaining small issues"

A correct execution prompt must drive the full pass through:

1. implementation
2. validation
3. error detection
4. correction / re-implementation if needed
5. final verification
6. honest closeout

If the prompt does not require this full loop, it is incomplete.

---

## Replit Positioning for VenomGPT

Replit must be treated as a serious heavy-duty engineering execution platform.

Do **not** write prompts as if:
- the task is too large for it
- the task should be artificially split only to be "nice"
- the model needs encouragement instead of strict direction
- implementation should pause after first success-looking result

Do **not** be gentle with scope when the objective is legitimately heavy.

What matters is not whether the task is "big."
What matters is whether the task is:
- bounded
- coherent
- technically explicit
- verifiable
- protected against drift

A large but well-bounded pass is preferable to several weak partial prompts that create churn.

---

## Non-Negotiable Prompt Standard

Every VenomGPT implementation prompt must be complete enough to answer all of these questions before execution starts:

1. What is already confirmed working?
2. What exact problem is being solved now?
3. What is explicitly out of scope?
4. What exact outcomes must exist before the pass is considered done?
5. What files may be touched?
6. What existing behavior must be preserved?
7. What verification must be run?
8. What should happen if verification fails?
9. What final closeout format is required?

If any of these are missing, the prompt is incomplete.

---

## Required Prompt Structure

Every serious implementation prompt should include these sections in this order:

1. **Context**
2. **Current confirmed state**
3. **Problem to solve now**
4. **What this pass is NOT**
5. **Required outcomes**
6. **Implementation requirements**
7. **Validation and correction loop**
8. **Verification required**
9. **Final response format**

Do not omit the validation-and-correction loop for serious passes.

---

## Golden Execution Rule

Every execution prompt must contain a direct instruction equivalent to:

> Do not stop at analysis or initial implementation. Implement the change, run the required validation, identify any failures or regressions, correct them in the same pass, re-run verification, and only then provide the final closeout.

This rule is mandatory.

---

## Core Prompting Rules

### 1. Build from confirmed state, not assumptions

Every prompt must begin from the current confirmed project state.

Do not ask Replit to:
- re-solve already completed work
- continue from stale assumptions
- trust a previous coding-agent summary over current repo reality
- build on claims that were not verified

If there is tension between:
- a report
- the current repo state
- local execution behavior
- logs / screenshots / browser proof

then the prompt must be built from:
1. local execution / real behavior
2. repo truth
3. logs / screenshots / browser proof
4. reported summaries

Never invert this order.

---

### 2. Solve one exact remaining problem

Every prompt must define one exact engineering problem.

Do not mix in one pass:
- bug fixing
- redesign
- scope expansion
- unrelated cleanup
- provider expansion
- broad performance work
- speculative architecture changes

If multiple issues exist, choose the single bounded problem that matters now.

One large bounded problem is acceptable.
Multiple unrelated problems are not.

---

### 3. State what is already confirmed working

Before describing the new work, list the relevant confirmed working areas.

This prevents Replit from:
- reopening finished work
- "improving" already-correct behavior
- changing architecture outside the pass
- re-solving the wrong layer

This is mandatory for continuity-sensitive sessions.

---

### 4. Explicitly state what this pass is NOT

Every prompt must explicitly say what the pass is not.

Examples:
- This is not a new phase.
- This is not a redesign pass.
- This is not a provider expansion pass.
- This is not a broad cleanup sweep.
- Do not touch already-confirmed control flow outside the target fix.
- Do not stop after initial implementation.

This section is one of the strongest anti-drift tools.

---

### 5. Define exact outcomes, not vague goals

Do not write:
- improve
- make better
- tighten generally
- clean up
- stabilize
- polish

Write exact outcomes:
- which behavior must exist
- which wrong behavior must disappear
- which UI state must render
- which backend path must execute
- which evidence must be produced
- which regressions must not occur

"Done" must be objective.

---

### 6. Tell Replit to complete the pass, not just attempt it

The prompt must require completion logic, not best-effort logic.

That means the pass must include:
- implementation
- validation
- issue detection
- repair or re-implementation if needed
- final verification
- truthful closeout

Do not frame the pass as:
- "make progress"
- "do what you can"
- "analyze and suggest"
- "implement as much as possible"

Unless the user explicitly asked for planning only.

---

### 7. Force validation inside the same pass

For implementation prompts, validation is not a separate luxury step.

The same prompt should require Replit to:
- run the relevant checks
- inspect the actual result
- detect errors and regressions
- fix what fails
- re-run checks
- only then close out

This dramatically reduces the need for follow-up prompts.

---

### 8. Require self-correction, not passive failure reporting

If validation fails, the prompt must tell Replit what to do:

- identify the concrete cause
- correct the implementation
- re-implement the failing path if necessary
- re-run verification
- only stop when either:
  - the bounded pass is truly verified, or
  - a hard external blocker is reached and explained honestly

Do not allow a "first implementation + failed validation + stop" pattern unless a real blocker exists.

---

### 9. Require honest blocking behavior

If the issue is blocked by:
- provider entitlement
- unavailable external route
- missing platform capability
- environment limitation
- unavailable dependency outside repo control

the prompt must require honesty:
- do not fake capability
- do not simulate unsupported behavior as if fixed
- do not silently degrade the task into a different task type
- do not claim success on an unavailable path

A truthful blocked result is better than fake completion.

---

### 10. Require a real closeout

Every serious pass must end with a structured closeout that states:

- what was changed
- what was validated
- what actually works now
- what regressions were checked
- what remains open
- what was intentionally deferred

No vague summary.
No "should now work."
No ungrounded success claims.

---

## Mandatory Validation-and-Correction Loop

For any non-trivial pass, the prompt must explicitly require this loop:

1. Implement the required changes.
2. Run the required verification.
3. Inspect failures, regressions, or incomplete behavior.
4. Correct the implementation or re-implement the failing path.
5. Re-run verification.
6. Repeat until the bounded pass is either:
   - genuinely verified, or
   - blocked by a real external constraint that is explained clearly.
7. Produce the final closeout only after the loop is complete.

This loop is the default standard.

---

## Evidence Standard

"It looks right" is not evidence.

Every accepted pass must produce explicit evidence appropriate to the change.

### Required evidence by pass type

| Pass type | Required evidence |
|---|---|
| Backend change | TypeScript clean + tests if relevant + real route / behavior verification |
| Frontend change | TypeScript clean + real visual / behavioral proof |
| Routing / control-flow fix | Triggered path proof + non-regression proof for nearby paths |
| Verification / execution logic change | Validation output + repaired outcome proof |
| Decomposition / cleanup | TypeScript clean + unchanged behavior proof |
| Closeout pass | Explicit gap list + proof each gap is now resolved |

A pass is not complete because code changed.
A pass is complete because the required behavior is proven.

---

## Strong Anti-Drift Rules

Every serious prompt should include the smallest set of guardrails needed to prevent the main failure mode.

Examples:

- Do not start a new phase.
- Do not redesign the whole app.
- Do not broaden provider support in this pass.
- Do not touch files outside the target list.
- Do not reopen already-confirmed behavior unless required for this fix.
- Do not stop at analysis.
- Do not stop after first-pass implementation.
- Do not report partial success as final completion.
- Do not rely on earlier reports over current repo truth.
- Do not fake unsupported capability.

---

## Heavy-Pass Policy

Do not artificially weaken a prompt because the task is large.

For VenomGPT:
- heavy tasks are allowed
- large file sets are allowed
- deep implementation is allowed
- multi-step validation is required
- re-implementation inside the same pass is allowed and often desirable

The only thing that must stay constrained is the **objective**.

Do not confuse:
- **large pass**
with
- **unbounded pass**

A large bounded pass is valid.
An unbounded pass is invalid.

---

## Prompt Types

### 1. Full Phase Implementation Pass

Use when a whole bounded engineering phase should be implemented.

Must include:
- strategic goal
- exact scope
- explicit non-goals
- required implementation outcomes
- full validation + correction loop
- broad but bounded verification
- final closeout

---

### 2. Bounded Correction Pass

Use when:
- drift happened
- a wrong control-flow path exists
- a regression appeared
- accepted work is incomplete in behavior

Must include:
- exact wrong behavior
- exact preserved working behavior
- strict scope boundary
- regression checks
- correction + re-validation loop

---

### 3. Closeout Pass

Use when a phase is mostly done but not yet fully trustworthy.

Must include:
- remaining issues only
- preserve already-working behavior
- no new feature expansion
- verification of all intended outcomes
- honest final state separation

---

### 4. Scope Tightening / Cleanup Pass

Use when the repo or capability surface became broader than intended.

Must include:
- exact surface to narrow
- misleading signals to remove
- preserved behavior
- non-regression proof

---

### 5. Identity / Consistency Pass

Use when naming, branding, copy, or product identity drifted.

Must include:
- exact occurrence classes
- what changes user-facing first
- compatibility constraints
- startup / persistence verification if affected

---

## Preflight Checklist Before Sending Any Serious Prompt

Before sending a serious Replit prompt, verify that it includes all of the following:

- relevant current confirmed state
- one exact remaining problem
- explicit out-of-scope section
- exact files to touch
- exact outcomes
- preserved behavior list
- validation steps
- regression checks
- correction / re-implementation loop
- honest blocker handling
- explicit final closeout format

If any item is missing, tighten the prompt before sending it.

---

## Strong Completion Rule

A VenomGPT execution pass should aim to finish in one serious prompt whenever reasonably possible.

That means the initial prompt should already include:
- implementation
- validation
- repair-on-failure
- re-verification
- summary closeout

Do not assume a separate validation prompt will be needed later.
Only use a separate validation or closeout prompt when:
- new evidence appears
- the repo reality differs from the expected implementation path
- a real blocker interrupts the original pass
- a safe bounded follow-up is genuinely required

The default goal is **first-prompt success with honest full closeout**.

---

## Final Response Standard

Every prompt should require a structured final response.

Preferred format:

1. What I changed
2. Why this pass was needed
3. How the behavior works now
4. Files changed
5. Verification performed
6. Re-implementation or corrections performed after validation failures
7. Remaining risks / intentionally deferred items

For larger passes, additional sections are encouraged, such as:
- routing behavior now
- validation loop summary
- regression checks performed
- blocked items and why they remain blocked

---

## Reusable Master Skeleton

```text
This is a bounded [phase / correction / closeout / cleanup] pass for VenomGPT.

## Context
[Why this pass exists now and what triggered it.]

## Current confirmed state
- ...
- ...
- ...

## Problem to solve now
[One exact remaining problem only.]

## What this pass is NOT
- ...
- ...
- ...
- Do not stop at analysis or first-pass implementation.

## Required outcomes
- ...
- ...
- ...
- Existing confirmed behavior must remain intact.

## Implementation requirements
- Touch only these files: ...
- Preserve: ...
- Build from current repo truth and observed behavior, not reported summaries alone.
- Implement the full bounded fix.
- Do not fake unsupported behavior.
- Do not broaden scope.

## Validation and correction loop
- After implementation, run the required validation immediately.
- If validation exposes errors, regressions, or incomplete behavior, correct the implementation in the same pass.
- Re-implement the failing path if necessary.
- Re-run validation after each correction.
- Do not close out until the bounded pass is genuinely verified or blocked by a real external constraint.

## Verification required
1. ...
2. ...
3. ...
4. ...
5. ...

## Final response format
1. What I changed
2. Why this pass was needed
3. How the behavior works now
4. Files changed
5. Verification performed
6. Corrections / re-implementation performed after validation
7. Remaining risks / intentionally deferred items

Do not stop at analysis. Make the code changes, run the validation, correct what fails, re-run verification, and only then provide the final closeout.
```
