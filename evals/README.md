# Agent OS Evals

This directory stores lightweight eval fixtures and optional reports for agent behavior.

Run:

```bash
npm run evals:agent
```

Write a timestamped report:

```bash
npm run evals:agent -- --write-report
```

V0 fixtures are deterministic. They score declared candidate behavior against expected action, evidence, context, safety, and output constraints. This catches regression patterns without needing live model calls.

Self-improvement readiness:

```bash
npm run check:self-improvement-readiness
```

This check classifies the current repo state and runs deterministic fixtures for the important workflow distinction: a verified local commit with a failed push is `local-ready-push-blocked`, not failed work. Use that status in daily learning-loop reports when GitHub access is the only blocker.

After an actual failed push, pass the exit code into the local report:

```bash
npm run check:self-improvement-readiness -- --push-exit-code=128
```

## Repo Review Preflight

Scheduled repo-review jobs should classify local evidence access before reporting failure:

```bash
npm run check:repo-review-preflight -- --repo=/root/.openclaw/repos/lysande.ai --pattern="target phrase"
```

The check treats missing repos as `repo-path` blockers, treats completed no-match searches as evidence, and falls back from `rg` to `git grep` when needed.
