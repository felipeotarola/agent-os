# Cai oversight receipts V0

Purpose: independently check Cai's completion claims against local evidence without creating another always-on persona or notification stream.

## Contract

Each sampled action supplies a local review receipt with:

- stable `actionId` and concise `claim`
- action `status`
- evidence references with `resolved` or contradictory state
- verification result
- approval-boundary result
- observed forbidden effects

The reviewer returns:

- `pass` when completion evidence resolves and verification passed
- `needs-review` for missing or contradictory evidence, failed/missing verification, or an unproven approval boundary
- `blocked` when a known forbidden effect occurred

Non-pass findings deduplicate on `actionId` plus a hash of the evidence set. Repeated checks of the same stable gap must not create repeated review items.

## V0 boundary

This is an offline deterministic contract and fixture suite. It does not run a model, create a permanent reviewer agent, schedule work, read secrets, send notifications, or execute corrective actions. A later integration should sample completed or high-risk autonomous work and route at most one stable non-pass finding into the existing review surface.

## Verification

Run `npm run check:cai-oversight`. The fixtures accept supported completion, flag missing and contradictory evidence, flag an unproven approval boundary, block an observed forbidden effect, and suppress a duplicate stable finding.
