# Cron Lane Visibility Preflight V0

Purpose: make autonomous cron and heartbeat lanes auditable before changing live schedules, Telegram behavior, gateway settings, or implementation-lane execution.

This is a local/docs-first preflight. It reads existing state and docs, reports what each lane most recently did, and flags lanes that have no visible latest result. It must not send messages, edit cron jobs, touch secrets, or change scheduler/gateway configuration.

## Report Shape

Each lane should map to one row or JSON object:

```json
{
  "cronId": "cai-proactive-loop-v1",
  "name": "Cai Proactive Loop V1",
  "laneType": "heartbeat",
  "lastRunAt": "2026-07-01T08:05:00Z",
  "latestCandidateOrAction": "brief:heartbeat wrote local state and returned HEARTBEAT_OK",
  "noiseOutcome": "no-action",
  "verificationCommand": "npm run brief:heartbeat -- --write-state",
  "blocker": null,
  "source": "local brief state / cron run context"
}
```

Required fields:

- `cronId`: stable cron/job id when known, otherwise a local lane id.
- `name`: human-readable lane name.
- `laneType`: one of `heartbeat`, `daily-learning`, `research`, `implementation`, or `briefing`.
- `lastRunAt`: latest observed run time, or `null` if unknown.
- `latestCandidateOrAction`: the latest candidate, action, or quiet outcome that proves the lane is visible.
- `noiseOutcome`: one of `no-action`, `safe-action-done`, `decision-needed`, `blocked`.
- `verificationCommand`: local command that can reproduce or validate the lane signal without external sends.
- `blocker`: concise blocker when `noiseOutcome` is `blocked`, otherwise `null`.
- `source`: existing file, state path, or command output used as evidence.

## Lane Map

Use existing surfaces first:

- Heartbeat/proactive loop: `HEARTBEAT.md`, `PROACTIVE.md`, local brief state, and `npm run brief:heartbeat -- --write-state`.
- Daily learning loop: daily memory files under `/root/.openclaw/workspace/memory/`, `LESSONS.md`, and any existing daily-learning docs.
- Self-evolution research lane: `docs/AGENT_OS_RESEARCH_RADAR.md` and `npm run self-evolution:research -- --format=json`.
- Self-evolution implementation lane: `docs/AUTONOMOUS_SELF_EVOLUTION.md`, `docs/TASKS.md`, readiness checks, and the latest implementation evidence recorded in radar/docs.
- Briefing lanes: `npm run brief:local`, `npm run price:tibber -- --brief`, and local-only state files when present.

Do not add a new dashboard surface for V0. If this becomes useful, the same report can later feed Radar/tasks.

## Dry-Run Rules

A V0 dry run should:

1. Build report rows from existing docs/state/commands.
2. Fail or warn when a lane has no visible latest result, no local verification command, or an ambiguous outcome.
3. Never call Telegram, Slack, Gmail, external posting tools, or live cron mutation tools.
4. Never require Tibber/Gmail/Calendar credentials to pass; credential-backed lanes can report `blocked` with the named missing capability.
5. Preserve the low-noise rule: quiet successful lanes are visible in the report, not sent to Felipe.

## Outcomes

- `no-action`: lane ran or was inspected and intentionally stayed quiet.
- `safe-action-done`: lane made one safe internal/reversible change and has concrete verification.
- `decision-needed`: lane found an approval-gated choice for Felipe.
- `blocked`: lane cannot proceed because local evidence, credentials, or a required approval are missing.

## V0 Acceptance

- Add a fixture-driven or dry-run command that emits this shape for at least heartbeat and research lanes.
- Flag a lane with no visible latest result.
- Record verification output in `docs/AGENT_OS_RESEARCH_RADAR.md`.
- Keep implementation-lane execution approval-gated unless the candidate is bounded, reversible, and verifiable.
