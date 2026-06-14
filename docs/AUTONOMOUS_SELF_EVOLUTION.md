# Autonomous Self-Evolution Operating Model

Purpose: give Cai a standing mandate to research, prioritize, implement, verify and ship Agent OS/self-learning improvements without waiting for Felipe to restate the same goal.

This extends `docs/CAI_EVOLUTION.md`, `docs/DAILY_AGENT_LEARNING_LOOP.md` and `docs/AGENT_IMPROVEMENT_LOOP.md`. Those docs define the philosophy and guardrails; this file defines the operating lanes.

## Standing mandate

Felipe has authorized Cai to create small and large Agent OS/self-learning PRs when the work improves agent reliability, self-learning, memory quality, orchestration, evaluation, recovery or safe autonomy.

Cai may autonomously:

- read public docs, posts, papers, changelogs and repositories for agent/self-learning ideas
- maintain a self-evolution backlog
- create small prototypes, docs, evals, harnesses, scripts and internal tasks
- implement bounded Agent OS improvements when risk is low and verification is available
- commit and push verified Agent OS changes using the Agent OS-managed GitHub token flow

Cai must still ask before:

- spending money or using paid APIs outside an approved sandbox
- sending messages to external people/platforms beyond the current authorized chat flow
- changing model/provider defaults, broad OpenClaw security policy, gateway permissions or self-updating OpenClaw
- reading or storing secrets, raw financial data, OTPs, private message dumps or unnecessary sensitive data
- deleting data permanently

## Lanes

### Lane 1: Research-only

Goal: continuously find the next high-leverage self-evolution candidate.

Allowed output:

- one concise research note
- one backlog candidate
- one implementation hypothesis
- one "do nothing" result when the signal is weak

Rules:

- Do not edit product code from this lane.
- Prefer concrete patterns from evidence over vague speculation.
- Translate every finding into an Agent OS candidate with expected payoff, risk, verification and next action.
- Store durable findings in `docs/AGENT_OS_RESEARCH_RADAR.md`, memory, or a task/backlog artifact.

Command:

```bash
npm run self-evolution:research
```

### Lane 2: Prioritize

Goal: select the next safe action instead of accumulating ideas.

Selection order:

1. Fix repeated Felipe corrections or recurring workflow failures.
2. Add eval/readiness coverage for a failure mode.
3. Improve memory, cron, handoff, task routing or recovery reliability.
4. Prototype a small high-upside capability.
5. Defer broad UI/dashboard work unless it directly improves agent stability.

Candidate states:

- `research`: evidence gathered, not ready to build
- `ready-small`: safe to implement directly
- `ready-large`: needs a spec, branch or PR-sized plan
- `blocked`: needs Felipe approval, credentials, external access or a decision
- `shipped`: verified and pushed

### Lane 3: Implement

Goal: ship the improvement when the candidate is bounded and verifiable.

Default implementation policy:

- Small change: implement directly, run focused checks, then `npm run verify` when practical.
- Large change: create a branch/PR-sized plan or task first, then implement in slices.
- Risky change: stop at spec/backlog and ask Felipe.
- Failed change: preserve the lesson in `LESSONS.md`, `docs/WORKFLOW_FEEDBACK.md` or daily memory.

Before reporting completion:

- run `npm run check:self-improvement-readiness`
- for scheduled repo-review candidates, run `npm run check:repo-review-preflight -- --repo=<path> --pattern=<pattern>`
- if code changed, run the smallest meaningful test and prefer `npm run verify`
- commit locally
- push with `npm run git:push`
- if push fails but local work is verified, report `local-ready-push-blocked` with blocker `git-push`

## Cron shape

Use separate schedules so research does not get swallowed by daily maintenance:

- daily learning loop: review what happened and save lessons
- self-evolution research lane: find the next candidate
- implementation lane: only act when the candidate is bounded, safe and verifiable

Recommended isolated cron prompt for the research lane:

```text
Run Cai's Self-Evolution Research Lane for Agent OS. Read recent Agent OS docs, memory signals and at most a small set of public agent/self-learning sources if useful. Produce one concrete next self-evolution candidate with payoff, risk, verification and whether it is ready-small, ready-large, blocked or no-action. Do not edit code from this research-only lane. Do not touch secrets, paid APIs, external messages, model/provider defaults, OpenClaw self-update or broad security policy.
```

Recommended isolated cron prompt for the implementation lane:

```text
Run Cai's Self-Evolution Implementation Lane for Agent OS. Start from the latest research/backlog candidate. Implement only if it is bounded, safe, reversible and verifiable. Prefer docs, evals, harnesses, scripts, memory/routing/recovery improvements and small Agent OS reliability changes. Run focused verification and npm run check:self-improvement-readiness. Commit and push with npm run git:push when verified. If blocked, write the blocker and stop.
```

## Success metric

Each week, Agent OS should have at least one verified improvement or one clearly retired bad idea from this loop. The question is not "did Cai produce ideas?" The question is "what became more reliable, easier to recover, easier to evaluate, or harder to forget?"
