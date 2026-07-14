# Agent OS Bridge Contracts

The bridge exposes local-only, token-protected JSON read models for the Agent OS UI. All endpoints except `/health` require `Authorization: Bearer $AGENT_OS_BRIDGE_TOKEN`.

## `GET /system/status`

Contract: `agent-os.bridge.status.v1`. This endpoint is backwards-compatible with the earlier settings UI fields and extends them with durable health metadata.

```json
{
  "ok": true,
  "contract": "agent-os.bridge.status.v1",
  "bridge": {
    "status": "online",
    "version": "1.0.0",
    "uptimeSeconds": 123,
    "now": "2026-05-18T07:16:00.000Z"
  },
  "db": { "status": "online", "checkedAt": "...", "error": null },
  "openclaw": {
    "available": true,
    "status": "available",
    "version": "OpenClaw ...",
    "source": "openclaw-cli:version",
    "error": null
  },
  "agents": { "count": 5, "source": "openclaw-cli:agents-list", "error": null },
  "knowledge": {
    "raw": 0,
    "queued": 0,
    "wikified": 0,
    "lifecycle": {
      "statuses": { "raw": 0, "queued": 0, "wikified": 0 },
      "active": ["raw", "queued", "wikified"],
      "planned": ["reviewed", "archived"],
      "flow": "raw -> queued -> wikified",
      "futureFlow": "reviewed/archived planned, not active yet"
    }
  },
  "memory": {
    "source": "openclaw-memory:qmd",
    "ok": true,
    "summary": { "agentCount": 1, "chunks": 42, "dirtyCount": 0 },
    "agents": [],
    "error": null
  },
  "subagents": {
    "ok": true,
    "source": "openclaw-cli:tasks-list:subagent",
    "available": true,
    "runningCount": 1,
    "recent": [],
    "error": null,
    "checkedAt": "..."
  },
  "lastSync": {
    "bridgeCheckedAt": "...",
    "openclawCheckedAt": "...",
    "subagentsCheckedAt": "...",
    "knowledgeUpdatedAt": null,
    "memoryCheckedAt": "..."
  }
}
```

`lastSync.knowledgeUpdatedAt` is explicit `null` until the bridge has a reliable knowledge sync timestamp. Errors are returned as strings without secrets/tokens.

The bridge discovers the installed OpenClaw CLI from `OPENCLAW_CLI_PATH`, then the current
`dist/index.js`, with legacy `dist/entry.js` as a compatibility fallback. Agent inventory comes
from `openclaw agents list --json`; `AGENT_OS_AGENTS_JSON` is used only as an explicit degraded
fallback and is labelled as such in `source`.

The bridge container mounts the OpenClaw home read-only, with a narrow read-write exception for
`/root/.openclaw/state`. Current OpenClaw CLI reads update health state, so this exception is
required for runtime inspection without granting write access to the full OpenClaw home.

## `GET /system/subagents`

Returns only the subagent/background run snapshot used by the cockpit.

```json
{
  "ok": true,
  "source": "openclaw-cli:tasks-list:subagent",
  "available": true,
  "runningCount": 1,
  "recent": [
    {
      "id": "run-id",
      "taskId": "task-id",
      "runId": "run-id",
      "sessionKey": "agent:main:subagent:...",
      "label": "agent-os-bridge-events-goal",
      "title": "Implement bridge health...",
      "status": "running",
      "runtime": "subagent",
      "ownerKey": "agent:main:telegram:...",
      "startedAt": "2026-05-18T07:16:00.000Z",
      "updatedAt": "2026-05-18T07:20:00.000Z",
      "finishedAt": null
    }
  ],
  "error": null,
  "checkedAt": "2026-05-18T07:20:00.000Z"
}
```

When the OpenClaw task source is unavailable, `ok=false`, `available=false`, `recent=[]`, and `error` explains the missing source. The bridge does not synthesize fake runs.

## `GET /overview`

The cockpit overview includes the `/system/subagents` payload under `subagents` and adds a `Subagents` stat card. The UI displays a truthful empty state if the source is unavailable or if OpenClaw returns no runs.

## `GET /tasks/dispatch-summary`

Contract: `agent-os.task-dispatch-summary.v1`. Used by Cai's morning/evening dispatcher to ask Felipe whether any agent-owned tasks should start. It only returns real Postgres tasks with an owner agent and status `backlog`, `waiting`, or `review` (`todo` is normalized to `backlog`). It does not auto-start work.

