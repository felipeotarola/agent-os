# Workflow Feedback Loop

Purpose: keep useful execution lessons from disappearing into chat while avoiding noisy self-reflection for trivial work.

## When to Capture Feedback

Capture feedback after a workflow when at least one is true:

- Felipe corrected the approach, priority, tone, or result.
- A tool, connector, cron, bridge, task, or handoff failed.
- The workflow exposed a missing instruction, skill, eval, doc, source, or decision.
- The work changed durable project behavior, not just one local file.
- The same friction appeared more than once.

Skip feedback for routine successful tasks that produced no new lesson, no decision, and no follow-up.

## Post-Run Template

Use this short shape in handoffs, task comments, daily memory, or a follow-up doc update:

```markdown
## Workflow Feedback

- Worked: <what should be repeated>
- Failed or friction: <what broke, confused, or slowed execution>
- Change needed: memory | instruction | skill | doc | ticket | eval | none
- Durable home: <path, task id, eval id, decision id, or "none">
- Follow-up: <single concrete next action, or "none">
```

Keep each field factual. If the useful answer is "none", write `none` and stop.

## Routing Rules

Route findings to the smallest durable home:

- `memory/YYYY-MM-DD.md`: raw session fact or short correction.
- `MEMORY.md`: durable preference, recurring lesson, or long-lived user context.
- `LESSONS.md`: mistakes and corrections Cai should not repeat.
- `docs/`: operating convention, workflow, guardrail, architecture, or product rule.
- `decisions/`: accepted rationale for durable behavior or architecture.
- `sources/`: raw evidence bundle separated from interpretation.
- `evals/`: regression case when an agent behavior should be tested.
- Agent OS task: concrete follow-up work with owner, source, priority, and evidence.

Do not route one finding to every place. Pick the home that future Cai will actually check.

## What Meaningful Workflows Capture

For coding and product changes:

- files changed and why
- verification run or not run
- user-visible behavior changed
- decision/source/eval links if the change affects operating behavior

For research:

- source IDs or links
- recommendation and confidence
- unresolved assumptions
- whether it should become a task, decision, source, or artifact

For agent orchestration:

- owner/session/agent
- handoff quality
- what context was missing
- whether a skill, instruction, or eval should change

For proactive/heartbeat work:

- signal checked
- action taken or intentionally skipped
- why the user was or was not notified
- follow-up task only when action is concrete

## Evidence

- `src:2026-06-04-growthos-context-boundary` - GrowthOS review pushed Agent OS toward stronger evidence, rationale, and feedback discipline.
- Task `1282043a-2373-4cc5-a006-90ca88208edb` - requested tighter workflow feedback and learning loop.
