import Link from 'next/link';
import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import { MermaidDiagram } from '@/components/mermaid-diagram';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { getRadarSnapshot, type RadarSignal, type RadarSnapshot } from '@/lib/radar';

export const metadata = {
  title: 'Agent OS: Inbox Radar'
};

type RadarView = 'all' | 'review' | 'approvals' | 'signals' | 'tasks';

const views: Array<{ value: RadarView; label: string; description: string }> = [
  { value: 'all', label: 'All', description: 'Everything that deserves attention.' },
  { value: 'review', label: 'Review', description: 'Items Felipe should inspect or decide on.' },
  {
    value: 'approvals',
    label: 'Approvals',
    description: 'Explicit yes/no decisions before action.'
  },
  {
    value: 'signals',
    label: 'Signals',
    description: 'Weak signals, degraded sources and monitoring.'
  },
  { value: 'tasks', label: 'Tasks', description: 'Internal work that can become execution.' }
];

const operatingRules = [
  'Radar combines attention, review, and approvals — not just alerts.',
  'Cai can prepare and propose; external or risky steps require approval.',
  'Every signal can become a task, be snoozed, handled, or opened at its source.',
  'Extra detail appears when risk is high, not as default noise.'
];

function priorityVariant(priority: RadarSignal['priority']) {
  if (priority === 'high') return 'default' as const;
  if (priority === 'medium') return 'secondary' as const;
  return 'outline' as const;
}

function kindVariant(kind: RadarSignal['kind']) {
  if (kind === 'approval') return 'default' as const;
  if (kind === 'review') return 'secondary' as const;
  return 'outline' as const;
}

function sourceLabel(source: RadarSignal['source']) {
  return {
    tasks: 'Tasks',
    knowledge: 'Knowledge',
    notifications: 'Notifications',
    observability: 'Observability',
    runway: 'Runway',
    github: 'GitHub'
  }[source];
}

function kindLabel(kind: RadarSignal['kind']) {
  return {
    signal: 'Signal',
    review: 'Review',
    approval: 'Approval',
    draft: 'Draft',
    handoff: 'Handoff',
    task: 'Task'
  }[kind];
}

function normalizeView(value: string | undefined): RadarView {
  return views.some((view) => view.value === value) ? (value as RadarView) : 'all';
}

function matchesView(signal: RadarSignal, view: RadarView) {
  if (view === 'all') return true;
  if (view === 'approvals') return signal.kind === 'approval';
  if (view === 'signals') return signal.kind === 'signal';
  if (view === 'tasks') return signal.kind === 'task';
  return signal.kind === 'review' || signal.kind === 'draft' || signal.kind === 'handoff';
}

function radarUrl(view: RadarView, signalId?: string) {
  const search = new URLSearchParams({ view });
  if (signalId) search.set('signal', signalId);
  return `/dashboard/radar?${search.toString()}`;
}

function generatedLabel(value: string) {
  const generatedAt = new Date(value);
  if (Number.isNaN(generatedAt.getTime())) return 'Update time unavailable';

  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(generatedAt);
}

function agentFlowDiagram(highCount: number, reviewCount: number, approvalCount: number) {
  return `flowchart LR
  Sources["Mail · Calendar · GitHub · Ops · Tasks"] --> Radar["Inbox Radar"]
  Radar --> Classify{"Classify"}
  Classify --> Signals["Signals\\n${highCount} high"]
  Classify --> Review["Review queue\\n${reviewCount} items"]
  Classify --> Approvals["Approvals\\n${approvalCount} pending"]
  Signals --> Cai["Cai triages"]
  Review --> Felipe["Felipe reviews"]
  Approvals --> Felipe
  Cai --> Action["Create task · snooze · handle"]
  Felipe --> Action
  Action --> Memory["Receipts + state"]`;
}

function statusCopy(params: { error?: string; radar?: string; reason?: string; task?: string }) {
  if (params.task === 'created') return { tone: 'secondary' as const, text: 'Task created' };
  if (params.task === 'duplicate')
    return { tone: 'secondary' as const, text: 'Task already exists' };
  if (params.task === 'error') return { tone: 'destructive' as const, text: 'Task not created' };
  if (params.radar)
    return { tone: 'secondary' as const, text: `Radar state saved: ${params.radar}` };
  if (params.error?.startsWith('radar-state')) {
    return { tone: 'destructive' as const, text: 'Radar state not saved' };
  }
  return null;
}

