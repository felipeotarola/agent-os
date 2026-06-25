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
- `LESSONS.md`: do-not-repeat mistakes, corrections and workflow lessons
- `MEMORY.md`: durable preferences, decisions and lessons
- `PROACTIVE.md` / `SELF_IMPROVEMENT.md`: operating rule changes
- Agent OS docs: workflow/runbook changes
- Agent OS tasks: concrete follow-up work
- private repo commits: small verified improvements

## Guardrails

- Do not save secrets, raw tokens, BankID details, raw bank/account data or private message dumps.
- Prefer distilled lessons over transcript copying.
- Promote to `MEMORY.md` only when the item is durable, future-useful, and distilled into a stable fact, preference, decision, or lesson. Keep routine heartbeat/cron output, validation logs, stale transient blockers, and raw status chunks in daily memory or task events instead.
- Prefer one small improvement over broad rewrites.
- Use `LESSONS.md` for corrections/mistakes before promoting them to long-term rules.
- Do not add UI surfaces unless they improve agent stability or recovery.
- Ask before external messages, paid APIs, model/provider defaults, broad gateway permissions or OpenClaw self-update.
- If scheduler/task tools are restricted inside the cron run, record that as a visibility limit and fall back to prompt context, current cron id, memory, Agent OS docs, and repo evidence; do not infer “no cron/task signals” from restricted access.
- Treat optional file reads as best-effort. If a daily memory/doc/task file is missing or temporarily unreadable, note the unavailable path and continue; do not let one failed `sed`/read abort the whole learning loop.
- Treat broad optional signal searches as best-effort. Prefer `rg`/shell checks with `|| true` or explicit error capture for cron/session/task JSON scans, and do not let an OpenClaw search-helper failure mark the learning loop failed when the scan is only evidence gathering.
- For scheduled repo reviews, run `npm run check:repo-review-preflight -- --repo=<path> --pattern=<evidence-pattern>` before relying on a search helper. A missing repo is a named `repo-path` blocker; a completed no-match search is evidence, not failure; a failed helper should degrade to shell evidence gathering instead of aborting the report.
- Treat git push as best-effort in isolated cron. Only attempt it when `git status --branch --short` shows a local commit ahead of upstream; if the repo is already synced, skip push. Use `npm run git:push` so git reads the Agent OS-managed GitHub token instead of stale shell credentials. If push still fails, record the blocker without failing the whole learning result.
- Run `npm run check:self-improvement-readiness` before reporting a learning-loop result that touched Agent OS. After an actual failed push, rerun it with `-- --push-exit-code=<code>`. If it reports `local-ready-push-blocked`, count the local work as ready and name `git-push` as the external blocker instead of marking the whole loop failed.

## Cadence

Live cron: `cai-daily-agent-learning-loop` (`2d2afd11-a269-48b8-a622-690046a01d02`) runs daily at 23:30 Europe/Stockholm.

It is intentionally low-noise: no all-clear messages, only a Telegram update if it changed something meaningful or needs a real decision.

This daily loop is not the same as the self-evolution research lane. The daily loop reviews what happened. The research lane, defined in `docs/AUTONOMOUS_SELF_EVOLUTION.md`, looks for the next Agent OS/self-learning candidate and may hand a bounded candidate to an implementation lane.

Initial prompt shape:

```text
Run Cai's Daily Agent Learning Loop. Review recent sessions/tasks/memory at a high level. Identify what worked, failed, was corrected, broke, or should be saved. Apply only safe local documentation/memory/task updates. Do not send external messages, touch secrets, change model/provider defaults, update OpenClaw, or make broad security changes. If nothing high-signal changed, report NO_ACTION.
```

## Success metric

Felipe should experience Cai as harder to reset, harder to forget, and more reliable — without having to open Agent OS for 98% of work.
