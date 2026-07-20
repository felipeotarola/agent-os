# Agent OS Research Radar

Purpose: keep a lightweight backlog of ideas from agentic OS / personal AI assistant research that Agent OS may want, especially things OpenClaw does not already provide directly.

Last scan: 2026-07-20

## 2026-07-20 - Enforced execution scope, not informational roots

State: `implemented-local`

High-signal pattern: the cockpit must distinguish an agent's displayed or requested scope from the boundary actually enforced at execution time. MCP's final SEP-2577 deprecates Roots partly because roots are only informational guidance: servers are not required to respect them. The proposed replacements are explicit tool parameters, resource URIs, server configuration, or environment variables. The SEP also notes that roots disclose filesystem structure and can invite traversal attempts outside the intended boundary.

Why this matters for Agent OS:

- Agent OS documents read-only connectors and guarded internal writes, but it has no connector-neutral receipt proving which paths, resource IDs, action classes, and enforcement layer constrained a particular operation.
- A capability badge or advertised workspace root can therefore look like a security boundary without proving that the tool adapter, process sandbox, API token, or server-side authorization enforced it.
- This belongs beside approval receipts and delegated-operation handles: approval answers _who accepted which action_; an execution-scope receipt answers _what the runtime could actually touch_.

Safe internal build candidate:

- Add bridge-free task candidate `enforced-execution-scope-receipt-v0` to `docs/TASKS.md`.
- V0 is a local contract and deterministic fixtures only. Require requested scope, effective scope, enforcement mechanism, policy/version hash, and post-run observed-resource summary; fail closed when effective scope is broader or unverifiable.
- Do not build an MCP compatibility layer or a new dashboard. Surface violations through existing Inbox Radar and attach receipts to existing task/run/approval records.

Source reviewed:

- https://modelcontextprotocol.io/seps/2577-deprecate-roots-sampling-and-logging

Note: SEP-2577 is a final standards-track migration signal, but its page says deprecation begins in the specification release that includes it. Build the local invariant, not an assumption about an unreleased wire version.

Implementation result:

- Added `docs/EXECUTION_SCOPE_RECEIPTS.md` with the connector-neutral receipt contract and explicit rule that informational roots/capability labels are not enforcement evidence.
- Added `execution-scope-receipts-v0` deterministic readiness fixtures. They accept an exact scoped read-only connector and reject informational-root-only, broader effective scope, policy drift, and out-of-scope observations.

Verification:

- `node --check scripts/self-improvement-readiness.mjs` passed.
- `npm run check:self-improvement-readiness` passed, including `execution-scope-receipts-v0` with 6/6 cases passing.

## 2026-07-16 - Memory-route completeness and semantic dedup guard

State: `implemented-verified`

Evidence: the 2026-07-15 automatic memory-control-plane run materialized several summaries that end mid-sentence and proposed a Charles Slack-DM lesson already present in `LESSONS.md`. The current `scripts/memory-control-plane-contract.mjs` verifies provenance-id idempotency, but it has no fixture that rejects clipped text or a lesson candidate already covered by durable memory/lessons.

Expected payoff: keep automatic memory and lesson routes self-contained and prevent repeated lessons from adding retrieval noise. Risk is low if V0 stays local and deterministic; ambiguous items must route to review rather than be silently discarded.

Verification hypothesis: extend the memory-control-plane contract with fixtures that reject obvious clipped fragments, accept complete standalone summaries, and suppress or review lesson candidates semantically covered by current daily memory, `MEMORY.md`, `LESSONS.md`, or pending candidates.

Implemented: `bridge/memory-control-plane.mjs` now routes obviously clipped summaries to review and suppresses lesson candidates already semantically covered by current daily memory, `MEMORY.md`, `LESSONS.md`, or pending candidates. The guard is deterministic and does not rewrite existing memory.

Verification: `npm run check:memory-control-plane` passes the new completeness/semantic-coverage fixtures (7/7) and materialization fixture (5/5); `npm run verify` passes end to end on 2026-07-16.

## 2026-07-13 - Durable delegated-operation handles

State: `ready-small`

High-signal pattern: a long-running tool call should be acknowledged with a durable, inspectable operation handle before the caller treats it as started. The new MCP Tasks extension makes that handle a small state machine rather than an opaque session: `working`, `input_required`, `completed`, `failed`, or `cancelled`, with TTL/poll hints, result/error, explicit update and cancellation calls, and stable keys for outstanding input requests.

Why this matters for Agent OS:

- Agent OS can display tasks, sessions, and handoffs, but it has no connector-neutral receipt for an external or delegated operation that may finish immediately or return an asynchronous handle. A provider-specific job can therefore become detached from its originating task, approval, or Radar item.
- `input_required` is the important cockpit state. It should create exactly one Inbox Radar item per stable input-request key; repeated polls must not nag Felipe or submit the same response twice.
- Cancellation is a request, not proof of termination. The MCP extension deliberately makes `tasks/cancel` acknowledgement eventually consistent; Agent OS should show `cancellation-requested` until a later read observes `cancelled`.
- The protocol split is useful locally even without an MCP integration: reads remain pure and retryable, while input responses and cancellation are explicit writes. A handle is not considered created until its read endpoint can resolve it.

