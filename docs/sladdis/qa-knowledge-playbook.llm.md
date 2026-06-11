# Sladdis QA Knowledge Playbook

Use this before selecting or publishing a QA report.

## Source of Truth

Agent OS now has a private dashboard page:

```text
/dashboard/qa-knowledge
```

That page controls:

- which QA techniques are active
- which techniques map to each QA vertical
- scenario priority
- when Sladdis should ask Felipe before running a scenario
- how old an existing report can be before Sladdis recommends a retest
- which strategy fields must be included in new report payloads

Do not treat this playbook as a fixed hard-coded list forever. The dashboard config is the operator-controlled policy.

## Decision Flow

When Felipe sends a URL or says "test this":

1. Check available QA scenarios on `/qa-rapport`.
2. Check existing reports for the same domain/customer.
3. Compare the request against the private QA Strategy config.
4. If Felipe named a scenario, use that scenario unless it conflicts with safety rules.
5. If the request is ambiguous, follow the scenario policy:
   - `auto-suggest`: recommend the best scenario and explain why.
   - `ask-when-ambiguous`: ask Felipe which scenario to run and suggest the best default.
   - `ask-before-running`: do not run until Felipe approves the scenario.
6. If a same-domain report already exists, mention it and recommend either a retest or a complementary scenario.
7. Publish strategy metadata with the report.

## Core Techniques

- Risk-based testing: choose by impact, likelihood, user exposure, and confidence needed.
- Exploratory session-based testing: use a focused charter, timebox, notes, evidence, and follow-up questions.
- Nielsen UX heuristics: use for UX/UI, demo readiness, visual hierarchy, navigation, and CTA clarity.
- WCAG 2.2 smoke: use for keyboard access, labels/names, focus order, headings, contrast risk, and target-size risk.
- Equivalence partitioning and boundary values: use for forms, inputs, filters, booking, checkout, and validation.
- Decision tables: use when outcomes depend on combinations of conditions.
- State transition testing: use for multi-step flows, auth, booking, checkout, retry, cancel, and confirmation states.
- Core Web Vitals smoke: use for perceived speed, layout stability, heavy assets, and mobile loading friction.
- OWASP WSTG non-intrusive baseline: use for safe public security observations only.
- SEO/content intent review: use for metadata, headings, search intent, trust proof, copy clarity, and link clarity.

## Report Strategy Fields

New reports should include:

```json
{
  "testStrategy": {
    "selectedScenarioReason": "Why this QA vertical was selected.",
    "techniquesUsed": ["Risk-based testing", "Exploratory session-based testing"],
    "decisionPolicy": "ask-when-ambiguous",
    "knowledgeSources": ["Agent OS QA Strategy", "ISTQB CTFL v4.0"],
    "coverageGaps": ["What was not covered and still matters."],
    "recommendedNextTest": "The best next QA scenario or retest."
  }
}
```

## Safety Rules

- Security smoke is non-intrusive unless Felipe explicitly approves deeper testing.
- Never submit production forms, payments, bookings, or destructive actions without explicit approval.
- Screenshots should be durable `imageUrl` or `blobUrl` assets whenever screenshots were captured.
- When the active QA Strategy requires screenshots, every report evidence card must have a real screenshot asset. Do not create placeholder evidence cards for pages or viewports that Sladdis did not capture.
- If confidence is low, say that and ask. Do not make a report look more certain than the run deserves.
