# Agent Handoff Format

Purpose: make subagent/worker results easy to review, resume, and turn into Inbox Radar review items.

Use this shape when a worker finishes non-trivial research, coding, review, or triage work. Markdown is the default; JSON can mirror the same fields when a bridge/API needs structured data.

## Markdown template

```markdown
# Handoff: <short task name>

- Goal: <what the worker was asked to achieve>
- Status: done | partial | blocked
- Owner: <agent/session/worker name>
- Finished at: <ISO timestamp>

## Summary
- <1-5 bullets with the actual outcome>

## Files changed
- `<path>` — <what changed>

## Commands run
- `<command>` — <result, exit code, or notable output>

## Verification
- <test/lint/build/manual check and result>

## Decisions made
- <decision> — <why it was safe/reasonable>

## Blockers / risks
- <blocker or risk, or "None">

## Recommended next step
- <single concrete next action>

## Workflow feedback
- Worked: <what should be repeated, or "none">
- Failed or friction: <what broke/confused/slowed execution, or "none">
- Change needed: memory | instruction | skill | doc | ticket | eval | none
- Durable home: <path, task id, eval id, decision id, or "none">
- Follow-up: <single concrete next action, or "none">
```

## JSON shape

```json
{
  "goal": "string",
  "status": "done | partial | blocked",
  "owner": "string",
  "finishedAt": "ISO-8601 timestamp",
  "summary": ["string"],
  "filesChanged": [{ "path": "string", "summary": "string" }],
  "commandsRun": [{ "command": "string", "result": "string" }],
  "verification": ["string"],
  "decisionsMade": [{ "decision": "string", "reason": "string" }],
  "blockers": ["string"],
  "recommendedNextStep": "string",
  "workflowFeedback": {
    "worked": "string",
    "failedOrFriction": "string",
    "changeNeeded": "memory | instruction | skill | doc | ticket | eval | none",
    "durableHome": "string",
    "followUp": "string"
  }
}
```

## Rules

- Keep it factual. No vague “made improvements” without paths or evidence.
- Include verification even when it is “not run” with a reason.
- If the worker needs Felipe to decide, set `status` to `blocked` and make the decision the recommended next step.
- Do not include secrets, raw private mail, tokens, credentials, or unnecessary personal data.
- For Inbox Radar, map handoffs needing review to `kind: handoff`; map consequential decisions to `kind: approval`.
- Include workflow feedback only when the run produced a lesson, correction, follow-up, or reusable artifact. See `docs/WORKFLOW_FEEDBACK.md` and `docs/DURABLE_ARTIFACTS.md`.
