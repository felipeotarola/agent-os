import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import type {
  QaCoverageArea,
  QaFinding,
  QaReport,
  QaRequirementTrace,
  QaStrategyDefinition,
  QaRiskArea,
  QaSeverity,
  QaStatus,
  QaTestRunSummary,
  QaTimelineEvent
} from '../api/types';

const severityLabels: Record<QaSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info'
};

const statusLabels: Record<QaStatus, string> = {
  passed: 'Passed',
  warning: 'Needs review',
  failed: 'Failed',
  'not-run': 'Not run'
};

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getSeverityBadgeVariant(severity: QaSeverity) {
  return severity === 'critical' || severity === 'high' ? 'destructive' : 'secondary';
}

function getFindingIcon(status: QaStatus) {
  if (status === 'passed') return Icons.circleCheck;
  if (status === 'failed') return Icons.circleX;
  if (status === 'not-run') return Icons.clock;
  return Icons.warning;
}

function getStatusBadgeVariant(status: QaStatus) {
  if (status === 'failed') return 'destructive';
  if (status === 'passed') return 'default';
  return 'secondary';
}

function getRiskLabel(risk: QaRiskArea) {
  if (risk.level === 'high') return 'High risk';
  if (risk.level === 'medium') return 'Medium risk';
  return 'Low risk';
}

