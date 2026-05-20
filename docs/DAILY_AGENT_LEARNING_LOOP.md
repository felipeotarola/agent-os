# Daily Agent Learning Loop

Purpose: make Cai/Charles/Sladdis improve from what actually happened, without turning Agent OS into more manual dashboard bloat.

## Daily review questions

Each day, review recent sessions, tasks, memory signals, logs and shipped commits for:

- what worked
- what failed
- what got corrected by Felipe
- what workflows broke
- what repeated requests/frictions showed up
- what lessons need saving

## Outputs

Write back only high-signal items:

- daily memory: raw facts and session learnings
- `MEMORY.md`: durable preferences, decisions and lessons
- `PROACTIVE.md` / `SELF_IMPROVEMENT.md`: operating rule changes
- Agent OS docs: workflow/runbook changes
- Agent OS tasks: concrete follow-up work
- private repo commits: small verified improvements

## Guardrails

- Do not save secrets, raw tokens, BankID details, raw bank/account data or private message dumps.
- Prefer distilled lessons over transcript copying.
- Prefer one small improvement over broad rewrites.
- Do not add UI surfaces unless they improve agent stability or recovery.
- Ask before external messages, paid APIs, model/provider defaults, broad gateway permissions or OpenClaw self-update.

## Cadence

Best default: one low-noise daily cron or heartbeat-backed pass during Swedish morning/daytime.

Initial prompt shape:

```text
Run Cai's Daily Agent Learning Loop. Review recent sessions/tasks/memory at a high level. Identify what worked, failed, was corrected, broke, or should be saved. Apply only safe local documentation/memory/task updates. Do not send external messages, touch secrets, change model/provider defaults, update OpenClaw, or make broad security changes. If nothing high-signal changed, report NO_ACTION.
```

## Success metric

Felipe should experience Cai as harder to reset, harder to forget, and more reliable — without having to open Agent OS for 98% of work.
