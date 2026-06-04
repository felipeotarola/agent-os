# Decision: Make Agent Evals First-Class

- Date: 2026-06-04
- Owner: cai
- Status: accepted
- Related task: `6f4c0bbc-f9aa-4db2-b505-a019dcfc46e6`
- Evidence:
  - `src:2026-06-04-growthos-context-boundary` - GrowthOS review pushed Agent OS toward stronger evidence, rationale, and behavior loops.
  - Task `6f4c0bbc-f9aa-4db2-b505-a019dcfc46e6` - requested first-class evals for agent outputs and workflows.

## Decision

Agent OS will treat evals as a first-class quality loop alongside code tests, docs, tasks, sources, and decision records.

## Reason

Agent work fails in ways normal TypeScript tests do not catch: weak recommendations, missed context, noisy reports, bad approval posture, and poor use of task/memory evidence. A small fixture-based eval suite gives Cai a cheap regression check before this becomes a heavy framework.

## Tradeoff

V0 fixtures are deterministic and only test declared behavior, not live model output. That is acceptable for now because the immediate need is a lightweight, reviewable operating convention.

## Follow-Up

Run `npm run evals:agent` when changing agent instructions, task routing, proactive behavior, or reporting conventions. Save reports only when failures or decisions need evidence.
