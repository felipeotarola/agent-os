import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Overview 2 Concept'
};

const navItems = [
  'Mission Control',
  'Inbox Radar',
  'Action Center',
  'Tasks',
  'Knowledge Inbox',
  'Wiki',
  'Memory',
  'Journal',
  'Chat',
  'Mail Radar',
  'Notifications',
  'Runway',
  'GitLab',
  'Vercel',
  'Supabase',
  'Assistant',
  'Agents',
  'Topology',
  'Architecture',
  'Settings'
];

const quickActions = [
  { label: 'Start mission', icon: '↗', variant: 'default' },
  { label: 'Approve plan', icon: '✓', variant: 'secondary' },
  { label: 'Delegate', icon: '→', variant: 'secondary' },
  { label: 'Ask Cai', icon: '⚛', variant: 'outline' }
] as const;

const planSteps = [
  {
    title: 'Build integration shell',
    detail: 'Nordea auth, consent, callback route',
    state: 'ready'
  },
  {
    title: 'Add transaction sync',
    detail: 'Normalize account + transaction payloads',
    state: 'next'
  },
  {
    title: 'Extend onboarding copy',
    detail: 'Explain bank connection and consent scope',
    state: 'copy'
  },
  {
    title: 'QA, docs, rollout',
    detail: 'Smoke tests, edge cases, deployment notes',
    state: 'queued'
  }
];

const evidence = [
  { label: 'Expected speedup', value: '~45%', detail: 'agent-ready plan' },
  { label: 'Confidence', value: '85%', detail: 'enough context' },
  { label: 'ETA', value: 'Today', detail: 'first working pass' }
];

const agents = [
  { name: 'Conductor', role: 'Mission orchestration', status: 'Online', load: '42%', icon: '⚛️' },
  { name: 'Charles', role: 'Product + research', status: 'Ready', load: '18%', icon: '🧭' },
  { name: 'Sladdis', role: 'Local ops assistant', status: 'Idle', load: '8%', icon: '🧰' },
  { name: 'Worker Pool', role: 'Coding execution', status: 'Standby', load: '31%', icon: '🛠️' }
];

const feed = [
  { actor: 'Cai', text: 'Drafted mission plan for Open Banking integration.', time: '2m ago' },
  {
    actor: 'Worker Pool',
    text: 'Found existing onboarding surface and API boundaries.',
    time: '8m ago'
  },
  { actor: 'Charles', text: 'Flagged consent-copy as the highest trust risk.', time: '13m ago' },
  { actor: 'System', text: 'No production action will run without Felipe approval.', time: 'safe' }
];

const memoryItems = [
  'Felipe prefers direct, concise execution notes.',
  'Use mocked UI here; keep production overview untouched.',
  'Nordea banking work needs clear consent language.'
];

const contextBlocks = [
  { title: 'Weather', value: '+16°C', detail: 'Upplands Väsby · light cloud' },
  { title: 'Calendar', value: '2 events', detail: 'Next: focus block at 14:00' },
  { title: 'Briefing', value: '3 notes', detail: 'Banking, agents, dashboard polish' },
  { title: 'Markets', value: 'Calm', detail: 'No urgent signal detected' },
  { title: 'News signals', value: '5', detail: 'Open banking + AI infra' },
  { title: 'Status checks', value: 'Healthy', detail: 'GitLab, Vercel, Supabase online' }
];

