# GitHub Signals Connector

Agent OS GitHub signals V1 is read-only and empty-safe.

## Contract

- Bridge endpoint: `GET /github/snapshot`
- UI route: `/dashboard/github`
- Frontend helper: `src/db/external-signals.ts`
- Contract id: `agent-os.github-signals.v1`

## Configuration

Configure these either in `/dashboard/settings` → **API keys & secrets** or in the bridge environment:

- `AGENT_OS_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_G26_TOKEN`
- Optional: `GITHUB_OWNER` or `AGENT_OS_GITHUB_OWNER`
- Optional: `GITHUB_REPO` or `AGENT_OS_GITHUB_REPO`

Environment variables win if both env and Agent OS secrets are present. The UI only shows readiness, account metadata, notifications, PR metadata, checks and alerts. It never renders token values.

## V1 Behavior

- If token is missing, return a degraded snapshot with setup next steps.
- If token is present from env or Agent OS secrets, fetch read-only viewer, notification and optional repo PR metadata.
- Fine-grained personal access tokens currently cannot read the global notifications endpoint; treat that 403 as an expected limitation, not a broken connector.
- If notification scope is missing, keep the connector partially useful and surface the limitation as a check.
- Use repo PR signals with `GITHUB_OWNER`/`GITHUB_REPO`, or use a classic PAT only if global notifications are worth the broader token scope.
- No comments, issue edits, merges, workflow dispatches or repo writes.

## Next Safe Expansion

1. Add repo allowlist before any future write action.
2. Feed unread notifications and stale PRs into Radar.
3. Add guarded Command Center actions only after audit logging and explicit confirmation.
