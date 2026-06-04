# Durable Artifact Rules

Purpose: preserve useful outputs beyond chat without creating a junk drawer.

## Artifact Types

Create a durable artifact when the output will likely be reused, reviewed, cited, or audited.

| Type | Durable Home | Examples |
| --- | --- | --- |
| Brief | `docs/` or `artifacts/` | one-pager, sprint offer, local daily brief |
| Research summary | `sources/` plus `docs/` when interpreted | vendor scan, GrowthOS notes, architecture comparison |
| Customer/product insight | `sources/` for evidence, task or doc for interpretation | customer signal, lead workflow finding |
| Decision/rationale | `decisions/` | accepted architecture, privacy, workflow, or ownership choice |
| Eval report | `evals/reports/` only when useful | failed eval, baseline comparison, regression evidence |
| Prompt/instruction change | agent/workspace instruction file plus optional decision | operating rule, skill change, guardrail |
| Workflow run output | task event, handoff, daily memory, or report path | worker handoff, cron result, audit summary |
| Implementation artifact | repo file plus task/commit evidence | script, fixture, migration, UI component |

## Promotion Rule

Promote chat output into an artifact when at least one is true:

- Felipe will likely ask for it again.
- Another agent or worker needs it to continue.
- It explains why a task exists.
- It records a decision, source, eval, workflow result, or approval.
- Losing it would cause repeated work or repeated mistakes.

Do not promote:

- routine status updates
- transient debugging chatter
- raw private messages or secrets
- speculative ideas with no action or evidence
- passing eval reports unless they justify a decision

## Storage Rules

- Keep raw evidence in `sources/` or `knowledge_sources`.
- Keep interpretation in `docs/`, tasks, or decisions.
- Keep operational records in task events, handoffs, or daily memory.
- Keep long-lived preferences and lessons in `MEMORY.md` only after distillation.
- Keep eval fixtures in `evals/`; keep reports only when they are useful evidence.

Every artifact should answer: why does this deserve to outlive the chat?

## Ticket Rule

Create or update a task instead of only creating an artifact when the output implies unfinished work with:

- owner
- acceptance criteria
- priority
- source/evidence
- review or approval need

If there is no concrete next action, do not create a task just to store a thought.

## Anti-Junk-Drawer Guardrails

- Prefer one well-named artifact over several partial copies.
- Link related task/source/decision IDs instead of duplicating full text.
- Archive or supersede stale artifacts by adding a note; do not silently rewrite history.
- Do not turn every good chat answer into a doc.

## Evidence

- `src:2026-06-04-growthos-context-boundary` - GrowthOS review highlighted the need to keep evidence, interpretation, decisions, and execution outputs distinct.
- Task `588c6a69-b525-4460-a2a2-d2b72f5d6aa0` - requested durable artifact rules.
