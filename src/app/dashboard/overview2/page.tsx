import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export const metadata = {
  title: 'Agent OS: Mission Control'
};

const {
  add: Plus,
  arrowRight: ArrowRight,
  bot: Bot,
  calendarDays: CalendarDays,
  check: Check,
  circleDot: CircleDot,
  cloudSun: CloudSun,
  cpu: Cpu,
  gitBranch: GitBranch,
  globe: Globe2,
  play: Play,
  search: Search,
  shieldCheck: ShieldCheck,
  sparkles: Sparkles,
  wallet: Wallet,
  zap: Zap
} = Icons;

const quickActions = [
  { label: 'Start mission', icon: Play, variant: 'default' },
  { label: 'Approve plan', icon: Check, variant: 'secondary' },
  { label: 'Delegate', icon: Bot, variant: 'secondary' },
  { label: 'Ask Cai', icon: Sparkles, variant: 'outline' }
] as const;

const planSteps = [
  {
    title: 'Build Nordea Open Banking integration',
    detail: 'Auth, consent, callback route and first account fetch.',
    state: 'In progress'
  },
  {
    title: 'Add transaction sync and mapping',
    detail: 'Normalize account and transaction payloads for the app.',
    state: 'Planned'
  },
  {
    title: 'Extend onboarding and UX copy',
    detail: 'Explain bank connection, consent scope and trust language.',
    state: 'Planned'
  },
  {
    title: 'QA, docs and rollout',
    detail: 'Smoke tests, edge cases, deployment notes and rollback path.',
    state: 'Queued'
  }
];

const evidence = [
  { label: 'Impact', value: 'High', detail: 'unblocks 2 tasks' },
  { label: 'Effort', value: '6-8h', detail: 'first working pass' },
  { label: 'Confidence', value: '85%', detail: 'enough context' },
  { label: 'ETA', value: 'Today', detail: 'safe to start' }
];

const missionSignals = [
  'Sandbox connection can be tested safely',
  'Consent copy is the highest trust risk',
  'Transaction schema is narrow enough for V1',
  'No production action runs without approval'
];

const agents = [
  {
    name: 'Conductor',
    role: 'Mission lead',
    status: 'Active',
    task: 'Coordinating Nordea integration steps',
    progress: 60,
    icon: Sparkles
  },
  {
    name: 'Charles',
    role: 'Product researcher',
    status: 'Active',
    task: 'Researching API limits and best practices',
    progress: 70,
    icon: Search
  },
  {
    name: 'Sladdis',
    role: 'Integration engineer',
    status: 'Active',
    task: 'Designing mapping and sync architecture',
    progress: 50,
    icon: GitBranch
  },
  {
    name: 'Worker Pool',
    role: 'Execution engine',
    status: 'Standby',
    task: 'Ready to run implementation and validation tasks',
    progress: 75,
    icon: Cpu
  }
];

const feed = [
  {
    time: '21:39',
    actor: 'Charles',
    text: 'Ran test plan for the accounts endpoint.',
    status: 'Success'
  },
  {
    time: '21:37',
    actor: 'Sladdis',
    text: 'Updated integration spec v0.3.',
    status: 'Updated'
  },
  {
    time: '21:34',
    actor: 'Worker Pool',
    text: 'Prepared transaction mapping job.',
    status: 'Ready'
  },
  {
    time: '21:32',
    actor: 'Cai',
    text: 'Analyzed Nordea API docs and consent requirements.',
    status: 'Analyzed'
  }
];

const memoryItems = [
  {
    label: 'Key memory',
    text: 'Felipe prefers direct execution notes and clear approval points.'
  },
  {
    label: 'Recent decision',
    text: 'Use mocked UI in this concept; keep production overview untouched.'
  },
  {
    label: 'Learned today',
    text: 'Banking work needs explicit consent copy before production use.'
  }
];

