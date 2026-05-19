import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { MermaidDiagram } from '@/components/mermaid-diagram';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getRadarSnapshot, type RadarSignal } from '@/lib/radar';

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
    <div className='flex flex-wrap items-center gap-2'>
      {canCreateTask && (
        <form action='/api/radar/signals/create-task' method='post'>
          <input type='hidden' name='id' value={signal.id} />
          <input type='hidden' name='title' value={signal.title} />
          <input type='hidden' name='detail' value={signal.detail} />
          <input type='hidden' name='source' value={signal.source} />
          <input type='hidden' name='priority' value={signal.priority} />
          <input type='hidden' name='href' value={signal.href} />
          {signal.meta && <input type='hidden' name='meta' value={signal.meta} />}
          <Button type='submit' variant='secondary' size='sm'>
            Create task
          </Button>
        </form>
      )}
      <Button asChild variant='outline' size='sm'>
        <Link href={signal.href}>{signal.actionLabel}</Link>
      </Button>
      <form action='/api/radar/signals/transition' method='post'>
        <input type='hidden' name='id' value={signal.id} />
        <input type='hidden' name='action' value='handled' />
        <Button type='submit' variant='secondary' size='sm'>
          Handled
        </Button>
      </form>
      <form action='/api/radar/signals/transition' method='post'>
        <input type='hidden' name='id' value={signal.id} />
        <input type='hidden' name='action' value='snooze' />
        <Button type='submit' variant='ghost' size='sm'>
          Snooze
        </Button>
      </form>
    </div>
  );
}

