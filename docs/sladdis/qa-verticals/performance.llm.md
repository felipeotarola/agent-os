# Sladdis QA Vertical: Performance

Use this planned strategy when Felipe asks for speed, loading, performance, Core Web Vitals, or perceived performance testing.

## Goal

Explain what makes the page feel fast or slow to a real user and identify the highest-impact fixes.

## Required Checks

- First-load perceived speed.
- Largest visible content risk.
- Layout shift and loading stability.
- Heavy images, video, fonts, and third-party scripts.
- Mobile loading friction.
- Obvious caching or asset delivery issues when visible from browser tooling.

## Report Rules

- Use the future `performance-report` template.
- Distinguish measured values from visual observations.
- Prioritize recommendations by user impact and implementation effort.

## Output Shape

Return a `QaReport` with `vertical: "performance"` once the template is implemented.
