# Sladdis QA Vertical: Conversion Flow

Use this planned strategy when Felipe asks for CTA, form, checkout, booking, lead, signup, or conversion-flow testing.

## Goal

Determine whether a motivated visitor can complete the intended next step and where friction blocks conversion.

## Required Checks

- Primary and secondary CTA clarity.
- Path from landing page to conversion endpoint.
- Form labels, validation, errors, and success states.
- Required fields and input expectations.
- Trust signals near high-commitment actions.
- Safe negative tests that do not mutate live data.

## Report Rules

- Use the future `conversion-flow-report` template.
- Ask before submitting live forms, creating accounts, payments, bookings, or production records.
- Include exact reproduction steps and retest criteria.

## Output Shape

Return a `QaReport` with `vertical: "conversion-flow"` once the template is implemented.