function SignalCard({ signal, selected = false }: { signal: RadarSignal; selected?: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-background/55 p-4 shadow-sm transition hover:border-primary/40 hover:bg-primary/5 ${selected ? 'border-primary/50 bg-primary/10' : ''}`}
    >
      <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
        <div className='min-w-0 space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant={kindVariant(signal.kind)}>{kindLabel(signal.kind)}</Badge>
            <Badge variant={priorityVariant(signal.priority)}>{signal.priority}</Badge>
            <Badge variant='outline'>{sourceLabel(signal.source)}</Badge>
          </div>
          <div className='text-base font-semibold'>{signal.title}</div>
          <div className='text-muted-foreground text-sm'>{signal.detail}</div>
          {signal.meta && (
            <div className='text-muted-foreground font-mono text-[11px]'>{signal.meta}</div>
          )}
        </div>
        <SignalActions signal={signal} />
      </div>
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

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='relative overflow-hidden rounded-3xl border bg-card p-6 shadow-sm'>
          <div className='absolute inset-y-0 right-0 hidden w-1/2 rounded-l-full bg-primary/10 blur-3xl lg:block' />
          <div className='relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
            <div className='space-y-3'>
              <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
                agentic attention cockpit
              </Badge>
              <div>
                <h1 className='text-3xl font-semibold tracking-tight md:text-5xl'>Inbox Radar</h1>
                <p className='text-muted-foreground mt-2 max-w-3xl text-sm md:text-base'>
                  En samlad yta för signaler, review, approvals och task candidates. Inte fler sidor
                  — mer kontroll, bättre triage och tydligare agentflöde.
                </p>
              </div>
            </div>
            <div className='grid grid-cols-3 gap-2 rounded-2xl border bg-background/70 p-3 text-center text-sm backdrop-blur'>
              <div>
                <div className='text-muted-foreground text-xs'>Open</div>
                <div className='text-2xl font-semibold'>{snapshot.counts.total}</div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>Review</div>
                <div className='text-2xl font-semibold'>{snapshot.counts.review}</div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>High</div>
                <div className='text-2xl font-semibold'>{snapshot.counts.high}</div>
              </div>
            </div>
          </div>
        </div>

        {status && <Badge variant={status.tone}>{status.text}</Badge>}

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_380px]'>
          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Queues</CardTitle>
                <CardDescription>Filtera samma inbox — skapa inte nya silos.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-2'>
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
                      className='h-auto w-full justify-between gap-3 rounded-xl p-3 text-left'
                    >
                      <Link href={`/dashboard/radar?view=${view.value}`}>
                        <span>
                          <span className='block font-medium'>{view.label}</span>
                          <span className='text-muted-foreground block text-xs'>
                            {view.description}
                          </span>
                        </span>
                        <Badge variant='outline'>{count}</Badge>
                      </Link>
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Source mix</CardTitle>
                <CardDescription>Vad radarn lyssnar på just nu.</CardDescription>
              </CardHeader>
              <CardContent className='grid grid-cols-2 gap-2 text-sm'>
                {[
                  ['Tasks', snapshot.counts.tasks],
                  ['Knowledge', snapshot.counts.knowledge],
                  ['Mail/Calendar', snapshot.counts.notifications],
                  ['GitHub', snapshot.counts.github],
                  ['Ops', snapshot.counts.observability],
                  ['Runway', snapshot.counts.runway]
                ].map(([label, value]) => (
                  <div key={label} className='rounded-xl border bg-background/45 p-3'>
                    <div className='text-muted-foreground text-xs'>{label}</div>
                    <div className='text-xl font-semibold'>{value}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className='overflow-hidden border-primary/20'>
            <CardHeader className='border-b bg-primary/5'>
              <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                <div>
                  <CardDescription>Central agent console</CardDescription>
                  <CardTitle className='text-2xl'>{recommendation.title}</CardTitle>
                </div>
                <Badge variant={priorityVariant(recommendation.priority)}>
                  {recommendation.priority}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className='space-y-4 p-4 md:p-6'>
              <div className='space-y-3'>
                <div className='max-w-[86%] rounded-2xl border bg-background/70 p-4'>
                  <div className='text-muted-foreground text-xs'>Cai</div>
                  <div className='mt-1 text-sm'>
                    Jag har konsoliderat radarn till <b>{activeView.label}</b>. Nästa tydliga
                    attention item är nedan. Välj action, eller öppna källan om du vill se mer
                    kontext.
                  </div>
                </div>
                <div className='ml-auto max-w-[86%] rounded-2xl border bg-primary/10 p-4'>
                  <div className='text-muted-foreground text-xs'>Radar recommendation</div>
                  <div className='mt-1 text-sm'>{recommendation.detail}</div>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <Badge variant={kindVariant(recommendation.kind)}>
                      {kindLabel(recommendation.kind)}
                    </Badge>
                    <Badge variant='outline'>{sourceLabel(recommendation.source)}</Badge>
                    {recommendation.meta && (
                      <Badge variant='secondary'>{recommendation.meta}</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className='rounded-2xl border bg-background/45 p-3'>
                <Textarea
                  value='Ask Cai to summarize, create a task, snooze noise, or explain why this matters…'
                  readOnly
                  className='min-h-20 resize-none border-0 bg-transparent text-muted-foreground shadow-none focus-visible:ring-0'
                />
                <div className='flex flex-wrap justify-end gap-2 border-t pt-3'>
                  <Button asChild variant='outline' size='sm'>
                    <Link href='/dashboard/chat'>Open Cai chat</Link>
                  </Button>
                  <Button asChild size='sm'>
                    <Link href={recommendation.href}>{recommendation.actionLabel}</Link>
                  </Button>
                </div>
              </div>

              <div className='space-y-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <h2 className='font-semibold'>{activeView.label} queue</h2>
                    <p className='text-muted-foreground text-sm'>{activeView.description}</p>
                  </div>
                  <Badge variant='outline'>{visibleSignals.length} items</Badge>
                </div>

                {visibleSignals.length === 0 ? (
                  <div className='text-muted-foreground rounded-2xl border border-dashed p-8 text-sm'>
                    Inget i den här kön just nu.
                  </div>
                ) : (
                  visibleSignals.map((signal) => (
                    <SignalCard
                      key={signal.id}
                      signal={signal}
                      selected={signal.id === recommendation.id}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Agent flow map</CardTitle>
                <CardDescription>Interaktiv karta: zooma, panorera, förstå flödet.</CardDescription>
              </CardHeader>
              <CardContent>
                <MermaidDiagram
                  title='Inbox Radar agent flow'
                  chart={agentFlowDiagram(
                    snapshot.counts.high,
                    snapshot.counts.review,
                    snapshot.counts.approvals
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Operating rules</CardTitle>
                <CardDescription>Chat är inte hela produkten. Kontrollpanelen är.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                {[
                  'Inbox Radar = attention + review + approvals, inte bara alerts.',
                  'Cai får förbereda och föreslå; externa eller riskabla steg kräver approval.',
                  'Varje item ska kunna bli task, snoozas, markeras handled eller öppnas i sin källa.',
                  'Mer detaljer visas när risken är hög — inte som standardbrus.'
                ].map((item) => (
                  <div key={item} className='rounded-xl border bg-background/45 p-3'>
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>

            {snapshot.sourceErrors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Source errors</CardTitle>
                  <CardDescription>Fail-soft connectors that need inspection.</CardDescription>
                </CardHeader>
                <CardContent className='space-y-2 text-sm'>
                  {snapshot.sourceErrors.map((error) => (
                    <div key={error} className='rounded-xl border bg-background/40 p-3'>
                      {error}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs'>
          <div>
            Source: <span className='font-mono'>{snapshot.source}</span> · State:{' '}
            <span className='font-mono'>{snapshot.stateSource}</span>
          </div>
          <div>{new Date(snapshot.generatedAt).toLocaleString('sv-SE')}</div>
        </div>
      </div>
    </PageContainer>
  );
}
