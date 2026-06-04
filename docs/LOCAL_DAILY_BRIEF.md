# Local Daily Brief

Purpose: generate a concise Cai briefing from local, non-sensitive context only, before Gmail, Calendar, or other private live sources are approved.

## Guardrails

- Use local markdown, Agent OS status, cron/task state, and public/non-sensitive signals only.
- Do not read private email, calendar, device notifications, bank data, secrets, or raw personal records for this brief unless Felipe explicitly approves that source.
- Do not send the brief externally by default. Draft it locally or surface it only when there is a useful change, blocker, or decision.
- Keep the output short: one useful screen, not a daily questionnaire.

## Inputs

Preferred safe inputs:

- `/root/.openclaw/workspace/LIFE_OS.md`
- `/root/.openclaw/workspace/PROACTIVE.md`
- `/root/.openclaw/workspace/HEARTBEAT.md`
- Recent daily notes under `/root/.openclaw/workspace/memory/YYYY-MM-DD.md`
- Agent OS `git status`, recent commits, docs, tasks, and local build/test results
- Agent OS sources and decision records when they explain current priorities
- Cron/task run summaries that are already visible in the runtime context

Approval-gated inputs:

- Gmail, Google Calendar, Drive, Slack, social notifications, device notifications, location, financial records, secrets, and any source requiring OAuth/account access.

## Template

Generate a local draft with:

```bash
npm run brief:local
```

Route it through the heartbeat noise filter with:

```bash
npm run brief:heartbeat
```

The heartbeat route prints `HEARTBEAT_OK` unless the local brief shows a decision point, a degraded/local-change signal, a forced run, or meaningfully changed context after a quiet period. Use `npm run brief:heartbeat -- --write-state` from cron/heartbeat jobs that should update `/root/.openclaw/workspace/memory/heartbeat-state.json`.

```markdown
# Daily Brief - YYYY-MM-DD

## Today

- <one sentence on the most important active goal or operational focus>

## Active Signals

- <local project/repo/task signal with source>
- <memory/Life OS blocker or decision point with source>
- <cron/automation signal if relevant>

## Suggested Next Action

- <one safe internal action Cai can do, or one concise decision Felipe needs to make>

## Evidence

- <file path, command result, task id, commit, or named source used>
- <source id or decision record path when the brief depends on durable rationale>
```

## Noise Filter

Only surface the brief proactively when at least one is true:

- A blocker needs Felipe's decision.
- A background action finished and has evidence.
- A local project or automation moved into a degraded state.
- It has been more than a day since a useful proactive update and there is genuinely new context.
