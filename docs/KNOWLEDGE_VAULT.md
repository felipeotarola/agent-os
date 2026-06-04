# Knowledge Vault

Purpose: expose Agent OS knowledge as an Obsidian-compatible markdown vault while keeping raw evidence, synthesized context, journal notes, index files, and audit logs distinct.

## Status

V1 is implemented as a generated vault snapshot backed by Postgres `knowledge_sources`.

## Runtime Shape

- Source table: `knowledge_sources`
- Snapshot helper: `src/lib/vault.ts`
- Bridge endpoint: `GET /knowledge/snapshot`
- Export route: `GET /api/knowledge/vault/export`
- UI surfaces: `/dashboard/knowledge` and `/dashboard/wiki`

The vault is generated from DB metadata instead of committed markdown files. This keeps Agent OS local-first while avoiding stale checked-in copies of private source material.

## Folder Structure

The generated vault always includes these index/log files:

- `agents.md`
- `index.md`
- `log.md`
- `knowledge/index.md`
- `knowledge/raw/index.md`
- `knowledge/wiki/index.md`
- `journal/index.md`

Source-specific files use DB-backed paths:

- raw sources: `knowledge/raw/*.md`
- wikified sources: `knowledge/wiki/*.md`
- memory imports: `knowledge/memory/<agent>/*.md`
- journal entries: `journal/*.md`
- mail imports: `knowledge/mail/*.md`
- session imports: `knowledge/sessions/*.md`

## Metadata Mirror

Each vault file is derived from source rows with:

- `raw_path`
- `wiki_path`
- `kind`
- `status`
- `summary`
- `source_url`
- `created_at`

The markdown vault is a read model. Postgres remains the source of truth.

## Guardrails

- Raw files are evidence, not final truth.
- Wiki files are synthesized working knowledge and should keep source links/paths.
- Archived sources are excluded from generated vault files.
- Do not preserve secrets, raw private mail, tokens, credentials, bank details, OTPs, or unnecessary private data.

## Evidence

- Task `agent-os-wiki-vault` - requested raw/wiki/journal/index/log folders and DB metadata mirroring.
- `docs/SOURCES_LAYER.md` - separates evidence from interpreted context.
- `docs/SESSION_RETENTION_POLICY.md` - defines when sessions should become knowledge sources.
