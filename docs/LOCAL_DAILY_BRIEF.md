# Local Daily Brief

Purpose: generate a concise Cai briefing from local, non-sensitive context only, before Gmail, Calendar, or other private live sources are approved.

## Guardrails

- Use local markdown, Agent OS status, cron/task state, and public/non-sensitive signals only.
- Do not read private email, calendar, device notifications, bank data, secrets, or raw personal records for this brief unless Felipe explicitly approves that source.
- Narrow approved exception: daily briefs may read the server-only Tibber token to fetch electricity price, but must never print the token.
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
- Tibber electricity price via `npm run price:tibber -- --brief`

Approval-gated inputs:

- Gmail, Google Calendar, Drive, Slack, social notifications, device notifications, location, financial records, secrets, and any source requiring OAuth/account access.

## Gmail / Calendar Approval Path

Do not run these commands in unattended cron until Felipe has explicitly approved the source and account. After approval, keep the first pass read-only, bounded, and citation-friendly:

```bash
gog auth list
gog gmail search 'in:inbox newer_than:2d' --max 10 --json --no-input
gog calendar events primary --from <start-iso> --to <end-iso> --json --no-input
```

Daily-brief use should summarize only:

- urgent unread threads or direct asks that need attention
- calendar events in the next 24-48 hours
- degraded setup state, such as missing Calendar scopes

Do not include raw message bodies, full attendee lists, contact details, attachments, tokens, or private calendar descriptions in the brief state. Mail sends, drafts, replies, calendar creates, RSVPs, event updates, Drive reads, and contact reads remain separate approval-gated actions.

## Template

Generate a local draft with:

```bash
npm run brief:local
```

Check only the electricity-price line with:

```bash
npm run price:tibber -- --brief
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
