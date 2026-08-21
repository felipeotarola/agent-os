# Agent Time Tracking — Product and Technical Spec

Status: Draft for Felipe review
Owner: Cai
Working name: Agent Time Tracking (nickname: AgentTime)
Scope of this document: specification only; no implementation, migration, scheduler, or production mutation

## 1. Product thesis

Agent Time Tracking is an agent-first work ledger for Felipe. Cai is the primary interface: Felipe
reports what happened in ordinary language, Cai resolves the intended workday and creates an
auditable event, and Agent OS is the review, correction, and reporting surface.

The system should answer four questions reliably:

1. When and where did Felipe work?
2. Is a workday incomplete or ambiguous?
3. What work context or notes belong to that day?
4. What are the estimated billable hours, earnings, and work-related costs for a selected period?

It is not payroll, accounting, invoicing, or an employee-surveillance product. Financial values are
planning estimates until reconciled with Wint, invoices, receipts, or another accounting source.

## 2. Product principles

- **Agent-first, UI-verifiable:** Telegram/chat is the fastest input; Agent OS makes state visible and editable.
- **Events before totals:** store what Felipe said and the normalized event; derive daily totals from events.
- **Facts before inference:** source text, explicit fields, inferred fields, confidence, and corrections remain distinguishable.
- **One source of truth:** Supabase Postgres; no local JSON or Vercel fallback state.
- **Low burden:** one short acknowledgement when unambiguous; one focused question only when required.
- **Correctable and auditable:** corrections supersede earlier interpretations without erasing provenance.
- **Timezone-safe:** business dates use `Europe/Stockholm`; timestamps remain timezone-aware.
- **Private by default:** exact rates, earnings, locations, notes, and expenses are private operational data.

## 3. Core user workflows

### 3.1 Complete day in one message

Input: `Kom in 08:00, gick hem 15:30. Kontoret.`

Cai should:

1. Resolve the business date from message time in `Europe/Stockholm` unless Felipe names another day.
2. Create a work session with start `08:00`, end `15:30`, and location `office`.
3. Apply the configured break rule only if Felipe has approved one; otherwise report gross time and mark break as missing/not configured.
4. Reply with a compact receipt, for example: `Sparat idag: 08:00–15:30 · kontoret · 7 h 30 min brutto.`

### 3.2 Incremental check-in/check-out

- `Kom in 08:03, kontoret` creates an open session.
- `Gick hem 16:12` closes today's compatible open session.
- `Jobbar hemma idag, började 08:15` creates an open `home` session.
- `Tillbaka 13:00` may close an open break or start a second segment, depending on current state.

Cai must never silently close two possible sessions. If more than one candidate exists, ask which one.

### 3.3 Explicit date and correction

- `Igår jobbade jag hemma 08–16.` resolves yesterday in Stockholm.
- `I måndags gick jag 16:30, inte 15:30.` supersedes the previous end event.
- `Ta bort parkeringen i tisdags, jag cyklade.` voids the expense while retaining audit history.

Relative dates are resolved from the inbound message timestamp, not the time at which a background
worker happens to process it.

### 3.4 Work notes

Input: `Note idag: regressionsmöte med teamet och jobbade med bolåneflödet.`

Create a note linked to the workday. Notes are operational context, not automatically long-term
memory. A note may optionally link to a project/customer/task, but the system must not infer SBAB or
another sensitive project from vague text without sufficient context.

### 3.5 Expenses

- `Parkering 120 kr idag, kontoret.`
- `Tåg till Stockholm 340 kr igår.`
- `Lunch 145 kr` should not automatically be treated as deductible or reimbursable.

Cai records category, amount, currency, date, optional merchant/note, and receipt state. Tax,
deductibility, reimbursement, and VAT treatment remain `unknown` until configured or reconciled.

### 3.6 Review and close

At day or week level Felipe can confirm a draft period. Confirmation freezes the current derived
summary as a versioned snapshot; later corrections create a new version rather than rewriting the
confirmed snapshot invisibly.

## 4. Language and interpretation contract

### 4.1 Supported V1 intents

- `work.start`
- `work.stop`
- `work.session` (start and stop in one message)
- `work.break.start`
- `work.break.stop`
- `work.location`
- `work.note`
- `expense.add`
- `entry.correct`
- `entry.void`
- `period.review`