function Dot({ active = false }: { active?: boolean }) {
  return (
    <span className={`size-2 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
  );
}

function SmallMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className='rounded-2xl border bg-background/55 p-3'>
      <div className='text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground'>
        {label}
      </div>
      <div className='mt-1 text-2xl font-semibold tracking-tight'>{value}</div>
      <div className='mt-1 text-xs text-muted-foreground'>{detail}</div>
    </div>
  );
}

function PanelTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div>
      {eyebrow ? (
        <div className='text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground'>
          {eyebrow}
        </div>
      ) : null}
      <h2 className='mt-1 text-lg font-semibold tracking-tight'>{title}</h2>
    </div>
  );
}

export default function Overview2Page() {
  return (
    <PageContainer>
      <div className='relative min-h-[calc(100vh-6rem)] overflow-x-hidden overflow-y-visible rounded-[2rem] border bg-background text-foreground shadow-sm [touch-action:pan-y]'>
        <div className='pointer-events-none absolute inset-0 bg-primary/[0.03]' />
        <div className='pointer-events-none absolute -left-40 top-0 size-96 rounded-full bg-primary/15 blur-3xl' />
        <div className='pointer-events-none absolute right-0 top-10 size-96 rounded-full bg-primary/10 blur-3xl' />

        <div className='relative grid gap-0 xl:grid-cols-[236px_minmax(0,1fr)_322px]'>
          <aside className='hidden border-r bg-card/55 p-4 xl:block'>
            <div className='mb-6 flex items-center gap-3 rounded-2xl border bg-background/55 p-3'>
              <div className='flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground'>
                ⚛
              </div>
              <div>
                <div className='text-sm font-semibold'>Cai OS</div>
                <div className='text-xs text-muted-foreground'>Agent cockpit</div>
              </div>
            </div>

            <nav className='space-y-1.5'>
              {navItems.map((item) => {
                const active = item === 'Mission Control';
                return (
                  <Link
                    key={item}
                    href='/dashboard/overview2'
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                      active
                        ? 'border-primary/35 bg-primary/12 text-primary shadow-sm'
                        : 'border-transparent text-muted-foreground hover:border-border hover:bg-background/45 hover:text-foreground'
                    }`}
                  >
                    <span>{item}</span>
                    {active ? <Dot active /> : null}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className='space-y-4 p-4 lg:p-5'>
            <header className='flex flex-col gap-3 rounded-3xl border bg-card/70 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between'>
              <div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant='outline' className='border-primary/35 bg-primary/10 text-primary'>
                    Live
                  </Badge>
                  <span className='text-xs text-muted-foreground'>
                    Felipe, Cai is running your mission.
                  </span>
                </div>
                <h1 className='mt-2 text-3xl font-semibold tracking-tight md:text-4xl'>
                  Cai Command Center
                </h1>
              </div>
              <div className='flex items-center gap-2 rounded-2xl border bg-background/55 p-2 text-sm text-muted-foreground'>
                <span className='hidden md:inline'>Search missions, agents, memory</span>
                <span className='rounded-xl border bg-card px-3 py-1'>⌘K</span>
              </div>
            </header>

            <section className='grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]'>
              <Card className='overflow-hidden border-primary/20 bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader className='pb-3'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div>
                      <Badge
                        variant='outline'
                        className='mb-3 border-primary/35 bg-primary/10 text-primary'
                      >
                        Recommended next mission
                      </Badge>
                      <CardTitle className='max-w-2xl text-2xl md:text-3xl'>
                        Build minimal Nordea Open Banking integration
                      </CardTitle>
                      <CardDescription className='mt-2 max-w-2xl text-sm leading-6'>
                        Cai found a compact path: authenticate, sync transactions, explain consent,
                        then ship a guarded first pass with mocked fallbacks.
                      </CardDescription>
                    </div>
                    <Badge className='bg-primary text-primary-foreground'>85% confidence</Badge>
                  </div>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
                    {quickActions.map((action) => (
                      <Button
                        key={action.label}
                        variant={action.variant}
                        className='h-auto justify-between rounded-2xl px-4 py-3 text-left'
                      >
                        <span>{action.label}</span>
                        <span>{action.icon}</span>
                      </Button>
                    ))}
                  </div>

                  <div className='grid gap-3 md:grid-cols-3'>
                    {evidence.map((item) => (
                      <SmallMetric key={item.label} {...item} />
                    ))}
                  </div>

                  <div className='rounded-3xl border bg-background/55 p-4'>
                    <PanelTitle
                      eyebrow='Why it matters'
                      title='This converts the dashboard into a command loop.'
                    />
                    <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                      The cockpit should show the best next move, the plan Cai proposes, who can do
                      the work, and what Felipe must approve before anything real happens.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className='bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader>
                  <PanelTitle eyebrow='Cai’s plan' title='Minimal path to a shippable pass' />
                </CardHeader>
                <CardContent className='space-y-3'>
                  {planSteps.map((step, index) => (
                    <div
                      key={step.title}
                      className='flex gap-3 rounded-2xl border bg-background/55 p-3'
                    >
                      <div className='flex size-8 shrink-0 items-center justify-center rounded-xl border bg-muted/50 text-xs font-semibold'>
                        {index + 1}
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center justify-between gap-2'>
                          <div className='truncate text-sm font-medium'>{step.title}</div>
                          <Badge variant='outline' className='text-[10px]'>
                            {step.state}
                          </Badge>
                        </div>
                        <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <section className='grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(330px,0.75fr)]'>
              <Card className='bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader>
                  <div className='flex items-start justify-between gap-3'>
                    <PanelTitle eyebrow='Active mission' title='Nordea integration sprint' />
                    <Badge
                      variant='outline'
                      className='border-primary/35 bg-primary/10 text-primary'
                    >
                      42%
                    </Badge>
                  </div>
                  <CardDescription>
                    Progress, evidence, and the signals behind Cai’s recommendation.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <Progress value={42} className='h-3' />
                  <div className='grid gap-3 md:grid-cols-[1fr_220px]'>
                    <div className='space-y-2 rounded-3xl border bg-background/55 p-4'>
                      {[
                        'OAuth path identified',
                        'Transaction schema mapped',
                        'Consent copy needs approval'
                      ].map((item, index) => (
                        <div key={item} className='flex items-center gap-2 text-sm'>
                          <Dot active={index < 2} />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                    <div className='rounded-3xl border bg-background/55 p-4'>
                      <div className='mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground'>
                        Progress graph
                      </div>
                      <div className='flex h-24 items-end gap-2'>
                        {[28, 42, 36, 58, 51, 72, 66].map((height, index) => (
                          <div key={`${height}-${index}`} className='flex flex-1 items-end'>
                            <div
                              className='w-full rounded-t-lg bg-primary/30'
                              style={{ height: `${height}%` }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className='bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader>
                  <PanelTitle eyebrow='Live agent feed' title='Recent activity' />
                </CardHeader>
                <CardContent className='space-y-3'>
                  {feed.map((item) => (
                    <div
                      key={`${item.actor}-${item.time}`}
                      className='rounded-2xl border bg-background/55 p-3'
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='font-medium'>{item.actor}</div>
                        <span className='text-[11px] text-muted-foreground'>{item.time}</span>
                      </div>
                      <p className='mt-1 text-sm leading-5 text-muted-foreground'>{item.text}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <section className='grid gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]'>
              <Card className='bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader>
                  <PanelTitle eyebrow='Your agents' title='Available operators' />
                </CardHeader>
                <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
                  {agents.map((agent) => (
                    <div key={agent.name} className='rounded-3xl border bg-background/55 p-4'>
                      <div className='mb-4 flex items-center justify-between gap-3'>
                        <div className='flex size-11 items-center justify-center rounded-2xl border bg-primary/10 text-xl'>
                          {agent.icon}
                        </div>
                        <Badge variant='outline' className='text-[10px]'>
                          {agent.status}
                        </Badge>
                      </div>
                      <div className='font-semibold'>{agent.name}</div>
                      <div className='mt-1 text-xs text-muted-foreground'>{agent.role}</div>
                      <div className='mt-3 flex items-center justify-between text-xs text-muted-foreground'>
                        <span>Load</span>
                        <span>{agent.load}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className='bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader>
                  <PanelTitle eyebrow='Agent Health' title='98% healthy' />
                </CardHeader>
                <CardContent className='space-y-3'>
                  {['Gateway online', 'Workers reachable', 'Memory indexed'].map((item) => (
                    <div
                      key={item}
                      className='flex items-center justify-between rounded-2xl border bg-background/55 p-3 text-sm'
                    >
                      <span>{item}</span>
                      <Dot active />
                    </div>
                  ))}
                  <Button variant='outline' className='w-full rounded-2xl border-dashed'>
                    + Add agent
                  </Button>
                </CardContent>
              </Card>
            </section>

            <section className='grid gap-4 2xl:grid-cols-2'>
              <Card className='bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader>
                  <PanelTitle eyebrow='Memory & Knowledge' title='Relevant context Cai is using' />
                </CardHeader>
                <CardContent className='space-y-2'>
                  {memoryItems.map((item) => (
                    <div
                      key={item}
                      className='rounded-2xl border bg-background/55 p-3 text-sm text-muted-foreground'
                    >
                      {item}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className='bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader>
                  <PanelTitle eyebrow='Runway' title='Execution budget' />
                </CardHeader>
                <CardContent className='grid gap-3 sm:grid-cols-2'>
                  <SmallMetric label='Tasks completed' value='18/40' detail='current mission' />
                  <SmallMetric label='Compute used' value='62%' detail='normal range' />
                  <SmallMetric label='Budget burn' value='$18.40/$50' detail='mock cap' />
                  <SmallMetric label='Resets in' value='2d 5h' detail='next allowance' />
                </CardContent>
              </Card>
            </section>
          </main>

          <aside className='border-t bg-card/55 p-4 xl:border-l xl:border-t-0'>
            <div className='sticky top-4 space-y-4'>
              <Card className='bg-background/55 shadow-sm'>
                <CardHeader>
                  <PanelTitle eyebrow='Live Context' title='What Cai sees now' />
                  <CardDescription>
                    Mocked ambient context from the reference layout.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {contextBlocks.map((block) => (
                    <div key={block.title} className='rounded-2xl border bg-card/60 p-3'>
                      <div className='flex items-start justify-between gap-3'>
                        <div>
                          <div className='text-xs uppercase tracking-[0.16em] text-muted-foreground'>
                            {block.title}
                          </div>
                          <div className='mt-1 font-semibold'>{block.value}</div>
                        </div>
                        <Dot active={block.value !== 'Calm'} />
                      </div>
                      <div className='mt-2 text-xs leading-5 text-muted-foreground'>
                        {block.detail}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}
