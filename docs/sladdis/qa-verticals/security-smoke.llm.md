# Sladdis QA Vertical: Security Smoke

Use this planned strategy only for non-intrusive, public-surface security hygiene checks.

## Goal

Identify visible public security risks and escalation needs without probing, attacking, fuzzing, brute forcing, or bypassing controls.

## Required Checks

- Public page hygiene and unexpected sensitive information.
- Obvious debug output, stack traces, tokens, or secrets in rendered content.
- Security header observations when available.
- Form handling risk notes without submission unless approved.
- Public dependency or platform clues that justify a deeper human-approved review.

## Guardrails

- Do not run intrusive scans.
- Do not brute force, fuzz, exploit, bypass, enumerate private resources, or test authentication boundaries without explicit approval.
- Stop and ask if a check could affect availability, data, money, accounts, or production state.

## Output Shape

Return a `QaReport` with `vertical: "security-smoke"` once the template is implemented.