### 4.2 Explicit versus inferred fields

Every parsed command produces:

- `source_text` and source message/session identifiers
- `received_at`
- `business_date`
- normalized intent
- explicit fields supplied by Felipe
- inferred fields with per-field confidence and inference reason
- parser/contract version
- disposition: `applied`, `needs_confirmation`, `rejected`, or `duplicate`

Example: in `Kom in 08:00` the time is explicit; today's Stockholm date is inferred from the message
timestamp; location is absent and must remain absent unless a same-day context rule is safe.

### 4.3 Confirmation policy

Apply immediately when:

- date resolution is unambiguous;
- the event has exactly one compatible target state;
- no existing event conflicts; and
- the operation is reversible.

Ask one focused question when:

- AM/PM or date is ambiguous;
- the end precedes the start and an overnight shift was not explicit;
- multiple open sessions could be closed;
- a correction target is unclear;
- a currency or amount is unclear; or
- a financial rule would change earnings, tax, VAT, reimbursement, or deductibility.

Never invent a start/end time, break, location, rate, expense, or note.

### 4.4 Idempotency

Use source message ID plus normalized intent fingerprint as the idempotency key. Telegram retries,
cron retries, or repeated ingestion must not create duplicate sessions, expenses, or reminders.

## 5. Domain model

Prefer explicit relational tables for auditable facts and JSONB only for safe extensibility.

### `work_profiles`

One profile per person/work arrangement.

- `id`, `user_ref`, `timezone`, `currency`
- optional default workdays and expected start/end windows
- optional break policy reference
- status and timestamps

### `work_contexts`

Supports the current SBAB engagement and future work without hard-coding one employer.

- `id`, `profile_id`, `name`, `client`, `project_id`
- `valid_from`, `valid_to`, `status`
- private metadata

### `work_sessions`

- `id`, `profile_id`, `context_id`, `business_date`
- `started_at`, `ended_at`
- `location_type`: `office`, `home`, `client_site`, `travel`, `other`, `unknown`
- optional location label; avoid precise GPS in V1
- `status`: `open`, `complete`, `needs_review`, `voided`
- source/provenance, confidence, version, timestamps

Multiple sessions per day are allowed. Duration is derived, never manually duplicated as the
canonical fact.

### `work_breaks`

- `id`, `work_session_id`, `started_at`, `ended_at`
- `kind`, `source`, `status`, timestamps

Do not silently materialize statutory or assumed breaks until Felipe chooses a policy. A configured
default may be represented as a clearly labelled inferred break and remain editable.

### `work_notes`

- `id`, `profile_id`, `business_date`, optional `work_session_id`
- optional `context_id`, `project_id`, `task_id`
- `body`, tags, source/provenance, timestamps

### `work_expenses`

- `id`, `profile_id`, `business_date`, optional `work_session_id/context_id`
- category: `parking`, `travel`, `meal`, `equipment`, `other`
- amount in minor units, currency
- optional merchant, note, receipt reference
- reimbursement status and accounting status
- tax/VAT classification fields defaulting to `unknown`
- source/provenance, status, timestamps

### `work_rate_rules`

- `id`, `profile_id`, `context_id`, validity interval
- rate in minor units, currency, billing unit
- optional overtime/weekend rules only after explicit configuration
- VAT mode: `exclusive`, `inclusive`, `not_applicable`, `unknown`
- private visibility and timestamps

Rates must not be copied into chat logs, markdown, public GitHub, or client-visible UI payloads.

### `work_entry_events`

Append-only audit ledger:

- source message identity and source text or a privacy-preserving reference
- normalized intent and payload
- explicit/inferred field map and confidence
- action, target entity/version, actor, parser version, timestamps
- `supersedes_event_id` where applicable

### `work_period_reviews`

- `profile_id`, period start/end, status `draft|confirmed|reopened`
- versioned derived totals and validation warnings
- confirmation actor/time

### `work_reminder_state`

- stable reminder key, profile/date/type
- state `eligible|sent|answered|suppressed|expired`
- first/last eligible time, sent time, answer event, suppression reason

This prevents repeated nagging and makes reminder behaviour inspectable.

## 6. Derived calculations

### Time

- gross duration = sum of completed session durations
- break duration = sum of completed breaks
- net worked duration = gross minus breaks
- billable duration = net duration adjusted only by an explicit billing rule
- incomplete sessions never count as final billable hours