Safe internal build candidate:

- Add bridge-free task candidate `delegated-operation-handle-v0` to `docs/TASKS.md`.
- V0 is a local contract and deterministic fixtures only. Map remote handles into existing task events and Inbox Radar instead of adding another dashboard page or polling service.

Sources reviewed:

- https://modelcontextprotocol.io/seps/2663-tasks-extension
- https://docs.langchain.com/oss/python/langgraph/interrupts

Note: SEP-2663 is Final on the MCP Extensions track, but the Tasks extension is still an incubating extension rather than stable core protocol. Build the internal invariant, not a hard dependency on the current wire shape.

## 2026-07-12 - Cron-safe review preflight

Implemented `scripts/cron-review-preflight.mjs` and `npm run check:cron-review-preflight` as one deterministic decision point for isolated review/learning jobs. Missing optional files now produce `continue-with-partial-evidence`; a synced branch skips push; an ahead branch permits push; and a failed push preserves the local result as `local-ready-push-blocked` with blocker `git-push`.

Verification: `node --check scripts/cron-review-preflight.mjs` and `npm run check:cron-review-preflight -- --optional=/tmp/intentionally-missing-cron-evidence` pass four fixtures. The check is wired into `npm run verify` and performs no external action.

## 2026-07-09 - Cron preflight live research freshness

State: `shipped`

High-signal pattern: autonomous lane visibility checks must read the live underlying lane output, not stale docs or cached assumptions. The cron preflight briefly reported `Cron lane visibility preflight` as the self-evolution research candidate even while `npm run self-evolution:research -- --format=json` returned `No self-evolution candidate`.

Why this matters for Agent OS:

- The research lane noise rule depends on exact candidate state. A stale preflight can make a quiet `no-action` lane look actionable or make a real candidate invisible.
- The fix is small and local: `scripts/cron-lane-visibility-preflight.mjs` now honors `--format=json` and shells directly into `scripts/self-evolution-research-lane.mjs --format=json` when building the research row.
- This is more useful than a new dashboard surface because it hardens the existing preflight contract: every lane row must name fresh evidence, a verification command, and a blocker only when one actually exists.

Verification:

- `npm run check:cron-lane-visibility -- --format=json` now reports Self-Evolution Research Lane as `No self-evolution candidate (no-action)` with source `scripts/self-evolution-research-lane.mjs`.
- `npm run self-evolution:research -- --format=json` returns `No self-evolution candidate` with state `no-action`.
- 2026-07-08 daily memory records the original drift, fix, and verification set.

Next action: no implementation follow-up. Keep this as shipped evidence; only reopen if preflight rows again diverge from their underlying lane commands.

## 2026-07-06 - Approval resume freshness guard

State: `implemented-local`

High-signal pattern: approval-gated agents are not just "pause, approve, resume." Long-lived pending approvals need a freshness/version check before execution, because the approval can outlive the agent graph, tool policy, SDK version, context object, or safety classification that produced it.

Sources reviewed in this pass:

- OpenAI Agents SDK HITL docs: tool calls can pause as `interruptions`, resume from the same `RunState`, and nested `agent.asTool()` approvals surface on the outer run. The docs also call out pre-approval input guardrails, rerunning guardrails after approval, serialized state containing app context/runtime metadata, and versioning pending tasks when approval waits through agent/SDK changes.
- AgenticOS @ SOSP 2026 workshop: the research agenda frames agent systems as long-running workloads that need OS-level primitives for isolation, scheduling, observability, provenance, debugging, long-lived state, and security around agent-invoked tools/data flows.

Why this matters for Agent OS:

- `tool-call-approval-receipts-v0` now records exact parameters and reviewer decision, but it does not yet say when a pending approval becomes stale or what must be revalidated before a resumed tool call executes.
- The missing guard is small and local: every executable approval receipt should include a freshness envelope with `expiresAt`, `policyVersion`, `agentGraphVersion` or source commit, `toolSchemaVersion`, and `preApprovalGuardrailStatus`. If any of those drift before execution, the receipt should become `superseded` and a new approval item should be created instead of silently resuming.
- This is more useful than another dashboard surface. It hardens the existing Inbox Radar approval model against delayed human review and code/policy drift.

Safe internal build candidate:

- Candidate state: `ready-small`.
- Add a bridge-free task candidate: `approval-resume-freshness-guard-v0` in `docs/TASKS.md`.
- V0 should extend docs and deterministic fixtures only. No real external sends, posts, deletes, purchases, credential changes, secret-bearing tool calls, live scheduler changes, or model/provider changes.

Reference links:

- https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- https://os-for-agent.github.io/

Implementation result: extended `docs/TOOL_CALL_APPROVAL_RECEIPTS.md` with a required freshness envelope for executable approval receipts and added deterministic readiness fixtures for fresh, missing-envelope, expired, and drifted-policy receipts.

Verification:

- `node --check scripts/self-improvement-readiness.mjs` passed.
- `npm run check:self-improvement-readiness` passed, including `tool-call-approval-receipts-v0` with 8/8 cases passing.

