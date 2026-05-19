# Agent OS Session Retention Policy

Status: V1 policy, no automatic destructive deletion.

## Goal

Keep OpenClaw session history useful without letting raw transcripts grow forever. Preserve durable product/context decisions, audit-relevant work, and recent debugging context. Avoid deleting secrets blindly; sensitive content should be reviewed, redacted, archived, or handled manually.

## Source classes

### Keep

Keep sessions when any of these are true:

- The session produced promoted/reviewed knowledge in `knowledge_sources`.
- The session is linked from a wiki page, task event, commit, incident, or product decision.
- The session contains active project context for Agent OS, Lysande, Sladdis, Cai, Charles, or Life OS.
- The session is part of an audit trail for external actions, config changes, pushes, reminders, or incident recovery.
- The session is recent enough to still support debugging or follow-up work.

### Review before archive/delete

Review sessions when:

- Signal score is high, but no extracted/reviewed knowledge exists yet.
- It may contain decisions, TODOs, durable preferences, product context, or technical lessons.
- It may contain sensitive material, private emails, financial context, customer context, or tokens/secrets.
- It is a long or expensive run whose outcome is unclear.

### Archive candidates

Archive rather than delete when:

- The useful decisions/TODOs have been extracted into reviewable `knowledge_sources`.
- The transcript is old and low activity, but could still be useful for traceability.
- The session is duplicate/noisy but related to a real project.

### Delete candidates

Delete only when all are true:

- No promoted/reviewed/extracted knowledge depends on it.
- No task event, audit event, commit, or wiki page references it.
- It is low signal, duplicate, failed setup noise, or transient scratch work.
- It has been archived or explicitly reviewed for safe removal.

## Timing defaults

- **0-30 days:** keep by default.
- **30-90 days:** harvest/extract signals first, then archive low-value sessions.
- **90+ days:** eligible for deletion only after dependency checks and human-confirmed dry run.

## Safety rules

- Never hard-delete automatically in V1.
- Prefer archive/trash over irreversible removal.
- Always run dry-run inventory before any deletion batch.
- Do not preserve secrets into wiki/context. Redact or exclude them.
- Do not promote raw private mail, auth tokens, bank/card/account details, OTPs, health details, or private keys.
- Deletion tools must show exact counts and affected paths before execution.

## Required checks before deletion

A deletion candidate must pass these checks:

1. Not present as `metadata.sessionPath` in active `knowledge_sources`.
2. Not referenced by `metadata.sessionSourceUrl` or `source_url` in `knowledge_sources`.
3. No `task_events.metadata` reference to the session path/source.
4. No matching path/link in wiki/vault export.
5. Not modified in the recent retention window.
6. User confirmed the dry-run list.

## V1 implementation stance

Current Agent OS should only:

- Inventory sessions.
- Harvest high-signal sessions into `extracted` knowledge.
- Extract reviewable decision/TODO/preference items.
- Document the retention/deletion policy.
- Expose future deletion as a guarded action only after dry-run and dependency checks exist.

Actual deletion is intentionally out of scope until archive/trash support and dependency checks are implemented.
