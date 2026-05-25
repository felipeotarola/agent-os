# Supabase Database

Agent OS now treats Supabase Postgres as the shared persistence layer.

## Runtime model

- Supabase project: `sfonkzhvsvoabnggxani`
- App database role: `agent_os_app`
- Runtime secret source on the host: `/root/.openclaw/secrets/agent-os-supabase.env`
- Local Agent OS `.env` mirrors `DATABASE_URL`, `BRIDGE_DATABASE_URL`, `SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_URL`.
- Vercel production has `DATABASE_URL`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured.

Do not commit raw connection strings or Supabase tokens.

## Bridge

The Agent OS bridge uses:

```text
BRIDGE_DATABASE_URL=${BRIDGE_DATABASE_URL:-local docker postgres fallback}
```

On the production host this points to Supabase. The local Docker Postgres service is retained only as a fallback/development source until it is intentionally removed.

`/system/status` exposes a redacted database source object so Settings can confirm whether the bridge is talking to Supabase without leaking credentials.

## Data migrated

The initial local Docker Postgres public schema/data was migrated to Supabase via Supabase MCP. Verified table counts after migration included:

- `agents=5`
- `tasks=19`
- `task_events=193`
- `knowledge_sources=7`
- `trading_decisions=2`

## Next steps

- Move Linda paper-trade writes behind a Supabase Edge Function.
- Replace current login/auth flow with Supabase Auth in a separate phase.
- Rotate Supabase/Vercel tokens that were used during setup.
- Decide when to retire the local Docker Postgres container/volume after Supabase has baked in production.