Guardrail: V0 remains docs and deterministic fixtures only. Stale approvals become `executionStatus: "superseded"` and require a fresh approval item instead of executing.

## 2026-07-05 - Tool-call approval receipts V0

State: `implemented-local`

Result: implemented the local V0 contract for approval-gated tool calls before any risky action can execute or resume. The contract keeps this inside Inbox Radar with `kind: "approval"` and `metadata.approvalReceipt`, and requires exact tool name, parameters, parameter hash, risk class, reviewer decision, execution status, and source run/session context.

Implemented:

- Added `docs/TOOL_CALL_APPROVAL_RECEIPTS.md` with receipt shape, pending/completed states, approve/deny/edit paths, and guardrails.
- Linked the receipt contract from `docs/INBOX_RADAR.md` and `docs/BRIDGE_CONTRACTS.md`.
- Added `tool-call-approval-receipts-v0` fixtures to `scripts/self-improvement-readiness.mjs`.
- Marked `tool-call-approval-receipts-v0` done in `docs/TASKS.md`.

Verification:

- `node --check scripts/self-improvement-readiness.mjs` passed.
- `npm run check:self-improvement-readiness` passed, including `tool-call-approval-receipts-v0` with 5/5 fixtures:
  - accepts exact pending receipts as non-executable
  - accepts exact approved receipts as executable
  - rejects vague chat approvals without exact tool parameters
  - rejects edited decisions without edited parameters
  - verifies the V0 docs define the required contract fields

Guardrail: V0 is docs and deterministic fixtures only. It does not execute external sends, posts, deletes, purchases, credential changes, or secret-bearing tool calls.

## 2026-07-05 - Correction-to-lesson router

State: `implemented-local`

Result: added `scripts/correction-lesson-router.mjs` and `npm run lessons:corrections` so weekly/daily learning loops can classify recent Felipe correction signals before creating duplicate lessons or tasks.

Current routing result: recent Tibber/Polestar standalone-status corrections route to covered `LESSONS.md` guidance, missing daily-memory-file/proactive-loop failures route to the covered optional-context-file lesson, and the repeated correction-routing signal routes to the now-done `correction-to-lesson-router-v0` task candidate.

Verification:

- `node --check scripts/correction-lesson-router.mjs` passed.
- `npm run lessons:corrections -- --format=json` found 9 recent correction-like signals; all routed to covered `LESSONS.md` guidance or done Agent OS task candidates.
- `npm run lab:weekly -- --format=json` still names `Correction-to-lesson router` as the suggested experiment, now with a runnable local command as the concrete output.

## 2026-07-03 - Memory-promotion covered-candidate suppression

State: `implemented-local`

Result: `npm run self-evolution:research` selected `Long-term memory promotion hygiene check`, but `npm run check:self-improvement-readiness` already passes the `memory-promotion-hygiene-v0` suite with 4/4 fixtures. The underlying hygiene guard exists: distilled durable facts are accepted, raw heartbeat output and stale transient worktree/status chunks are rejected, and undistilled ideas require review.

Candidate added: `memory-promotion-covered-candidate-suppression-v0` in `docs/TASKS.md`.

Expected payoff: the research lane stops spending future cron turns on a covered memory hygiene guard and advances to the next unresolved Agent OS/self-learning signal.

Risk: low if limited to research-lane covered-candidate scoring; do not weaken the actual memory promotion classifier or readiness fixtures.

Verification evidence:

- `npm run self-evolution:research` selected `Long-term memory promotion hygiene check` with state `ready-small`.
- `npm run check:self-improvement-readiness` passed, including `memory-promotion-hygiene-v0` with 4/4 cases.
- Current repo status is `needs-local-work` because of existing uncommitted local files plus this docs-only backlog update.

Next action: implementation lane should tighten covered-candidate suppression for `memory-promotion-hygiene` so `npm run self-evolution:research -- --format=json` selects the next unresolved candidate while the existing readiness fixtures pass.

Implementation result: updated `scripts/self-evolution-research-lane.mjs` so covered signals are marked explicitly and skipped during candidate selection. The memory-promotion coverage predicate now also requires the stale-worktree rejection fixture, and the research report exposes `covered: true` for suppressed signals.

Verification:

- `node --check scripts/self-evolution-research-lane.mjs && node --check scripts/self-improvement-readiness.mjs` passed.
- `npm run self-evolution:research -- --format=json` returned `No self-evolution candidate` with all current signals marked `covered: true`.
- `npm run check:self-improvement-readiness` passed, including `memory-promotion-hygiene-v0` with 4/4 cases.

## 2026-07-02 - Credential-aware publish recovery eval

State: `implemented-local`

Result: `npm run self-evolution:research` selected `Credential-aware publish recovery eval` as the next high-leverage Agent OS/self-learning candidate. The signal is repeated push/credential friction: local work can be verified and useful while publish fails due to token sourcing or GitHub access, so the learning loop must classify that as `local-ready-push-blocked` with blocker `git-push`, not as failed work.

Candidate added: `credential-aware-publish-recovery-eval` in `docs/TASKS.md`.

