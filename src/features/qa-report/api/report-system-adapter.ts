import type { TestReport, ReportChecklistItem, ReportPriority } from '@/features/reports/api/types';
import type { QaReport, QaSeverity, QaStatus, QaStrategyDefinition } from './types';

function mapStatus(status: QaStatus) {
  if (status === 'not-run') return 'not_run';
  return status;
}

function mapSeverityToPriority(severity: QaSeverity): ReportPriority {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function mapPriority(priority: string): ReportPriority {
  if (priority === 'P0') return 'critical';
  if (priority === 'P1') return 'high';
  if (priority === 'P2') return 'medium';
  return 'low';
}

function buildChecklist(report: QaReport): ReportChecklistItem[] {
  const testCases = report.suggestedTests.map((test) => ({
    id: test.id,
    title: test.title,
    category: test.area,
    priority: mapPriority(test.priority),
    status: 'todo' as const,
    notes: test.reason
  }));

  const nextRun = report.nextRun.map((item, index) => ({
    id: `next-run-${index + 1}`,
    title: item,
    category: 'Next run',
    priority: index === 0 ? ('high' as const) : ('medium' as const),
    status: 'todo' as const
  }));

  return [...testCases, ...nextRun];
}

export function mapQaReportToTestReport(
  report: QaReport,
  strategy?: QaStrategyDefinition
): TestReport {
  return {
    id: `${report.vertical}/${report.customerSlug}/${report.slug}`,
    title: report.title,
    testType: strategy?.shortName ?? report.reportType,
    status: report.testRun ? mapStatus(report.testRun.result) : 'warning',
    score: report.score,
    summary: report.executiveSummary,
    verdict: report.verdict,
    createdAt: report.generatedAt,
    targetUrl: report.targetUrl,
    canonicalPath: `/qa-rapport/${report.vertical}/${report.customerSlug}/${report.slug}`,
    badges: [report.customerName, report.agentName, report.reportType],
    actions: [
      { label: 'Export report', disabled: true },
      { label: 'Rerun test', disabled: true },
      { label: 'View raw data', disabled: true }
    ],
    metrics: report.metrics,
    runDetails: [
      ...report.environment,
      ...(report.testRun
        ? [
            { label: 'Build', value: report.testRun.build },
            { label: 'Test plan', value: report.testRun.testPlan },
            { label: 'Execution', value: report.testRun.executionType },
            {
              label: 'Window',
              value:
                [report.testRun.startedAt, report.testRun.completedAt]
                  .filter(Boolean)
                  .join(' - ') || 'n/a'
            },
            { label: 'Release readiness', value: report.testRun.releaseReadiness }
          ]
        : [])
    ],
    categories: report.coverage.map((item) => ({
      id: item.area,
      name: item.area,
      score: item.coverage,
      status: mapStatus(item.status),
      summary: item.notes,
      checks: item.checks
    })),
    findings: report.findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      category: finding.area,
      status: mapStatus(finding.status),
      description: finding.summary,
      whyItMatters: finding.expected,
      suggestedFix: finding.recommendation,
      affectedArea: finding.actual,
      impact: finding.severity === 'critical' || finding.severity === 'high' ? 'high' : 'medium',
      effort: finding.severity === 'low' ? 'low' : 'medium',
      evidenceIds: finding.evidenceId ? [finding.evidenceId] : undefined,
      tags: finding.reproductionSteps.slice(0, 3)
    })),
    recommendations: report.findings.map((finding) => ({
      id: `recommendation-${finding.id}`,
      title: finding.recommendation,
      priority: mapSeverityToPriority(finding.severity),
      problem: finding.summary,
      action: finding.retestNote,
      expectedImpact: finding.expected,
      effort: finding.severity === 'low' ? 'low' : 'medium',
      relatedFindingIds: [finding.id],
      status: mapStatus(finding.status)
    })),
    checklist: buildChecklist(report),
    evidence: report.evidence.map((item) => ({
      id: item.id,
      type: 'screenshot',
      title: item.label,
      description: item.notes,
      url: item.imageUrl ?? item.blobUrl,
      path: item.path,
      capturedAt: item.capturedAt,
      metadata: {
        Viewport: item.viewport
      }
    })),
    traceability: report.traceability?.map((item, index) => ({
      id: `REQ-${String(index + 1).padStart(3, '0')}`,
      requirement: item.requirement,
      source: item.source,
      status: mapStatus(item.status),
      testCaseIds: item.testCases,
      findingIds: item.findings,
      notes: item.notes
    })),
    timeline: report.timeline.map((item, index) => ({
      id: `run-event-${index + 1}`,
      time: item.time,
      title: item.title,
      detail: item.detail,
      status: mapStatus(item.status)
    })),
    raw: {
      report,
      strategy
    }
  };
}
