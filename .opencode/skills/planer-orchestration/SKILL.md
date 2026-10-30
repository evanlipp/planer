---
name: Planer Orchestration
description: Run a non-trivial change in the Planer repo through the architect → coder → reviewer pipeline with explicit contracts and review gates.
---

# Planer orchestration

Use this when a task changes more than one file, touches auth/API contracts, or needs a design decision before code.
For a one-line fix, delegate straight to `coder`, or do nothing if it is outside code.

Project facts live in `AGENTS.md` at the repo root. Read them before the first delegation; they bind every agent.

## Roles

| Agent | Owns | Must not |
| --- | --- | --- |
| `orchestrator` (you) | scope, slicing, decisions, final report | write product code |
| `architect` | design, file plan, contracts, risks | edit, build, run code |
| `coder` | implementation of one slice + verification | redesign, expand scope |
| `reviewer` | findings on the diff | edit, fix, rewrite |

## Pipeline

### 1. Scope (orchestrator, no delegation)

Write down: goal in one sentence, in-scope paths, out-of-scope paths, unknowns, and the verification command that will
prove it works. If an assumption could invalidate the whole plan, ask the user now — not after the coder has worked.

Slice the task. A slice is the smallest change that is correct on its own and buildable. Typical slices for this repo:
data layer → API route → client + store → view. Do not slice by file count.

### 2. Design (architect)

Send a self-contained brief:

```
Task: <goal>
Slice: <what this contract must cover>
Known files: <paths you already identified>
Constraints: AGENTS.md invariants; no new dependencies; <task-specific>
Return: the standard design contract (goal, constraints, approach, rejected alternatives, file plan,
data contracts, risks, definition of done).
```

Reject the contract and re-ask if it: invents files, proposes new dependencies or layers, omits the file plan, or lacks
a verifiable definition of done. Do not pass a vague contract downstream.

### 3. Implement (coder)

One call per slice. Pass the contract verbatim. Always include:

```
Slice: <name>
Plan: <architect contract, verbatim>
Scope: only these files <list>. Anything else needs approval.
Verify: npm run build --prefix frontend  (API changes: also npm run api:dev + curl /api/health)
Return: the standard implementation report.
```

A coder report without a real verification line is incomplete — send it back.

### 4. Review (reviewer)

Send the diff context, not the whole conversation:

```
Task: <goal>
Slice: <name>
Expected: <definition of done from the contract>
Review the current working tree diff.
```

### 5. Gate

- `APPROVE` → next slice, or finish.
- `REQUEST_CHANGES` with only `bug`/`security`/`regression`/`contract` items → hand the exact blocking bullets back to
  `coder`, then re-review.
- Findings that are really a design problem → go back to `architect` for a revised contract, then re-run the slice.
- Three review cycles without approval → stop. Report to the user with the remaining findings and your recommendation.
  Do not keep looping on the same defect.

Never let the coder and reviewer argue through you. Translate findings into one concrete instruction per cycle.

## Final report

```markdown
Сделано: <одна строка>
Изменено: <файлы>
Проверка: <команда> → <результат>
Ревью: APPROVE после N циклов (или: осталось X блокирующих)
Риски: <только реальные>
```

Include the reviewer's non-blocking items only if the user will care; otherwise mention that they exist.

## Anti-patterns

- Delegating "look at the repo and do the task" — the subagent starts with no context and will guess.
- Merging two slices into one coder call to save a round trip — it produces an unreviewable diff.
- Accepting a review that lists no file:line — demand specifics.
- Editing code yourself "because it is faster" — you lose the independent review, which is the entire point.
- Silently dropping a blocking finding because it looks pedantic.
