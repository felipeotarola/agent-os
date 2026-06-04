# Decision: Use A Lightweight Decision Log

- Date: 2026-06-04
- Owner: cai
- Status: accepted
- Related task: `16813704-0af0-44af-9842-75008852f9e2`
- Evidence:
  - `src:2026-06-04-growthos-context-boundary` - GrowthOS review finding that evidence, context, and rationale need clearer separation.
  - Task `16813704-0af0-44af-9842-75008852f9e2` - requested decision/rationale discipline.

## Decision

Agent OS will use short decision records for important Agent OS and Life OS changes. Each record captures decision, reason, evidence/source, tradeoff, date, and owner.

## Reason

Commits and memory explain what happened, but not reliably why. A small decision log gives future agents enough rationale without creating a heavyweight governance process.

## Tradeoff

Some choices will still be too small for a record. Cai should bias toward records only when the decision changes durable behavior, permissions, architecture, or project direction.

## Follow-Up

Link relevant future docs and tasks to `docs/DECISION_LOG.md`.
