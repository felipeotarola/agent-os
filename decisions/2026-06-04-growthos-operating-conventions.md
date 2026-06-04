# GrowthOS Operating Conventions

- Date: 2026-06-04
- Status: accepted
- Owner: Cai
- Evidence:
  - `src:2026-06-04-growthos-context-boundary` - GrowthOS review pushed Agent OS toward clearer evidence, rationale, learning, and artifact boundaries.
  - Task `1282043a-2373-4cc5-a006-90ca88208edb` - workflow feedback and learning loop.
  - Task `0f3df177-b32c-43a6-a5bf-cb8ef85f8178` - playbook/workflow separation.
  - Task `588c6a69-b525-4460-a2a2-d2b72f5d6aa0` - durable artifact rules.
  - Task `3c593c0a-3665-4d82-b7d6-649207f97652` - memory/proactivity regression harness.

## Decision

Agent OS will keep three lightweight operating conventions:

- post-run workflow feedback for non-trivial learning
- explicit separation between strategic playbooks and executable workflows
- durable artifact rules for reusable outputs

Memory/proactivity regression fixtures will cover these behaviors alongside approval safety and noise control.

## Reason

The GrowthOS pass exposed a recurring failure mode: useful evidence, rationale, workflow learning, and reusable outputs can blur together in chat or docs. Small conventions make future work easier to resume and evaluate without adding another dashboard surface.

## Tradeoff

This adds documentation ceremony for meaningful work. The counterweight is explicit: skip feedback and artifact promotion for trivial tasks with no durable lesson or follow-up.

## Operational Rule

When a workflow teaches something reusable, route it through `docs/WORKFLOW_FEEDBACK.md`. When an output should outlive chat, use `docs/DURABLE_ARTIFACTS.md`. When writing execution docs, classify them through `docs/PLAYBOOKS_AND_WORKFLOWS.md`.
