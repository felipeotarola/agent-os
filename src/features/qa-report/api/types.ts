export type QaSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type QaStatus = 'passed' | 'warning' | 'failed' | 'not-run';

export type QaReportVertical =
  | 'ux-ui'
  | 'accessibility'
  | 'performance'
  | 'seo-content'
  | 'conversion-flow'
  | 'security-smoke';

export type QaStrategyStatus = 'active' | 'planned';

export interface QaStrategyDefinition {
  vertical: QaReportVertical;
  name: string;
  shortName: string;
  status: QaStrategyStatus;
  description: string;
  reportTemplate: string;
  agentInstructionsPath: string;
  triggerPhrases: string[];
  primaryQuestions: string[];
  defaultScope: string[];
}

export interface QaMetric {
  label: string;
  value: string;
  detail: string;
}

export interface QaFinding {
  id: string;
  title: string;
  severity: QaSeverity;
  status: QaStatus;
  area: string;
  summary: string;
  expected: string;
  actual: string;
  reproductionSteps: string[];
  recommendation: string;
  retestNote: string;
  evidenceId?: string;
}

export interface QaEvidence {
  id: string;
  label: string;
  viewport: string;
  path: string;
  imageUrl?: string;
  blobUrl?: string;
  capturedAt: string;
  notes: string;
}

export interface QaTestCase {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  area: string;
  reason: string;
}

export interface QaCoverageArea {
  area: string;
  status: QaStatus;
  coverage: number;
  checks: number;
  notes: string;
}

export interface QaTimelineEvent {
  time: string;
  title: string;
  detail: string;
  status: QaStatus;
}

export interface QaRiskArea {
  label: string;
  level: 'low' | 'medium' | 'high';
  score: number;
  reason: string;
}

export interface QaEnvironment {
  label: string;
  value: string;
}

export interface QaTestRunSummary {
  build: string;
  testPlan: string;
  executionType: string;
  startedAt?: string;
  completedAt?: string;
  result: QaStatus;
  passed: number;
  failed: number;
  warnings: number;
  notRun: number;
  deviations: string[];
  releaseReadiness: string;
  reviewer?: string;
  signOff?: string;
}

export interface QaRequirementTrace {
  requirement: string;
  source: string;
  status: QaStatus;
  testCases: string[];
  findings: string[];
  notes: string;
}

export interface QaReportTestStrategy {
  selectedScenarioReason: string;
  techniquesUsed: string[];
  decisionPolicy: string;
  knowledgeSources: string[];
  coverageGaps: string[];
  recommendedNextTest: string;
}

export interface QaReport {
  vertical: QaReportVertical;
  customerSlug: string;
  customerName: string;
  slug: string;
  title: string;
  targetUrl: string;
  generatedAt: string;
  agentName: string;
  reportType: string;
  executiveSummary: string;
  score: number;
  verdict: string;
  scope: string[];
  testRun?: QaTestRunSummary;
  traceability?: QaRequirementTrace[];
  testStrategy?: QaReportTestStrategy;
  metrics: QaMetric[];
  environment: QaEnvironment[];
  coverage: QaCoverageArea[];
  timeline: QaTimelineEvent[];
  risks: QaRiskArea[];
  evidence: QaEvidence[];
  findings: QaFinding[];
  suggestedTests: QaTestCase[];
  nextRun: string[];
}