Expected payoff: fewer false failure reports from isolated cron/learning lanes and less retry noise when GitHub publish is the only external blocker.

Risk: low if implemented as local deterministic fixtures only; no live push, no raw token reads, no credential changes.

Implemented: added `git-push-credential-policy-v0` fixtures to `scripts/self-improvement-readiness.mjs`. The guard accepts the Agent OS token/askpass wrapper, rejects stale plain shell credential-helper behavior, and keeps the existing failed-push readiness fixture that reports `local-ready-push-blocked` with blocker `git-push`.

Verification:

- `npm run check:self-improvement-readiness` passed, including `gitPushCredentialPolicy` with 3/3 cases passing and no failed fixture suites.
- `npm run evals:agent` passed with 8/8 cases and average `1`.

Next action: commit/publish through `npm run git:push`.

Follow-up: added covered-candidate suppression in `scripts/self-evolution-research-lane.mjs` for this implemented credential/push eval. The research lane now downgrades `push-or-credential-failure` when the task candidate, readiness fixtures, radar implementation evidence, and eval verification are all present.

Follow-up verification:

- `node --check scripts/self-evolution-research-lane.mjs` passed.
- `npm run self-evolution:research -- --format=json` now selects `Long-term memory promotion hygiene check`; `push-or-credential-failure` is downgraded to score `8.4` from raw `56`.
- `npm run check:self-improvement-readiness` passed all fixture suites; current repo status remains `needs-local-work` because this local patch is uncommitted.
- `npm run evals:agent` passed 8/8 with verdict `passing-baseline`.

## 2026-07-02 - Cron lane preflight covered-candidate suppression

State: `implemented-local`

Result: updated `scripts/self-evolution-research-lane.mjs` so the research lane recognizes `cron-lane-visibility-preflight-v0` as covered when the spec, script, package command, task candidate, and radar evidence are present. This prevents the lane from repeatedly selecting the already-shipped "Create a small spec before changing live cron jobs" next action.

Verification output:

- `node --check scripts/self-evolution-research-lane.mjs` passed.
- `npm run self-evolution:research -- --format=json` now selects `Credential-aware publish recovery eval`; `cron-or-heartbeat-friction` is downgraded to score `4.5` from raw `30`.
- `npm run check:self-improvement-readiness` passed all fixture suites; current repo status remains `needs-local-work` because this local patch is uncommitted.
- `npm run check:cron-lane-visibility -- --json` passed 4/4 fixtures.
- `npm run evals:agent` passed 8/8 with verdict `passing-baseline`.

Next action: scope the selected `Credential-aware publish recovery eval` before implementing anything broader.

## 2026-07-01 - Cron lane visibility preflight V0 spec

State: `ready-small`

Result: added `docs/CRON_LANE_VISIBILITY_PREFLIGHT.md` as the local/docs-first spec for auditing autonomous cron and heartbeat lanes before any live scheduler changes.

The spec defines the report shape for heartbeat, daily learning, self-evolution research, implementation, and briefing lanes. It keeps V0 bounded to existing docs/state/commands, requires explicit `no-action`, `safe-action-done`, `decision-needed`, and `blocked` outcomes, and forbids Telegram sends, live cron mutation, secrets, broad gateway/security changes, or new dashboard surfaces.

Verification output:

- `npm run self-evolution:research -- --format=json` selected `Cron lane visibility preflight` with state `ready-large` and next action `Create a small spec before changing live cron jobs`.
- `test -f docs/CRON_LANE_VISIBILITY_PREFLIGHT.md && rg "noiseOutcome|no-action|safe-action-done|decision-needed|blocked" docs/CRON_LANE_VISIBILITY_PREFLIGHT.md` passed.
- `node --check scripts/cron-lane-visibility-preflight.mjs` passed.
- `npm run check:cron-lane-visibility -- --json` passed 4/4 fixtures and emitted visible rows for heartbeat, daily-learning, research, implementation, and briefing lanes without Telegram sends or live cron changes.

Next action: keep this local until Felipe approves any live cron/scheduler or dashboard wiring; the dry-run command is now ready as `npm run check:cron-lane-visibility`.

## 2026-06-30 — Implementation lane stop: eval/readiness candidate still research

State: `research`

Evidence:

- `npm run self-evolution:research` returned `Eval or readiness gap follow-up` with state `research` at 2026-06-30T09:05:13Z.
- The lane output named the next action as: `Write one candidate task with acceptance criteria`.

Next action: keep the work at candidate-task scoping until the research lane returns `ready-small`; do not implement from this lane while the latest command output is `research`.

## 2026-06-30 — Research lane covered-candidate suppression

State: `ready-small`

Evidence:

- `npm run self-evolution:research` still selected `Eval or readiness gap follow-up` on 2026-06-30.
- `docs/TASKS.md` already contains `eval-readiness-gap-coverage` with acceptance criteria, guardrails, evidence, and bridge-free backlog shape.
- This radar already records `research-task-coverage-v0` as implemented locally for the scoped eval/readiness task coverage.

Hypothesis: extend the research lane closure/de-dup scoring beyond Felipe-correction candidates so covered eval/readiness candidates are downgraded when a matching `docs/TASKS.md` candidate and readiness guard evidence already exist.

