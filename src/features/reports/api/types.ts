export type ReportStatus = 'passed' | 'warning' | 'failed' | 'in_progress' | 'not_run';

export type ReportSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ReportPriority = 'critical' | 'high' | 'medium' | 'low';

export type ReportEffort = 'high' | 'medium' | 'low';

export type ReportEvidenceType =
  | 'screenshot'
  | 'image'
  | 'log'
  | 'metric'
  | 'table'
  | 'json'
  | 'link';

export interface ReportAction {
  label: string;
  href?: string;
  disabled?: boolean;
}

export interface ReportMetric {
  label: string;
  value: string;
  detail?: string;
}

export interface ReportCategory {
  id: string;
  name: string;
  score?: number;
  status: ReportStatus;
  summary?: string;
  trend?: string;
  checks?: number;
}

export interface ReportEvidence {
  id: string;
  type: ReportEvidenceType;
  title: string;
  description?: string;
  url?: string;
  path?: string;
  capturedAt?: string;
  metadata?: Record<string, string>;
  data?: unknown;
}

export interface ReportFinding {
  id: string;
  title: string;
  severity: ReportSeverity;
  category: string;
  status?: ReportStatus;
  description: string;
  whyItMatters?: string;
  suggestedFix?: string;
  affectedArea?: string;
  impact?: ReportEffort;
  effort?: ReportEffort;
  evidenceIds?: string[];
  tags?: string[];
}

export interface ReportRecommendation {
  id: string;
  title: string;
  priority: ReportPriority;
  problem?: string;
  action: string;
  expectedImpact?: string;
  effort?: ReportEffort;
  relatedFindingIds?: string[];
  owner?: string;
  status?: ReportStatus;
}

export interface ReportChecklistItem {
  id: string;
  title: string;
  category?: string;
  priority?: ReportPriority;
  status: 'todo' | 'passed' | 'failed' | 'not_applicable';
  notes?: string;
  evidenceId?: string;
}

export interface ReportRunDetail {
  label: string;
  value: string;
}

export interface ReportTraceabilityItem {
  id: string;
  requirement: string;
  source?: string;
  status: ReportStatus;
  testCaseIds: string[];
  findingIds: string[];
  notes?: string;
}

export interface ReportTimelineEvent {
  id: string;
  time: string;
  title: string;
  detail?: string;
  status: ReportStatus;
}

export interface TestReport {
  id: string;
  title: string;
  testType: string;
  status: ReportStatus;
  score: number;
  summary: string;
  verdict?: string;
  createdAt: string;
  updatedAt?: string;
  targetUrl?: string;
  canonicalPath?: string;
  badges?: string[];
  actions?: ReportAction[];
  metrics: ReportMetric[];
  runDetails: ReportRunDetail[];
  categories: ReportCategory[];
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  checklist: ReportChecklistItem[];
  evidence: ReportEvidence[];
  traceability?: ReportTraceabilityItem[];
  timeline?: ReportTimelineEvent[];
  raw?: unknown;
}
