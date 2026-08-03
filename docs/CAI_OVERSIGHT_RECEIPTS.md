# Cai oversight receipts

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

Run the retained V0 suite with `npm run check:cai-oversight:v0`. Its fixtures accept supported completion, flag missing and contradictory evidence, flag an unproven approval boundary, block an observed forbidden effect, and suppress a duplicate stable finding.

## V1 daily-signal contract

V1 is still local, deterministic, read-only and fail-closed. It consumes supplied daily signals only; it does not collect data, alter files, close work, send messages, read secrets, or run corrective actions.

Accepted signal types are active goals, Agent OS changes, cron errors, and agent status. A signal can produce an alert only when it is material and carries safe, concrete evidence (`ref` plus the observed fact). Normal, known, one-off, and unsupported signals produce no alert. A material signal without usable evidence holds the run instead of guessing.

The output is either `clear`, `held`, or `alert`. An alert contains only its stable id, category, and exact evidence. V1 deduplicates identical evidence within a run. It is a two-week trial contract, not a scheduler or a notification integration.

Run V1 with `npm run check:cai-oversight:v1`. Its fixtures cover no-op/noise, false positives, missing evidence, a material blocker, a material decision, and an unsafe policy boundary.
