# Agent Improvement Loop

Purpose: make Agent OS better at improving Cai/Charles/Sladdis without Felipe having to micromanage every next step.

## Current stance

- Default-act on safe, reversible, observable improvements.
- Stay away from Bank/Nordea work until Felipe explicitly reopens that track.
- Prefer agent/runtime leverage over cosmetic dashboard work.
- Ask before secrets, paid APIs, OAuth/live external accounts, broad security changes, model/provider defaults, or external messages.

## Built foundation

- `/dashboard/topology` — runtime map for agents, channels, bridge, memory, cron and cockpit surfaces.
- Bridge timeout/cache hardening — faster and less fragile snapshot reads.
- `/dashboard/memory` — QMD/Dreaming memory health, search and hygiene.
- `/dashboard/assistant` — personal-assistant readiness checks inspired by OpenClaw setup docs.

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
