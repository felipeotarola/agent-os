# Decision Log

Purpose: keep Agent OS and Life OS decisions small, dated, cited, and maintainable.

Agent OS already records what changed in commits, tasks, docs, and memory. The decision log records why important changes happened.

## When To Write One

Write a decision record when a change affects:

- Agent OS operating model, data boundaries, or permissions
- Life OS planning conventions
- durable task/project structure
- agent responsibilities
- product direction or architecture
- retention, privacy, or source handling

Do not write a record for tiny implementation details, typo fixes, routine dependency bumps, or one-off local cleanups.

## Required Fields

Each decision record should include:

- decision
- reason
- evidence/source
- tradeoff
- date
- owner

Use `decisions/YYYY-MM-DD-short-topic.md`.

## Template

```markdown
# Decision: short title

- Date: YYYY-MM-DD
- Owner: cai
- Status: proposed | accepted | superseded
- Related task: `<task-id or none>`
- Evidence:
  - `src:YYYY-MM-DD-short-topic` - one-line source summary

## Decision

One or two sentences.

## Reason

Why this choice is better than the realistic alternatives.

## Tradeoff

What this makes worse, slower, or more constrained.

## Follow-Up

The smallest next action, if any.
```

## Citation Rule

Every decision should cite at least one source ID, task ID, doc path, commit, or external link. If no source exists, create a short source summary first.

Good:

```markdown
- `src:2026-06-04-growthos-context-boundary` - GrowthOS finding that evidence and interpretation were mixed.
- Task `16813704-0af0-44af-9842-75008852f9e2` - requested decision-log discipline.
```

Bad:

```markdown
- Cai thinks this feels right.
```

## Maintenance

- Keep records under one screen when possible.
- Prefer one accepted decision over a chain of chat explanations.
- Supersede old decisions instead of rewriting history.
- Link decision records from docs and tasks when they define current behavior.
