# Memory control plane

Agent memory is automatic by default. Knowledge Studio is for sources, documents, research,
session extracts and wiki material; it is not the primary promotion queue for memory.

## Deterministic routing

Session signals are classified into `daily-memory`, `long-term-memory`, `lesson-candidate`,
`task`, `knowledge-wiki`, or `discard`. The result, confidence, reasons and source lineage are
stored in `knowledge_sources.metadata`, preserving the existing table and endpoints.

Safe, high-confidence routes leave the human queue automatically. Knowledge/wiki remains
`extracted`; discarded noise is archived; other accepted routes retain the legacy `promoted`
status for compatibility. This status means routed by the control plane, not manually promoted.

Only exceptions require review: sensitive content, contradictions, low confidence, and actual
strategy/preference changes. Action Center filters routed items accordingly. Legacy rows without
control-plane metadata remain reviewable so the rollout does not hide existing work.

## Compatibility and boundaries

- No destructive migration. Existing lifecycle values, APIs, vault export and QMD consumers work.
- Memory and session harvest endpoints remain available.
- Raw session sources remain evidence in Knowledge Studio.
- The materializer appends provenance-marked entries to the owning agent's daily memory,
  `MEMORY.md`, or `LESSONS_CANDIDATES.md`. It never modifies live instructions or skills.
- Durable memory requires confidence >= 0.8. Any exception blocks all file/task writes.
- Task routes are idempotently created in Agent OS using `memory-control-plane:<signal hash>` as
  source. Knowledge/wiki remains in the DB and discard is archived.
- Dry-run performs no file or task writes.
- The bridge container keeps OpenClaw home read-only and mounts only each registered workspace as
  writable. A newly added agent needs its workspace bind added before file materialization; routing
  metadata remains available meanwhile.

Run `npm run check:memory-control-plane` for the contract fixtures.

## Automatic local runner

`npm run memory:control-plane -- --limit 5` runs the bounded bridge operation without requiring a
dashboard visit. It reads `AGENT_OS_BRIDGE_TOKEN` (or an explicit
`AGENT_OS_BRIDGE_TOKEN_FILE`) and never includes the token in output. Use `--dry-run` for preview.
Dry-run reads and classifies selected sessions and returns planned routes/materialization outcomes,
but performs no SQL inserts, file writes, task writes or audit-event writes.
The default runner stores a freshness watermark at
`/root/.openclaw/state/memory-control-plane-watermark.json`. Its first live invocation initializes
the watermark to the current time and performs zero bridge mutations. Later successful live runs
only select session artifacts whose mtime is newer than the previous watermark, then advance it.
Failed and dry runs never advance it. Legacy sessions require the explicit `--backfill` opt-in.
The dashboard form is permanently preview-only and cannot silently backfill or materialize old
sessions.
The intended integration point is the existing daily-learning loop; add the command there after
deployment verification. This change deliberately does not mutate cron configuration.

Raw transcript bodies are no longer copied into Postgres by default. Session path, summary,
extracted signals and hashes preserve provenance. `includeRawTranscript` is an explicit bridge-only
compatibility option for controlled debugging, not part of the standard runner.

Only `.md`/`.markdown` session artifacts are eligible. JSON/JSONL transport logs, trajectories,
checkpoints, backups and app-server envelopes are excluded and equivalent session exports are
deduplicated. Embedded JSON envelope lines are rejected again during signal extraction.