function SignalActions({ signal }: { signal: RadarSignal }) {
  const canCreateTask = signal.source !== 'tasks';

  return (
    <div className='grid grid-cols-2 gap-2'>
      <Button asChild size='sm' className='col-span-2 w-full'>
        <Link href={signal.href}>
          {signal.actionLabel}
          <Icons.arrowRight data-icon='inline-end' />
        </Link>
      </Button>
      {canCreateTask && (
        <form action='/api/radar/signals/create-task' method='post' className='min-w-0'>
          <input type='hidden' name='id' value={signal.id} />
          <input type='hidden' name='title' value={signal.title} />
          <input type='hidden' name='detail' value={signal.detail} />
          <input type='hidden' name='source' value={signal.source} />
          <input type='hidden' name='priority' value={signal.priority} />
          <input type='hidden' name='href' value={signal.href} />
          {signal.meta && <input type='hidden' name='meta' value={signal.meta} />}
          <Button type='submit' variant='outline' size='sm' className='w-full'>
            <Icons.add data-icon='inline-start' />
            Create Task
          </Button>
        </form>
      )}
      <form
        action='/api/radar/signals/transition'
        method='post'
        className={cn('min-w-0', !canCreateTask && 'col-span-2')}
      >
        <input type='hidden' name='id' value={signal.id} />
        <input type='hidden' name='action' value='handled' />
        <Button type='submit' variant='secondary' size='sm' className='w-full'>
          <Icons.check data-icon='inline-start' />
          Mark Handled
        </Button>
      </form>
      <form action='/api/radar/signals/transition' method='post' className='col-span-2 min-w-0'>
        <input type='hidden' name='id' value={signal.id} />
        <input type='hidden' name='action' value='snooze' />
        <Button type='submit' variant='ghost' size='sm' className='w-full'>
          <Icons.clock data-icon='inline-start' />
          Snooze
        </Button>
      </form>
    </div>
  );
}

function SignalRow({
  signal,
  selected,
  view
}: {
  signal: RadarSignal;
  selected: boolean;
  view: RadarView;
}) {
  return (
    <article className='min-w-0'>
      <Link
        href={radarUrl(view, signal.id)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none md:px-5',
          selected && 'bg-primary/10 hover:bg-primary/15'
        )}
      >
        <div className='min-w-0'>
          <div className='mb-1.5 flex flex-wrap items-center gap-1.5'>
            <Badge variant={kindVariant(signal.kind)} className='text-[10px]'>
              {kindLabel(signal.kind)}
            </Badge>
            <Badge variant={priorityVariant(signal.priority)} className='text-[10px]'>
              {signal.priority}
            </Badge>
            <span className='text-muted-foreground text-[11px]'>{sourceLabel(signal.source)}</span>
          </div>
          <div className='truncate text-sm font-semibold'>{signal.title}</div>
          <div className='text-muted-foreground mt-1 line-clamp-2 text-xs leading-5'>
            {signal.detail}
          </div>
          {signal.meta && (
            <div className='text-muted-foreground mt-1 truncate font-mono text-[10px]'>
              {signal.meta}
            </div>
          )}
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {selected ? (
            <Badge variant='secondary' className='hidden sm:inline-flex'>
              Selected
            </Badge>
          ) : (
            <span className='text-muted-foreground hidden text-xs lg:inline'>Inspect</span>
          )}
          <Icons.chevronRight
            className='text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground'
            aria-hidden='true'
          />
        </div>
      </Link>
    </article>
  );
}

function RadarMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className='flex min-w-20 flex-col items-center justify-center px-3 py-3 text-center'>
      <dt className='text-muted-foreground order-2 text-[10px] font-medium uppercase tracking-wider'>
        {label}
      </dt>
      <dd className='order-1 text-xl font-semibold tabular-nums'>{value}</dd>
    </div>
  );
}

