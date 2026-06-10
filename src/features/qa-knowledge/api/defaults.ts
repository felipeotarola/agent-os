import { qaStrategies } from '@/features/qa-report/api/strategies';
import type { QaReportVertical } from '@/features/qa-report/api/types';
import type { QaKnowledgeConfig, QaTechnique, QaVerticalKnowledgeSetting } from './types';

export const qaTechniques: QaTechnique[] = [
  {
    id: 'risk-based-testing',
    name: 'Risk-based testing',
    category: 'strategy',
    summary:
      'Prioritize checks by business impact, likelihood of failure, user exposure, and confidence needed before sharing or shipping.',
    useWhen: [
      'Felipe gives Sladdis only a URL or an ambiguous test request.',
      'A customer/demo link needs fast but defensible coverage.',
      'There are existing reports and Sladdis must choose the next best test.'
    ],
    evidence: [
      'Selected scenario reason',
      'Known coverage gaps',
      'Recommended next test',
      'Staleness of previous reports'
    ],
    sources: [
      {
        title: 'ISTQB CTFL v4.0',
        url: 'https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/',
        note: 'Foundation model for test analysis, design, and risk-aware test activity management.'
      }
    ]
  },
  {
    id: 'exploratory-session',
    name: 'Exploratory session-based testing',
    category: 'strategy',
    summary:
      'Use a focused charter, timebox, notes, screenshots, and follow-up questions instead of pretending every unknown site has a complete test plan.',
    useWhen: [
      'A site is new, unfamiliar, or changing quickly.',
      'UX, content, or conversion risks are more important than strict pass/fail cases.',
      'Sladdis needs to find issues and learn the product at the same time.'
    ],
    evidence: ['Session charter', 'Timeline notes', 'Screenshots', 'Open questions'],
    sources: [
      {
        title: 'ISTQB CTFL v4.0',
        url: 'https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/',
        note: 'Experience-based techniques complement black-box and white-box techniques.'
      }
    ]
  },
  {
    id: 'nielsen-heuristics',
    name: 'Nielsen UX heuristics',
    category: 'ux',
    summary:
      'Review visibility, language fit, control, consistency, error prevention, recognition, efficiency, minimalism, recovery, and help.',
    useWhen: [
      'The request is UX/UI, demo readiness, visual QA, or first-impression review.',
      'The page has unclear navigation, dense copy, weak CTA hierarchy, or trust issues.',
      'A buyer-readable report needs concrete UX rationale.'
    ],
    evidence: [
      'Annotated screenshots',
      'Heuristic label per finding',
      'Expected vs actual UX impact'
    ],
    sources: [
      {
        title: 'Nielsen Norman Group: 10 Usability Heuristics',
        url: 'https://www.nngroup.com/articles/ten-usability-heuristics/',
        note: 'Practical heuristic baseline for interface review.'
      }
    ]
  },
  {
    id: 'wcag-22-smoke',
    name: 'WCAG 2.2 accessibility smoke',
    category: 'accessibility',
    summary:
      'Check keyboard access, focus visibility, names/labels, headings, target size risk, contrast risk, and predictable interaction.',
    useWhen: [
      'The site is public, customer-facing, or should be usable without a mouse.',
      'Sladdis sees forms, menus, dialogs, carousels, or custom controls.',
      'A previous UX report did not cover accessibility.'
    ],
    evidence: [
      'Keyboard path notes',
      'Failing element selector or label',
      'Screenshot or DOM note'
    ],
    sources: [
      {
        title: 'W3C WCAG 2.2',
        url: 'https://www.w3.org/TR/WCAG22/',
        note: 'Current W3C recommendation for web accessibility success criteria.'
      }
    ]
  },
  {
    id: 'equivalence-boundary',
    name: 'Equivalence partitions and boundary values',
    category: 'functional',
    summary:
      'Group similar inputs and test edges where validation usually breaks: empty, minimum, maximum, invalid format, and realistic valid values.',
    useWhen: [
      'The site has forms, calculators, booking, checkout, search, filters, or onboarding.',
      'Sladdis needs better test cases than one happy path.',
      'The report should explain why specific inputs were chosen.'
    ],
    evidence: [
      'Input table',
      'Expected validation',
      'Actual validation',
      'Screenshots for failures'
    ],
    sources: [
      {
        title: 'ISTQB CTFL v4.0',
        url: 'https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/',
        note: 'Black-box test design techniques for deriving test cases from requirements and behavior.'
      }
    ]
  },
  {
    id: 'decision-table',
    name: 'Decision tables',
    category: 'functional',
    summary:
      'Map conditions to outcomes so Sladdis tests combinations instead of randomly clicking through complex rules.',
    useWhen: [
      'Rules depend on multiple choices, plan tiers, eligibility, shipping, pricing, or account state.',
      'A flow has several conditional branches.',
      'The expected result changes by user type or input combination.'
    ],
    evidence: ['Condition/action table', 'Covered combinations', 'Untested combinations'],
    sources: [
      {
        title: 'ISTQB CTFL v4.0',
        url: 'https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/',
        note: 'Black-box combination technique for business-rule coverage.'
      }
    ]
  },
  {
    id: 'state-transition',
    name: 'State transition testing',
    category: 'functional',
    summary:
      'Check that flows move through valid states and reject invalid jumps, especially around auth, checkout, bookings, and confirmations.',
    useWhen: [
      'A user can start, pause, cancel, retry, submit, confirm, or return to a flow.',
      'The page has modals, multi-step forms, login state, payment state, or booking state.',
      'Regression risk is about broken flow order rather than visual polish.'
    ],
    evidence: ['State map', 'Transition tested', 'Invalid transition result'],
    sources: [
      {
        title: 'ISTQB CTFL v4.0',
        url: 'https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/',
        note: 'Black-box model for behavior that depends on previous state.'
      }
    ]
  },
  {
    id: 'core-web-vitals-smoke',
    name: 'Core Web Vitals smoke',
    category: 'performance',
    summary:
      'Look for slow first useful render, unstable layout, heavy media, blocking scripts, and mobile loading friction.',
    useWhen: [
      'The site feels slow or media-heavy.',
      'A public campaign/demo page needs loading confidence.',
      'A previous UX report flagged visual or perceived speed friction.'
    ],
    evidence: [
      'Measured or observed loading notes',
      'Asset suspects',
      'Viewport-specific screenshots'
    ],
    sources: [
      {
        title: 'web.dev: Core Web Vitals',
        url: 'https://web.dev/vitals/',
        note: 'User-centered loading, responsiveness, and visual stability metrics.'
      }
    ]
  },
  {
    id: 'owasp-wstg-baseline',
    name: 'OWASP WSTG non-intrusive baseline',
    category: 'security',
    summary:
      'Run only safe public observations unless Felipe explicitly approves deeper testing: headers, exposed data, public form risk, and obvious misconfiguration clues.',
    useWhen: [
      'The scenario is security-smoke.',
      'A public website has forms, login, uploads, account pages, or third-party integrations.',
      'Sladdis needs to separate safe observations from tests that require approval.'
    ],
    evidence: [
      'Observation type',
      'Non-intrusive method',
      'Escalation boundary',
      'Recommended owner action'
    ],
    sources: [
      {
        title: 'OWASP Web Security Testing Guide',
        url: 'https://owasp.org/www-project-web-security-testing-guide/',
        note: 'Reference framework for web app security testing practices.'
      }
    ]
  },
  {
    id: 'seo-content-intent',
    name: 'SEO and content intent review',
    category: 'content',
    summary:
      'Check whether metadata, headings, internal links, page promise, objections, and proof match what the visitor/searcher expects.',
    useWhen: [
      'The request is SEO/content QA or sales-page readiness.',
      'The page has weak headings, vague copy, unclear offer, or poor trust proof.',
      'A customer/demo report should include copy fixes, not only bugs.'
    ],
    evidence: ['Title/meta notes', 'Heading hierarchy', 'Copy gap', 'Suggested rewrite direction'],
    sources: [
      {
        title: 'Google Search Central: SEO Starter Guide',
        url: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide',
        note: 'Baseline guidance for crawlable, understandable, useful web content.'
      }
    ]
  }
];

