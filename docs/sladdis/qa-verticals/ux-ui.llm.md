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

## Report Rules

- Use the `ux-ui-report` template.
- Findings must include severity, status, area, expected result, actual result, reproduction steps, recommendation, evidence, and retest note.
- Suggested tests should be prioritized as P0-P3.
- Do not submit production forms, create accounts, spend money, or mutate live data without explicit approval.

## Output Shape

Return a `QaReport` with `vertical: "ux-ui"` and enough data to render `/qa-rapport/ux-ui/{slug}`.