Payoff: prevents the daily research cron from repeatedly resurfacing stale covered work and lets it select the next unresolved Agent OS/self-learning signal, such as tool-call approval receipts.

Risk: low if kept as a narrow scoring/check change with fixtures; no product code, external actions, secrets, or model/provider changes needed.

Verification: `npm run self-evolution:research` should no longer select `Eval or readiness gap follow-up` while `eval-readiness-gap-coverage` and `research-task-coverage-v0` evidence exist; `npm run check:self-improvement-readiness` should pass.

Result: added `researchTaskCoverageIsCovered()` to the research lane scoring. With `eval-readiness-gap-coverage`, `research-task-coverage-v0`, and radar implementation evidence present, `agent-eval-or-readiness` is now downgraded and the lane advances to `Cron lane visibility preflight`.

Verification output:

- `node --check scripts/self-evolution-research-lane.mjs` passed.
- `npm run self-evolution:research -- --format=json` selected `Cron lane visibility preflight`; `agent-eval-or-readiness` scored `4.5` from raw `30`.
- `npm run check:self-improvement-readiness` passed all fixture suites; current readiness remains `needs-local-work` because the worktree has uncommitted changes.

Next action: implementation lane adds a generic covered-candidate suppression helper plus one fixture for eval/readiness coverage de-dup.

## 2026-06-29 — Tool-call approval receipts, not just review queues

High-signal pattern: production HITL is moving from "approve the final answer" to "pause before the risky tool call, show the exact parameters, let the human approve/deny/edit, then resume the same run with an audit receipt."

Sources reviewed in this pass:

- n8n docs: human review can be attached to specific AI Agent tools; the workflow pauses before execution, routes approval through channels like Slack/Telegram/Gmail, shows `$tool.name` and `$tool.parameters`, then executes or cancels.
- LangGraph interrupts docs: graph execution can pause at arbitrary points, persist checkpoint state, surface JSON interrupt payloads, and resume with `Command(resume=...)`; docs explicitly cover approval/reject, review/edit state, and interrupts inside tools.
- Claude Code Agent SDK hooks docs: hooks provide deterministic callbacks around lifecycle events such as tool calls and stop events.
- OpenAI ChatGPT agent help: the agent can pause for clarification/confirmation and uses takeover mode for sensitive browser input, then tries to continue from prior workflow state.

Why this matters for Agent OS:

- Agent OS already has Inbox Radar and approval/review concepts, but the current model is mostly item-level review. The missing piece is a first-class **tool-call approval receipt**: exact intended tool, parameters, risk class, source run/session, reviewer decision, optional edited parameters, execution result, and resume cursor.
- This should stay inside Inbox Radar, not become another page. The useful UI is a compact "pending tool call" item with approve/deny/edit actions and a durable receipt after completion.
- This also closes a safety gap in proactive autonomy: Cai/OpenClaw can prepare high-value work, but any external/mutating action should have a deterministic gate that records what was approved, not merely "Felipe said ok" in chat.

Safe internal build candidate:

- Candidate state: `ready-small`.
- Add a bridge-free task candidate: `tool-call-approval-receipts-v0` in `docs/TASKS.md`.
- V0 should define the receipt schema and one fixture-driven check before wiring any live external action. No real sending, posting, deleting, purchasing, or secret-bearing tool calls.

Reference links:

- https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools.md
- https://docs.langchain.com/oss/python/langgraph/interrupts
- https://code.claude.com/docs/en/agent-sdk/hooks
- https://help.openai.com/en/articles/11752874-chatgpt-agent

## What strong agentic systems tend to have

Sources reviewed in this pass:

- MindStudio: agentic OS components — identity, short/long memory, skills/tools, planning, orchestration, handoffs, evaluation, guardrails.
- Microsoft Azure Architecture Center: orchestration patterns — direct model, single-agent-with-tools, multi-agent; sequential, concurrent, handoff/group patterns.
- HITL Agent Inbox docs: review inbox states, assignments, filters, bulk operations, analytics, access control.
- OpenAI ChatGPT agent announcement: unified research/action environment, multiple tool modes, connectors, virtual computer, interrupt/steer/pause/resume, asks permission before consequential actions.
- Microsoft STATE-Bench: stateful agent task evaluation benchmark focused on whether memory improves real multi-turn task outcomes, not just retrieval.

## Gap analysis vs current Agent OS / OpenClaw

### Already mostly covered

