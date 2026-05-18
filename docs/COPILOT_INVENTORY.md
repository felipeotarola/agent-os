# Copilot / Agent OS Inventory

Date: 2026-05-18

## What exists now

### Real / keep

- **Cockpit overview** (`/dashboard/overview`)
  - Reads cockpit snapshot from bridge when available.
  - Falls back to Postgres/fallback state.
  - Shows stats, prioritized tasks, agents, knowledge counters, task flow and recent events.

- **Tasks** (`/dashboard/kanban`)
  - Postgres-backed task board.
  - Supports task creation and reorder persistence.
  - Uses the Agent OS task model instead of template product data.

- **Agents** (`/dashboard/agents`)
  - Reads OpenClaw agent inventory/config via local data layer.
  - Shows identity, model, workspace, agent dir and bindings.

- **Command** (`/dashboard/command`)
  - Read-only diagnostic commands: bridge health, memory status, agents list, knowledge snapshot.
  - Correct V1 posture: observe first, guarded actions later.

- **Knowledge Inbox** (`/dashboard/knowledge`)
  - Captures source title/type/url/raw content.
  - Stores via `knowledge_sources`/bridge-compatible flow.

- **Wiki** (`/dashboard/wiki`)
  - Displays wikified vault files and raw source counts.
  - Intended stable knowledge surface.

- **Journal** (`/dashboard/journal`)
  - Real local log/decision capture surface.
  - Persists entries into `knowledge_sources` as `kind=journal` for later wikification.

- **Memory** (`/dashboard/memory`)
  - Memory search/save surface.
  - Should stay local-first and avoid secrets.

- **Permissions / notifications** (`/dashboard/notifications`)
  - Reworked away from template notification mocks in an earlier commit.

- **Settings** (`/dashboard/settings`)
  - Real system/data-source status: bridge, Postgres, agents, memory and guardrails.
  - Replaces the disabled template icons/settings demo.

- **Affiliate** (`/dashboard/affiliate`)
  - Exists, read-only, bridge/API/export-first.
  - Removed from main nav for now because it is not core Copilot cockpit.

### Disabled / removed from surface

- Product table + `/api/products/*` fake store.
- Users table + `/api/users/*` fake store.
- React Query Pokemon demo.
- Form demo pages.
- Chat demo page.
- Billing, exclusive and workspace template pages.
- Icons/settings demo page.
- Template GitHub/star CTA and starter links.
- README links to the upstream dashboard starter.
- Faker-backed `src/constants/mock-api*.ts` files.

Disabled routes now return 404 or 410 instead of silently showing fake data.

## What is missing

### Data model / DB

- Persistent agent/session event sync from OpenClaw into Postgres.
- Proper knowledge lifecycle states: `raw -> queued -> wikified -> reviewed -> archived`.
- First-class artifacts/files table usage in the UI.
- Owners/projects relationship shown consistently on task cards.
- Audit/event stream for user-visible actions.

### Bridge

- Durable bridge process contract documented and tested.
- Safe write actions from cockpit to OpenClaw/DB with permission checks.
- Import/export endpoints for knowledge vault and affiliate data need verification.
- Health endpoint should expose version, DB status, OpenClaw status and last sync timestamps.

### UI/product

- Expand Settings with editable-but-guarded configuration once bridge write guardrails exist.
- Expand Journal with filters, tags, project links and “promote to wiki/task” actions.
- Make empty states explicit: no fake data, tell the user what source is missing.
- Add a “needs wiring” badge for surfaces that are real UI but not fully connected.
- Add an inventory/admin page so this document does not live only in markdown.

### Quality

- Add tests around disabled mock endpoints returning 410.
- Add smoke tests for active routes.
- Add lint rule/check to fail on forbidden sample domains and faker imports.
- Reduce dependency footprint after template cleanup.

## Guardrail

No new mock data in runtime routes. Temporary fixtures are allowed only in tests or clearly named dev-only files, never shown as real cockpit state.
