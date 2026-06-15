import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  ReportCategory,
  ReportChecklistItem,
  ReportEvidence,
  ReportFinding,
  ReportPriority,
  ReportRecommendation,
  ReportSeverity,
  ReportStatus,
  ReportTimelineEvent,
  ReportTraceabilityItem,
  TestReport
} from '../api/types';

const statusLabels: Record<ReportStatus, string> = {
  passed: 'Passed',
  warning: 'Needs review',
  failed: 'Failed',
  in_progress: 'In progress',
  not_run: 'Not run'
};

const severityLabels: Record<ReportSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info'
};

const priorityLabels: Record<ReportPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getStatusBadgeVariant(status: ReportStatus) {
  if (status === 'failed') return 'destructive';
  if (status === 'passed') return 'default';
  return 'secondary';
}

function getSeverityBadgeVariant(severity: ReportSeverity) {
  return severity === 'critical' || severity === 'high' ? 'destructive' : 'secondary';
}

function getPriorityBadgeVariant(priority: ReportPriority) {
  return priority === 'critical' || priority === 'high' ? 'destructive' : 'secondary';
}

function getStatusIcon(status: ReportStatus) {
  if (status === 'passed') return Icons.circleCheck;
  if (status === 'failed') return Icons.circleX;
  if (status === 'not_run') return Icons.clock;
  if (status === 'in_progress') return Icons.spinner;
  return Icons.warning;
}

function getSeverityAccent(severity: ReportSeverity) {
  if (severity === 'critical' || severity === 'high') return 'border-l-destructive';
  if (severity === 'medium') return 'border-l-primary';
  return 'border-l-border';
}

function getChecklistStatus(item: ReportChecklistItem): ReportStatus {
  if (item.status === 'todo' || item.status === 'not_applicable') return 'not_run';
  return item.status;
}

function getChecklistStatusLabel(item: ReportChecklistItem) {
  if (item.status === 'todo') return 'Ready to run';
  if (item.status === 'not_applicable') return 'Not applicable';
  return statusLabels[item.status];
}

function getStatusSummary(report: TestReport) {
  return report.checklist.reduce(
    (summary, item) => {
      const status = getChecklistStatus(item);
      summary[status] += 1;
      return summary;
    },
    {
      passed: 0,
      warning: 0,
      failed: 0,
      in_progress: 0,
      not_run: 0
    } satisfies Record<ReportStatus, number>
  );
}

function isImageEvidence(evidence: ReportEvidence) {
  const src = evidence.url ?? evidence.path ?? '';
  return (
    evidence.type === 'screenshot' ||
    evidence.type === 'image' ||
    /\.(avif|gif|jpe?g|png|webp)(\?.*)?$/i.test(src)
  );
}

function getEvidenceHref(evidence: ReportEvidence) {
  return evidence.url ?? evidence.path;
}

function stringifyRaw(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return 'Raw report details could not be serialized.';
  }
}