const contextBlocks = [
  {
    title: 'Weather',
    value: '+16C',
    detail: 'Upplands Vasby - partly cloudy',
    icon: CloudSun
  },
  {
    title: 'Calendar',
    value: '2 events',
    detail: 'Next: Felipe / Max - 14:30',
    icon: CalendarDays
  },
  {
    title: 'Briefing',
    value: '3 notes',
    detail: 'Banking, agents, dashboard polish',
    icon: Sparkles
  },
  {
    title: 'Markets',
    value: 'Calm',
    detail: 'No urgent signal detected',
    icon: Wallet
  },
  {
    title: 'News signals',
    value: '5',
    detail: 'Open banking + AI infrastructure',
    icon: Globe2
  },
  {
    title: 'Status checks',
    value: 'Healthy',
    detail: 'GitLab, Vercel, Supabase online',
    icon: ShieldCheck
  }
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Dot({ active = false }: { active?: boolean }) {
  return (
    <span
      className={cx(
        'size-2 rounded-full',
        active ? 'bg-primary shadow-[0_0_16px_hsl(var(--primary)/0.7)]' : 'bg-muted-foreground/40'
      )}
    />
  );
}

function PanelTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div>
      {eyebrow ? (
        <div className='text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
          {eyebrow}
        </div>
      ) : null}
      <h2 className='mt-1 text-lg font-semibold tracking-tight'>{title}</h2>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className='min-h-[104px] rounded-xl border bg-background/55 p-4'>
      <div className='text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
        {label}
      </div>
      <div className='mt-3 text-2xl font-semibold tracking-tight'>{value}</div>
      <div className='mt-1 text-xs leading-5 text-muted-foreground'>{detail}</div>
    </div>
  );
}

function PageActions() {
  return (
    <div className='flex max-w-full flex-wrap gap-2'>
      <Button variant='outline' className='rounded-xl'>
        <Bot className='mr-2 size-4 text-primary' />
        Cai OS
      </Button>
      <Button className='rounded-xl'>
        <Play className='mr-2 size-4' />
        Start mission
      </Button>
    </div>
  );
}

