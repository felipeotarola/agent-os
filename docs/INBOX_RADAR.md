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

Radar V1 aggregates persisted Inbox items, existing safe snapshots, and read-only external signal connectors, then ranks signals by priority.

It highlights:

- persisted review/approval/task items from bridge producers
- high-priority tasks/review items
- knowledge sources needing extract/wikify/review/promote
- unread notifications
- high-signal Gmail threads
- upcoming Calendar events
- unread GitHub notifications and open PRs
- degraded observability connectors or Vercel/Supabase alerts
- urgent runway attention

## Producer Contract

Use `scripts/create-inbox-item.mjs` for safe local producers that need to create reviewable Radar items without adding new dashboard surfaces.

```bash
node scripts/create-inbox-item.mjs \
  --id cai-learning-loop-review \
  --source cai.proactive \
  --source-id daily-learning \
  --kind review \
  --priority 70 \
  --title "Review daily agent learning output" \
  --detail "Daily learning loop created a reviewable result." \
  --owner-agent-id cai
```

The helper requires `AGENT_OS_BRIDGE_URL` and `AGENT_OS_BRIDGE_TOKEN`, upserts by stable `--id`, and should be preferred over ad-hoc files for attention items Felipe may need to review.

Approval-gated tool calls should use `kind: "approval"` and include a V0 tool-call approval receipt in `metadata.approvalReceipt`. See `docs/TOOL_CALL_APPROVAL_RECEIPTS.md`. A chat approval without exact tool parameters is not enough to execute or resume a risky action.

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
