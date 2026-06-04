# Playbooks and Workflows

Purpose: stop strategic principles from being mistaken for executable procedures.

## Definitions

A playbook is strategic guidance:

- principles
- decision rules
- tradeoffs
- examples
- when to ask, pause, or escalate

A workflow is executable:

- trigger/input
- owner
- steps
- outputs
- guardrails
- verification
- durable destination for results

If an agent should run it step by step, it is a workflow. If an agent should use it to choose a judgment call, it is a playbook.

## File Naming

Use names that reveal intent:

- `docs/*_PLAYBOOK.md` for strategic guidance.
- `docs/*_WORKFLOW.md` for executable procedures.
- `docs/*_RUNBOOK.md` for operational recovery or incident handling.
- `docs/*_POLICY.md` for rules and constraints.
- `docs/*_CONTRACTS.md` for API/schema/event contracts.

Existing docs do not need mechanical renames. Relabel or split only when ambiguity causes mistakes.

## Workflow Shape

Use this shape for executable workflows:

```markdown
# <Workflow Name>

Purpose: <why it exists>

## Trigger
<when to run it>

## Inputs
- <required context/tool/file>

## Steps
1. <action>
2. <action>
3. <action>

## Outputs
- <file/task/event/message/report>

## Guardrails
- <what not to do without approval>

## Verification
- <command/check/review>
```

## Playbook Shape

Use this shape for guidance:

```markdown
# <Playbook Name>

Purpose: <what judgment it improves>

## Principles
- <rule of thumb>

## Decision Rules
- If <condition>, choose <action>.

## Anti-Patterns
- <thing to avoid>

## Examples
- <small concrete example>
```

## Current Doc Labels

Treat these current docs as workflows:

- `docs/DAILY_AGENT_LEARNING_LOOP.md`
- `docs/AGENT_HANDOFF.md`
- `docs/BROWSER_AUTOMATION_RECOVERY.md`
- `docs/LOCAL_DAILY_BRIEF.md`
- `docs/WORKFLOW_FEEDBACK.md`

Treat these current docs as playbooks or policies:

- `docs/AGENT_IMPROVEMENT_LOOP.md`
- `docs/AGENT_OS_RESEARCH_RADAR.md`
- `docs/SOURCES_LAYER.md`
- `docs/DECISION_LOG.md`
- `docs/DURABLE_ARTIFACTS.md`

Treat these current docs as contracts:

- `docs/BRIDGE_CONTRACTS.md`
- `docs/SUPABASE_DATABASE.md`
- `docs/SUPABASE_AUTH.md`

## Evidence

- `src:2026-06-04-growthos-context-boundary` - GrowthOS review called out blurred context/rationale/execution boundaries.
- Task `0f3df177-b32c-43a6-a5bf-cb8ef85f8178` - requested separation between playbooks and executable workflows.