function RadarRightRail({
  selectedSignal,
  snapshot
}: {
  selectedSignal?: RadarSignal;
  snapshot: RadarSnapshot;
}) {
  return (
    <div className='flex flex-col gap-3'>
      <Card>
        <CardHeader className='gap-2 pb-3'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <CardTitle className='text-base'>Selected Signal</CardTitle>
              <CardDescription>Details and guarded actions.</CardDescription>
            </div>
            {selectedSignal ? (
              <Badge variant={priorityVariant(selectedSignal.priority)}>
                {selectedSignal.priority}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {selectedSignal ? (
            <div className='flex flex-col gap-4'>
              <div className='flex flex-col gap-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant={kindVariant(selectedSignal.kind)}>
                    {kindLabel(selectedSignal.kind)}
                  </Badge>
                  <Badge variant='outline'>{sourceLabel(selectedSignal.source)}</Badge>
                </div>
                <h2 className='text-pretty text-base font-semibold'>{selectedSignal.title}</h2>
                <p className='text-muted-foreground text-sm leading-6'>{selectedSignal.detail}</p>
                {selectedSignal.meta ? (
                  <p className='text-muted-foreground break-words font-mono text-[11px]'>
                    {selectedSignal.meta}
                  </p>
                ) : null}
              </div>
              <Separator />
              <SignalActions signal={selectedSignal} />
            </div>
          ) : (
            <Empty className='border-0 px-0 py-6'>
              <EmptyMedia variant='icon'>
                <Icons.inbox />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Queue Is Clear</EmptyTitle>
                <EmptyDescription>Select another queue to inspect its signals.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='gap-2 pb-2'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <CardTitle className='text-base'>Source Health</CardTitle>
              <CardDescription>Connector state behind this queue.</CardDescription>
            </div>
            <Badge variant={snapshot.sourceErrors.length > 0 ? 'destructive' : 'secondary'}>
              {snapshot.sourceErrors.length > 0
                ? `${snapshot.sourceErrors.length} issues`
                : 'Healthy'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='text-sm'>
          {snapshot.sourceErrors.length === 0 ? (
            <div className='text-muted-foreground flex items-start gap-2'>
              <Icons.circleCheck className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
              <p>No connector errors were reported in this snapshot.</p>
            </div>
          ) : (
            <Accordion type='single' collapsible>
              <AccordionItem value='source-errors'>
                <AccordionTrigger className='py-2'>Review Connector Issues</AccordionTrigger>
                <AccordionContent>
                  <ul className='text-muted-foreground flex flex-col gap-2'>
                    {snapshot.sourceErrors.map((error) => (
                      <li
                        key={error}
                        className='flex items-start gap-2 rounded-lg bg-muted/40 p-2.5'
                      >
                        <Icons.alertCircle className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
                        <span className='break-words'>{error}</span>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='gap-1 pb-2'>
          <CardTitle className='text-base'>Radar Model</CardTitle>
          <CardDescription>Flow and operating rules when you need them.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type='single' collapsible>
            <AccordionItem value='rules'>
              <AccordionTrigger>Operating Rules</AccordionTrigger>
              <AccordionContent>
                <ul className='text-muted-foreground flex flex-col gap-3 leading-5'>
                  {operatingRules.map((item) => (
                    <li key={item} className='flex items-start gap-2'>
                      <Icons.circleDot className='mt-1 size-3 shrink-0' aria-hidden='true' />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value='flow'>
              <AccordionTrigger>Agent Flow Map</AccordionTrigger>
              <AccordionContent>
                <MermaidDiagram
                  title='Inbox Radar agent flow'
                  chart={agentFlowDiagram(
                    snapshot.counts.high,
                    snapshot.counts.review,
                    snapshot.counts.approvals
                  )}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function RadarPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
    radar?: string;
    reason?: string;
    signal?: string;
    task?: string;
    view?: string;
  }>;
}) {
  const [snapshot, params] = await Promise.all([getRadarSnapshot(), searchParams]);
  const selectedView = normalizeView(params.view);
  const visibleSignals = snapshot.signals.filter((signal) => matchesView(signal, selectedView));
  const recommendation = snapshot.recommendation;
  const status = statusCopy(params);
  const activeView = views.find((view) => view.value === selectedView) ?? views[0];
  const selectedSignal =
    visibleSignals.find((signal) => signal.id === params.signal) ??
    visibleSignals.find((signal) => signal.id === recommendation.id) ??
    visibleSignals[0];
  const sourceMix: Array<[string, number]> = [
    ['Tasks', snapshot.counts.tasks],
    ['Knowledge', snapshot.counts.knowledge],
    ['Mail / Calendar', snapshot.counts.notifications],
    ['GitHub', snapshot.counts.github],
    ['Ops', snapshot.counts.observability],
    ['Runway', snapshot.counts.runway]
  ];

  return (
    <PageContainer
      pageTitle='Inbox Radar'
      pageDescription='One attention queue for signals, review, approvals, and task candidates.'
      pageHeaderAction={
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant={snapshot.sourceErrors.length > 0 ? 'destructive' : 'secondary'}>
            <Icons.activity data-icon='inline-start' />
            {snapshot.sourceErrors.length > 0 ? 'Degraded Sources' : 'Sources Healthy'}
          </Badge>
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard/chat'>
              <Icons.chat data-icon='inline-start' />
              Ask Cai
            </Link>
          </Button>
        </div>
      }
      rightRailTitle='Signal context'
      rightRailDescription='Selected signal, actions, and source health.'
      rightRailDefaultOpen={params.signal ? true : undefined}
      rightRail={<RadarRightRail selectedSignal={selectedSignal} snapshot={snapshot} />}
    >
      <div className='flex min-w-0 flex-1 flex-col gap-4'>
        <section
          aria-labelledby='radar-attention-heading'
          className='overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm'
        >
          <div className='grid min-w-0 lg:grid-cols-[minmax(0,1fr)_auto]'>
            <div className='flex min-w-0 flex-col gap-2 p-4 md:p-5'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant={kindVariant(recommendation.kind)}>
                  <Icons.sparkles data-icon='inline-start' />
                  Next Attention
                </Badge>
                <Badge variant={priorityVariant(recommendation.priority)}>
                  {recommendation.priority}
                </Badge>
                <span className='text-muted-foreground text-xs'>
                  {sourceLabel(recommendation.source)}
                </span>
              </div>
              <h2 id='radar-attention-heading' className='truncate text-lg font-semibold'>
                {recommendation.title}
              </h2>
              <p className='text-muted-foreground line-clamp-2 max-w-3xl text-sm leading-5'>
                {recommendation.detail}
              </p>
              <div>
                <Button asChild variant='link' size='sm' className='h-auto px-0'>
                  <Link href={radarUrl('all', recommendation.id)}>
                    Inspect Recommendation
                    <Icons.arrowRight data-icon='inline-end' />
                  </Link>
                </Button>
              </div>
            </div>
            <Separator className='lg:hidden' />
            <dl className='grid grid-cols-4 divide-x lg:border-l'>
              <RadarMetric label='Open' value={snapshot.counts.total} />
              <RadarMetric label='Review' value={snapshot.counts.review} />
              <RadarMetric label='Approval' value={snapshot.counts.approvals} />
              <RadarMetric label='High' value={snapshot.counts.high} />
            </dl>
          </div>
        </section>

        {status ? (
          <div role='status' aria-live='polite'>
            <Badge variant={status.tone}>{status.text}</Badge>
          </div>
        ) : null}

        <section
          aria-label='Radar queue filters'
          className='flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 text-card-foreground'
        >
          <nav
            className='flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain'
            aria-label='Queues'
          >
            {views.map((view) => {
              const count = snapshot.signals.filter((signal) =>
                matchesView(signal, view.value)
              ).length;
              const active = selectedView === view.value;
              return (
                <Button
                  key={view.value}
                  asChild
                  variant={active ? 'secondary' : 'ghost'}
                  size='sm'
                  className='shrink-0'
                >
                  <Link href={radarUrl(view.value)} aria-current={active ? 'page' : undefined}>
                    {view.label}
                    <Badge variant='outline'>{count}</Badge>
                  </Link>
                </Button>
              );
            })}
          </nav>
          <Separator />
          <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <span className='text-muted-foreground text-[10px] font-medium uppercase tracking-wider'>
              Source mix
            </span>
            {sourceMix.map(([label, value]) => (
              <span key={label} className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <span>{label}</span>
                <Badge variant='outline' className='tabular-nums'>
                  {value}
                </Badge>
              </span>
            ))}
          </div>
        </section>

        <div className='min-w-0'>
          <Card className='min-w-0 gap-0 overflow-hidden py-0'>
            <CardHeader className='py-4'>
              <CardTitle className='text-base'>{activeView.label} Queue</CardTitle>
              <CardDescription className='line-clamp-1'>{activeView.description}</CardDescription>
              <CardAction>
                <Badge variant='outline' className='shrink-0 tabular-nums'>
                  {visibleSignals.length} items
                </Badge>
              </CardAction>
            </CardHeader>
            <Separator />
            <CardContent className='p-0'>
              {visibleSignals.length === 0 ? (
                <Empty className='min-h-72 border-0'>
                  <EmptyMedia variant='icon'>
                    <Icons.inbox />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>Nothing Needs Attention Here</EmptyTitle>
                    <EmptyDescription>
                      This queue is clear. Choose another view to continue triage.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div
                  role='list'
                  className='divide-y lg:max-h-[calc(100svh-28rem)] lg:min-h-72 lg:overflow-y-auto lg:overscroll-contain'
                >
                  {visibleSignals.map((signal) => (
                    <div key={signal.id} role='listitem'>
                      <SignalRow
                        signal={signal}
                        selected={signal.id === selectedSignal?.id}
                        view={selectedView}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <Separator />
            <CardFooter className='text-muted-foreground flex flex-wrap justify-between gap-2 py-3 text-[11px]'>
              <span>
                Source: <span className='font-mono'>{snapshot.source}</span> · State:{' '}
                <span className='font-mono'>{snapshot.stateSource}</span>
              </span>
              <time dateTime={snapshot.generatedAt}>{generatedLabel(snapshot.generatedAt)}</time>
            </CardFooter>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
