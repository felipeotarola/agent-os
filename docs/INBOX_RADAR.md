# Inbox Radar

Inbox Radar is the unified “what deserves Felipe's attention?” surface for Agent OS.

## Route

- UI route: `/dashboard/radar`
- Helper: `src/lib/radar.ts`
- Sources:
- Action Center tasks/knowledge
- Gmail high-signal threads
- Calendar upcoming events
- GitHub notifications/open PRs
- Notifications
  - Supabase observability
  - Vercel observability
  - Runway picture

## V1 Scope

Radar V1 aggregates existing safe snapshots plus read-only external signal connectors and ranks signals by priority.

It highlights:

- high-priority tasks/review items
- knowledge sources needing extract/wikify/review/promote
- unread notifications
- high-signal Gmail threads
- upcoming Calendar events
- unread GitHub notifications and open PRs
- degraded observability connectors or Vercel/Supabase alerts
- urgent runway attention

## Guardrails

- No destructive actions.
- No generic shell/Gateway commands.
- No secrets rendered in the UI.
- Degraded connectors are allowed and should be shown as actionable setup signals.
- Fail-soft: one broken source should not break the whole radar.

## Next Expansion

1. Add per-signal snooze/hide after persistence exists.
2. Add source allowlists and audit logs for external signal reads.
3. Add guarded actions only when backend contracts are narrow and auditable.
4. Feed high-value radar findings into daily Cai briefings.
