# Tool-Call Approval Receipts V0

Purpose: make approval-gated actions auditable before any risky tool call executes or resumes. This is a local contract for Inbox Radar producers; it is not a live external-action runner.

## Receipt Shape

Pending approvals and completed receipts use the same shape so the item can move from review to audit without losing context.

```json
{
  "contract": "agent-os.tool-call-approval-receipt.v0",
  "receiptId": "toolcall_2026-07-05_cai_telegram_send_demo",
  "sourceRunId": "optional-openclaw-run-or-session-id",
  "sourceSessionKey": "optional-session-key",
  "radarItemId": "approval-toolcall-telegram-send-demo",
  "toolName": "message.send",
  "riskClass": "external-message",
  "requestedAction": "Send one Telegram update to Felipe",
  "parameters": {
    "channel": "telegram",
    "target": "343551190",
    "accountId": "default",
    "message": "..."
  },
  "parameterHash": "sha256-of-canonical-parameters",
  "reviewerDecision": "pending",
  "freshnessEnvelope": {
    "expiresAt": "2026-07-05T12:15:00.000Z",
    "policyVersion": "tool-call-policy.v0",
    "agentGraphVersion": "agent-os-local.v0",
    "toolSchemaVersion": "message-tool.v0",
    "preApprovalGuardrailStatus": "passed",
    "lastRevalidatedAt": null
  },
  "editedParameters": null,
  "executionStatus": "not-executed",
  "resultSummary": null,
  "sourceLinks": ["/dashboard/radar"],
  "createdAt": "2026-07-05T12:00:00.000Z",
  "reviewedAt": null,
  "executedAt": null
}
```

## Valid States

- `reviewerDecision`: `pending`, `approved`, `denied`, or `edited`.
- `executionStatus`: `not-executed`, `executed`, `cancelled`, `failed`, or `superseded`.
- `riskClass`: one concise class such as `external-message`, `delete`, `purchase`, `credential-change`, `public-post`, `security-change`, or `sensitive-data-access`.

An `approved` or `edited` receipt is executable only when `toolName`, `parameters`, `parameterHash`, `requestedAction`, `riskClass`, `reviewerDecision`, and `sourceRunId` or `sourceSessionKey` are present. Vague approvals such as "ok, send it" without exact parameters are invalid.

Executable receipts also require a fresh `freshnessEnvelope`:

- `expiresAt`: ISO timestamp after the current execution time.
- `policyVersion`: local tool-call policy version that produced the approval.
- `agentGraphVersion`: agent graph version or source commit that produced the approval.
- `toolSchemaVersion`: tool schema version used to hash and review parameters.
- `preApprovalGuardrailStatus`: `passed`.
- `lastRevalidatedAt`: ISO timestamp from the latest execution-time revalidation, or `null` while pending.

If the envelope is missing, expired, or mismatched against the current local policy, agent graph, or tool schema version, the receipt must not execute. Mark it `executionStatus: "superseded"` and create a new approval item with current parameters and context.

## Inbox Radar Mapping

Use an Inbox Radar item with `kind: "approval"` and store the receipt in `metadata.approvalReceipt`. Keep the UI inside `/dashboard/radar`; V0 does not add a separate approval page.

```json
{
  "id": "approval-toolcall-telegram-send-demo",
  "source": "cai.proactive",
  "sourceId": "run_123",
  "kind": "approval",
  "priority": 90,
  "title": "Approve Telegram send",
  "detail": "Review exact message.send parameters before execution.",
  "href": "/dashboard/radar",
  "actionLabel": "Review",
  "ownerAgentId": "cai",
  "metadata": {
    "approvalReceipt": {
      "contract": "agent-os.tool-call-approval-receipt.v0",
      "toolName": "message.send",
      "riskClass": "external-message",
      "requestedAction": "Send one Telegram update to Felipe",
      "parameters": {
        "channel": "telegram",
        "target": "343551190",
        "accountId": "default",
        "message": "..."
      },
      "parameterHash": "sha256-of-canonical-parameters",
      "reviewerDecision": "pending",
      "executionStatus": "not-executed",
      "sourceRunId": "run_123",
      "freshnessEnvelope": {
        "expiresAt": "2026-07-05T12:15:00.000Z",
        "policyVersion": "tool-call-policy.v0",
        "agentGraphVersion": "agent-os-local.v0",
        "toolSchemaVersion": "message-tool.v0",
        "preApprovalGuardrailStatus": "passed",
        "lastRevalidatedAt": null
      }
    }
  }
}
```

## Review Paths

- Approve: keep `parameters`, set `reviewerDecision: "approved"`, then execute exactly those parameters.
- Deny: set `reviewerDecision: "denied"` and `executionStatus: "cancelled"`; do not execute.
- Edit: set `reviewerDecision: "edited"`, store exact `editedParameters`, recompute `parameterHash`, and execute only the edited parameters after the edited receipt is confirmed.
- Revalidate before execution: compare the freshness envelope against current local policy/schema/agent graph versions and update `lastRevalidatedAt` only when the receipt is still fresh.

## Guardrails

- V0 is docs and deterministic fixtures only.
- Do not execute external sends, posts, deletes, purchases, credential changes, or secret-bearing calls from this contract.
- Do not treat chat approval alone as sufficient. The receipt must capture the exact intended tool and parameters before execution.
- Do not resume long-lived approvals when policy, graph, schema, or guardrail context has drifted; supersede and request a fresh approval.
- Do not store secrets in `parameters`; use opaque references when a future approved flow needs credential-backed execution.
