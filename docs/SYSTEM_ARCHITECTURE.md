# Agent OS System Architecture

UI route: `/dashboard/architecture`

The architecture page is the human-readable system map for Agent OS. It uses Mermaid diagrams to show:

- Runtime architecture: Next.js UI, API routes, bridge, Postgres, OpenClaw Gateway, gog, GitHub, Vercel and Supabase.
- Signal flow: Gmail, Calendar, GitHub, Vercel, Supabase, tasks, knowledge, notifications and runway into Inbox Radar.
- Knowledge lifecycle: raw → extracted → wikified → reviewed → promoted/archived.
- Agent orchestration: Felipe → Cai → subagent workers → validation/push.

## OpenClaw runtime registry

Agent OS uses `agent-os.openclaw-agent-registry.v1` as the shared runtime inventory for Agents,
Chat, session and memory harvest, assistant readiness, and Topology. The bridge discovers agents
with `openclaw agents list --json` and channel routes with `openclaw config get bindings --json`.
`AGENT_OS_AGENTS_JSON` is only an explicitly labelled degraded fallback when the CLI inventory is
unavailable; UI code must not add named agents or stale model values to a live snapshot.

The two task domains are intentionally separate:

- **Agent OS Tasks** are product/work-management records stored in Postgres and edited on the
  Kanban surface.
- **OpenClaw runtime runs** are ephemeral tasks, active sessions, and subagent executions observed
  from the OpenClaw CLI/runtime. They are status data, not Kanban records.
- Safety boundary: read-only external connectors, guarded internal writes, no secrets in UI.

Design stance: Agent OS should stay an operational cockpit, not a template dashboard. The architecture page should be updated whenever core runtime contracts change.
