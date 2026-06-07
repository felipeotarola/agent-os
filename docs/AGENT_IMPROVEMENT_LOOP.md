# Agent Improvement Loop

Purpose: make Agent OS better at improving Cai/Charles/Sladdis without Felipe having to micromanage every next step.

## Current stance

- Default-act on safe, reversible, observable improvements.
- Bank/Nordea track is reopened only for the explicitly approved v0: read-only account overview, mock/sandbox-first, no transactions/payments/raw statements, no live credentials until Felipe approves.
- Prefer agent/runtime leverage over cosmetic dashboard work.
- Ask before secrets, paid APIs, OAuth/live external accounts, broad security changes, model/provider defaults, or external messages.

## Built foundation

- `/dashboard/topology` — runtime map for agents, channels, bridge, memory, cron and cockpit surfaces.
- Bridge timeout/cache hardening — faster and less fragile snapshot reads.
- `/dashboard/memory` — QMD/Dreaming memory health, search and hygiene.
- `/dashboard/assistant` — personal-assistant readiness checks inspired by OpenClaw setup docs.
- `npm run evals:agent` — lightweight fixture-based evals for agent behavior, guardrails, context usage and output quality.
- `docs/WORKFLOW_FEEDBACK.md` — post-run learning template and routing rules.
- `docs/DURABLE_ARTIFACTS.md` — durable homes for reusable outputs instead of chat-only storage.
- `docs/PLAYBOOKS_AND_WORKFLOWS.md` — separates strategic guidance from executable procedures.

## Next high-leverage builds

1. **Session Workspace v1**
   - active/recent sessions
   - transcript viewer
   - session metadata: agent, channel, updatedAt, tokens when available
   - reset/compact guidance
   - handoff links into memory/tasks

2. **Agent Health v1**
   - per-agent memory freshness
   - recent failures/tool errors
   - stale sessions
   - heartbeat last useful action
   - “needs attention” queue

3. **Self-improvement task lane**
   - internal tasks tagged `agent-improvement`
   - reviewable ideas from heartbeats/dreaming/session friction
   - lightweight status: proposed → scaffolded → verified → shipped
   - eval failures become tasks, instruction updates or decision records

4. **Integration scaffold lane**
   - safe local adapters first
   - env var names and docs
   - read-only/mock mode by default
   - live credentials only after Felipe approves

## Heartbeat behavior

When no urgent work exists, Cai should use heartbeats to do one small step from this loop: inspect, document, scaffold, verify, or create an internal task. Avoid routine status spam.

## Direction correction: less Agent OS bloat

Felipe expects most work to happen through conversation with Cai, not by manually using many dashboard pages. Agent OS should not keep expanding into a surface for everything.

Prioritize:

- agent stability and recovery
- memory quality and hygiene
- session/subagent reliability
- fewer, sharper control panels
- health/readiness signals that help Cai act better

Deprioritize:

- new broad dashboard pages unless they directly improve agent stability or orchestration
- more workspaces/agents unless isolation is clearly needed
- UI surfaces Felipe will rarely use manually

## Daily learning loop

Add a low-noise daily review loop inspired by OpenClaw self-learning workflows: review what worked, failed, got corrected, broke, and what should be saved. Write back only high-signal lessons into memory, operating notes, docs, tasks, or small commits. See `docs/DAILY_AGENT_LEARNING_LOOP.md`.

Use `docs/WORKFLOW_FEEDBACK.md` for non-trivial post-run feedback. Route reusable outputs through `docs/DURABLE_ARTIFACTS.md` so useful work gets a durable home without creating a storage junk drawer.

## Autonomous self-evolution lanes

Felipe has authorized Cai to run all three self-evolution levels for Agent OS and self-learning: research, prioritize and implement. The operating model lives in `docs/AUTONOMOUS_SELF_EVOLUTION.md`.

- Research lane: `npm run self-evolution:research`; produces the next candidate and does not edit code.
- Prioritization lane: classify candidates as `research`, `ready-small`, `ready-large`, `blocked` or `shipped`.
- Implementation lane: ship bounded, safe, verified Agent OS/self-learning improvements; ask before external, paid, sensitive, model/provider, broad security or OpenClaw self-update actions.

## Agent evals

Use `docs/AGENT_EVALS.md` and `npm run evals:agent` when changing agent instructions, task routing, proactive behavior, or output/reporting conventions. Keep evals small and deterministic until a live model/tool harness is clearly worth the complexity.
