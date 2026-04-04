# VenomGPT — 02 Replit Workflow

## Overview

This document defines the correct workflow for using Replit on VenomGPT.

It is intentionally strict.

Replit is not being used here as a lightweight helper for small patches.
It is being used as a serious engineering execution platform capable of heavy, multi-step, bounded implementation work.

The workflow below exists to maximize first-pass success, minimize prompt churn, and prevent false completion.

---

## Core Workflow Principle

**Do not send Replit partial work instructions when the real need is a complete execution pass.**

A correct VenomGPT Replit pass should, whenever reasonably possible, include:

1. bounded implementation
2. required validation
3. failure/regression detection
4. correction or re-implementation
5. final verification
6. truthful closeout

The default goal is not "make progress."
The default goal is **finish the bounded pass correctly**.

---

## Replit Capability Assumption

For VenomGPT, Replit should be treated as capable of:
- heavy implementation work
- multi-file changes
- deep codepath corrections
- large bounded passes
- repeated validation within the same pass
- corrective re-implementation when initial validation fails
- strong closeout reporting

Do not artificially shrink a pass just to be gentle.

Only reduce scope when:
- the objective is not coherent
- the pass mixes unrelated goals
- the repo truth is unclear
- a real risk boundary requires isolation

Large is acceptable.
Unbounded is not.

---

## Default Replit Execution Model

The default serious-pass workflow is:

1. establish current confirmed state
2. define one bounded engineering objective
3. give exact files and guardrails
4. require full implementation
5. require validation in the same pass
6. require correction / re-implementation if validation fails
7. require re-validation
8. require truthful summary closeout

If a prompt stops before step 8, it is incomplete.

---

## When to Use Replit

Replit is the right tool for:
- full bounded engineering phases
- substantial correction passes
- heavy control-flow fixes
- UI + backend implementation passes when the objective is still coherent
- large but explicit refactors
- closeout passes that require real verification
- repo-wide consistency work when tightly bounded
- implementation that requires retry/fix cycles inside the same execution pass

Do not avoid Replit because the task is heavy.
Avoid vague prompts, not heavy work.

---

## When to Split Work

Split work only when one of these is true:

1. The task contains multiple unrelated objectives.
2. The safe verification boundary between subproblems is materially different.
3. The repo truth is unclear and needs a planning pass first.
4. The pass would require changing risky unrelated systems simultaneously.
5. A real blocker prevents the main bounded objective from completing.

Do **not** split just because:
- the task is long
- the file count is high
- the implementation is complex
- Replit may need multiple validation runs

Complexity alone is not a reason to weaken the pass.

---

## Mandatory Pass Types

### 1. Full Phase Implementation Pass

Use when a full bounded capability or phase should be implemented.

This pass must require:
- implementation
- validation
- internal correction if needed
- final closeout

It is not acceptable for such a pass to stop after code changes only.

---

### 2. Bounded Correction Pass

Use when:
- the wrong path was implemented
- a regression appeared
- behavior is incomplete despite code landing
- a prior pass drifted

This pass must:
- fix the exact failing path
- preserve what already works
- validate the corrected path
- re-check nearby regressions
- close out honestly

Correction comes before continuation.

---

### 3. Closeout Pass

Use when most of a phase is complete but trust is not yet high enough.

This pass must:
- address remaining gaps only
- avoid new feature expansion
- verify all intended outcomes
- separate confirmed / partial / open / deferred honestly

---

### 4. Planning Pass

Use only when the repo reality or implementation order is not yet clear enough for safe direct execution.

A planning pass is justified when:
- more than one high-risk path is possible
- the current system behavior is unclear
- the work touches a dangerous core structure
- decomposition needs explicit risk judgment first

A planning pass must not be used as a habit or as a way to avoid implementation.

---

## Serious Prompt Requirements

Every serious Replit prompt must include:

- the exact bounded objective
- the current confirmed state relevant to this pass
- the exact files to touch
- the files or systems to leave alone
- the preserved behaviors
- the exact outcomes required
- the validation steps
- the correction / re-implementation rule if validation fails
- the final closeout format

If any of these are missing, the prompt is too weak.

---

## Execution Standard: Finish the Pass, Don't Just Start It

When Replit is executing a bounded implementation pass, the expected standard is:

- do the implementation
- run the checks
- inspect the result
- correct failures
- re-run checks
- repeat as needed inside the same pass
- then close out honestly

Do not accept this pattern as sufficient:

1. implement
2. run one test
3. notice failure
4. stop
5. report "needs follow-up pass"

That pattern is only acceptable if:
- a real external blocker exists, or
- continuing would violate the bounded scope.

Otherwise, the pass should continue until the bounded objective is either genuinely complete or honestly blocked.

---

## Validation Is Part of Execution, Not a Separate Courtesy

For VenomGPT, validation is part of the pass itself.

The same Replit prompt should normally require:
- typecheck/build
- tests where relevant
- route/path verification
- UI or runtime proof where relevant
- regression checks on nearby behavior
- post-fix re-validation

Do not assume that "implementation now, validation later" is acceptable.
That increases churn and creates unnecessary follow-up prompts.

---