### Earnings

- estimated net revenue before VAT = billable duration × applicable rate rule
- VAT is shown separately when the rule is VAT-exclusive
- gross invoice estimate = revenue before VAT + VAT
- expenses are not automatically subtracted from salary, revenue, or tax
- optional contribution estimate = revenue before VAT − selected work expenses

All financial cards must say `Estimate` unless reconciled. Swedish payroll tax, employer
contributions, income tax, deductions, and company cash are out of V1; they require an explicit
accounting model and should not be inferred from invoice revenue.

### Parking and expenses

Show:

- total recorded expense
- reimbursed/unreimbursed split
- receipt missing count
- category totals

Do not label an expense deductible or VAT-recoverable without a configured, reviewable rule.

## 7. Reminder system

Use OpenClaw cron for precise, isolated eligibility checks. The cron should invoke a deterministic
checker; it should not contain the business logic in prompt text.

Proposed reminder classes:

1. **Missing check-in:** only on configured expected workdays, after a configurable grace window.
2. **Open session:** a start exists but no end after the expected departure window.
3. **Incomplete yesterday:** one morning reminder if the previous workday still needs review.
4. **Weekly review:** one prompt at the chosen weekly close time if the week is unconfirmed.

Guardrails:

- at most one active reminder per stable `(profile, business_date, type)` key;
- no reminders on configured leave/holiday/non-work days;
- suppress if calendar or explicit context says not working, once such integration is approved;
- a Telegram reply should resolve the underlying state and mark the reminder answered;
- quiet hours use Europe/Stockholm;
- reminders ask, never manufacture entries;
- cron creation/changes require a separate implementation approval and are observable in Agent OS.

Suggested message: `Jag saknar sluttid för idag. När slutade du?` with direct semantics for `16:30`,
`jobbade inte`, `påminn senare`, and `skit i den`.

## 8. Agent and API contract

Cai should receive narrow tools rather than broad SQL access:

- `worklog.get_day(date)`
- `worklog.record_event(source, parsed_event, idempotency_key)`
- `worklog.correct_entry(target, patch, reason)`
- `worklog.void_entry(target, reason)`
- `worklog.add_note(date, body, links)`
- `worklog.add_expense(date, amount, category, metadata)`
- `worklog.get_period(from, to)`
- `worklog.confirm_period(from, to, expected_version)`
- `worklog.get_reminder_eligibility(now)`
- `worklog.resolve_reminder(key, disposition)`

The bridge/backend owns database access, validation, authorization, idempotency, calculations, and
audit events. Vercel/UI reads scoped view models and sends narrow mutations. Edge Functions are
optional ingestion endpoints, not the system of record and not required for V1 if the bridge already
provides the secure agent path.

## 9. Agent OS information architecture

Add one first-class page: `/dashboard/time` with navigation title `Worklog` or `Time` (final name to
be chosen). Do not scatter this across Runway, Tasks, and Agent Notes.

Use existing design contracts:

- `PageContainer`
- theme tokens and shared `Card`, `Badge`, `Button`, `Tabs`, table/row primitives
- URL-backed views
- optional right context rail for the selected day or entry
- compact rows/tables, not one card per record

### Page views

1. **Today** — open/complete state, timeline, net/gross hours, location, notes, expenses, warnings.
2. **Week** — day rows, totals, missing entries, location split, review/confirm action.
3. **Month** — calendar/table, hours, estimated revenue, expenses, contribution estimate.
4. **Ledger** — searchable event/audit list and corrections.
5. **Settings** — workdays, reminder windows, break policy, contexts, rates, currency; sensitive values masked by default.

### Right rail

For a selected day show:

- source facts and inferred fields
- validation warnings
- edit/correct/void actions
- linked notes and expenses
- audit trail

### Cockpit integration

Only compact signals belong on Overview/Action Center:

- `Open session since 08:03`
- `Yesterday needs an end time`
- `Week: 31 h 20 min · 1 incomplete day`

No separate card sprawl and no exact rate/earnings in the general right rail by default.

## 10. Security, privacy, and audit

