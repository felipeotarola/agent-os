# Sladdis QA Vertical: UX/UI

Use this strategy when Felipe asks for a UX test, UI test, design QA, visual QA, conversion UX review, or "UX AI test" of a website.

## Goal

Evaluate whether a first-time visitor can understand, trust, and act on the website without friction. Optimize for practical product, design, and conversion feedback rather than generic opinions.

## Required Checks

- First impression: offer clarity, audience fit, visual hierarchy, and above-the-fold CTA.
- Navigation: menu clarity, route labels, dead ends, and backtracking friction.
- Visual UI: spacing, alignment, contrast risk, typography rhythm, button clarity, and component consistency.
- Responsive UX: desktop, tablet when useful, and mobile at 390px plus one narrower viewport when risk is visible.
- Conversion path: primary CTA, contact/booking path, forms, confirmation states, and guardrails before live submissions.
- Trust: proof, examples, privacy cues, limits, credibility, and objection handling.
- Evidence: capture screenshots for every important finding and attach viewport, path, and timestamp.
- Test execution record: build/page version, test plan or acceptance criteria, execution window, pass/fail/warning/not-run totals, deviations from the plan, release-readiness, reviewer, and sign-off note.
- Traceability: map important requirements or acceptance criteria to test cases and finding IDs.

## Report Rules

- Use the `ux-ui-report` template.
- Findings must include severity, status, area, expected result, actual result, reproduction steps, recommendation, evidence, and retest note.
- Suggested tests should be prioritized as P0-P3.
- New reports should include `testRun` and `traceability` so the report proves what was executed, what was skipped or deviated from, and which requirements were covered.
- Do not submit production forms, create accounts, spend money, or mutate live data without explicit approval.

## Output Shape

Return a `QaReport` with `vertical: "ux-ui"` and enough data to render `/qa-rapport/ux-ui/{slug}`.