function CommandHero() {
  return (
    <section className='relative overflow-hidden rounded-xl border bg-card/75 p-4 shadow-sm backdrop-blur lg:p-6'>
      <div className='pointer-events-none absolute inset-x-0 top-0 h-32 bg-primary/[0.06]' />

      <div className='relative z-10 mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between'>
        <div className='max-w-3xl'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className='border-primary/35 bg-primary/10 text-primary'>
              <Dot active />
              Live
            </Badge>
            <span className='text-xs text-muted-foreground'>
              Cai has one mission ready for review.
            </span>
          </div>
          <h1 className='mt-3 text-2xl font-semibold tracking-tight md:text-3xl'>
            Mission recommendation
          </h1>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
            Review the suggested path, evidence and approval actions before Cai performs real work.
          </p>
        </div>

        <div className='rounded-xl border bg-background/65 p-2'>
          <div className='mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
            Autonomy mode
          </div>
          <div className='grid grid-cols-3 gap-1'>
            {['Observe', 'Suggest', 'Auto-handle'].map((mode) => (
              <button
                key={mode}
                className={cx(
                  'min-h-10 rounded-lg px-3 text-xs font-medium transition',
                  mode === 'Suggest'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className='relative z-10 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_420px]'>
        <Card className='border-primary/20 bg-background/60 shadow-none'>
          <CardHeader className='space-y-4 pb-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <Badge variant='outline' className='border-primary/35 bg-primary/10 text-primary'>
                <CircleDot className='mr-1 size-3' />
                Top recommendation
              </Badge>
              <Badge className='bg-primary text-primary-foreground'>85% confidence</Badge>
            </div>

            <div className='max-w-4xl'>
              <CardTitle className='text-2xl leading-tight md:text-3xl'>
                Build minimal Nordea Open Banking integration
              </CardTitle>
              <CardDescription className='mt-3 max-w-3xl text-sm leading-6'>
                Cai found a compact path: authenticate, sync transactions, explain consent and ship
                a guarded first pass with mocked fallbacks.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className='space-y-5'>
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              {evidence.map((item) => (
                <Metric key={item.label} {...item} />
              ))}
            </div>

            <div className='grid gap-4 rounded-xl border bg-card/60 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]'>
              <div>
                <div className='text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
                  Why it matters
                </div>
                <div className='mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-3 lg:grid-cols-1'>
                  {[
                    'Enables transaction sync for onboarding flow',
                    'Improves data accuracy and user trust',
                    'High leverage for this sprint goals'
                  ].map((item) => (
                    <div key={item} className='flex gap-2'>
                      <Zap className='mt-0.5 size-4 shrink-0 text-primary' />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className='text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
                  Approval actions
                </div>
                <div className='mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1'>
                  {quickActions.map((action) => {
                    const Icon = action.icon;

                    return (
                      <Button
                        key={action.label}
                        variant={action.variant}
                        className='h-11 justify-between rounded-xl px-3'
                      >
                        <span>{action.label}</span>
                        <Icon className='size-4' />
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='bg-background/60 shadow-none'>
          <CardHeader>
            <div className='flex items-start justify-between gap-3'>
              <PanelTitle eyebrow="Cai's plan" title='Minimal path to ship' />
              <Button variant='ghost' size='sm' className='rounded-xl text-primary'>
                View all
              </Button>
            </div>
          </CardHeader>

          <CardContent className='space-y-3'>
            {planSteps.map((step, index) => (
              <div key={step.title} className='flex gap-3 rounded-xl border bg-card/60 p-3'>
                <div className='flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-xs font-semibold'>
                  {index + 1}
                </div>

                <div className='min-w-0 flex-1'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='line-clamp-1 text-sm font-medium'>{step.title}</div>
                    <Badge variant='outline' className='shrink-0 text-[10px]'>
                      {step.state}
                    </Badge>
                  </div>
                  <p className='mt-1 text-xs leading-5 text-muted-foreground'>{step.detail}</p>
                </div>
              </div>
            ))}

            <div className='flex items-center justify-between text-xs text-muted-foreground'>
              <span>4 tasks - Est. 6-8h</span>
              <span>30%</span>
            </div>
            <Progress value={30} className='h-2' />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ActiveMission() {
  return (
    <Card className='bg-card/75 shadow-sm backdrop-blur'>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <PanelTitle eyebrow='Active mission' title='Nordea integration sprint' />
          <Badge
            variant='outline'
            className='border-destructive/35 bg-destructive/10 text-destructive'
          >
            High priority
          </Badge>
        </div>
        <CardDescription>
          Progress, evidence and the signals behind Cai's recommendation.
        </CardDescription>
      </CardHeader>

      <CardContent className='space-y-4'>
        <div className='rounded-xl border bg-background/55 p-4'>
          <div className='mb-3 flex items-center justify-between gap-3'>
            <Badge variant='outline' className='border-primary/35 bg-primary/10 text-primary'>
              In progress
            </Badge>
            <span className='text-sm font-semibold'>42%</span>
          </div>

          <h3 className='text-lg font-semibold tracking-tight'>
            Build Nordea Open Banking integration
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
            Implement Open Banking connection and fetch accounts.
          </p>

          <Progress value={42} className='mt-4 h-3' />

          <div className='mt-4 grid gap-3 md:grid-cols-[1fr_230px]'>
            <div className='space-y-2'>
              <div className='text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
                Evidence and signals
              </div>

              {missionSignals.map((item, index) => (
                <div key={item} className='flex items-center gap-2 text-sm'>
                  <Dot active={index < 3} />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className='rounded-xl border bg-card/60 p-3'>
              <div className='mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
                Progress over time
              </div>

              <div className='flex h-24 items-end gap-2'>
                {[28, 42, 36, 58, 51, 72, 66, 82].map((height, index) => (
                  <div key={`${height}-${index}`} className='flex flex-1 items-end'>
                    <div
                      className='w-full rounded-t bg-primary/30'
                      style={{ height: `${height}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className='flex flex-wrap gap-2'>
          <Button className='rounded-xl'>
            Open mission
            <ArrowRight className='ml-2 size-4' />
          </Button>
          <Button variant='secondary' className='rounded-xl'>
            View plan
          </Button>
          <Button variant='outline' className='rounded-xl'>
            Add note
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LiveAgentFeed() {
  return (
    <Card className='bg-card/75 shadow-sm backdrop-blur'>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <PanelTitle eyebrow='Live agent feed' title='Recent activity' />
          <Badge variant='outline' className='border-primary/35 bg-primary/10 text-primary'>
            <Dot active />
            Live
          </Badge>
        </div>
      </CardHeader>

      <CardContent className='space-y-3'>
        {feed.map((item) => (
          <div
            key={`${item.actor}-${item.time}`}
            className='flex gap-3 rounded-xl border bg-background/55 p-3'
          >
            <div className='w-10 shrink-0 text-xs text-muted-foreground'>{item.time}</div>
            <div className='pt-1'>
              <Dot active />
            </div>
            <div className='min-w-0 flex-1'>
              <div className='flex items-start justify-between gap-3'>
                <div className='font-medium'>{item.actor}</div>
                <Badge variant='outline' className='text-[10px]'>
                  {item.status}
                </Badge>
              </div>
              <p className='mt-1 text-sm leading-5 text-muted-foreground'>{item.text}</p>
            </div>
          </div>
        ))}

        <Button variant='ghost' className='w-full justify-between rounded-xl text-primary'>
          View full feed
          <ArrowRight className='size-4' />
        </Button>
      </CardContent>
    </Card>
  );
}

function AgentHealth() {
  return (
    <Card className='bg-card/75 shadow-sm backdrop-blur'>
      <CardHeader>
        <div className='flex items-start justify-between gap-4'>
          <PanelTitle eyebrow='Agent health' title='98% healthy' />
          <div className='flex size-20 items-center justify-center rounded-full border-4 border-primary/70 bg-primary/10 text-xl font-semibold shadow-[0_0_32px_hsl(var(--primary)/0.22)]'>
            98%
          </div>
        </div>
        <CardDescription>System readiness is optimal.</CardDescription>
      </CardHeader>

      <CardContent className='space-y-3'>
        {[
          ['Bridge', 'Healthy'],
          ['Memory index', '98%'],
          ['Tools and runners', 'Healthy'],
          ['Data sources', 'Healthy'],
          ['Guardrails', 'Active']
        ].map(([label, value]) => (
          <div
            key={label}
            className='flex items-center justify-between rounded-xl border bg-background/55 p-3 text-sm'
          >
            <span className='text-muted-foreground'>{label}</span>
            <span className='font-medium text-primary'>{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AgentsPanel() {
  return (
    <Card className='bg-card/75 shadow-sm backdrop-blur'>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <PanelTitle eyebrow='Your agents' title='Available operators' />
          <Button variant='ghost' size='sm' className='rounded-xl text-primary'>
            Manage agents
          </Button>
        </div>
      </CardHeader>

      <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5'>
        {agents.map((agent) => {
          const Icon = agent.icon;

          return (
            <div key={agent.name} className='rounded-xl border bg-background/55 p-4'>
              <div className='mb-4 flex items-start justify-between gap-3'>
                <div className='flex size-11 items-center justify-center rounded-xl border bg-primary/10 text-primary'>
                  <Icon className='size-5' />
                </div>
                <Badge variant='outline' className='text-[10px]'>
                  {agent.status}
                </Badge>
              </div>

              <div className='font-semibold'>{agent.name}</div>
              <div className='mt-1 text-xs text-muted-foreground'>{agent.role}</div>
              <p className='mt-3 min-h-10 text-sm leading-5 text-muted-foreground'>{agent.task}</p>

              <div className='mt-4 flex items-center justify-between text-xs text-muted-foreground'>
                <span>Current task</span>
                <span>{agent.progress}%</span>
              </div>
              <Progress value={agent.progress} className='mt-2 h-2' />
            </div>
          );
        })}

        <button className='flex min-h-[182px] flex-col items-center justify-center rounded-xl border border-dashed bg-background/35 p-4 text-center text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground'>
          <div className='mb-3 flex size-11 items-center justify-center rounded-full border bg-card'>
            <Plus className='size-5' />
          </div>
          <div className='font-medium'>Add agent</div>
          <div className='mt-1 max-w-36 text-xs leading-5'>Assign a specialist to your team.</div>
        </button>
      </CardContent>
    </Card>
  );
}

function MemoryAndRunway() {
  return (
    <section className='grid gap-4 2xl:grid-cols-2'>
      <Card className='bg-card/75 shadow-sm backdrop-blur'>
        <CardHeader>
          <div className='flex items-start justify-between gap-3'>
            <PanelTitle eyebrow='Memory and knowledge' title='Relevant context Cai is using' />
            <span className='text-xs text-muted-foreground'>Updated 3m ago</span>
          </div>
        </CardHeader>

        <CardContent className='space-y-2'>
          {memoryItems.map((item) => (
            <div key={item.label} className='rounded-xl border bg-background/55 p-3'>
              <div className='text-xs font-medium text-primary'>{item.label}</div>
              <div className='mt-1 text-sm leading-5 text-muted-foreground'>{item.text}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className='bg-card/75 shadow-sm backdrop-blur'>
        <CardHeader>
          <PanelTitle eyebrow='Runway' title='Execution budget' />
        </CardHeader>

        <CardContent className='grid gap-3 sm:grid-cols-2'>
          <Metric label='Tasks completed' value='18/40' detail='current mission' />
          <Metric label='Compute used' value='62%' detail='normal range' />
          <Metric label='Budget burn' value='$18.40/$50' detail='mock cap' />
          <Metric label='Resets in' value='2d 5h' detail='next allowance' />
        </CardContent>
      </Card>
    </section>
  );
}

function ContextPanel() {
  return (
    <section className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]'>
      <Card className='bg-card/75 shadow-sm backdrop-blur'>
        <CardHeader>
          <PanelTitle eyebrow='Live context' title='What Cai sees now' />
          <CardDescription>Cai uses this ambient context when suggesting actions.</CardDescription>
        </CardHeader>

        <CardContent className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {contextBlocks.map((block) => {
            const Icon = block.icon;

            return (
              <div key={block.title} className='rounded-xl border bg-background/55 p-3'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <div className='text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
                      {block.title}
                    </div>
                    <div className='mt-1 text-lg font-semibold'>{block.value}</div>
                  </div>
                  <div className='flex size-9 items-center justify-center rounded-xl border bg-card/70 text-primary'>
                    <Icon className='size-4' />
                  </div>
                </div>
                <div className='mt-2 text-xs leading-5 text-muted-foreground'>{block.detail}</div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className='bg-card/75 shadow-sm backdrop-blur'>
        <CardHeader>
          <PanelTitle eyebrow='Status' title='All systems operational' />
        </CardHeader>

        <CardContent className='space-y-2'>
          {['Cai online', 'OpenCai bridge connected', 'Memory index healthy', 'Build idle'].map(
            (item) => (
              <div
                key={item}
                className='flex items-center justify-between rounded-xl border bg-background/55 p-3 text-sm'
              >
                <span>{item}</span>
                <Dot active />
              </div>
            )
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function Overview2Page() {
  return (
    <PageContainer
      pageTitle='Mission Control'
      pageDescription='Review Cai recommendations, agent status and operational context from the dashboard workspace.'
      pageHeaderAction={<PageActions />}
    >
      <div className='space-y-4'>
        <CommandHero />

        <section className='grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(330px,0.75fr)_300px]'>
          <ActiveMission />
          <LiveAgentFeed />
          <AgentHealth />
        </section>

        <AgentsPanel />
        <ContextPanel />
        <MemoryAndRunway />
      </div>
    </PageContainer>
  );
}
