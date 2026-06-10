import type { QaReportVertical, QaStrategyDefinition } from './types';

export const qaStrategies: QaStrategyDefinition[] = [
  {
    vertical: 'ux-ui',
    name: 'UX and UI website test',
    shortName: 'UX/UI',
    status: 'active',
    description:
      'Exploratory website review focused on first impression, visual hierarchy, responsive layout, navigation, conversion clarity, trust signals, and practical user friction.',
    reportTemplate: 'ux-ui-report',
    agentInstructionsPath: 'docs/sladdis/qa-verticals/ux-ui.llm.md',
    triggerPhrases: [
      'ux ai test',
      'ux test',
      'ui test',
      'ux/ui test',
      'website ux review',
      'design qa',
      'visual qa',
      'conversion ux test'
    ],
    primaryQuestions: [
      'Can a first-time visitor understand what this website offers within a few seconds?',
      'Is the primary action visually clear and reachable on desktop and mobile?',
      'Do layout, spacing, hierarchy, copy, and trust signals support the intended conversion?',
      'Which UX or UI issues should be fixed before the next public share or campaign?'
    ],
    defaultScope: [
      'First-load impression',
      'Visual hierarchy and scanability',
      'Navigation and primary CTA path',
      'Mobile and responsive layout',
      'Forms and conversion friction',
      'Trust signals, copy clarity, and proof',
      'Screenshot-backed findings and retest notes'
    ]
  },
  {
    vertical: 'accessibility',
    name: 'Accessibility smoke test',
    shortName: 'A11y',
    status: 'planned',
    description:
      'Website pass focused on keyboard access, semantic structure, accessible names, focus order, contrast risk, and basic screen-reader readiness.',
    reportTemplate: 'accessibility-report',
    agentInstructionsPath: 'docs/sladdis/qa-verticals/accessibility.llm.md',
    triggerPhrases: [
      'accessibility test',
      'a11y test',
      'screen reader test',
      'keyboard test',
      'wcag smoke test'
    ],
    primaryQuestions: [
      'Can the important flows be reached and used without a mouse?',
      'Do interactive controls have clear accessible names?',
      'Does the page structure make sense through headings, landmarks, and labels?',
      'Which accessibility issues should be fixed before deeper WCAG validation?'
    ],
    defaultScope: [
      'Keyboard navigation',
      'Focus visibility and order',
      'Accessible names for controls',
      'Heading and landmark structure',
      'Image alt text smoke pass',
      'Contrast risk scan',
      'Retest checklist for accessibility fixes'
    ]
  },
  {
    vertical: 'performance',
    name: 'Performance and loading test',
    shortName: 'Performance',
    status: 'planned',
    description:
      'Website pass focused on perceived speed, page weight, loading sequence, visual stability, expensive assets, and user-visible performance friction.',
    reportTemplate: 'performance-report',
    agentInstructionsPath: 'docs/sladdis/qa-verticals/performance.llm.md',
    triggerPhrases: [
      'performance test',
      'speed test',
      'loading test',
      'core web vitals test',
      'slow website test'
    ],
    primaryQuestions: [
      'Does the page become useful quickly on desktop and mobile?',
      'Which assets or scripts create visible loading friction?',
      'Are important elements stable while the page loads?',
      'Which performance fixes are most likely to improve user experience?'
    ],
    defaultScope: [
      'First-load timing impression',
      'Largest visible content risk',
      'Layout shift and loading stability',
      'Image and media weight scan',
      'Third-party script friction',
      'Mobile loading notes',
      'Prioritized performance fix list'
    ]
  },
  {
    vertical: 'seo-content',
    name: 'SEO and content QA',
    shortName: 'SEO/content',
    status: 'planned',
    description:
      'Website pass focused on indexable basics, metadata, headings, link clarity, content intent, social sharing readiness, and trust-building copy.',
    reportTemplate: 'seo-content-report',
    agentInstructionsPath: 'docs/sladdis/qa-verticals/seo-content.llm.md',
    triggerPhrases: [
      'seo test',
      'content qa',
      'metadata test',
      'search visibility test',
      'copy qa'
    ],
    primaryQuestions: [
      'Can search engines and people understand the page topic quickly?',
      'Are titles, descriptions, headings, and links aligned with the offer?',
      'Does the copy answer the visitor objections that block action?',
      'Which content fixes should be made before outreach or launch?'
    ],
    defaultScope: [
      'Title and meta description',
      'Heading hierarchy',
      'Internal and external link clarity',
      'Social preview readiness',
      'Search intent fit',
      'Trust and proof copy',
      'Content improvement backlog'
    ]
  },
  {
    vertical: 'conversion-flow',
    name: 'Conversion flow test',
    shortName: 'Conversion',
    status: 'planned',
    description:
      'Website pass focused on user intent, CTA clarity, form or booking flow friction, validation states, confirmation states, and safe end-to-end conversion testing.',
    reportTemplate: 'conversion-flow-report',
    agentInstructionsPath: 'docs/sladdis/qa-verticals/conversion-flow.llm.md',
    triggerPhrases: [
      'conversion test',
      'cta test',
      'form test',
      'booking flow test',
      'lead flow test'
    ],
    primaryQuestions: [
      'Can a motivated visitor complete the intended next step?',
      'Where does the conversion path create hesitation, confusion, or dead ends?',
      'Do forms explain errors and success states clearly?',
      'Which conversion issues should be fixed before sending paid or sales traffic?'
    ],
    defaultScope: [
      'CTA visibility and wording',
      'Path from landing page to conversion endpoint',
      'Form labels and validation',
      'Error and success states',
      'Trust signals near conversion',
      'Safe submission guardrails',
      'Retest script for conversion fixes'
    ]
  },
  {
    vertical: 'security-smoke',
    name: 'Security smoke test',
    shortName: 'Security',
    status: 'planned',
    description:
      'Non-intrusive website pass focused on visible security hygiene, unsafe exposure signals, form handling risk, dependency or header clues, and clear escalation boundaries.',
    reportTemplate: 'security-smoke-report',
    agentInstructionsPath: 'docs/sladdis/qa-verticals/security-smoke.llm.md',
    triggerPhrases: [
      'security smoke test',
      'safe security test',
      'website security qa',
      'headers test',
      'non intrusive security test'
    ],
    primaryQuestions: [
      'Are there visible public security hygiene issues?',
      'Do forms or public pages expose risky clues or sensitive data?',
      'Which findings require a human-approved deeper security review?',
      'What can be checked safely without intrusive probing?'
    ],
    defaultScope: [
      'Public page hygiene',
      'Security header observation',
      'Sensitive data exposure scan',
      'Form handling risk notes',
      'Dependency and platform clues',
      'Strict non-intrusive guardrails',
      'Escalation list for approved testing'
    ]
  }
];

export function getQaStrategy(vertical: string): QaStrategyDefinition | undefined {
  return qaStrategies.find((strategy) => strategy.vertical === vertical);
}

export function isQaReportVertical(vertical: string): vertical is QaReportVertical {
  return qaStrategies.some((strategy) => strategy.vertical === vertical);
}