const defaultTechniqueIdsByVertical: Record<QaReportVertical, string[]> = {
  'ux-ui': ['risk-based-testing', 'exploratory-session', 'nielsen-heuristics'],
  accessibility: ['risk-based-testing', 'wcag-22-smoke'],
  performance: ['risk-based-testing', 'core-web-vitals-smoke'],
  'seo-content': ['risk-based-testing', 'seo-content-intent'],
  'conversion-flow': [
    'risk-based-testing',
    'exploratory-session',
    'equivalence-boundary',
    'decision-table',
    'state-transition'
  ],
  'security-smoke': ['risk-based-testing', 'owasp-wstg-baseline']
};

export function buildDefaultVerticalSettings(): QaVerticalKnowledgeSetting[] {
  return qaStrategies.map((strategy) => ({
    vertical: strategy.vertical,
    priority: strategy.status === 'active' ? 'high' : 'medium',
    decisionPolicy:
      strategy.vertical === 'security-smoke' ? 'ask-before-running' : 'ask-when-ambiguous',
    techniqueIds: defaultTechniqueIdsByVertical[strategy.vertical],
    staleAfterDays: strategy.vertical === 'ux-ui' ? 30 : 60,
    requireScreenshots: true
  }));
}

export function buildDefaultQaKnowledgeConfig(): QaKnowledgeConfig {
  return {
    activeTechniqueIds: qaTechniques.map((technique) => technique.id),
    verticalSettings: buildDefaultVerticalSettings(),
    requireStrategyInReports: true,
    requireCoverageGaps: true,
    requireRecommendedNextTest: true,
    updatedAt: new Date().toISOString()
  };
}
