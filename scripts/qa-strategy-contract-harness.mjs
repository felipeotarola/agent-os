#!/usr/bin/env node

const activeTechniqueNames = new Set(['Exploratory testing', 'Visual regression review']);

const uxUiSetting = {
  vertical: 'ux-ui',
  decisionPolicy: 'ask-when-ambiguous',
  requireScreenshots: true
};

const baseReport = {
  vertical: 'ux-ui',
  customerSlug: 'poolio',
  customerName: 'Poolio',
  slug: 'homepage-ux-smoke',
  title: 'Poolio homepage UX smoke',
  targetUrl: 'https://poolio.example',
  generatedAt: '2026-06-14T09:40:00.000Z',
  agentName: 'Sladdis',
  reportType: 'UX/UI smoke',
  executiveSummary: 'Focused QA pass.',
  score: 78,
  verdict: 'warning',
  scope: ['Homepage'],
  testStrategy: {
    selectedScenarioReason: 'Felipe asked for a URL-driven UX/UI check.',
    techniquesUsed: ['Exploratory testing', 'Visual regression review'],
    decisionPolicy: 'ask-when-ambiguous',
    knowledgeSources: ['/dashboard/qa-knowledge'],
    coverageGaps: ['No authenticated flow tested.'],
    recommendedNextTest: 'Run the conversion-flow scenario after UX issues are fixed.'
  },
  metrics: [],
  environment: [],
  coverage: [],
  timeline: [],
  risks: [],
  evidence: [
    {
      id: 'hero-desktop',
      label: 'Hero desktop',
      viewport: '1440x900',
      path: '/',
      imageUrl: '/qa-evidence/poolio/hero-desktop.png',
      capturedAt: '2026-06-14T09:40:00.000Z',
      notes: 'Desktop pass.'
    }
  ],
  findings: [],
  suggestedTests: [],
  nextRun: []
};

const fixtures = [
  {
    id: 'rejects-missing-strategy',
    report: { ...baseReport, testStrategy: undefined },
    expectedPaths: ['testStrategy']
  },
  {
    id: 'rejects-wrong-decision-policy',
    report: {
      ...baseReport,
      testStrategy: { ...baseReport.testStrategy, decisionPolicy: 'auto-suggest' }
    },
    expectedPaths: ['testStrategy.decisionPolicy']
  },
  {
    id: 'rejects-empty-evidence-when-screenshots-required',
    report: { ...baseReport, evidence: [] },
    expectedPaths: ['evidence']
  },
  {
    id: 'rejects-each-placeholder-evidence-card',
    report: {
      ...baseReport,
      evidence: [
        ...baseReport.evidence,
        {
          id: 'mobile-viewport',
          label: 'Mobile viewport',
          viewport: '390x844',
          path: '/',
          capturedAt: '2026-06-14T09:40:00.000Z',
          notes: 'Placeholder without durable screenshot.'
        }
      ]
    },
    expectedPaths: ['evidence.mobile-viewport']
  },
  {
    id: 'accepts-corrected-evidence-card-with-blob-url',
    report: {
      ...baseReport,
      evidence: [
        ...baseReport.evidence,
        {
          id: 'mobile-viewport',
          label: 'Mobile viewport',
          viewport: '390x844',
          path: '/',
          blobUrl: 'https://blob.example/poolio/mobile-viewport.png',
          capturedAt: '2026-06-14T09:40:00.000Z',
          notes: 'Durable mobile screenshot.'
        }
      ]
    },
    expectedPaths: []
  }
];

function validateReport(report, setting) {
  const issues = [];
  const strategy = report.testStrategy;

  if (!strategy) {
    issues.push({
      path: 'testStrategy',
      code: 'required',
      message: 'testStrategy is required by the active QA Strategy config.'
    });
  }

  if (strategy) {
    if (strategy.decisionPolicy !== setting.decisionPolicy) {
      issues.push({
        path: 'testStrategy.decisionPolicy',
        code: 'invalid_value',
        message: `Expected decisionPolicy to match QA Strategy config: ${setting.decisionPolicy}.`
      });
    }

    if (!strategy.coverageGaps.length) {
      issues.push({
        path: 'testStrategy.coverageGaps',
        code: 'required',
        message: 'coverageGaps must include at least one explicit gap.'
      });
    }

    if (!strategy.recommendedNextTest.trim()) {
      issues.push({
        path: 'testStrategy.recommendedNextTest',
        code: 'required',
        message: 'recommendedNextTest is required by the active QA Strategy config.'
      });
    }

    strategy.techniquesUsed.forEach((technique, index) => {
      if (!activeTechniqueNames.has(technique)) {
        issues.push({
          path: `testStrategy.techniquesUsed.${index}`,
          code: 'invalid_value',
          message: `${technique} is not active in the QA Strategy config.`
        });
      }
    });
  }

  if (setting.requireScreenshots) {
    if (!report.evidence.length) {
      issues.push({
        path: 'evidence',
        code: 'required',
        message: `${report.vertical} requires screenshot evidence with imageUrl or blobUrl.`
      });
    }

    report.evidence
      .filter((evidence) => !evidence.imageUrl && !evidence.blobUrl)
      .forEach((evidence) => {
        issues.push({
          path: `evidence.${evidence.id}`,
          code: 'required',
          message: `${report.vertical} evidence "${evidence.label}" must include imageUrl or blobUrl.`
        });
      });
  }

  return issues;
}

function assertSamePaths(fixture, issues) {
  const actual = issues.map((issue) => issue.path).sort();
  const expected = [...fixture.expectedPaths].sort();
  if (JSON.stringify(actual) === JSON.stringify(expected)) return true;

  console.error(`FAIL ${fixture.id}`);
  console.error(`  expected: ${expected.join(', ') || '(none)'}`);
  console.error(`  actual:   ${actual.join(', ') || '(none)'}`);
  return false;
}

let failed = 0;
for (const fixture of fixtures) {
  const issues = validateReport(fixture.report, uxUiSetting);
  if (assertSamePaths(fixture, issues)) {
    console.log(`PASS ${fixture.id}`);
  } else {
    failed += 1;
  }
}

if (failed) {
  console.error(`QA strategy contract harness failed: ${failed}/${fixtures.length}`);
  process.exit(1);
}

console.log(`QA strategy contract harness passed: ${fixtures.length}/${fixtures.length}`);