- Agent identity/context files: `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `PROACTIVE.md`, agent workspaces.
- Long-term memory: `MEMORY.md`, daily memory, QMD/session search, memory dreaming promotion.
- Tool/skill layer: OpenClaw tools + skills + allowed tool lists.
- Scheduling: OpenClaw cron, morning/evening briefs, proactive loop.
- Multi-agent execution: Cai + Charles + Sladdis + subagents.
- Guardrails: protected config paths, ask-first rules, tool policy, channel routing, read-only connector stance.
- Cockpit surfaces: Overview, Radar, Action Center, Knowledge, Runway, Vercel/Supabase/GitHub.

### Missing or weak

1. **Handoff documents between agents**
   - Workers currently return free-form summaries.
   - Better: standardized `handoff.json`/markdown shape: goal, files changed, decisions, blockers, tests, next suggested action.

2. **Eval/feedback loop**
   - We run lint/build, but there is no persistent quality feedback: “was this useful?”, repeated mistakes, regression notes.
   - Better: `Agent OS Evals` page + tiny feedback events table for completed tasks/briefs.

3. **Inbox Radar as Review Queue**
   - Knowledge has review states; Radar has signals; Action Center has actions.
   - Decision: do not create a separate Review page by default. Fold “needs Felipe approval/review” into Inbox Radar as one consolidated attention cockpit across drafts, outreach, risky actions, memory promotions, suggested tasks, generated PRDs and subagent handoffs.

4. **Runbook/workflow templates**
   - Skills exist at OpenClaw level, but Agent OS lacks user-visible workflow templates: “research competitor”, “turn email into task”, “prepare outreach draft”, “ship small UI fix”.
   - Better: reusable cockpit playbooks with allowed tools, ask-first boundaries, expected outputs.

5. **Pause/resume/steer UI for long work**
   - OpenClaw supports sessions/subagents/processes, but Agent OS UI could show running jobs with buttons: steer, pause/stop, summarize current progress.

6. **Cost/time/token visibility per run**
   - OpenClaw has status/session usage, but Agent OS cockpit does not yet expose cost/latency budget or “expensive task warning”.

7. **Proactive hypothesis backlog**
   - Cai now has a proactive loop, but Agent OS lacks a first-class backlog of “Cai noticed X, proposes Y because Z”.
   - Better: `Opportunity Radar` page: observed signal → proposed action → confidence → risk → status.

8. **Connector health SLAs**
   - We have degraded states per connector, but no “last good snapshot”, “stale since”, “noise/failure trend”, or recurring repair suggestion.

9. **Human preference model / decision log**
   - Memory has preferences, but UI lacks a decision ledger: “Felipe prefers X; source; confidence; last confirmed”.

## Recommended build order

### 1. Inbox Radar V2: attention + review + approvals

Why: this converts proactivity into safe autonomy without creating another dashboard silo. Cai can prepare things, but Felipe reviews one consolidated cockpit instead of chasing Telegram or checking yet another page.

V1:

- Extend Radar items with `kind`: `signal`, `review`, `approval`, `draft`, `handoff`, `task`
- Keep existing Radar state/actions: handled, snooze, create task, open source
- Add queue filters inside `/dashboard/radar`: All, Review, Approvals, Signals, Tasks
- Add central agent console: recommendation + explanation + “open Cai chat” path
- Add flow diagram explaining sources → classification → Cai/Felipe decision → receipts/state
- Later DB model can evolve from `radar_signals` into `inbox_items` without a separate route

### 2. Standard subagent handoff format

Status: V1 documented in `docs/AGENT_HANDOFF.md`.

Why: reduces lost context and makes orchestration more reliable.

V1 handoff fields:

- goal
- status
- owner
- finished at
- summary
- files changed
- commands run
- verification
- decisions made
- blockers / risks
- recommended next step

### 3. Opportunity Radar inside Inbox Radar

Why: this is the “Cai noticed something” surface, but it should not become a separate page unless it proves it needs one.

V1:

- represent opportunities as Radar `kind=signal` or `kind=review`
- include confidence + effort + risk in metadata
- action buttons: create task, dismiss/handled, ask Felipe, schedule follow-up

### 4. Runbook templates

Why: makes repeated work less chat-dependent.

V1 templates:

- Small Agent OS UI improvement
- Connector health repair
- Competitor/product research
- Draft outreach but do not send
- Turn meeting/email into task/follow-up

### 5. Feedback/evals

Why: teaches the system what was actually useful.

V1:

- thumbs up/down on briefs/tasks/proactive actions
- “too noisy / useful / wrong / risky” tags
- weekly summary of what to adjust

### 6. Memory eval harness, inspired by STATE-Bench

Why: most memory checks only prove recall works. Agent OS needs to know whether memory/proactivity changes outcomes: fewer repeated mistakes, fewer unnecessary turns, safer approvals, better task completion, lower cost.

High-signal pattern from Microsoft STATE-Bench:

- evaluate agents in stateful multi-turn scenarios with tools and a simulated user, not static Q&A
- score final state / task completion, reliability across repeated runs, cost/turn/tool efficiency, and UX/consent quality
- compare memory configurations by measuring behavior improvement, not retrieval accuracy alone

Safe internal V1 for Agent OS:

- create 10-20 local “Felipe cockpit” scenarios: convert inbox signal to task, prepare approval item, recover from stale connector, promote memory, reject unsafe external action
- run each scenario against fixed fixture state with memory enabled/disabled or old/new prompts
- score: task completed, approval safety, unnecessary messages/tool calls, uses known preferences correctly, avoids leaking private context
- surface the weekly result in Evals or Inbox Radar as “memory/proactivity regression check”

## OpenClaw vs Agent OS split

OpenClaw already provides primitives:

- agents
- tools
- cron
- memory
- sessions/subagents
- messaging
- config/permissions

Agent OS should provide the human cockpit layer:

- what needs attention
- what can be approved
- what is running
- what Cai recommends next
- why a recommendation exists
- what changed since last time

## Next candidate task

### 2026-06-28 — Eval/readiness gap guard scoping

State: `implemented-local`

Evidence:

- `npm run self-evolution:research` selected `Eval or readiness gap follow-up` with next action `Write one candidate task with acceptance criteria`.
- `docs/TASKS.md` already contains `eval-readiness-gap-coverage`, including acceptance criteria, guardrails, evidence, and a bridge-free backlog shape.
- Recent memory (`/root/.openclaw/workspace/memory/2026-06-27.md`) confirms the lane now avoids reopening the covered Felipe-correction candidate and should move to this eval/readiness gap.

Hypothesis: implement one narrow deterministic guard for a recurring readiness/eval gap, using the scoped `eval-readiness-gap-coverage` task as the boundary. The implementation lane should pick the exact failure mode before touching code and keep it local, fixture-based, and wired into `npm run verify` only after the standalone check passes.

Result: added `research-task-coverage-v0` to `scripts/self-improvement-readiness.mjs`. It has accept/reject fixtures for scoped eval/readiness task coverage and a real-doc assertion that `docs/TASKS.md` contains `eval-readiness-gap-coverage` with acceptance criteria, guardrails, evidence, a standalone command, and `npm run verify` wiring.

Verification:

- `npm run check:self-improvement-readiness` passes, including `research-task-coverage-v0` with 3/3 cases passing.
- `npm run verify` passes. The run reported one non-blocking lint warning in the untracked Remotion prototype (`ConnectionDiagram` unused), then `tsc --noEmit` completed.

Next action: commit this guard separately from the untracked Remotion prototype.

### 2026-06-27 — Self-evolution candidate de-dup and closure scoring

State: `implemented-local`

Evidence:

- `npm run self-evolution:research` still selected `Felipe correction follow-up` even though `docs/TASKS.md` now contains `felipe-correction-regression-guard` with acceptance criteria and this radar already records the QAA/Testbench positioning guard as implemented locally.
- The repeated output is now lower leverage than the original correction signal: the lane is missing a closure/de-dup rule that recognizes scoped, implemented, or already-backlogged candidates.
- Current repo signal: `scripts/self-evolution-research-lane.mjs` already discounts some covered failure modes, but not generic Felipe-correction follow-ups after a matching task or guard exists.

Hypothesis: teach the research lane to suppress or downgrade candidates that already have a matching `docs/TASKS.md` backlog item or a radar entry marked implemented/shipped, then choose the next unresolved signal.

Result: added a narrow `felipeCorrectionFollowUpIsCovered()` scoring guard in `scripts/self-evolution-research-lane.mjs` and a readiness check fixture named `research-lane-correction-dedup`.

Verification:

- `npm run self-evolution:research` now selects `Eval or readiness gap follow-up` instead of `Felipe correction follow-up` while `felipe-correction-regression-guard` and QAA guard evidence exist.
- `npm run check:self-improvement-readiness` passes with `research-lane-correction-dedup`.
- `npm run check:qaa-positioning` passes.

Next action: scope the new `Eval or readiness gap follow-up` candidate before any implementation work; do not touch QAA/Sladdis product copy or prototype assets.

### 2026-06-26 — Felipe correction follow-up scoping

State: `research`

Evidence:

- `npm run self-evolution:research` selected `Felipe correction follow-up` as the latest candidate from recent Felipe-correction signals.
- The candidate is not yet bounded: payoff is clear enough to preserve the signal, but risk and verification are still unknown until scoped.
- Attempting to persist the lane output with `npm run self-evolution:research -- --write=true` exposed a separate blocker: the default `reports/self-evolution-next.md` path cannot be written when `reports/` does not already exist.

Result: fixed the persistence issue by making the research lane create the output directory before writing. Verified with `npm run self-evolution:research -- --write=true` and `npm run check:self-improvement-readiness`.

Next action: write one concrete candidate task with acceptance criteria before implementation.

Named blocker: `candidate-not-scoped`; persistence blocker resolved.

### 2026-06-26 — QAA/Testbench positioning regression guard

State: `implemented-local`

Evidence:

- `npm run self-evolution:research` selected `Felipe correction follow-up` as the top candidate from recent memory, with six Felipe-correction signals.
- `memory/2026-06-25.md` records repeated corrections: QAA/Testbench is the workbench/system of record; Sladdis is the autonomous software-capable QA coworker; avoid framing it as generic AI testing, a chatbot, recorder, or dashboard.
- `/root/.openclaw/workspace/LESSONS.md` now has two relevant rules: `2026-06-24 — QAA positioning must not route through Agent OS` and `2026-06-25 — QAA/Testbench story must center the coworker-workbench loop`.
- Repo signal: current QAA Remotion prototype files are untracked/dirty, so an implementation guard should protect copy drift without editing the prototype in this research lane.

Hypothesis: add a small deterministic copy/positioning guard for QAA/Testbench public-facing docs and Remotion/storyboard text. It should flag forbidden framing such as QAA-as-Sladdis-memory/brain, visible Agent OS routing in QAA-facing material, "old AI testing" as the enemy, and generic chatbot/dashboard/recorder positioning unless explicitly used as contrast.

Result: added `scripts/qaa-positioning-guard.mjs`, wired `npm run check:qaa-positioning` into `npm run verify`, and covered both forbidden frames and allowed contrast examples with deterministic fixtures.

Verification:

- `npm run check:qaa-positioning`
- `npm run check:proactivity && npm run check:qaa-positioning && npm run check:self-improvement-readiness`
- `npm run self-evolution:research`

Remaining note: Agent OS still has pre-existing local prototype changes under `remotion/` plus `.gitignore`; keep them separate from this guard unless the prototype lane is intentionally committed.

### 2026-06-25 — Long-term memory promotion hygiene check

State: `ready-small`

Evidence:

- `npm run self-evolution:research` selected `Long-term memory promotion hygiene check` as the top candidate with payoff focused on preventing routine heartbeat, cron, and validation logs from being promoted into durable memory.
- Recent memory shows the same failure mode: `memory/2026-06-23.md` recorded noisy auto-promoted raw heartbeat/cron chunks and a stale push-blocker snapshot in `MEMORY.md`; `memory/2026-06-24.md` records cleanup of a raw auto-promoted heartbeat log under the 2026-06-23 memory-distillation rule.
- This is higher leverage than adding more self-evolution lane infrastructure because the lane now selects recent operational failures, and the current failure affects Cai's long-term context quality directly.

Hypothesis: add a small deterministic memory-promotion fixture or checklist that accepts distilled durable facts and rejects raw routine validation chunks, stale transient status, and heartbeat/cron log dumps.

Next action: implement in the implementation lane as a narrow readiness/eval guard, then verify with `npm run self-evolution:research` and `npm run check:self-improvement-readiness`.

### 2026-06-24 — Recency-weighted self-evolution candidate selection

State: `ready-small`

Evidence:

- `npm run self-evolution:research` still selected the generic `Autonomous self-evolution lane hardening` candidate, even though that lane is already implemented and readiness checks pass.
- Recent memory has higher-signal failures: noisy long-term memory promotion cleanup and the 2026-06-23 isolated cron/tooling issue where stale `toolsAllow` caused proactivity/cron failure while initial symptoms pointed elsewhere.
- `npm run check:self-improvement-readiness` reports `synced` and all self-improvement/autonomy-lane fixtures pass, so the next leverage is not more lane setup; it is better candidate ranking.

Hypothesis: `scripts/self-evolution-research-lane.mjs` should discount standing mandate/docs and prefer recent memory, Felipe corrections, and unresolved friction. This prevents the research lane from repeatedly resurfacing already-shipped infrastructure instead of the newest operational failure mode.

Next action: update the research script scoring in the implementation lane with source/recency weighting and a guard that suppresses already-shipped generic self-evolution setup when readiness is green. Verify with `npm run self-evolution:research` plus `npm run check:self-improvement-readiness`.

Follow-up implementation: added `scripts/cron-tool-policy-preflight.mjs` and `npm run check:cron-tool-policy` so fixture coverage catches cron payloads that mention file/repo/npm work but restrict `toolsAllow` to message-only before the failure shows up as a misleading file or cron error.

### Previous candidates

Continue Inbox Radar V2 rather than adding `/dashboard/review`.

Highest-leverage next step: wire producers into the new bridge-backed `inbox_items` endpoint so proactive loops and subagents can create approval/review items directly instead of only surfacing derived signals.

Progress: V1 persistence scaffold exists in the bridge (`GET/POST /inbox/items`) and Inbox Radar now reads active persisted items alongside derived signals. Producers now have a local bridge CLI helper at `scripts/create-inbox-item.mjs` for idempotently creating review/approval/task items without adding new dashboard surfaces.

New build candidate from 2026-05-25 scan: add a tiny memory/proactivity regression harness inspired by STATE-Bench, using local Agent OS fixtures and scoring outcome/reliability/cost/safety instead of retrieval accuracy.

Progress: V0 exists as `scripts/proactivity-regression-harness.mjs` with `npm run check:proactivity`. It uses 10 deterministic local fixtures for safe doc follow-up, external outreach approval, noise control, token-rotation sensitivity, missed-ticket checks, workflow feedback, durable artifact promotion, playbook/workflow separation, and eval-failure routing. This is a baseline guardrail, not a full agent evaluator yet.

Progress update: first-class Agent OS evals now exist as `docs/AGENT_EVALS.md`, `evals/agent-behavior-v0.json`, and `scripts/agent-evals.mjs` with `npm run evals:agent`. V0 covers recommendation quality, guardrail compliance, context usage, missed-context detection, and output format quality.

Operational note from 2026-05-26 proactive loop: Cai upserted this as persistent Inbox Radar task `cai-memory-proactivity-regression-harness`. The bridge now skips optional Inbox Radar index creation when the runtime DB role is not the table owner, avoiding the prior `must be owner of table inbox_items` failure.
