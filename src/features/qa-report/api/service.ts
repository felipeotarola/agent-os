import type { QaReport, QaReportVertical } from './types';

const qaReports: QaReport[] = [
  {
    vertical: 'ux-ui',
    customerSlug: 'lysande',
    customerName: 'Lysande',
    slug: 'homepage-review',
    title: 'Lysande UX smoke test',
    targetUrl: 'https://www.lysande.ai',
    generatedAt: '2026-06-10T09:30:00.000Z',
    agentName: 'Sladdis',
    reportType: 'Public QA report template',
    executiveSummary:
      'This public report format is designed for Sladdis website reviews: it gives a buyer-readable verdict, shows evidence, lists concrete defects, and turns the result into the next QA plan.',
    score: 82,
    verdict: 'Strong showcase candidate with a few conversion and mobile-risk checks to close.',
    scope: [
      'First-load impression',
      'Navigation and main call-to-action flow',
      'Mobile layout smoke pass',
      'Accessibility and trust signals',
      'Next useful test coverage'
    ],
    testRun: {
      build: 'public-site 2026-06-10',
      testPlan: 'Sladdis UX/UI smoke plan v1',
      executionType: 'Manual exploratory with browser evidence',
      startedAt: '09:10',
      completedAt: '09:24',
      result: 'warning',
      passed: 6,
      failed: 0,
      warnings: 4,
      notRun: 2,
      deviations: [
        'Production form submission was stopped at the mutation boundary.',
        'Accessibility checks were limited to smoke-level review in this run.'
      ],
      releaseReadiness:
        'Good enough as a public demo artifact after real screenshot assets are attached; not enough for conversion sign-off.',
      reviewer: 'Cai',
      signOff: 'Retest required before using this as final client evidence.'
    },
    traceability: [
      {
        requirement: 'Visitor understands the offer and primary next step',
        source: 'Homepage acceptance criterion',
        status: 'warning',
        testCases: ['TC-001', 'TC-002'],
        findings: ['QA-001'],
        notes:
          'Offer is understandable, but the CTA success state still needs a safe end-to-end pass.'
      },
      {
        requirement: 'Core content and controls fit small mobile screens',
        source: 'Responsive QA scope',
        status: 'warning',
        testCases: ['TC-003'],
        findings: ['QA-002'],
        notes: 'Mobile viewport pass is covered, with narrower breakpoints recommended for retest.'
      },
      {
        requirement: 'Basic accessibility can be verified and repeated',
        source: 'Accessibility smoke baseline',
        status: 'not-run',
        testCases: ['TC-004'],
        findings: ['QA-004'],
        notes: 'Reserved for the next automated accessibility pass.'
      }
    ],
    metrics: [
      {
        label: 'Findings',
        value: '5',
        detail: '1 high, 2 medium, 2 low'
      },
      {
        label: 'Evidence',
        value: '4',
        detail: 'Desktop and mobile screenshots'
      },
      {
        label: 'Suggested tests',
        value: '8',
        detail: 'Prioritized for the next run'
      },
      {
        label: 'Readiness',
        value: '82%',
        detail: 'Good for demo, needs retest'
      }
    ],
    environment: [
      {
        label: 'Browser',
        value: 'Chromium stable'
      },
      {
        label: 'Viewports',
        value: '1440, 768, 390'
      },
      {
        label: 'Run mode',
        value: 'Read-only exploratory'
      },
      {
        label: 'Auth state',
        value: 'Public visitor'
      },
      {
        label: 'Network',
        value: 'Default local profile'
      },
      {
        label: 'Mutation guard',
        value: 'No live submissions'
      }
    ],
    coverage: [
      {
        area: 'First impression',
        status: 'warning',
        coverage: 85,
        checks: 6,
        notes: 'Offer, CTA, and above-the-fold proof are covered by desktop and mobile screenshots.'
      },
      {
        area: 'Conversion flow',
        status: 'warning',
        coverage: 55,
        checks: 4,
        notes: 'CTA path is mapped, but final submission needs explicit approval before testing.'
      },
      {
        area: 'Responsive layout',
        status: 'warning',
        coverage: 70,
        checks: 5,
        notes: 'Mobile smoke checks are included; smallest viewport should be repeated after fixes.'
      },
      {
        area: 'Accessibility smoke',
        status: 'not-run',
        coverage: 35,
        checks: 3,
        notes: 'Keyboard and accessible-name checks are planned but not automated in this slice.'
      },
      {
        area: 'Trust and content',
        status: 'not-run',
        coverage: 45,
        checks: 4,
        notes: 'Useful for sales readiness, but needs a content-specific Sladdis pass.'
      },
      {
        area: 'Evidence quality',
        status: 'warning',
        coverage: 60,
        checks: 4,
        notes: 'Report links findings to evidence IDs; real screenshot assets are the next step.'
      }
    ],
    timeline: [
      {
        time: '09:10',
        title: 'Run initialized',
        detail: 'Sladdis receives the public URL, scope, and read-only guardrails.',
        status: 'passed'
      },
      {
        time: '09:12',
        title: 'Desktop walkthrough',
        detail: 'Homepage, visual hierarchy, proof, and primary CTA are inspected.',
        status: 'warning'
      },
      {
        time: '09:14',
        title: 'Mobile viewport pass',
        detail: 'Small-screen layout and navigation risks are captured for review.',
        status: 'warning'
      },
      {
        time: '09:18',
        title: 'Conversion path mapping',
        detail: 'CTA path is followed until a mutation-sensitive form or booking step.',
        status: 'warning'
      },
      {
        time: '09:24',
        title: 'Report assembled',
        detail: 'Findings, suggested test cases, and retest notes are prepared.',
        status: 'passed'
      }
    ],
    risks: [
      {
        label: 'Conversion confidence',
        level: 'high',
        score: 72,
        reason: 'Primary business flow needs safe end-to-end validation.'
      },
      {
        label: 'Mobile polish',
        level: 'medium',
        score: 58,
        reason: 'Responsive screenshots are required before marking the page demo-ready.'
      },
      {
        label: 'Accessibility baseline',
        level: 'medium',
        score: 44,
        reason: 'Keyboard and accessible-name checks are not automated yet.'
      },
      {
        label: 'Evidence durability',
        level: 'low',
        score: 36,
        reason: 'The report contract exists; persistent screenshot storage is still missing.'
      }
    ],
    evidence: [
      {
        id: 'hero-desktop',
        label: 'Homepage hero',
        viewport: '1440 x 1000',
        path: '/',
        capturedAt: '09:12',
        notes: 'Above-the-fold message and primary action visibility.'
      },
      {
        id: 'hero-mobile',
        label: 'Mobile first view',
        viewport: '390 x 844',
        path: '/',
        capturedAt: '09:14',
        notes: 'Checks content priority, text wrapping, and CTA reachability.'
      },
      {
        id: 'contact-flow',
        label: 'Contact path',
        viewport: '1440 x 1000',
        path: '/contact',
        capturedAt: '09:18',
        notes: 'Checks whether a motivated visitor can find the next step.'
      },
      {
        id: 'navigation-mobile',
        label: 'Mobile navigation',
        viewport: '390 x 844',
        path: '/',
        capturedAt: '09:20',
        notes: 'Menu discoverability and tap target scan.'
      }
    ],
    findings: [
      {
        id: 'QA-001',
        title: 'Primary conversion path needs a clearer success state',
        severity: 'high',
        status: 'warning',
        area: 'Conversion',
        summary:
          'A user can understand the offer, but the report should verify exactly what happens after the main CTA and whether the user gets confirmation.',
        expected:
          'The primary CTA leads to a clear next step with confirmation or scheduling feedback.',
        actual:
          'The current template marks the flow as requiring a full retest with form interaction.',
        reproductionSteps: [
          'Open the homepage.',
          'Click the primary call to action.',
          'Continue until the first form, booking, or contact confirmation appears.'
        ],
        recommendation:
          'Add this as a required Sladdis flow test with screenshots before and after submission.',
        retestNote: 'Retest with a safe test identity only after Felipe approves form submission.',
        evidenceId: 'contact-flow'
      },
      {
        id: 'QA-002',
        title: 'Mobile hero needs text-overflow and tap-target checks',
        severity: 'medium',
        status: 'warning',
        area: 'Responsive UX',
        summary:
          'The mobile first view is the highest-risk viewport for showcase pages because long Swedish or English claims can wrap into CTAs.',
        expected:
          'Headline, proof point, and CTA fit without overlap on 390px and 360px wide screens.',
        actual: 'Template requires mobile screenshots before marking this passed.',
        reproductionSteps: [
          'Open the page at 390px width.',
          'Repeat at 360px width.',
          'Inspect headline, CTA row, navigation, and first content transition.'
        ],
        recommendation:
          'Run the next Sladdis pass across 390px, 360px, and 768px widths and store screenshots.',
        retestNote:
          'Pass when the visual evidence shows no overlap and all primary controls are tappable.',
        evidenceId: 'hero-mobile'
      },
      {
        id: 'QA-003',
        title: 'Trust proof should be tested as a buyer objection',
        severity: 'medium',
        status: 'not-run',
        area: 'Content',
        summary:
          'For QA-agent sales pages, visitors need to quickly see proof, examples, limits, and how safe testing works.',
        expected:
          'The page explains what was tested, what was not tested, and why the recommendations are credible.',
        actual:
          'The current report page includes the structure, but the target website needs a content-specific pass.',
        reproductionSteps: [
          'Scan the first two sections.',
          'Identify claims that need evidence.',
          'Check whether examples or reports are linked near those claims.'
        ],
        recommendation:
          'Use this report URL as proof close to the QA-agent offer, not hidden in a footer.',
        retestNote: 'Retest after the first real Sladdis report is generated from browser evidence.'
      },
      {
        id: 'QA-004',
        title: 'Accessibility smoke checks should be automated',
        severity: 'low',
        status: 'not-run',
        area: 'Accessibility',
        summary:
          'The report should include repeatable checks for headings, landmarks, alt text, button names, focus order, and contrast.',
        expected:
          'Every Sladdis report includes a small accessibility checklist with pass, warning, or fail status.',
        actual:
          'This template reserves the section but does not run automated accessibility tooling yet.',
        reproductionSteps: [
          'Collect heading structure.',
          'Check keyboard tab order.',
          'Scan images and interactive controls for accessible names.'
        ],
        recommendation:
          'Add an accessibility smoke runner to Sladdis before publishing reports as client evidence.',
        retestNote: 'Pass when the report includes machine-readable accessibility results.'
      },
      {
        id: 'QA-005',
        title: 'Report needs durable screenshots from the agent run',
        severity: 'low',
        status: 'warning',
        area: 'Evidence',
        summary:
          'The public page works best when screenshots are saved as durable artifacts and attached to finding IDs.',
        expected:
          'Each important finding links to a screenshot, viewport, URL path, and timestamp.',
        actual:
          'This first slice renders evidence placeholders and the data contract for those assets.',
        reproductionSteps: [
          'Run Sladdis against the target URL.',
          'Capture screenshots for key paths and findings.',
          'Persist the assets and attach their IDs to report findings.'
        ],
        recommendation:
          'Store screenshot paths in the report payload so the public page can render real evidence.',
        retestNote:
          'Pass when evidence cards render real browser captures instead of placeholders.',
        evidenceId: 'hero-desktop'
      }
    ],
    suggestedTests: [
      {
        id: 'TC-001',
        title: 'Homepage first impression: offer, proof, and CTA understood in 10 seconds',
        priority: 'P0',
        area: 'UX',
        reason: 'This is the first buyer filter for a public QA-agent showcase.'
      },
      {
        id: 'TC-002',
        title: 'Primary CTA flow reaches a usable contact or booking endpoint',
        priority: 'P0',
        area: 'Conversion',
        reason: 'A qualified visitor must know exactly what to do next.'
      },
      {
        id: 'TC-003',
        title: 'Mobile navigation opens, closes, and preserves visible CTA access',
        priority: 'P1',
        area: 'Responsive',
        reason: 'Mobile prospects often arrive from social links.'
      },
      {
        id: 'TC-004',
        title: 'Keyboard-only smoke pass for navigation, CTA, and form controls',
        priority: 'P1',
        area: 'Accessibility',
        reason: 'Catches basic focus and naming issues before deeper audits.'
      },
      {
        id: 'TC-005',
        title: 'Broken link and missing asset scan across public pages',
        priority: 'P1',
        area: 'Reliability',
        reason: 'Fast automated signal with high credibility in a client report.'
      },
      {
        id: 'TC-006',
        title: 'Contact form validation and safe negative input test',
        priority: 'P2',
        area: 'Forms',
        reason: 'Finds friction without submitting production-changing data.'
      },
      {
        id: 'TC-007',
        title: 'Page title, meta description, and social preview smoke check',
        priority: 'P2',
        area: 'SEO',
        reason: 'Important for a website that is shared as a sales asset.'
      },
      {
        id: 'TC-008',
        title: 'Trust proof scan: testimonials, cases, privacy, and limits',
        priority: 'P3',
        area: 'Content',
        reason: 'Turns UX review into practical sales-page recommendations.'
      }
    ],
    nextRun: [
      'Replace template evidence with Sladdis browser screenshots.',
      'Add machine-readable result export for findings and test cases.',
      'Run the P0 and P1 test cases against desktop and mobile.',
      'Publish a second report URL after fixes to show before and after value.'
    ]
  }
];

export function getQaReport(slug: string): QaReport | undefined {
  return qaReports.find((report) => report.slug === slug);
}

export function getQaReportByVertical(vertical: string, slug: string): QaReport | undefined {
  return qaReports.find((report) => report.vertical === vertical && report.slug === slug);
}

export function getQaReportByCustomer(
  vertical: string,
  customerSlug: string,
  slug: string
): QaReport | undefined {
  return qaReports.find(
    (report) =>
      report.vertical === vertical && report.customerSlug === customerSlug && report.slug === slug
  );
}

export function getQaReportsByVertical(vertical: QaReportVertical): QaReport[] {
  return qaReports.filter((report) => report.vertical === vertical);
}

export function getQaReportsByCustomer(vertical: string, customerSlug: string): QaReport[] {
  return qaReports.filter(
    (report) => report.vertical === vertical && report.customerSlug === customerSlug
  );
}

export function getQaReports(): QaReport[] {
  return qaReports;
}
