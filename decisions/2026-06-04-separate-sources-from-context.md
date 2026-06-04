# Decision: Separate Sources From Context

- Date: 2026-06-04
- Owner: cai
- Status: accepted
- Related task: `1c63eaff-9550-4c32-8f48-7032d5e9b02c`
- Evidence:
  - `src:2026-06-04-growthos-context-boundary` - GrowthOS review finding that raw evidence and interpreted context were mixed.
  - Task `1c63eaff-9550-4c32-8f48-7032d5e9b02c` - requested a sources layer separate from context.

## Decision

Agent OS will treat sources as evidence and context as interpretation. Durable docs, tasks, decisions, and agent outputs should cite stable source IDs or links when they depend on raw evidence.

## Reason

This keeps memory/docs useful without turning them into unsupported claims. It also gives Cai and coding workers a repeatable way to preserve why a ticket, recommendation, or system change exists.

## Tradeoff

There is a little more ceremony for important changes. The constraint is intentional: only durable or consequential decisions need cited sources.

## Follow-Up

Use `docs/SOURCES_LAYER.md` and `sources/README.md` for new evidence bundles.
