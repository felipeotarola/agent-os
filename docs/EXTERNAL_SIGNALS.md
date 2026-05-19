# External Signals

Agent OS external signals are read-only connectors that feed Inbox Radar.

## V1 Connectors

- Gmail: existing `GET /mail/radar` bridge endpoint via `gog gmail` readonly search/thread reads.
- Calendar: `GET /calendar/snapshot` via `gog calendar events` readonly event reads.
- GitHub: `GET /github/snapshot` via GitHub REST API readonly user/notifications and optional open PR reads.
- GitHub UI: `/dashboard/github` for connector checks, notifications and open PRs.

Linear is intentionally skipped for now.

## Environment

### Gmail / Calendar

Uses gog credentials on the bridge host.

- `AGENT_OS_GMAIL_ACCOUNT` defaults to the configured Gmail account.
- `AGENT_OS_CALENDAR_ACCOUNT` optionally overrides Calendar account.

Calendar may require granting gog read-only Calendar scopes. If scopes are missing, the connector returns a degraded snapshot and Radar shows it as a setup signal.

### GitHub

Configure on the bridge host only:

- `GITHUB_TOKEN`, `GH_TOKEN`, or `AGENT_OS_GITHUB_TOKEN`
- Optional: `GITHUB_OWNER` / `AGENT_OS_GITHUB_OWNER`
- Optional: `GITHUB_REPO` / `AGENT_OS_GITHUB_REPO`

The token should be scoped read-only for notifications and repository metadata.

## Guardrails

- No sends, RSVP, issue comments, PR actions, or writes in V1.
- No tokens in browser UI, markdown, logs, or Radar details.
- Sensitive Gmail candidates are down-ranked and should not be saved raw.
- One broken connector must not break Radar.

## Radar Integration

`src/lib/radar.ts` imports `src/db/external-signals.ts` and turns high-signal items into Radar signals:

- Gmail high-score unsaved threads
- Calendar events in the next 48 hours
- GitHub unread notifications and open PRs
- Degraded connector setup warnings

## Next Safe Expansion

1. Add persistent snooze/hide for noisy signals.
2. Add source-specific allowlists and stronger audit logging.
3. Add guarded follow-up actions only with explicit confirmation.
4. Feed urgent signals into Cai daily/heartbeat briefings.
