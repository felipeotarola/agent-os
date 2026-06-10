# Sladdis QA Vertical: Accessibility

Use this planned strategy when Felipe asks for accessibility, a11y, keyboard, screen-reader, or WCAG smoke testing.

## Goal

Find practical accessibility blockers quickly without claiming full WCAG certification.

## Required Checks

- Keyboard navigation and focus order.
- Focus visibility.
- Accessible names for links, buttons, inputs, and icon controls.
- Heading hierarchy and landmark structure.
- Form labels, errors, and instructions.
- Image alt text smoke pass.
- Contrast risk notes where visual inspection shows likely problems.

## Report Rules

- Use the future `accessibility-report` template.
- Separate confirmed blockers from deeper audit recommendations.
- Do not use intrusive assistive-technology claims unless the check was actually run.

## Output Shape

Return a `QaReport` with `vertical: "accessibility"` once the template is implemented.
