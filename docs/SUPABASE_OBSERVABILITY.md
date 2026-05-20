# Supabase Observability Connector

Agent OS Supabase observability V1 is intentionally read-only and empty-safe.

## Contract

- Bridge endpoint: `GET /supabase/snapshot`
- UI route: `/dashboard/supabase`
- Frontend helper: `src/db/supabase.ts`
- Contract id: `agent-os.supabase-observability.v1`

## Environment

Configure these either in `/dashboard/settings` → **API keys & secrets** or in the bridge environment:

- `SUPABASE_PROJECT_REF` or `AGENT_OS_SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN` or `AGENT_OS_SUPABASE_ACCESS_TOKEN`
- Optional env-only override: `SUPABASE_MANAGEMENT_API_URL` defaults to `https://api.supabase.com`

Environment variables win if both env and Agent OS secrets are present. The UI only shows readiness, project metadata, checks and alerts. It never renders token values.

## V1 Behavior

- If token/project ref is missing, return a degraded snapshot with setup next steps.
- If token/project ref is present from env or Agent OS secrets, fetch project metadata from the Supabase Management API.
- If the fetch fails, return a degraded snapshot with a warning alert.
- No write actions.
- No OAuth/browser automation.
- No database credentials, JWTs, service role keys or tokens in UI/markdown.

## Next Safe Expansion

1. Confirm the best scoped read-only API/log drain for Supabase logs and usage.
2. Normalize auth/API/database/storage events into a small observability table.
3. Apply retention and redaction before storing logs.
4. Add Notification and Command Center hooks only for meaningful signals.
