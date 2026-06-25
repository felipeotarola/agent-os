# Agent OS Research Radar

Purpose: keep a lightweight backlog of ideas from agentic OS / personal AI assistant research that Agent OS may want, especially things OpenClaw does not already provide directly.

Last scan: 2026-06-25

## What strong agentic systems tend to have

Sources reviewed in this pass:

- MindStudio: agentic OS components — identity, short/long memory, skills/tools, planning, orchestration, handoffs, evaluation, guardrails.
- Microsoft Azure Architecture Center: orchestration patterns — direct model, single-agent-with-tools, multi-agent; sequential, concurrent, handoff/group patterns.
- HITL Agent Inbox docs: review inbox states, assignments, filters, bulk operations, analytics, access control.
- OpenAI ChatGPT agent announcement: unified research/action environment, multiple tool modes, connectors, virtual computer, interrupt/steer/pause/resume, asks permission before consequential actions.
- Microsoft STATE-Bench: stateful agent task evaluation benchmark focused on whether memory improves real multi-turn task outcomes, not just retrieval.

## Gap analysis vs current Agent OS / OpenClaw

### Already mostly covered

- Agent identity/context files: `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `PROACTIVE.md`, agent workspaces.
- Long-term memory: `MEMORY.md`, daily memory, QMD/session search, memory dreaming promotion.
- Tool/skill layer: OpenClaw tools + skills + allowed tool lists.
- Scheduling: OpenClaw cron, morning/evening briefs, proactive loop.
- Multi-agent execution: Cai + Charles + Sladdis + subagents.
- Guardrails: protected config paths, ask-first rules, tool policy, channel routing, read-only connector stance.
- Cockpit surfaces: Overview, Radar, Action Center, Knowledge, Runway, Vercel/Supabase/GitHub.

### Missing or weak

1. **Handoff documents between agents**
   - Workers currently return free-form summaries.
   - Better: standardized `handoff.json`/markdown shape: goal, files changed, decisions, blockers, tests, next suggested action.

2. **Eval/feedback loop**
   - We run lint/build, but there is no persistent quality feedback: “was this useful?”, repeated mistakes, regression notes.
   - Better: `Agent OS Evals` page + tiny feedback events table for completed tasks/briefs.

3. **Inbox Radar as Review Queue**
   - Knowledge has review states; Radar has signals; Action Center has actions.
   - Decision: do not create a separate Review page by default. Fold “needs Felipe approval/review” into Inbox Radar as one consolidated attention cockpit across drafts, outreach, risky actions, memory promotions, suggested tasks, generated PRDs and subagent handoffs.

4. **Runbook/workflow templates**
   - Skills exist at OpenClaw level, but Agent OS lacks user-visible workflow templates: “research competitor”, “turn email into task”, “prepare outreach draft”, “ship small UI fix”.
   - Better: reusable cockpit playbooks with allowed tools, ask-first boundaries, expected outputs.

5. **Pause/resume/steer UI for long work**
   - OpenClaw supports sessions/subagents/processes, but Agent OS UI could show running jobs with buttons: steer, pause/stop, summarize current progress.

6. **Cost/time/token visibility per run**
   - OpenClaw has status/session usage, but Agent OS cockpit does not yet expose cost/latency budget or “expensive task warning”.

7. **Proactive hypothesis backlog**
   - Cai now has a proactive loop, but Agent OS lacks a first-class backlog of “Cai noticed X, proposes Y because Z”.
   - Better: `Opportunity Radar` page: observed signal → proposed action → confidence → risk → status.

8. **Connector health SLAs**
   - We have degraded states per connector, but no “last good snapshot”, “stale since”, “noise/failure trend”, or recurring repair suggestion.

9. **Human preference model / decision log**
   - Memory has preferences, but UI lacks a decision ledger: “Felipe prefers X; source; confidence; last confirmed”.

## Recommended build order

### 1. Inbox Radar V2: attention + review + approvals

Why: this converts proactivity into safe autonomy without creating another dashboard silo. Cai can prepare things, but Felipe reviews one consolidated cockpit instead of chasing Telegram or checking yet another page.

V1:
- Extend Radar items with `kind`: `signal`, `review`, `approval`, `draft`, `handoff`, `task`
- Keep existing Radar state/actions: handled, snooze, create task, open source
- Add queue filters inside `/dashboard/radar`: All, Review, Approvals, Signals, Tasks
- Add central agent console: recommendation + explanation + “open Cai chat” path
- Add flow diagram explaining sources → classification → Cai/Felipe decision → receipts/state
- Later DB model can evolve from `radar_signals` into `inbox_items` without a separate route

### 2. Standard subagent handoff format

Status: V1 documented in `docs/AGENT_HANDOFF.md`.

Why: reduces lost context and makes orchestration more reliable.

V1 handoff fields:
- goal
- status
- owner
- finished at
- summary
- files changed
- commands run
- verification
- decisions made
- blockers / risks
- recommended next step

### 3. Opportunity Radar inside Inbox Radar

Why: this is the “Cai noticed something” surface, but it should not become a separate page unless it proves it needs one.

V1:
- represent opportunities as Radar `kind=signal` or `kind=review`
- include confidence + effort + risk in metadata
- action buttons: create task, dismiss/handled, ask Felipe, schedule follow-up

### 4. Runbook templates

Why: makes repeated work less chat-dependent.

V1 templates:
- Small Agent OS UI improvement
- Connector health repair
- Competitor/product research
- Draft outreach but do not send
- Turn meeting/email into task/follow-up

### 5. Feedback/evals

Why: teaches the system what was actually useful.

V1:
- thumbs up/down on briefs/tasks/proactive actions
- “too noisy / useful / wrong / risky” tags
- weekly summary of what to adjust

### 6. Memory eval harness, inspired by STATE-Bench

Why: most memory checks only prove recall works. Agent OS needs to know whether memory/proactivity changes outcomes: fewer repeated mistakes, fewer unnecessary turns, safer approvals, better task completion, lower cost.

High-signal pattern from Microsoft STATE-Bench:
- evaluate agents in stateful multi-turn scenarios with tools and a simulated user, not static Q&A
- score final state / task completion, reliability across repeated runs, cost/turn/tool efficiency, and UX/consent quality
- compare memory configurations by measuring behavior improvement, not retrieval accuracy alone

Safe internal V1 for Agent OS:
- create 10-20 local “Felipe cockpit” scenarios: convert inbox signal to task, prepare approval item, recover from stale connector, promote memory, reject unsafe external action
- run each scenario against fixed fixture state with memory enabled/disabled or old/new prompts
- score: task completed, approval safety, unnecessary messages/tool calls, uses known preferences correctly, avoids leaking private context
- surface the weekly result in Evals or Inbox Radar as “memory/proactivity regression check”

## OpenClaw vs Agent OS split

OpenClaw already provides primitives:
- agents
- tools
- cron
- memory
- sessions/subagents
- messaging
- config/permissions

Agent OS should provide the human cockpit layer:
- what needs attention
- what can be approved
- what is running
- what Cai recommends next
- why a recommendation exists
- what changed since last time

## Next candidate task

### 2026-06-25 — Long-term memory promotion hygiene check

State: `ready-small`

Evidence:
- `npm run self-evolution:research` selected `Long-term memory promotion hygiene check` as the top candidate with payoff focused on preventing routine heartbeat, cron, and validation logs from being promoted into durable memory.
- Recent memory shows the same failure mode: `memory/2026-06-23.md` recorded noisy auto-promoted raw heartbeat/cron chunks and a stale push-blocker snapshot in `MEMORY.md`; `memory/2026-06-24.md` records cleanup of a raw auto-promoted heartbeat log under the 2026-06-23 memory-distillation rule.
- This is higher leverage than adding more self-evolution lane infrastructure because the lane now selects recent operational failures, and the current failure affects Cai's long-term context quality directly.

Hypothesis: add a small deterministic memory-promotion fixture or checklist that accepts distilled durable facts and rejects raw routine validation chunks, stale transient status, and heartbeat/cron log dumps.

Next action: implement in the implementation lane as a narrow readiness/eval guard, then verify with `npm run self-evolution:research` and `npm run check:self-improvement-readiness`.

### 2026-06-24 — Recency-weighted self-evolution candidate selection

State: `ready-small`

Evidence:
- `npm run self-evolution:research` still selected the generic `Autonomous self-evolution lane hardening` candidate, even though that lane is already implemented and readiness checks pass.
- Recent memory has higher-signal failures: noisy long-term memory promotion cleanup and the 2026-06-23 isolated cron/tooling issue where stale `toolsAllow` caused proactivity/cron failure while initial symptoms pointed elsewhere.
- `npm run check:self-improvement-readiness` reports `synced` and all self-improvement/autonomy-lane fixtures pass, so the next leverage is not more lane setup; it is better candidate ranking.

Hypothesis: `scripts/self-evolution-research-lane.mjs` should discount standing mandate/docs and prefer recent memory, Felipe corrections, and unresolved friction. This prevents the research lane from repeatedly resurfacing already-shipped infrastructure instead of the newest operational failure mode.

Next action: update the research script scoring in the implementation lane with source/recency weighting and a guard that suppresses already-shipped generic self-evolution setup when readiness is green. Verify with `npm run self-evolution:research` plus `npm run check:self-improvement-readiness`.

Follow-up implementation: added `scripts/cron-tool-policy-preflight.mjs` and `npm run check:cron-tool-policy` so fixture coverage catches cron payloads that mention file/repo/npm work but restrict `toolsAllow` to message-only before the failure shows up as a misleading file or cron error.

### Previous candidates

Continue Inbox Radar V2 rather than adding `/dashboard/review`.

Highest-leverage next step: wire producers into the new bridge-backed `inbox_items` endpoint so proactive loops and subagents can create approval/review items directly instead of only surfacing derived signals.

Progress: V1 persistence scaffold exists in the bridge (`GET/POST /inbox/items`) and Inbox Radar now reads active persisted items alongside derived signals. Producers now have a local bridge CLI helper at `scripts/create-inbox-item.mjs` for idempotently creating review/approval/task items without adding new dashboard surfaces.

New build candidate from 2026-05-25 scan: add a tiny memory/proactivity regression harness inspired by STATE-Bench, using local Agent OS fixtures and scoring outcome/reliability/cost/safety instead of retrieval accuracy.

Progress: V0 exists as `scripts/proactivity-regression-harness.mjs` with `npm run check:proactivity`. It uses 10 deterministic local fixtures for safe doc follow-up, external outreach approval, noise control, token-rotation sensitivity, missed-ticket checks, workflow feedback, durable artifact promotion, playbook/workflow separation, and eval-failure routing. This is a baseline guardrail, not a full agent evaluator yet.

Progress update: first-class Agent OS evals now exist as `docs/AGENT_EVALS.md`, `evals/agent-behavior-v0.json`, and `scripts/agent-evals.mjs` with `npm run evals:agent`. V0 covers recommendation quality, guardrail compliance, context usage, missed-context detection, and output format quality.

Operational note from 2026-05-26 proactive loop: Cai upserted this as persistent Inbox Radar task `cai-memory-proactivity-regression-harness`. The bridge now skips optional Inbox Radar index creation when the runtime DB role is not the table owner, avoiding the prior `must be owner of table inbox_items` failure.
