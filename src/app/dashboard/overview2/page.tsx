import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Overview 2 Concept'
};

const commandActions = [
  { label: 'Start mission', detail: 'Launch a focused agent run', tone: 'primary' },
  { label: 'Approve plan', detail: 'Review queued decisions', tone: 'outline' },
  { label: 'Delegate', detail: 'Assign work to an agent', tone: 'outline' },
  { label: 'Ask Cai', detail: 'Open command chat', tone: 'outline' }
];

const agents = [
  { name: 'Cai', role: 'Cockpit operator', emoji: '⚛️', status: 'online', load: 'low' },
  { name: 'Charles', role: 'Lysande product', emoji: '🧭', status: 'researching', load: 'med' },
  { name: 'Worker-07', role: 'Code execution', emoji: '🛠️', status: 'idle', load: 'low' },
  { name: 'Scout', role: 'Signals + leads', emoji: '📡', status: 'standby', load: 'low' }
];

const missionSteps = [
  { label: 'Clarify goal', state: 'done' },
  { label: 'Draft plan', state: 'active' },
  { label: 'Delegate workers', state: 'queued' },
  { label: 'Verify output', state: 'queued' }
];

const feed = [
  { agent: 'Cai', event: 'Prepared dashboard concept route', time: '2m ago', type: 'design' },
  { agent: 'Charles', event: 'Queued GTM positioning review', time: '12m ago', type: 'research' },
  { agent: 'Worker-07', event: 'Build verification passed', time: '21m ago', type: 'code' },
  { agent: 'Radar', event: 'Detected 3 high-signal items', time: '34m ago', type: 'signal' }
];

const signals = [
  { label: 'Builds', value: 'idle', meta: 'last green' },
  { label: 'Calendar', value: '2', meta: 'next 24h' },
  { label: 'Markets', value: '+1.8%', meta: 'holdings avg' },
  { label: 'Radar', value: '3', meta: 'needs review' }
];

function StatusPill({ state }: { state: string }) {
  const active = ['online', 'researching', 'active', 'done'].includes(state);
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full border bg-background/45 px-2 py-1 text-[11px] text-muted-foreground'>
      <span className={`size-1.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground'}`} />
      {state}
    </span>
  );
}

