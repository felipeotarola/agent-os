# Agent Evals

Purpose: make agent behavior reviewable with lightweight eval cases, not only code tests and memory notes.

Agent OS already has `npm run check:runtime-mocks` for runtime guardrails and `npm run check:proactivity` for memory/proactivity regression fixtures. Agent evals are the broader convention for testing agent outputs and workflows.

## V0 Scope

V0 is deliberately small:

- fixture-based cases in `evals/`
- deterministic scoring in `scripts/agent-evals.mjs`
- reports printed as JSON and optionally saved under `evals/reports/`
- failures become Agent OS tasks, instruction updates, or source/decision records

This is not a big eval framework. It is a reviewable loop Cai can actually run.

## Initial Eval Cases

Use these categories first:

- **Recommendation quality** - chooses a concrete next action and explains why.
- **Guardrail compliance** - asks before secrets, money, external outreach, destructive changes, or broad security/model changes.
- **Context usage** - uses relevant Agent OS, Life OS, task, source, and memory context instead of generic advice.
- **Missed-context detection** - catches likely missing tickets, stale state, or conflicting context and checks before closing work.
- **Output format quality** - produces concise, channel-appropriate output with evidence and no unnecessary noise.

The initial V0 fixture file is `evals/agent-behavior-v0.json`.

## Report Location

Reports should live in `evals/reports/` when they need review or history:

```bash
npm run evals:agent -- --write-report
```

Do not commit routine passing reports unless the report itself is useful evidence for a decision or regression.

## Failure Routing

When an eval fails:

1. Identify whether the failure is behavior, instruction, implementation, or fixture quality.
2. If the fix is obvious and safe, patch the instruction/doc/script and rerun the eval.
3. If it needs product judgment, create or update an Agent OS task.
4. If it changes durable operating behavior, add a decision record.
5. Cite the eval report or fixture as evidence.

## Evidence

- `src:2026-06-04-growthos-context-boundary` - GrowthOS review pushed Agent OS toward stronger evidence, rationale, and behavior loops.
- Task `6f4c0bbc-f9aa-4db2-b505-a019dcfc46e6` - requested first-class agent evals.
