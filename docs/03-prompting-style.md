# VenomGPT — 03 Prompting Style

## Overview

This document describes the prompting style that has proven effective for VenomGPT engineering sessions. It is a practical guide derived from what has actually worked — not a generic prompting handbook.

---

## Core Principle

**Write super prompts, not vague requests.**

Every VenomGPT engineering pass that succeeded had a prompt that:
- Named the exact objective in a single sentence
- Listed the exact files to touch
- Listed the exact files to leave alone
- Specified the verification criterion
- Stated what "done" looks like with evidence

Every pass that drifted or over-engineered had a vague prompt.

---

## Proven Prompt Patterns

### 1. Heavy Super Prompts

For any pass that changes more than 100 lines or touches more than 2 files, write a structured super prompt. Structure:

```
## This pass: [name]

### Objective
[One sentence: what this pass achieves]

### Bounded scope
Target files: [exact list]
Out of scope: [explicit list — do not touch these]

### What must be implemented
[Numbered list of specific technical requirements]

### Verification required
[TypeScript clean | tests pass | manual behavior check | specific command output]

### Done means
[Evidence that confirms completion — not "it seems right" but "tsc exit 0 + test output shows X"]

### Explicitly do NOT
[Things the agent tends to do that would be wrong here]
```

### 2. Trust Closure Passes

After a major implementation pass, run a closure pass to harden the last 5–10%:

```
This is a trust closure pass for [feature/module].

The implementation was accepted in the previous pass. This pass:
- Reviews the accepted implementation for gaps and silent assumptions
- Confirms all evidence claims are accurate and complete
- Identifies any behavior implied but not implemented
- Does NOT add new features or change the architecture

Verified working: [list what was accepted]
In scope: [specific gaps or questions to close]
Out of scope: [everything else]
```

### 3. Validation + Next-Step Passes

After any major merged pass:

```
This is a validation + next-step pass.

Confirmed completed in the previous pass: [list]

This pass:
1. Validates that the implementation is actually working, not just accepted in principle
2. Identifies the single highest-value next action based on current confirmed state

Validation criteria: [specific checks]
Do not implement any new features — validate first, then recommend only.
```

### 4. Bounded Decomposition Planning

Before decomposing a large file:

```
This is a decomposition planning pass for [filename].

Current file size: ~[N] lines
Goal: identify which modules can be safely extracted without touching [skeleton/thread/pattern].

For each candidate extraction:
- Name the proposed module
- List what it currently contains
- Judge the risk: does it touch [list of risky areas]?
- Recommend: extract now | defer | leave in place

Output: a written plan listing confirmed safe extractions, their scope, and explicitly deferred items.
Do NOT implement anything in this pass. Plan only.
```

### 5. Bounded Decomposition Implementation

After the plan is confirmed:

```
This is a decomposition implementation pass for [filename].

Confirmed plan from previous pass:
- Extract [module A]: [scope]
- Extract [module B]: [scope]
- Explicitly defer: [list]

This pass implements ONLY the confirmed safe extractions. It does not extract anything not in the plan.

Verification: TypeScript compiles clean, existing behavior unchanged.
```

---

## Evidence Requirements (Non-Negotiable)

Every accepted pass must produce explicit evidence. "It looks right" is not evidence.

Required evidence per pass type:

| Pass type | Required evidence |
|---|---|
| Backend change | TypeScript exit 0 + test output |
| Frontend change | Visual verification + TypeScript clean |
| Decomposition | TypeScript exit 0, existing behavior unchanged |
| Closure pass | Explicit list of gaps found + evidence each was resolved |
| Validation pass | Specific check outputs showing correct behavior |

Evidence must be present in the completion record, not just implied. The `done` action in the agent loop enforces this: `summary` must explain what was done AND what evidence confirms it.

---

## Anti-Drift Enforcement

The most common failure mode in sustained engineering sessions is drift: the agent starts implementing unplanned changes because they seem related or easy.

Counter-drift strategies:

1. **Explicit out-of-scope lists**: Name what must not change. The agent respects explicit negation better than implicit scope.

2. **Single-objective passes**: One objective per pass. Two objectives in one prompt means one will be done well and one will drift.

3. **"Do not" clauses**: End every super prompt with a "Explicitly do NOT" section listing the most likely over-engineering errors for this specific pass.

4. **Acceptance gating**: Do not start the next pass until the current one is accepted with evidence. Running two passes in parallel without intermediate acceptance leads to compounding drift.

5. **Decomposition boundary enforcement**: If the plan says "extract A and B, defer C and D", the implementation prompt must explicitly say "do NOT extract C or D, even if they look easy."

---

## Failure Mode Reference

| Symptom | Cause | Fix |
|---|---|---|
| Agent changes more files than listed | Vague scope | Explicit out-of-scope list |
| Agent "completes" without verification | Missing evidence requirement | Always specify required verification |
| Agent re-implements already-merged work | Missing state context | Begin prompt with confirmed current state |
| Decomposition extracts risky modules | No risk judgment required | Decomposition planning pass first |
| Two features partially done instead of one complete | Multi-objective prompt | One objective per pass |
| New architecture introduced without plan | No plan mode | Use plan mode for passes >200 lines |

---

## Session Continuity

At the start of every new session, provide:

1. **Confirmed completed** — what was accepted in the last session
2. **Current project state** — specific modules, files, and behaviors that are confirmed working
3. **What was deferred** — explicitly named items that are out of scope for this session
4. **This session's objective** — one bounded sentence

Do not assume the agent has context from a previous session. State the entry condition explicitly every time.