export default function Overview2Page() {
  return (
    <PageContainer>
      <div className='relative min-h-[calc(100vh-6rem)] overflow-hidden rounded-[2rem] border bg-background p-4 text-foreground shadow-sm md:p-6'>
        <div className='pointer-events-none absolute inset-0'>
          <div className='absolute -left-24 top-0 h-80 w-80 rounded-full bg-primary/20 blur-3xl' />
          <div className='absolute right-[-10%] top-12 h-96 w-96 rounded-full bg-primary/25 blur-3xl' />
          <div className='absolute bottom-[-15%] left-1/3 h-96 w-96 rounded-full bg-primary/10 blur-3xl' />
          <div className='absolute inset-0 bg-primary/5' />
        </div>

        <div className='relative grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'>
          <main className='space-y-4'>
            <section className='rounded-[1.75rem] border bg-card/70 p-5 shadow-sm backdrop-blur md:p-6'>
              <div className='flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
                <div className='max-w-3xl space-y-3'>
                  <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
                    Overview 2 concept
                  </Badge>
                  <div>
                    <h1 className='text-3xl font-semibold tracking-tight md:text-5xl'>
                      Mission control for your agent network.
                    </h1>
                    <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base'>
                      A mocked Cai cockpit: start missions, approve plans, delegate work, and watch
                      the live agent feed without turning the normal overview into a design fight.
                    </p>
                  </div>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button asChild variant='outline' className='rounded-full'>
                    <Link href='/dashboard/overview'>Current overview</Link>
                  </Button>
                  <Button asChild className='rounded-full'>
                    <Link href='/dashboard/chat'>Ask Cai</Link>
                  </Button>
                </div>
              </div>
            </section>

            <section className='grid gap-3 md:grid-cols-4'>
              {commandActions.map((action) => (
                <Card
                  key={action.label}
                  className='group overflow-hidden border-primary/15 bg-card/70 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg hover:shadow-primary/10'
                >
                  <CardContent className='p-4'>
                    <div className='mb-4 flex size-10 items-center justify-center rounded-2xl border bg-primary/10 text-primary transition group-hover:scale-105'>
                      +
                    </div>
                    <div className='font-semibold'>{action.label}</div>
                    <div className='mt-1 text-xs leading-5 text-muted-foreground'>
                      {action.detail}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className='grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]'>
              <Card className='relative overflow-hidden border-primary/20 bg-card/75 shadow-sm backdrop-blur'>
                <div className='pointer-events-none absolute inset-x-0 top-0 h-40 bg-primary/10 blur-2xl' />
                <CardHeader className='relative'>
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <CardTitle className='text-2xl'>Active mission</CardTitle>
                      <CardDescription>
                        Mocked planner surface. This becomes real later.
                      </CardDescription>
                    </div>
                    <Badge className='bg-primary text-primary-foreground'>active</Badge>
                  </div>
                </CardHeader>
                <CardContent className='relative space-y-5'>
                  <div className='rounded-3xl border bg-background/45 p-4'>
                    <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                      <div>
                        <div className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
                          Mission
                        </div>
                        <h2 className='mt-2 text-2xl font-semibold'>
                          Build a cleaner agent cockpit prototype
                        </h2>
                        <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
                          Design a more energetic overview that shows agents, mission state,
                          approvals, and live execution — while keeping the current production
                          overview stable.
                        </p>
                      </div>
                      <div className='rounded-2xl border bg-card/70 p-3 text-sm'>
                        <div className='text-muted-foreground'>ETA</div>
                        <div className='text-xl font-semibold'>Today</div>
                      </div>
                    </div>
                  </div>

                  <div className='grid gap-3 md:grid-cols-4'>
                    {missionSteps.map((step, index) => (
                      <div key={step.label} className='rounded-2xl border bg-background/45 p-3'>
                        <div className='mb-3 flex items-center justify-between gap-2'>
                          <span className='flex size-7 items-center justify-center rounded-xl border bg-muted/40 text-xs font-semibold'>
                            {index + 1}
                          </span>
                          <StatusPill state={step.state} />
                        </div>
                        <div className='text-sm font-medium'>{step.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className='flex flex-wrap gap-2'>
                    <Button className='rounded-full'>Approve plan</Button>
                    <Button variant='outline' className='rounded-full'>
                      Delegate workers
                    </Button>
                    <Button variant='outline' className='rounded-full'>
                      Pause mission
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className='border-primary/15 bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader>
                  <CardTitle>Agent roster</CardTitle>
                  <CardDescription>Who is available right now.</CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {agents.map((agent) => (
                    <div
                      key={agent.name}
                      className='flex items-center gap-3 rounded-2xl border bg-background/45 p-3'
                    >
                      <div className='flex size-11 shrink-0 items-center justify-center rounded-2xl border bg-primary/10 text-xl'>
                        {agent.emoji}
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center justify-between gap-2'>
                          <div className='truncate font-medium'>{agent.name}</div>
                          <StatusPill state={agent.status} />
                        </div>
                        <div className='mt-1 text-xs text-muted-foreground'>
                          {agent.role} · load {agent.load}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className='flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/10 p-4 text-sm font-medium text-primary transition hover:bg-primary/15'>
                    <span className='text-lg'>+</span> Add agent
                  </button>
                </CardContent>
              </Card>
            </section>
          </main>

          <aside className='space-y-4'>
            <Card className='border-primary/15 bg-card/75 shadow-sm backdrop-blur'>
              <CardHeader>
                <CardTitle>Live agent feed</CardTitle>
                <CardDescription>Mocked event stream.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {feed.map((item) => (
                  <div
                    key={`${item.agent}-${item.time}`}
                    className='rounded-2xl border bg-background/45 p-3'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <div className='font-medium'>{item.agent}</div>
                        <div className='mt-1 text-sm leading-5 text-muted-foreground'>
                          {item.event}
                        </div>
                      </div>
                      <Badge variant='outline' className='shrink-0 text-[10px]'>
                        {item.type}
                      </Badge>
                    </div>
                    <div className='mt-2 text-[11px] text-muted-foreground'>{item.time}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className='border-primary/15 bg-card/75 shadow-sm backdrop-blur'>
              <CardHeader>
                <CardTitle>Signals</CardTitle>
                <CardDescription>Compact rail summary.</CardDescription>
              </CardHeader>
              <CardContent className='grid grid-cols-2 gap-2'>
                {signals.map((signal) => (
                  <div key={signal.label} className='rounded-2xl border bg-background/45 p-3'>
                    <div className='text-[11px] uppercase tracking-wide text-muted-foreground'>
                      {signal.label}
                    </div>
                    <div className='mt-1 text-xl font-semibold'>{signal.value}</div>
                    <div className='mt-1 text-xs text-muted-foreground'>{signal.meta}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}
