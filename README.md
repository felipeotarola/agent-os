# Agent OS

Local-first cockpit for Felipe × Cai.

## Current real surfaces

- Cockpit overview: live/fallback OpenClaw + Postgres status
- Tasks: Postgres-backed kanban/task board
- Agents: OpenClaw agent inventory
- Command: read-only bridge diagnostics
- Knowledge Inbox: raw source capture
- Wiki: vault/read-model view
- Journal: local log/decision capture into knowledge raw
- Memory: memory search/save surface
- Permissions: notification/permission state
- Settings: real system/data-source status and guardrails
- Trading Lab: paper-only BTC research/backtesting workspace
- Sources layer: raw evidence kept separate from interpreted context
- Decision log: concise rationale records for durable Agent OS/Life OS choices
- Agent evals: lightweight fixture-based behavior checks for agents/workflows

## Removed from the product surface

Template/demo surfaces have been disabled instead of being carried forward:

- Products/users fake APIs and faker datasets
- Pokemon/React Query sample API
- Form demo pages
- Chat demo
- Billing/exclusive/workspace template pages
- Template GitHub/star/demo links
- Sample avatar/product image URLs

## Build stance

Do not add mock SaaS/sample datasets back into runtime routes. If a screen needs data, connect it to one of:

1. OpenClaw runtime/config
2. Agent OS bridge
3. Postgres tables
4. Local knowledge/memory files
5. Explicit user input

See `docs/COPILOT_INVENTORY.md` for the current inventory and missing pieces.

## Feature docs

- `docs/TRADING_LAB.md` — paper-only BTC research workspace, APIs, guardrails, and validation.
- `docs/BROWSER_AUTOMATION_RECOVERY.md` — profile-specific browser automation triage and safe recovery guardrails.
- `docs/LOCAL_DAILY_BRIEF.md` — local-only daily brief template and approval-gated input rules.
- `docs/SOURCES_LAYER.md` — raw evidence/source IDs, citations, and sensitivity rules.
- `docs/DECISION_LOG.md` — lightweight decision records with rationale and evidence.
- `docs/AGENT_EVALS.md` — first-class eval loop for agent behavior and workflow quality.
