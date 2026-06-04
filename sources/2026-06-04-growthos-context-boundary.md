# Source: GrowthOS Context Boundary

- Source ID: `src:2026-06-04-growthos-context-boundary`
- Date: 2026-06-04
- Owner: cai
- Sensitivity: internal-summary
- Related task: `1c63eaff-9550-4c32-8f48-7032d5e9b02c`

## Summary

GrowthOS review surfaced that Agent OS had memory, docs, agent instructions, and tasks, but lacked a clear place for raw evidence behind decisions. The practical fix is a sources layer with stable IDs and a strict boundary:

- sources are evidence
- context is interpretation
- decision records explain why a choice was made

## Used By

- `docs/SOURCES_LAYER.md`
- `docs/DECISION_LOG.md`
- `docs/TASKS.md`
