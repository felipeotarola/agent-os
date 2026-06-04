# Copilot / Agent OS Inventory

Date: 2026-05-18

## What exists now

### Real / keep

- **Cockpit overview** (`/dashboard/overview`)
  - Reads cockpit snapshot from bridge when available.
  - Falls back to Postgres/fallback state.
  - Shows stats, prioritized tasks, agents, knowledge counters, subagent/background runs, task flow and recent events.

- **Tasks** (`/dashboard/kanban`)
  - Postgres-backed task board.
  - Supports task creation and reorder persistence.
  - Uses the Agent OS task model instead of template product data.
  - Task descriptions can include fenced Mermaid diagrams; see `docs/TASKS.md`.

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

- **Sources layer** (`docs/SOURCES_LAYER.md`, `sources/`)
  - Defines raw evidence as separate from interpreted context.
  - Adds stable source IDs and citation conventions for docs, tickets, decisions, and agent outputs.

- **Decision log** (`docs/DECISION_LOG.md`, `decisions/`)
  - Defines lightweight decision records for durable Agent OS and Life OS choices.
  - Captures decision, reason, evidence/source, tradeoff, date, owner, and related task.

- **Memory** (`/dashboard/memory`)
  - Memory search/save surface.
  - Should stay local-first and avoid secrets.

- **Permissions / notifications** (`/dashboard/notifications`)
  - Reworked away from template notification mocks in an earlier commit.

- **Settings** (`/dashboard/settings`)
  - Real system/data-source status: bridge, Postgres, OpenClaw CLI, agents, memory, subagent task source and guardrails.
  - Replaces the disabled template icons/settings demo.

- **Affiliate** (`/dashboard/affiliate`)
  - Exists, read-only, bridge/API/export-first.
  - Removed from main nav for now because it is not core Copilot cockpit.

### Removed / stripped from runtime

- Product table + `/api/products/*` fake store.
- Users table + `/api/users/*` fake store.
- React Query Pokemon demo route.
- Form demo pages and form/product showcase feature code.
- Billing, exclusive, workspace and template icon routes.
- Template GitHub/star CTA and starter links.
- README links to the upstream dashboard starter.
- Faker-backed `src/constants/mock-api*.ts` files.
- Organization switcher links to removed workspace setup.

These are now deleted rather than merely hidden. If a capability returns, it should come back as a real Agent OS surface backed by OpenClaw/DB data.

## What is missing

### Data model / DB

- Deeper persistent agent/session event sync from OpenClaw into Postgres beyond throttled bridge audit failures.
- Proper active knowledge lifecycle states beyond current `raw -> queued -> wikified`; `reviewed`/`archived` are documented as planned only.
- First-class artifacts/files table usage in the UI.
- Owners/projects relationship shown consistently on task cards.
- Audit/event stream for user-visible actions.

### Bridge

- Bridge contract documented in `docs/BRIDGE_CONTRACTS.md`; automated contract tests still missing.
- Session retention/deletion policy documented in `docs/SESSION_RETENTION_POLICY.md`; V1 intentionally supports inventory/harvest/extract/review, not automatic hard deletion.
- Supabase observability connector documented in `docs/SUPABASE_OBSERVABILITY.md`; V1 is read-only, env-only, empty-safe and exposed at `/dashboard/supabase`.
- Vercel observability connector documented in `docs/VERCEL_OBSERVABILITY.md`; V1 is read-only, env-only, empty-safe and exposed at `/dashboard/vercel`.
- Runway picture documented in `docs/RUNWAY_PICTURE.md`; V1 is a safe Life OS summary at `/dashboard/runway`, with no raw banking/secrets.
- Inbox Radar documented in `docs/INBOX_RADAR.md`; V1 aggregates tasks, knowledge, notifications, observability and runway into `/dashboard/radar`.
- External signals documented in `docs/EXTERNAL_SIGNALS.md`; Gmail, Calendar and GitHub read-only connectors feed Inbox Radar while Linear is intentionally skipped.
- System architecture documented in `docs/SYSTEM_ARCHITECTURE.md` and visualized at `/dashboard/architecture` with Mermaid diagrams.
- Safe write actions from cockpit to OpenClaw/DB with permission checks.
- Import/export endpoints for knowledge vault and affiliate data need verification.
- Health endpoint now exposes version, DB status, OpenClaw status, subagent visibility source and explicit last sync/null fields.

### UI/product

- Decide whether Affiliate belongs in this cockpit at all; it is real/read-only but not core Agent OS, so it is no longer in primary navigation.
- Expand Settings with editable-but-guarded configuration once bridge write guardrails exist.
- Expand Journal with filters, tags, project links and “promote to wiki/task” actions.
- Make empty states explicit: no fake data, tell the user what source is missing.
- Add a “needs wiring” badge for surfaces that are real UI but not fully connected.
- Add an inventory/admin page so this document does not live only in markdown.
- Eventually surface sources and decision records in the UI if the markdown convention proves useful.

### Quality

- Add tests around disabled mock endpoints returning 410.
- Add smoke tests for active routes.
- Runtime mock guard exists as `npm run check:runtime-mocks` and runs before build.
- Reduce dependency footprint after template cleanup.

## Guardrail

No new mock data in runtime routes. Temporary fixtures are allowed only in tests or clearly named dev-only files, never shown as real cockpit state.
