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
