# Execution-scope receipts V0

Purpose: record the scope an operation could actually exercise. A displayed
capability, requested scope, or protocol-advertised root is context only; it
is not proof of enforcement.

## Contract

```json
{
  "contract": "agent-os.execution-scope-receipt.v0",
  "sourceTaskId": "task reference",
  "sourceRunId": "run reference",
  "sourceApprovalId": "optional approval reference",
  "requestedScope": {
    "paths": ["normalized path identifier"],
    "resourceIds": ["connector resource identifier"],
    "actionClasses": ["read"]
  },
  "effectiveScope": {
    "paths": ["normalized path identifier"],
    "resourceIds": ["connector resource identifier"],
    "actionClasses": ["read"]
  },
  "enforcementMechanism": "process-sandbox|tool-adapter|server-authorization|scoped-credential",
  "policyVersion": "agent-os-execution-scope.v0",
  "policyHash": "sha256-...",
  "createdAt": "ISO-8601 timestamp",
  "observedResourceSummary": {
    "paths": [],
    "resourceIds": [],
    "actionClasses": []
  }
}
```

`effectiveScope` must be equal to or narrower than `requestedScope`, and all
observed resources must remain inside `effectiveScope`. A receipt fails closed
when enforcement is absent, scope is broader, policy identity drifts, or the
observed summary leaves scope.

Informational roots, UI capability labels, and connector descriptions never
count as an `enforcementMechanism`. The four accepted mechanisms must come
from the process sandbox, tool adapter, server authorization, or scoped
credential that performed the operation.

## Routing and privacy

Attach receipts to existing task, run, or approval records. Route violations
through the existing Inbox Radar; do not create a dashboard page. Store only
normalized identifiers and summaries—never credentials, raw payloads, or
unnecessary filesystem disclosure.
