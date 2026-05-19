# Agent OS System Architecture

UI route: `/dashboard/architecture`

The architecture page is the human-readable system map for Agent OS. It uses Mermaid diagrams to show:

- Runtime architecture: Next.js UI, API routes, bridge, Postgres, OpenClaw Gateway, gog, GitHub, Vercel and Supabase.
- Signal flow: Gmail, Calendar, GitHub, Vercel, Supabase, tasks, knowledge, notifications and runway into Inbox Radar.
- Knowledge lifecycle: raw → extracted → wikified → reviewed → promoted/archived.
- Agent orchestration: Felipe → Cai → subagent workers → validation/push.
- Safety boundary: read-only external connectors, guarded internal writes, no secrets in UI.

Design stance: Agent OS should stay an operational cockpit, not a template dashboard. The architecture page should be updated whenever core runtime contracts change.