```json
{
  "contract": "agent-os.task-dispatch-summary.v1",
  "generatedAt": "2026-05-18T08:30:00.000Z",
  "source": "bridge:postgres",
  "actionableStatuses": ["backlog", "waiting", "review"],
  "actionableCount": 3,
  "byAgent": [
    {
      "agentId": "charles",
      "agentName": "Charles",
      "emoji": "🧭",
      "count": 2,
      "highPriorityCount": 1,
      "tasks": []
    }
  ],
  "suggestedMessage": "Det finns 3 agentkopplade tasks att ta ställning till:\n- 🧭 Charles ..."
}
```

The helper `node scripts/agent-dispatcher-summary.mjs` reads `.env`, calls this endpoint, and prints the Swedish dispatcher prompt Cai should summarize to Felipe.

## `GET /inbox/items`

Contract: `agent-os.inbox-items.v1`. Returns active persistent Inbox Radar items from Postgres, plus snoozed items whose `snoozedUntil` is missing or elapsed. Items are sorted by priority descending, then latest update, and capped at 100.

```json
{
  "items": [
    {
      "id": "cai-learning-loop-review",
      "source": "cai.proactive",
      "sourceId": "daily-learning",
      "kind": "review",
      "status": "active",
      "priority": 70,
      "title": "Review daily agent learning output",
      "detail": "Daily learning loop created a reviewable result.",
      "href": "/dashboard/radar",
      "actionLabel": "Open",
      "ownerAgentId": "cai",
      "metadata": {},
      "snoozedUntil": null,
      "createdAt": "2026-05-21T10:00:00.000Z",
      "updatedAt": "2026-05-21T10:00:00.000Z"
    }
  ],
  "source": "bridge:postgres:inbox_items"
}
```

## `POST /inbox/items`

Upserts one persistent Inbox Radar item. `source` and `title` are required; `id` is optional but producers should provide a stable id for idempotent updates.

Allowed `kind` values: `signal`, `review`, `approval`, `draft`, `handoff`, `task`. Unknown kinds normalize to `signal`.
Allowed `status` values: `active`, `handled`, `dismissed`, `snoozed`. Unknown statuses normalize to `active`.

```json
{
  "id": "cai-learning-loop-review",
  "source": "cai.proactive",
  "sourceId": "daily-learning",
  "kind": "review",
  "status": "active",
  "priority": 70,
  "title": "Review daily agent learning output",
  "detail": "Daily learning loop created a reviewable result.",
  "href": "/dashboard/radar",
  "actionLabel": "Open",
  "ownerAgentId": "cai",
  "metadata": { "runId": "optional-safe-reference" }
}
```

Response is the normalized item. On conflict, the bridge updates the item and merges `metadata` with existing metadata (`existing || incoming`).

For approval-gated tool calls, producers should set `kind: "approval"` and store the V0 receipt under `metadata.approvalReceipt`. The receipt contract is documented in `docs/TOOL_CALL_APPROVAL_RECEIPTS.md` and requires exact `toolName`, `parameters`, `parameterHash`, `riskClass`, `requestedAction`, reviewer decision, execution status, and source run/session context. Vague chat approvals without exact parameters must not execute or resume the tool call.

Producer helper:

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

## `POST /knowledge/sources/delete`

Deletes one real knowledge source from Postgres by `id`. The generated vault files (`rawPath`/`wikiPath`) disappear from the next `/knowledge/snapshot` because the vault is derived from `knowledge_sources`; root generated files (`agents.md`, `index.md`, `log.md`) are not individually deletable.

Request:

```json
{ "id": "knowledge-source-id" }
```

Response:

```json
{
  "deleted": true,
  "source": {
    "id": "knowledge-source-id",
    "title": "Old mock note",
    "status": "wikified",
    "rawPath": "knowledge/raw/...md",
    "wikiPath": "knowledge/wiki/...md"
  }
}
```

The bridge writes a `knowledge_deleted` task event with safe path metadata and no raw content.

## Audit events

The existing `task_events` table is used as the audit stream. Bridge health/subagent snapshot failures write throttled events (`bridge_health_failed`, `subagent_snapshot_failed`) with safe metadata and no secrets. The throttle prevents noisy spam while keeping visible operational failures in Recent events.
