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
  "agents": { "count": 3, "source": "bridge:AGENT_OS_AGENTS_JSON" },
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

## Audit events

The existing `task_events` table is used as the audit stream. Bridge health/subagent snapshot failures write throttled events (`bridge_health_failed`, `subagent_snapshot_failed`) with safe metadata and no secrets. The throttle prevents noisy spam while keeping visible operational failures in Recent events.