## Correction and Re-Implementation Policy

If validation reveals that the initial implementation is wrong or incomplete, Replit should not stop at reporting the issue.

The pass should explicitly require:

1. identify the failing behavior precisely
2. determine whether the issue is:
   - incomplete implementation
   - wrong control flow
   - regression
   - validation gap
   - environment/blocker issue
3. correct the implementation
4. re-implement the failing path if necessary
5. re-run all relevant validation
6. close out only after the corrected result is verified

This policy is mandatory for serious execution passes.

---

## Honest Blocker Policy

If a real blocker exists, the closeout must say so clearly.

Real blockers include:
- unavailable provider entitlement
- unsupported platform route
- missing external dependency outside repo control
- environment limitation preventing truthful validation
- capability not actually supported by the platform

When blocked:
- do not fake progress
- do not simulate unsupported success
- do not silently degrade into another task type
- do not claim "done" because code changed

A truthful blocked result is acceptable.
A fake complete result is not.

---

## Evidence Hierarchy

When deciding whether a pass is genuinely complete, use this hierarchy:

1. local execution and real behavior
2. current repo state
3. logs / screenshots / browser proof
4. coding-agent summaries

Never let summaries outrank proof.

---

## Workflow for a Serious Replit Pass

### Step 1 — State the entry condition

Before writing the prompt, identify:
- what is confirmed working now
- what was previously accepted
- what remains open
- what must not be reopened

This prevents continuity drift.

---

### Step 2 — Define the one bounded objective

State the pass in one sentence.

Examples:
- correct the task replay closeout path without changing checkpoint semantics
- implement lane-level evidence rendering for the existing orchestration model
- tighten runtime stale detection behavior without redesigning recovery flows

If the sentence cannot be made precise, the pass is not ready.

---

### Step 3 — Define the exact scope

Specify:
- target files
- non-target files
- preserved behaviors
- non-goals

This is mandatory.
Do not rely on implicit scope.

---

### Step 4 — Require full implementation

Tell Replit to complete the bounded implementation, not just sketch or partially land it.

Use direct language:
- implement
- correct
- preserve
- verify
- re-run
- close out

Avoid passive language:
- consider
- explore
- think about
- discuss
- suggest

Unless this is explicitly a planning pass.

---

### Step 5 — Require validation in the same pass

Specify:
- exact commands
- exact flows
- exact UI paths
- exact behavioral expectations
- exact regression checks

Validation must be concrete, not generic.

---

### Step 6 — Require correction if validation fails

The prompt must explicitly say that Replit should:
- inspect the failure
- correct the issue
- re-implement if needed
- re-run validation
- continue until verified or truly blocked

This step is essential for reducing follow-up prompts.

---

### Step 7 — Require truthful closeout

The final report must distinguish:
- confirmed working
- partially validated
- still open
- intentionally deferred

Do not allow a generic success summary.

---

## Practical Standard for Reducing Follow-Up Prompts

The best way to reduce the number of prompts is **not** to make prompts smaller.

It is to make them more complete.

A prompt that includes only implementation often creates:
- one execution prompt
- one validation prompt
- one fix prompt
- one closeout prompt

A stronger single prompt can often absorb all of that by requiring:
- implementation
- validation
- correction
- re-validation
- closeout

The objective is to reduce prompt count by increasing prompt completeness.

---

## Planning Mode Rule

Use planning mode only when it is genuinely necessary.

Valid reasons:
- dangerous core-loop work
- unclear control-flow boundaries
- unclear repo truth
- decomposition risk assessment
- major architecture choice not yet resolved

Invalid reasons:
- the task is large
- the task spans many files
- the implementation is difficult
- you want to be cautious by default

Replit should not be underloaded just because the task is heavy.

---

## Closeout Standard

A Replit pass is only fully accepted when the closeout includes:

1. what changed
2. why the pass was needed
3. how the behavior works now
4. files changed
5. verification performed
6. fixes / re-implementation performed after validation failures
7. remaining risks / intentionally deferred items

For larger passes, it should also include:
- confirmed working
- partially validated
- still open
- intentionally deferred

That separation is mandatory for truthfulness.

---

## Common Failure Modes and Corrections

| Failure mode | Cause | Correction |
|---|---|---|
| Code landed but behavior still wrong | Prompt allowed stop after implementation | Require validation + correction loop |
| Follow-up validation prompt needed unnecessarily | Original prompt was incomplete | Put validation into the original prompt |
| Closeout is vague | Final response format too weak | Require structured closeout |
| Replit drifted into redesign | Out-of-scope not explicit enough | Add strong non-goals |
| Replit stopped after first failed test | No self-correction rule | Require correction / re-implementation in same pass |
| Task split too early | Prompt was written "gently" | Keep heavy but bounded passes intact |

---

## Reusable Replit Workflow Skeleton

```text
1. Establish current confirmed state.
2. Define one exact bounded objective.
3. Define target files, preserved behaviors, and explicit non-goals.
4. Require full implementation.
5. Require validation in the same pass.
6. If validation fails, require correction / re-implementation in the same pass.
7. Re-run verification.
8. Close out with a truthful structured final report.
```