function TestRunRecord({ testRun }: { testRun: QaTestRunSummary }) {
  const totals = [
    { label: 'Passed', value: testRun.passed },
    { label: 'Failed', value: testRun.failed },
    { label: 'Warnings', value: testRun.warnings },
    { label: 'Not run', value: testRun.notRun }
  ];

  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='min-w-0'>
            <CardTitle>Test execution record</CardTitle>
            <CardDescription className='mt-2 break-words'>
              Build, test basis, deviations, and release-readiness summary.
            </CardDescription>
          </div>
          <Badge className='w-fit shrink-0' variant={getStatusBadgeVariant(testRun.result)}>
            {statusLabels[testRun.result]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_220px]'>
        <div className='grid min-w-0 gap-4'>
          <div className='grid gap-3 sm:grid-cols-2'>
            {[
              { label: 'Build', value: testRun.build },
              { label: 'Test plan', value: testRun.testPlan },
              { label: 'Execution', value: testRun.executionType },
              {
                label: 'Window',
                value: [testRun.startedAt, testRun.completedAt].filter(Boolean).join(' - ') || 'n/a'
              }
            ].map((item) => (
              <div key={item.label} className='bg-muted/50 min-w-0 rounded-md p-3'>
                <div className='text-muted-foreground text-xs'>{item.label}</div>
                <div className='mt-1 text-sm font-medium break-words'>{item.value}</div>
              </div>
            ))}
          </div>
          <div>
            <div className='text-sm font-medium'>Release readiness</div>
            <p className='text-muted-foreground mt-2 text-sm leading-6 break-words'>
              {testRun.releaseReadiness}
            </p>
          </div>
          {testRun.deviations.length ? (
            <div>
              <div className='text-sm font-medium'>Plan deviations</div>
              <ul className='mt-3 flex flex-col gap-2'>
                {testRun.deviations.map((deviation) => (
                  <li key={deviation} className='flex min-w-0 gap-3 text-sm'>
                    <Icons.warning className='mt-0.5 size-4 shrink-0' />
                    <span className='text-muted-foreground min-w-0 leading-6 break-words'>
                      {deviation}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {testRun.reviewer || testRun.signOff ? (
            <div className='text-muted-foreground text-sm leading-6 break-words'>
              {[
                testRun.reviewer && `Reviewer: ${testRun.reviewer}`,
                testRun.signOff && `Sign-off: ${testRun.signOff}`
              ]
                .filter(Boolean)
                .join(' / ')}
            </div>
          ) : null}
        </div>
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-1'>
          {totals.map((item) => (
            <div key={item.label} className='bg-muted/50 min-w-0 rounded-md p-3'>
              <div className='text-2xl font-semibold'>{item.value}</div>
              <div className='text-muted-foreground mt-1 text-xs'>{item.label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TraceabilityMatrix({ traceability }: { traceability: QaRequirementTrace[] }) {
  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <CardTitle>Traceability matrix</CardTitle>
        <CardDescription className='break-words'>
          Requirements or acceptance criteria mapped to test cases and findings.
        </CardDescription>
      </CardHeader>
      <CardContent className='min-w-0'>
        <div className='grid gap-3 sm:hidden'>
          {traceability.map((item) => (
            <div
              key={`${item.source}-${item.requirement}`}
              className='bg-muted/50 min-w-0 rounded-md p-3'
            >
              <div className='flex min-w-0 items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <div className='font-medium leading-6 break-words'>{item.requirement}</div>
                  <div className='text-muted-foreground mt-1 text-xs break-words'>
                    {item.source}
                  </div>
                </div>
                <Badge className='shrink-0' variant={getStatusBadgeVariant(item.status)}>
                  {statusLabels[item.status]}
                </Badge>
              </div>
              <p className='text-muted-foreground mt-3 text-sm leading-6 break-words'>
                {item.notes}
              </p>
              <div className='text-muted-foreground mt-3 text-xs leading-5 break-words'>
                Tests: {item.testCases.join(', ') || 'n/a'} / Findings:{' '}
                {item.findings.join(', ') || 'none'}
              </div>
            </div>
          ))}
        </div>
        <Table className='hidden min-w-[760px] sm:table'>
          <TableHeader>
            <TableRow>
              <TableHead>Requirement</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tests</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traceability.map((item) => (
              <TableRow key={`${item.source}-${item.requirement}`}>
                <TableCell className='max-w-64 whitespace-normal font-medium'>
                  {item.requirement}
                </TableCell>
                <TableCell className='max-w-40 whitespace-normal'>{item.source}</TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(item.status)}>
                    {statusLabels[item.status]}
                  </Badge>
                </TableCell>
                <TableCell className='text-muted-foreground max-w-44 whitespace-normal'>
                  {item.testCases.join(', ') || 'n/a'}
                </TableCell>
                <TableCell className='text-muted-foreground max-w-36 whitespace-normal'>
                  {item.findings.join(', ') || 'none'}
                </TableCell>
                <TableCell className='text-muted-foreground max-w-64 whitespace-normal'>
                  {item.notes}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CoverageMatrix({ coverage }: { coverage: QaCoverageArea[] }) {
  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <CardTitle>Coverage matrix</CardTitle>
        <CardDescription className='break-words'>
          What was checked, how deep the pass went, and what remains.
        </CardDescription>
      </CardHeader>
      <CardContent className='min-w-0'>
        <div className='overflow-x-auto'>
          <Table className='min-w-[760px]'>
            <TableHeader>
              <TableRow>
                <TableHead>Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Checks</TableHead>
                <TableHead className='min-w-44'>Coverage</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coverage.map((item) => (
                <TableRow key={item.area}>
                  <TableCell className='whitespace-normal font-medium'>{item.area}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(item.status)}>
                      {statusLabels[item.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.checks}</TableCell>
                  <TableCell>
                    <div className='flex min-w-40 items-center gap-3'>
                      <Progress value={item.coverage} className='h-2' />
                      <span className='text-muted-foreground w-10 text-right text-xs'>
                        {item.coverage}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='text-muted-foreground max-w-96 whitespace-normal'>
                    {item.notes}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function RiskMap({ risks }: { risks: QaRiskArea[] }) {
  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <CardTitle>Risk map</CardTitle>
        <CardDescription>Where the next test run should spend attention first.</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4'>
        {risks.map((risk) => (
          <div key={risk.label} className='bg-muted/50 min-w-0 rounded-md p-4'>
            <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_96px] sm:items-start'>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <div className='font-medium'>{risk.label}</div>
                  <Badge variant={risk.level === 'high' ? 'destructive' : 'secondary'}>
                    {getRiskLabel(risk)}
                  </Badge>
                </div>
                <p className='text-muted-foreground mt-2 text-sm leading-6'>{risk.reason}</p>
              </div>
              <div className='sm:text-right'>
                <div className='text-2xl font-semibold tabular-nums'>{risk.score}</div>
                <div className='text-muted-foreground text-xs'>risk score</div>
              </div>
            </div>
            <div className='mt-4'>
              <div className='bg-background h-2 overflow-hidden rounded-full border'>
                <div
                  className={cn(
                    'h-full rounded-full',
                    risk.level === 'high' && 'bg-destructive',
                    risk.level === 'medium' && 'bg-primary',
                    risk.level === 'low' && 'bg-secondary'
                  )}
                  style={{ width: `${Math.max(8, Math.min(100, risk.score))}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RunTimeline({ timeline }: { timeline: QaTimelineEvent[] }) {
  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <CardTitle>Run timeline</CardTitle>
        <CardDescription>How Sladdis moved from URL to report.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className='flex flex-col gap-4'>
          {timeline.map((event, index) => {
            const EventIcon = getFindingIcon(event.status);

            return (
              <li
                key={`${event.time}-${event.title}`}
                className='grid grid-cols-[52px_minmax(0,1fr)] gap-3 sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-4'
              >
                <div className='text-muted-foreground pt-1 font-mono text-xs'>{event.time}</div>
                <div className='relative flex min-w-0 gap-3'>
                  {index < timeline.length - 1 ? (
                    <span className='bg-border absolute left-4 top-9 h-[calc(100%+1rem)] w-px' />
                  ) : null}
                  <span className='bg-background relative z-10 flex size-8 shrink-0 items-center justify-center rounded-md border'>
                    <EventIcon className='size-4' />
                  </span>
                  <div className='min-w-0'>
                    <div className='font-medium'>{event.title}</div>
                    <p className='text-muted-foreground mt-1 text-sm leading-6 break-words'>
                      {event.detail}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function FindingSummaryTable({ findings }: { findings: QaFinding[] }) {
  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <CardTitle>Defect summary</CardTitle>
        <CardDescription>
          A compact table for scanning severity, owner area, and status.
        </CardDescription>
      </CardHeader>
      <CardContent className='min-w-0'>
        <div className='overflow-x-auto'>
          <Table className='min-w-[680px]'>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Finding</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {findings.map((finding) => (
                <TableRow key={finding.id}>
                  <TableCell className='font-mono text-xs'>{finding.id}</TableCell>
                  <TableCell className='max-w-80 whitespace-normal font-medium'>
                    {finding.title}
                  </TableCell>
                  <TableCell className='whitespace-normal'>{finding.area}</TableCell>
                  <TableCell>
                    <Badge variant={getSeverityBadgeVariant(finding.severity)}>
                      {severityLabels[finding.severity]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(finding.status)}>
                      {statusLabels[finding.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function TestMixDiagram({ report }: { report: QaReport }) {
  const automated = report.coverage.filter((item) => item.status === 'passed').length;
  const assisted = report.coverage.filter((item) => item.status === 'warning').length;
  const planned = report.coverage.filter((item) => item.status === 'not-run').length;
  const total = Math.max(1, automated + assisted + planned);

  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <CardTitle>Test mix</CardTitle>
        <CardDescription>
          Current balance between verified, assisted, and planned checks.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {[
          { label: 'Verified checks', value: automated, width: (automated / total) * 100 },
          { label: 'Agent-assisted review', value: assisted, width: (assisted / total) * 100 },
          { label: 'Planned next run', value: planned, width: (planned / total) * 100 }
        ].map((item) => (
          <div key={item.label}>
            <div className='mb-2 flex items-center justify-between gap-4 text-sm'>
              <span className='font-medium'>{item.label}</span>
              <span className='text-muted-foreground'>{item.value} areas</span>
            </div>
            <div className='bg-muted h-8 overflow-hidden rounded-md'>
              <div
                className='bg-primary flex h-full min-w-8 items-center justify-end px-2 text-xs text-primary-foreground'
                style={{ width: `${Math.max(12, item.width)}%` }}
              >
                {Math.round(item.width)}%
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FindingCard({ finding }: { finding: QaFinding }) {
  const StatusIcon = getFindingIcon(finding.status);

  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='flex min-w-0 gap-3'>
            <div className='bg-muted flex size-10 shrink-0 items-center justify-center rounded-md'>
              <StatusIcon className='size-5' />
            </div>
            <div className='min-w-0'>
              <CardTitle className='leading-snug'>{finding.title}</CardTitle>
              <CardDescription className='mt-1'>
                {finding.id} / {finding.area} / {statusLabels[finding.status]}
              </CardDescription>
            </div>
          </div>
          <Badge variant={getSeverityBadgeVariant(finding.severity)}>
            {severityLabels[finding.severity]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-5'>
        <p className='text-muted-foreground text-sm leading-6'>{finding.summary}</p>
        <div className='grid gap-4 md:grid-cols-2'>
          <div className='bg-muted/50 rounded-md p-4'>
            <div className='text-sm font-medium'>Expected</div>
            <p className='text-muted-foreground mt-2 text-sm leading-6'>{finding.expected}</p>
          </div>
          <div className='bg-muted/50 rounded-md p-4'>
            <div className='text-sm font-medium'>Actual</div>
            <p className='text-muted-foreground mt-2 text-sm leading-6'>{finding.actual}</p>
          </div>
        </div>
        <div className='grid gap-5 lg:grid-cols-[0.9fr_1.1fr]'>
          <div>
            <div className='text-sm font-medium'>Reproduction</div>
            <ol className='text-muted-foreground mt-3 flex flex-col gap-2 text-sm'>
              {finding.reproductionSteps.map((step, index) => (
                <li key={step} className='flex gap-3'>
                  <span className='bg-muted text-foreground flex size-6 shrink-0 items-center justify-center rounded-md text-xs'>
                    {index + 1}
                  </span>
                  <span className='leading-6'>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className='flex flex-col gap-3'>
            <div>
              <div className='text-sm font-medium'>Recommendation</div>
              <p className='text-muted-foreground mt-2 text-sm leading-6'>
                {finding.recommendation}
              </p>
            </div>
            <div>
              <div className='text-sm font-medium'>Retest note</div>
              <p className='text-muted-foreground mt-2 text-sm leading-6'>{finding.retestNote}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface QaReportTemplateProps {
  report: QaReport;
  strategy?: QaStrategyDefinition;
}

export function QaReportTemplate({ report, strategy }: QaReportTemplateProps) {
  return (
    <main className='bg-background min-h-screen'>
      <section className='border-b'>
        <div className='mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-14'>
          <div className='flex min-w-0 flex-col gap-8'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='secondary'>{report.agentName}</Badge>
              {strategy ? <Badge variant='default'>{strategy.shortName}</Badge> : null}
              <Badge variant='outline'>{report.customerName}</Badge>
              <Badge variant='outline'>{report.reportType}</Badge>
              <Badge variant='outline'>{formatReportDate(report.generatedAt)}</Badge>
            </div>
            <div className='max-w-5xl'>
              <p className='text-muted-foreground text-sm font-medium uppercase tracking-[0.18em]'>
                {strategy?.name ?? 'Public QA report'}
              </p>
              <h1 className='text-foreground mt-4 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl'>
                {report.title}
              </h1>
              <p className='text-muted-foreground mt-6 max-w-4xl text-lg leading-8'>
                {report.executiveSummary}
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <a
                href={report.targetUrl}
                className='border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-10 max-w-full min-w-0 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors'
                target='_blank'
                rel='noreferrer'
              >
                <Icons.externalLink className='size-4 shrink-0' />
                <span className='truncate'>{report.targetUrl}</span>
              </a>
              <div className='text-muted-foreground min-w-0 text-sm break-all'>
                Shareable URL: /qa-rapport/{report.vertical}/{report.customerSlug}/{report.slug}
              </div>
            </div>
          </div>

          <Card className='min-w-0 max-w-5xl rounded-lg'>
            <CardHeader>
              <CardTitle>Readiness score</CardTitle>
              <CardDescription>{report.verdict}</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]'>
              <div className='min-w-0'>
                <div className='flex items-end justify-between gap-4'>
                  <span className='text-5xl font-semibold tracking-tight'>{report.score}</span>
                  <span className='text-muted-foreground pb-1 text-sm'>of 100</span>
                </div>
                <Progress value={report.score} className='mt-4' />
              </div>
              <div className='grid min-w-0 gap-2 md:grid-cols-2'>
                {report.environment.map((item) => (
                  <div
                    key={item.label}
                    className='flex min-w-0 items-center justify-between gap-4 text-sm'
                  >
                    <span className='text-muted-foreground'>{item.label}</span>
                    <span className='min-w-0 truncate text-right font-medium'>{item.value}</span>
                  </div>
                ))}
              </div>
              <div className='grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4'>
                {report.metrics.map((metric) => (
                  <div key={metric.label} className='bg-muted/50 min-w-0 rounded-md p-3'>
                    <div className='text-2xl font-semibold'>{metric.value}</div>
                    <div className='mt-1 text-sm font-medium'>{metric.label}</div>
                    <div className='text-muted-foreground mt-1 text-xs leading-5'>
                      {metric.detail}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className='mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8'>
        <div className='min-w-0 flex flex-col gap-8'>
          {report.testRun ? <TestRunRecord testRun={report.testRun} /> : null}

          {report.traceability?.length ? (
            <TraceabilityMatrix traceability={report.traceability} />
          ) : null}

          <section className='grid min-w-0 gap-4'>
            <CoverageMatrix coverage={report.coverage} />
            <div className='grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.6fr)]'>
              <RiskMap risks={report.risks} />
              <TestMixDiagram report={report} />
            </div>
          </section>

          <section className='grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
            <RunTimeline timeline={report.timeline} />
            <FindingSummaryTable findings={report.findings} />
          </section>

          <section className='grid min-w-0 gap-4 md:grid-cols-2'>
            {report.evidence.map((item, index) => (
              <Card key={item.id} className='min-w-0 overflow-hidden rounded-lg py-0'>
                <div className='bg-muted/70 border-b p-3'>
                  <div className='flex min-w-0 items-center justify-between gap-3'>
                    <div className='flex items-center gap-2'>
                      <span className='bg-background size-2 rounded-full' />
                      <span className='bg-background size-2 rounded-full' />
                      <span className='bg-background size-2 rounded-full' />
                    </div>
                    <span className='text-muted-foreground min-w-0 truncate font-mono text-xs'>
                      {item.path}
                    </span>
                  </div>
                </div>
                <div
                  className={cn(
                    'from-muted via-background to-muted flex min-w-0 items-center justify-center bg-linear-to-br p-4 sm:aspect-[16/10] sm:p-6',
                    index % 2 === 1 && 'from-background via-muted/60 to-background'
                  )}
                >
                  <div className='border-border/70 bg-card/80 w-full max-w-[min(100%,24rem)] rounded-lg border p-4 shadow-sm sm:p-5'>
                    <div className='bg-muted h-4 w-2/3 rounded' />
                    <div className='bg-muted mt-4 h-3 w-full rounded' />
                    <div className='bg-muted mt-2 h-3 w-5/6 rounded' />
                    <div className='mt-5 grid grid-cols-3 gap-2'>
                      <div className='bg-muted h-14 rounded' />
                      <div className='bg-muted h-14 rounded' />
                      <div className='bg-muted h-14 rounded' />
                    </div>
                  </div>
                </div>
                <CardContent className='flex flex-col gap-2 py-5'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <div className='font-medium'>{item.label}</div>
                      <div className='text-muted-foreground mt-1 text-sm break-words'>
                        {item.notes}
                      </div>
                    </div>
                    <Badge className='shrink-0' variant='outline'>
                      {item.viewport}
                    </Badge>
                  </div>
                  <div className='text-muted-foreground text-xs'>Captured at {item.capturedAt}</div>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className='flex flex-col gap-4'>
            <div>
              <h2 className='text-2xl font-semibold tracking-tight'>Findings</h2>
              <p className='text-muted-foreground mt-2'>
                Each item is written so a client can understand the risk and a builder can retest
                it.
              </p>
            </div>
            {report.findings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
          </section>
        </div>

        <aside className='flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start'>
          {strategy ? (
            <Card className='rounded-lg'>
              <CardHeader>
                <CardTitle>Strategy</CardTitle>
                <CardDescription>{strategy.description}</CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-4'>
                <div>
                  <div className='text-sm font-medium'>Template</div>
                  <div className='text-muted-foreground mt-1 font-mono text-xs'>
                    {strategy.reportTemplate}
                  </div>
                </div>
                <Separator />
                <div>
                  <div className='text-sm font-medium'>Key questions</div>
                  <ul className='mt-3 flex flex-col gap-3'>
                    {strategy.primaryQuestions.map((question) => (
                      <li key={question} className='flex gap-3 text-sm'>
                        <Icons.target className='mt-0.5 size-4 shrink-0' />
                        <span className='text-muted-foreground leading-6'>{question}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className='rounded-lg'>
            <CardHeader>
              <CardTitle>Scope</CardTitle>
              <CardDescription>What Sladdis should cover in this report.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className='flex flex-col gap-3'>
                {report.scope.map((item) => (
                  <li key={item} className='flex gap-3 text-sm'>
                    <Icons.check className='mt-0.5 size-4 shrink-0' />
                    <span className='text-muted-foreground leading-6'>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className='rounded-lg'>
            <CardHeader>
              <CardTitle>Suggested test cases</CardTitle>
              <CardDescription>Best candidates for the next Sladdis run.</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {report.suggestedTests.map((test) => (
                <div key={test.id} className='border-b pb-4 last:border-b-0 last:pb-0'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='text-sm font-medium leading-6'>{test.title}</div>
                    <Badge variant={test.priority === 'P0' ? 'default' : 'secondary'}>
                      {test.priority}
                    </Badge>
                  </div>
                  <div className='text-muted-foreground mt-2 text-xs leading-5'>
                    {test.area} / {test.reason}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className='rounded-lg'>
            <CardHeader>
              <CardTitle>Next report</CardTitle>
              <CardDescription>
                What to improve before this becomes a live Sladdis artifact.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className='flex flex-col gap-3'>
                {report.nextRun.map((item, index) => (
                  <li key={item} className='flex gap-3 text-sm'>
                    <span className='bg-muted text-foreground flex size-6 shrink-0 items-center justify-center rounded-md text-xs'>
                      {index + 1}
                    </span>
                    <span className='text-muted-foreground leading-6'>{item}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}

export const QaReportPage = QaReportTemplate;
