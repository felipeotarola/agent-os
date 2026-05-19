# Inbox Radar

Inbox Radar is the unified “what deserves Felipe's attention?” surface for Agent OS.

## Route

- UI route: `/dashboard/radar`
- Helper: `src/lib/radar.ts`
- Sources:
  - Action Center tasks/knowledge
  - Notifications
  - Supabase observability
  - Vercel observability
  - Runway picture

## V1 Scope

Radar V1 does not add new external credentials. It aggregates existing safe snapshots and ranks signals by priority.

It highlights:

- high-priority tasks/review items
- knowledge sources needing extract/wikify/review/promote
- unread notifications
- degraded observability connectors or Vercel/Supabase alerts
- urgent runway attention

## Guardrails

- No destructive actions.
- No generic shell/Gateway commands.
- No secrets rendered in the UI.
- Degraded connectors are allowed and should be shown as actionable setup signals.
- Fail-soft: one broken source should not break the whole radar.

## Next Expansion

1. Add Gmail/Calendar/GitHub/Linear connectors as read-only signal sources.
2. Add per-signal snooze/hide after persistence exists.
3. Add guarded actions only when backend contracts are narrow and auditable.
4. Feed high-value radar findings into daily Cai briefings.
