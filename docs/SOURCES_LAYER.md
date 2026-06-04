# Sources Layer

Purpose: keep raw evidence separate from Agent OS context, memory, tasks, and decisions.

GrowthOS made the gap obvious: Agent OS has plenty of interpretation, but system changes and product choices need traceable evidence behind them. The sources layer is the place for that evidence.

## Boundary

Sources are evidence. Context is interpretation.

Use sources for:

- customer signals
- email or Slack thread summaries approved for use
- call notes
- screenshots
- repo, PR, issue, Linear, GitHub, Vercel, Supabase, or OpenClaw links
- public research links
- local command output summaries
- raw observations from Agent OS, Life OS, or agent sessions

Use context docs, tickets, memory, and decision records for:

- meaning
- prioritization
- recommendations
- accepted tradeoffs
- next actions

Do not paste sensitive raw data into sources unless Felipe explicitly approves that source and retention. Prefer short summaries and links over full transcripts.

## Storage Convention

Raw evidence can live in:

- Agent OS Knowledge Inbox when it should enter the wiki/review flow.
- `sources/` when the evidence is a local project artifact or citation bundle.
- A task description when it is small and task-local.
- A decision record when it is only needed to justify one decision.

Use stable source IDs:

```text
src:YYYY-MM-DD-short-topic
src:ticket-<task-id>
src:repo-<owner>-<repo>-<commit-or-pr>
src:chat-<platform>-<message-id>
src:doc-<path-or-slug>
```

Examples:

- `src:2026-06-04-growthos-context-boundary`
- `src:ticket-1c63eaff-9550-4c32-8f48-7032d5e9b02c`
- `src:repo-agent-os-f0cd7977`

## Citation Convention

Docs, task descriptions, agent outputs, and decision records should cite sources in a short `Evidence` block:

```markdown
## Evidence

- `src:2026-06-04-growthos-context-boundary` - GrowthOS review finding: raw evidence and interpreted context are mixed.
- `src:ticket-1c63eaff-9550-4c32-8f48-7032d5e9b02c` - Agent OS task defining the sources-layer acceptance criteria.
```

When citing a local file, include the path:

```markdown
- `src:doc-docs-sources-layer` - `docs/SOURCES_LAYER.md`
```

When citing a task, include the task ID and status if relevant:

```markdown
- `src:ticket-16813704-0af0-44af-9842-75008852f9e2` - decision-log ticket, status `in_progress`.
```

## Sensitivity Rules

- No plaintext secrets, tokens, passwords, OTPs, private keys, bank details, or account numbers.
- No full private email/calendar/Slack bodies unless Felipe explicitly approves that exact retention.
- Summarize personal or customer details down to the minimum needed decision signal.
- If raw evidence is sensitive but useful, cite the system where it lives and store only a safe summary.
- Delete or redact accidental sensitive captures immediately using a recoverable path first when possible.

## Agent Discipline

Before making an important Agent OS or Life OS change, Cai should ask:

- What source backs this?
- Is the source raw evidence or my interpretation?
- Can I cite a stable source ID or link?
- Is any raw detail too sensitive to store?

If the answer is unclear, create a small source summary first, then make the decision or task.
