# Vercel Observability Connector

Agent OS Vercel observability V1 is read-only and empty-safe.

## Contract

- Bridge endpoint: `GET /vercel/snapshot`
- UI route: `/dashboard/vercel`
- Frontend helper: `src/db/vercel.ts`
- Contract id: `agent-os.vercel-observability.v1`

## Environment

Configure these either in `/dashboard/settings` → **API keys & secrets** or in the bridge environment:

- `VERCEL_ACCESS_TOKEN` or `AGENT_OS_VERCEL_ACCESS_TOKEN`
- Optional: `VERCEL_TEAM_ID` or `AGENT_OS_VERCEL_TEAM_ID`
- Optional: `VERCEL_PROJECT_ID` or `AGENT_OS_VERCEL_PROJECT_ID`
- Optional: `VERCEL_PROJECT_NAME` or `AGENT_OS_VERCEL_PROJECT_NAME`

Environment variables win if both env and Agent OS secrets are present. The UI only shows readiness, project metadata, deployment metadata, checks and alerts. It never renders token values.

## V1 Behavior

- If token is missing, return a degraded snapshot with setup next steps.
- If token is present from env or Agent OS secrets, fetch read-only user, project and deployment metadata from Vercel API.
- If the fetch fails, return a degraded snapshot with a warning alert.
- No write actions.
- No manual OAuth/browser automation.
- No Vercel tokens in UI, markdown or logs.

## Drains / Logs

Vercel Drains are intentionally not ingested in V1. Before enabling them:

1. Create a custom HTTPS drain endpoint.
2. Verify Vercel drain signatures or equivalent source authenticity.
3. Redact secrets and high-cardinality sensitive values before storage.
4. Apply retention policy before Notification/Command hooks.

## Next Safe Expansion

1. Add analytics reads for traffic/conversion/product signals once token scopes are confirmed.
2. Normalize build/runtime events into an observability table.
3. Add Notification hooks for meaningful failures only.
4. Add guarded Command Center refresh after snapshot caching/audit logging exists.