function ReportHeader({ report }: { report: TestReport }) {
  const statusSummary = getStatusSummary(report);

  return (
    <section className='border-b bg-muted/20'>
      <div className='mx-auto flex max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8'>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>QA Control Center</Badge>
            <Badge variant='outline'>{report.testType}</Badge>
            <Badge variant={getStatusBadgeVariant(report.status)}>
              {statusLabels[report.status]}
            </Badge>
            <Badge variant='outline'>{formatReportDate(report.createdAt)}</Badge>
            {report.badges?.map((badge) => (
              <Badge key={badge} variant='outline'>
                {badge}
              </Badge>
            ))}
          </div>
          <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end'>
            <div className='min-w-0'>
              <h1 className='text-3xl font-semibold tracking-tight break-words sm:text-4xl'>
                {report.title}
              </h1>
              <p className='text-muted-foreground mt-4 max-w-4xl text-base leading-7 break-words sm:text-lg'>
                {report.summary}
              </p>
            </div>
            <Card className='min-w-0 rounded-lg py-4'>
              <CardContent className='flex flex-col gap-4'>
                <div className='flex items-end justify-between gap-4'>
                  <div>
                    <div className='text-muted-foreground text-sm'>Report score</div>
                    <div className='flex items-end gap-2'>
                      <span className='text-5xl font-semibold tracking-tight tabular-nums'>
                        {report.score}
                      </span>
                      <span className='text-muted-foreground pb-1 text-sm'>/100</span>
                    </div>
                  </div>
                  <Icons.chartBar className='text-muted-foreground size-8' />
                </div>
                <Progress value={report.score} className='mt-4' />
                <p className='text-muted-foreground text-sm leading-6 break-words'>
                  {report.verdict ?? statusLabels[report.status]}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
            <HeaderStat
              label='Test cases'
              value={String(report.checklist.length)}
              detail='Tracked'
            />
            <HeaderStat
              label='Passed'
              value={String(statusSummary.passed)}
              detail='Latest run'
              status='passed'
            />
            <HeaderStat
              label='Issues'
              value={String(report.findings.length)}
              detail='Linked findings'
              status={report.findings.length ? 'warning' : 'passed'}
            />
            <HeaderStat
              label='Evidence'
              value={String(report.evidence.length)}
              detail='Assets'
              status={report.evidence.length ? 'passed' : 'not_run'}
            />
            <HeaderStat
              label='Not run'
              value={String(statusSummary.not_run)}
              detail='Retest queue'
              status={statusSummary.not_run ? 'not_run' : 'passed'}
            />
          </div>
          <div className='flex flex-wrap items-center gap-3'>
            {report.targetUrl ? (
              <Button asChild variant='outline'>
                <a href={report.targetUrl} target='_blank' rel='noreferrer'>
                  <Icons.externalLink data-icon='inline-start' />
                  Target
                </a>
              </Button>
            ) : null}
            {report.actions?.map((action) =>
              action.href ? (
                <Button key={action.label} asChild variant='outline'>
                  <Link href={action.href}>{action.label}</Link>
                </Button>
              ) : (
                <Button key={action.label} variant='outline' disabled={action.disabled}>
                  {action.label}
                </Button>
              )
            )}
            {report.canonicalPath ? (
              <span className='text-muted-foreground min-w-0 text-sm break-all'>
                Shareable URL: {report.canonicalPath}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeaderStat({
  label,
  value,
  detail,
  status = 'warning'
}: {
  label: string;
  value: string;
  detail: string;
  status?: ReportStatus;
}) {
  return (
    <div className='rounded-lg border bg-background p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='text-muted-foreground text-xs font-medium uppercase'>{label}</div>
          <div className='mt-2 text-2xl font-semibold tabular-nums'>{value}</div>
          <div className='text-muted-foreground mt-1 text-xs'>{detail}</div>
        </div>
        <span className='mt-1 size-2 shrink-0 rounded-full bg-muted'>
          <span
            className={cn(
              'block size-2 rounded-full',
              status === 'passed' && 'bg-primary',
              status === 'failed' && 'bg-destructive',
              status === 'warning' && 'bg-primary',
              status === 'not_run' && 'bg-muted-foreground',
              status === 'in_progress' && 'bg-primary'
            )}
          />
        </span>
      </div>
    </div>
  );
}

function ReportScoreCards({ categories }: { categories: ReportCategory[] }) {
  if (!categories.length)
    return <EmptyState title='No categories' detail='This report has no category scores.' />;

  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
      {categories.map((category) => {
        const StatusIcon = getStatusIcon(category.status);

        return (
          <Card key={category.id} className='min-w-0 rounded-lg'>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <CardTitle className='break-words'>{category.name}</CardTitle>
                  <CardDescription className='mt-1 break-words'>
                    {category.summary ?? statusLabels[category.status]}
                  </CardDescription>
                </div>
                <span className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-md'>
                  <StatusIcon />
                </span>
              </div>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <div className='flex items-center justify-between gap-4'>
                <Badge variant={getStatusBadgeVariant(category.status)}>
                  {statusLabels[category.status]}
                </Badge>
                {typeof category.score === 'number' ? (
                  <span className='text-2xl font-semibold tabular-nums'>{category.score}</span>
                ) : (
                  <span className='text-muted-foreground text-sm'>No score</span>
                )}
              </div>
              {typeof category.score === 'number' ? <Progress value={category.score} /> : null}
              <div className='text-muted-foreground flex flex-wrap gap-3 text-xs'>
                {typeof category.checks === 'number' ? <span>{category.checks} checks</span> : null}
                {category.trend ? <span>{category.trend}</span> : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MetricGrid({ report }: { report: TestReport }) {
  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
      {report.metrics.map((metric) => (
        <Card key={metric.label} className='min-w-0 rounded-lg'>
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className='text-2xl'>{metric.value}</CardTitle>
          </CardHeader>
          {metric.detail ? (
            <CardContent>
              <p className='text-muted-foreground text-sm leading-6 break-words'>{metric.detail}</p>
            </CardContent>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function FindingsTab({ findings }: { findings: ReportFinding[] }) {
  if (!findings.length)
    return <EmptyState title='No findings' detail='No findings were recorded.' />;

  return (
    <div className='flex flex-col gap-4'>
      {findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </div>
  );
}

function FindingCard({ finding }: { finding: ReportFinding }) {
  return (
    <Card className={cn('min-w-0 rounded-lg border-l-4', getSeverityAccent(finding.severity))}>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='min-w-0'>
            <div className='mb-2 flex flex-wrap items-center gap-2'>
              <Badge variant={getSeverityBadgeVariant(finding.severity)}>
                {severityLabels[finding.severity]}
              </Badge>
              <Badge variant='outline'>{finding.category}</Badge>
              {finding.status ? (
                <Badge variant={getStatusBadgeVariant(finding.status)}>
                  {statusLabels[finding.status]}
                </Badge>
              ) : null}
            </div>
            <CardTitle className='leading-snug break-words'>{finding.title}</CardTitle>
            <CardDescription className='mt-2 break-words'>{finding.id}</CardDescription>
          </div>
          <div className='flex shrink-0 flex-wrap gap-2'>
            {finding.impact ? <Badge variant='secondary'>Impact {finding.impact}</Badge> : null}
            {finding.effort ? <Badge variant='secondary'>Effort {finding.effort}</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-5'>
        <p className='text-muted-foreground text-sm leading-6 break-words'>{finding.description}</p>
        <div className='grid gap-4 lg:grid-cols-2'>
          {finding.whyItMatters ? (
            <div className='rounded-md bg-muted/50 p-4'>
              <div className='text-sm font-medium'>Why it matters</div>
              <p className='text-muted-foreground mt-2 text-sm leading-6 break-words'>
                {finding.whyItMatters}
              </p>
            </div>
          ) : null}
          {finding.suggestedFix ? (
            <div className='rounded-md bg-muted/50 p-4'>
              <div className='text-sm font-medium'>Suggested fix</div>
              <p className='text-muted-foreground mt-2 text-sm leading-6 break-words'>
                {finding.suggestedFix}
              </p>
            </div>
          ) : null}
        </div>
        <div className='flex flex-wrap gap-2'>
          {finding.affectedArea ? <Badge variant='outline'>{finding.affectedArea}</Badge> : null}
          {finding.evidenceIds?.map((id) => (
            <Badge key={id} variant='outline'>
              Evidence {id}
            </Badge>
          ))}
          {finding.tags?.map((tag) => (
            <Badge key={tag} variant='secondary'>
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceTab({ evidence }: { evidence: ReportEvidence[] }) {
  if (!evidence.length)
    return <EmptyState title='No evidence' detail='This report has no evidence assets.' />;

  return (
    <div className='grid gap-4 md:grid-cols-2'>
      {evidence.map((item) => (
        <EvidenceCard key={item.id} evidence={item} />
      ))}
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: ReportEvidence }) {
  const href = getEvidenceHref(evidence);

  return (
    <Card className='min-w-0 overflow-hidden rounded-lg py-0'>
      <div className='border-b bg-muted/60 p-3'>
        <div className='flex min-w-0 items-center justify-between gap-3'>
          <Badge variant='outline'>{evidence.type}</Badge>
          <span className='text-muted-foreground min-w-0 truncate font-mono text-xs'>
            {evidence.path ?? evidence.url ?? evidence.id}
          </span>
        </div>
      </div>
      <div className='flex min-h-64 items-center justify-center bg-muted/30'>
        {href && isImageEvidence(evidence) ? (
          // oxlint-disable-next-line next/no-img-element -- Report evidence may use arbitrary signed/blob URLs.
          <img
            src={href}
            alt={`${evidence.title} evidence`}
            className='h-full min-h-64 w-full object-cover'
            loading='lazy'
          />
        ) : (
          <div className='flex w-full flex-col items-center justify-center gap-3 p-6 text-center'>
            <Icons.fileTypeDoc />
            <div className='text-sm font-medium'>{evidence.type} evidence</div>
            {href ? (
              <Button asChild variant='outline' size='sm'>
                <a href={href} target='_blank' rel='noreferrer'>
                  Open evidence
                </a>
              </Button>
            ) : null}
          </div>
        )}
      </div>
      <CardContent className='flex flex-col gap-3 py-5'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='font-medium break-words'>{evidence.title}</div>
            {evidence.description ? (
              <p className='text-muted-foreground mt-1 text-sm leading-6 break-words'>
                {evidence.description}
              </p>
            ) : null}
          </div>
          {evidence.capturedAt ? (
            <Badge className='shrink-0' variant='secondary'>
              {evidence.capturedAt}
            </Badge>
          ) : null}
        </div>
        {evidence.metadata ? (
          <div className='grid gap-2 text-xs sm:grid-cols-2'>
            {Object.entries(evidence.metadata).map(([label, value]) => (
              <div key={label} className='flex min-w-0 justify-between gap-3'>
                <span className='text-muted-foreground'>{label}</span>
                <span className='min-w-0 truncate text-right font-medium'>{value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RecommendationsTab({ recommendations }: { recommendations: ReportRecommendation[] }) {
  if (!recommendations.length) {
    return <EmptyState title='No recommendations' detail='No recommendations were generated.' />;
  }

  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      {recommendations.map((recommendation) => (
        <Card key={recommendation.id} className='min-w-0 rounded-lg'>
          <CardHeader>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <Badge className='mb-2' variant={getPriorityBadgeVariant(recommendation.priority)}>
                  {priorityLabels[recommendation.priority]} priority
                </Badge>
                <CardTitle className='leading-snug break-words'>{recommendation.title}</CardTitle>
              </div>
              {recommendation.effort ? (
                <Badge className='shrink-0' variant='secondary'>
                  Effort {recommendation.effort}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {recommendation.problem ? (
              <p className='text-muted-foreground text-sm leading-6 break-words'>
                {recommendation.problem}
              </p>
            ) : null}
            <div className='rounded-md bg-muted/50 p-4'>
              <div className='text-sm font-medium'>Suggested action</div>
              <p className='text-muted-foreground mt-2 text-sm leading-6 break-words'>
                {recommendation.action}
              </p>
            </div>
            {recommendation.expectedImpact ? (
              <div>
                <div className='text-sm font-medium'>Expected impact</div>
                <p className='text-muted-foreground mt-2 text-sm leading-6 break-words'>
                  {recommendation.expectedImpact}
                </p>
              </div>
            ) : null}
            <div className='flex flex-wrap gap-2'>
              {recommendation.status ? (
                <Badge variant={getStatusBadgeVariant(recommendation.status)}>
                  {statusLabels[recommendation.status]}
                </Badge>
              ) : null}
              {recommendation.owner ? (
                <Badge variant='outline'>{recommendation.owner}</Badge>
              ) : null}
              {recommendation.relatedFindingIds?.map((id) => (
                <Badge key={id} variant='outline'>
                  {id}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TestCasesTab({ checklist }: { checklist: ReportChecklistItem[] }) {
  if (!checklist.length) {
    return <EmptyState title='No test cases' detail='No reusable test cases were recorded.' />;
  }

  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <CardTitle>Test cases</CardTitle>
        <CardDescription>
          Reusable cases Sladdis can run again and compare over time.
        </CardDescription>
      </CardHeader>
      <CardContent className='overflow-x-auto'>
        <Table className='min-w-[840px]'>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checklist.map((item) => (
              <TableRow key={item.id}>
                <TableCell className='max-w-80 whitespace-normal'>
                  <div className='font-medium'>{item.id}</div>
                  <div className='text-muted-foreground mt-1 text-sm'>{item.title}</div>
                </TableCell>
                <TableCell>{item.category ?? 'General'}</TableCell>
                <TableCell>
                  {item.priority ? (
                    <Badge variant={getPriorityBadgeVariant(item.priority)}>
                      {priorityLabels[item.priority]}
                    </Badge>
                  ) : (
                    'n/a'
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(getChecklistStatus(item))}>
                    {getChecklistStatusLabel(item)}
                  </Badge>
                </TableCell>
                <TableCell className='text-muted-foreground max-w-96 whitespace-normal'>
                  {item.notes ?? 'No note recorded.'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TraceabilityTab({ traceability }: { traceability: ReportTraceabilityItem[] }) {
  if (!traceability.length) {
    return (
      <EmptyState
        title='No traceability links'
        detail='No requirement-to-test-to-finding links were recorded.'
      />
    );
  }

  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <CardTitle>Traceability matrix</CardTitle>
        <CardDescription>
          Requirements mapped to test cases, findings, and evidence gaps.
        </CardDescription>
      </CardHeader>
      <CardContent className='overflow-x-auto'>
        <Table className='min-w-[920px]'>
          <TableHeader>
            <TableRow>
              <TableHead>Requirement</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Test cases</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traceability.map((item) => (
              <TableRow key={item.id}>
                <TableCell className='max-w-80 whitespace-normal'>
                  <div className='font-medium'>{item.id}</div>
                  <div className='text-muted-foreground mt-1 text-sm'>{item.requirement}</div>
                </TableCell>
                <TableCell>{item.source ?? 'n/a'}</TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(item.status)}>
                    {statusLabels[item.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-1'>
                    {item.testCaseIds.map((id) => (
                      <Badge key={id} variant='outline'>
                        {id}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-1'>
                    {item.findingIds.length ? (
                      item.findingIds.map((id) => (
                        <Badge key={id} variant='secondary'>
                          {id}
                        </Badge>
                      ))
                    ) : (
                      <span className='text-muted-foreground text-sm'>None</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className='text-muted-foreground max-w-96 whitespace-normal'>
                  {item.notes ?? 'No note recorded.'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TimelineTab({ timeline }: { timeline: ReportTimelineEvent[] }) {
  if (!timeline.length) {
    return <EmptyState title='No run history' detail='No execution timeline was recorded.' />;
  }

  return (
    <Card className='rounded-lg'>
      <CardHeader>
        <CardTitle>Run history</CardTitle>
        <CardDescription>Chronological execution log for this test activity.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {timeline.map((event) => {
          const StatusIcon = getStatusIcon(event.status);

          return (
            <div key={event.id} className='grid gap-3 border-l pl-4 sm:grid-cols-[92px_1fr]'>
              <div className='text-muted-foreground font-mono text-xs'>{event.time}</div>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusIcon className='size-4' />
                  <span className='font-medium'>{event.title}</span>
                  <Badge variant={getStatusBadgeVariant(event.status)}>
                    {statusLabels[event.status]}
                  </Badge>
                </div>
                {event.detail ? (
                  <p className='text-muted-foreground mt-1 text-sm leading-6 break-words'>
                    {event.detail}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CategoriesTab({ categories }: { categories: ReportCategory[] }) {
  return (
    <Card className='min-w-0 rounded-lg'>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>Score, status, and coverage depth by tested area.</CardDescription>
      </CardHeader>
      <CardContent className='overflow-x-auto'>
        <Table className='min-w-[720px]'>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Checks</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className='font-medium'>{category.name}</TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(category.status)}>
                    {statusLabels[category.status]}
                  </Badge>
                </TableCell>
                <TableCell>{typeof category.score === 'number' ? category.score : 'n/a'}</TableCell>
                <TableCell>{category.checks ?? 'n/a'}</TableCell>
                <TableCell className='text-muted-foreground max-w-96 whitespace-normal'>
                  {category.summary ?? 'No summary recorded.'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RunDetails({ report }: { report: TestReport }) {
  if (!report.runDetails.length) return null;

  return (
    <Card className='rounded-lg'>
      <CardHeader>
        <CardTitle>Run details</CardTitle>
        <CardDescription>Environment and execution context.</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3'>
        {report.runDetails.map((detail) => (
          <div key={detail.label} className='flex min-w-0 justify-between gap-4 text-sm'>
            <span className='text-muted-foreground'>{detail.label}</span>
            <span className='min-w-0 truncate text-right font-medium'>{detail.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SummaryRail({ report }: { report: TestReport }) {
  const criticalFindings = report.findings.filter((finding) =>
    ['critical', 'high'].includes(finding.severity)
  ).length;
  const traceabilityCount = report.traceability?.length ?? 0;
  const runEvents = report.timeline?.length ?? 0;

  return (
    <aside className='flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start'>
      <Card className='rounded-lg'>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>Quick scan of this report.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div>
            <div className='flex items-end justify-between gap-3'>
              <span className='text-4xl font-semibold tabular-nums'>{report.score}</span>
              <Badge variant={getStatusBadgeVariant(report.status)}>
                {statusLabels[report.status]}
              </Badge>
            </div>
            <Progress value={report.score} className='mt-3' />
          </div>
          <Separator />
          <div className='grid gap-3 text-sm'>
            <div className='flex justify-between gap-3'>
              <span className='text-muted-foreground'>Findings</span>
              <span className='font-medium'>{report.findings.length}</span>
            </div>
            <div className='flex justify-between gap-3'>
              <span className='text-muted-foreground'>High risk</span>
              <span className='font-medium'>{criticalFindings}</span>
            </div>
            <div className='flex justify-between gap-3'>
              <span className='text-muted-foreground'>Evidence</span>
              <span className='font-medium'>{report.evidence.length}</span>
            </div>
            <div className='flex justify-between gap-3'>
              <span className='text-muted-foreground'>Checklist</span>
              <span className='font-medium'>{report.checklist.length}</span>
            </div>
            <div className='flex justify-between gap-3'>
              <span className='text-muted-foreground'>Requirements</span>
              <span className='font-medium'>{traceabilityCount}</span>
            </div>
            <div className='flex justify-between gap-3'>
              <span className='text-muted-foreground'>Run events</span>
              <span className='font-medium'>{runEvents}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      <RunDetails report={report} />
    </aside>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <Card className='rounded-lg'>
      <CardContent className='flex min-h-40 flex-col items-center justify-center gap-2 text-center'>
        <Icons.info />
        <div className='font-medium'>{title}</div>
        <p className='text-muted-foreground max-w-md text-sm leading-6'>{detail}</p>
      </CardContent>
    </Card>
  );
}

export function TestReportPage({ report }: { report: TestReport }) {
  const traceability = report.traceability ?? [];
  const timeline = report.timeline ?? [];

  return (
    <main className='min-h-screen bg-background'>
      <ReportHeader report={report} />
      <div className='mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8'>
        <div className='min-w-0'>
          <Tabs defaultValue='overview' className='gap-5'>
            <div className='overflow-x-auto pb-1'>
              <TabsList>
                <TabsTrigger value='overview'>Overview</TabsTrigger>
                <TabsTrigger value='traceability'>Traceability</TabsTrigger>
                <TabsTrigger value='test-cases'>Test Cases</TabsTrigger>
                <TabsTrigger value='findings'>Findings</TabsTrigger>
                <TabsTrigger value='evidence'>Evidence</TabsTrigger>
                <TabsTrigger value='coverage'>Coverage</TabsTrigger>
                <TabsTrigger value='runs'>Runs</TabsTrigger>
                <TabsTrigger value='recommendations'>Recommendations</TabsTrigger>
                <TabsTrigger value='raw'>Raw Details</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value='overview' className='flex flex-col gap-5'>
              <MetricGrid report={report} />
              <TraceabilityTab traceability={traceability.slice(0, 4)} />
              <TestCasesTab checklist={report.checklist.slice(0, 6)} />
              <ReportScoreCards categories={report.categories} />
              <FindingsTab findings={report.findings.slice(0, 3)} />
            </TabsContent>
            <TabsContent value='traceability'>
              <TraceabilityTab traceability={traceability} />
            </TabsContent>
            <TabsContent value='test-cases'>
              <TestCasesTab checklist={report.checklist} />
            </TabsContent>
            <TabsContent value='findings'>
              <FindingsTab findings={report.findings} />
            </TabsContent>
            <TabsContent value='evidence'>
              <EvidenceTab evidence={report.evidence} />
            </TabsContent>
            <TabsContent value='coverage'>
              <CategoriesTab categories={report.categories} />
            </TabsContent>
            <TabsContent value='runs'>
              <TimelineTab timeline={timeline} />
            </TabsContent>
            <TabsContent value='recommendations'>
              <RecommendationsTab recommendations={report.recommendations} />
            </TabsContent>
            <TabsContent value='raw'>
              <Card className='rounded-lg'>
                <CardHeader>
                  <CardTitle>Raw details</CardTitle>
                  <CardDescription>
                    Original report payload for debugging and adapters.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className='max-h-[680px] overflow-auto rounded-md bg-muted p-4 text-xs leading-5'>
                    {stringifyRaw(report.raw ?? report)}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        <SummaryRail report={report} />
      </div>
    </main>
  );
}