- Supabase RLS and server-side authorization must limit all worklog rows to Felipe/the intended profile.
- Service-role and management tokens remain server-side and never enter browser payloads or docs.
- Exact rates and earnings are private; logs should redact them.
- Store no GPS in V1; `office/home/other` is enough.
- Notes may contain client information; support redaction/voiding and avoid automatic long-term-memory promotion.
- Append-only event history records who changed what and why.
- Database migrations must have rollback guidance and backups; do not create tables ad hoc at runtime.
- Export should eventually support CSV, but formula-injection-safe escaping is required.

## 11. Phased delivery

### Phase 0 — decisions and fixtures

- settle name, break policy, reminder schedule, expected workdays, rate visibility, and V1 context;
- define Swedish natural-language fixtures and DST/date boundary cases;
- finalize schema and authorization contract.

### Phase 1 — reliable work ledger

- migrations, bridge tools, audit ledger;
- start/stop/full-session/location/correction flows;
- Today/Week UI and selected-day rail;
- no cron and no money required for initial acceptance.

### Phase 2 — reminders and notes

- deterministic reminder eligibility plus OpenClaw cron;
- Telegram response reconciliation;
- work notes and incomplete-day review.

### Phase 3 — expenses and estimates

- parking/travel/other expenses and receipt state;
- rate rules, estimated earnings, VAT-separated display;
- Month view and period confirmation.

### Phase 4 — integrations

- optional calendar-aware expected-workday suppression;
- Wint/invoice reconciliation only with a separate connector scope and approval;
- exports and trend insights.

## 12. V1 acceptance criteria

1. `Kom in 08:00, gick hem 15:30, kontoret` creates exactly one correct Stockholm workday.
2. Incremental start and stop messages reconcile to one session without duplicates.
3. `igår`, weekday references, midnight, DST start, and DST end have deterministic tests.
4. Ambiguous dates/times produce one focused question and no speculative row.
5. Corrections supersede earlier values while preserving provenance.
6. Multiple sessions and breaks produce correct gross, break, and net totals.
7. Missing end times are visible and excluded from confirmed billable totals.
8. Reminder eligibility is idempotent, quiet-hours aware, and sends at most once per key.
9. A reminder answer updates the workday and resolves the reminder.
10. Office/home/other and notes are visible in Today/Week views.
11. Expenses use integer minor units and never infer tax/VAT/deductibility.
12. Earnings are labelled estimates, rate-versioned, and VAT-separated.
13. Agent OS uses PageContainer, theme tokens, compact rows, and a useful selected-day rail.
14. RLS tests prove unauthenticated/cross-user reads and writes fail.
15. No secret, exact rate, or sensitive note appears in logs, docs, Git, or public payloads.

## 13. Outside-the-box opportunities

- **Commute-aware cost:** compare office-day parking/travel cost against home days without pretending this is tax advice.
- **Evidence completeness score:** show days that are complete, inferred, or awaiting confirmation.
- **Context recall:** before a weekly review, summarize work notes into a private draft suitable for invoice/supporting documentation.
- **Anomaly detection:** flag overlapping sessions, unusually long days, repeated missing exits, or expenses without office/travel context.
- **What changed?** show corrections since the last confirmed weekly snapshot.
- **Agent receipt language:** every mutation returns a human-readable receipt plus stable entry ID, making corrections easy (`ändra posten från igår`).
- **Future parking helper:** an office check-in may offer to record parking later, but must not infer that Felipe drove or paid.

## 14. Decisions required before implementation

1. Final product name and navigation label.
2. Expected workdays and normal reminder windows.
3. Break policy: explicit only, or a configurable default inference.
4. Whether V1 is only the current SBAB engagement or supports multiple contexts immediately.
5. Whether rate/earnings are shown by default or behind a private reveal control.
6. Whether parking should be manually entered only in V1.
7. Weekly review day/time.
8. Whether confirmed weeks may be edited directly or must be reopened first.

## 15. Recommended defaults

- Name: **Worklog** in navigation; “Agent Time Tracking” as feature description.
- V1 context: current engagement, but schema supports several contexts.
- Location: `office|home|other`; no GPS.
- Breaks: explicit until Felipe chooses a policy.
- Rates: private, masked by default, estimates only.
- Parking: manual input only.
- Week: Monday–Sunday, Europe/Stockholm.
- Confirmed periods: reopen before correction.
- Build order: ledger reliability first, reminders second, finance third.
