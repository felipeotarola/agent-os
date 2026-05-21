import PageContainer from '@/components/layout/page-container';
import { AgentOrbAvatar } from '@/components/agent-orb-avatar';
import { ContextRailLayout } from '@/components/context-rail-layout';
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
  check: Check,
  circleDot: CircleDot,
  cloudSun: CloudSun,
  play: Play,
  sparkles: Sparkles,
  sun: Sun
} = Icons;

const quickActions = [
  { label: 'Start mission', icon: Play, variant: 'default' },
  { label: 'Approve plan', icon: Check, variant: 'secondary' },
  { label: 'Delegate', icon: Bot, variant: 'outline' },
  { label: 'Ask Cai', icon: Sparkles, variant: 'outline' }
] as const;

const evidence = [
  { label: 'Impact', value: 'High', detail: '2 downstream tasks' },
  { label: 'Effort', value: '6-8h', detail: 'first working pass' },
  { label: 'Confidence', value: '85%', detail: 'validated path' },
  { label: 'ETA', value: 'Today', detail: 'safe to start' }
];

const planSteps = [
  {
    title: 'Build Nordea Open Banking integration',
    detail: 'Auth, consent, callback route and first account fetch.',
    state: 'In progress'
  },
  {
    title: 'Add transaction sync and mapping',
    detail: 'Normalize account and transaction payloads.',
    state: 'Planned'
  },
  {
    title: 'Extend onboarding and UX copy',
    detail: 'Explain consent scope and trust language.',
    state: 'Planned'
  },
  {
    title: 'QA, docs and rollout',
    detail: 'Smoke tests, edge cases and deployment notes.',
    state: 'Queued'
  }
];

const missionSignals = [
  'Sandbox connection established',
  'Token exchange successful',
  'Accounts endpoint returns data',
  'Mapping spec v0.3 approved'
];

const progressHistory = [
  { label: '09:00', value: 8 },
  { label: '11:00', value: 16 },
  { label: '13:00', value: 25 },
  { label: '15:00', value: 31 },
  { label: '17:00', value: 38 },
  { label: 'Now', value: 42 }
];

const agents = [
  {
    name: 'Cai',
    role: 'Mission lead',
    status: 'Active',
    task: 'Coordinating Agents and running the mission',
    progress: 60,
    avatarIcon: 'sparkles',
    avatarColumn: '0%'
  },
  {
    name: 'Charles',
    role: 'Product researcher',
    status: 'Active',
    task: 'Research agent at Lysande.ai',
    progress: 70,
    avatarIcon: 'search',
    avatarColumn: '33.333%'
  },
  {
    name: 'Sladdis',
    role: 'Affiliate agent',
    status: 'Active',
    task: 'Running sladdis.store and marketing on social media',
    progress: 50,
    avatarIcon: 'gitBranch',
    avatarColumn: '66.666%'
  },
  {
    name: 'Felipe',
    role: 'Human in the loop',
    status: 'Active',
    task: 'Reviewing implementation and providing feedback',
    progress: 75,
    avatarIcon: 'cpu',
    avatarColumn: '100%'
  }
] as const;

const feed = [
  {
    time: '21:39',
    actor: 'Charles',
    text: 'Ran test suite for /accounts endpoint.',
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
    actor: 'Felipe',
    text: 'Executed data mapping job.',
    status: 'Completed'
  },
  {
    time: '21:32',
    actor: 'Cai',
    text: 'Analyzed Nordea API docs pages.',
    status: 'Analyzed'
  },
  {
    time: '21:28',
    actor: 'Cai',
    text: 'Started mission.',
    status: 'Started'
  }
];

const memoryItems = [
  {
    label: 'Key memory',
    text: 'Nordea sandbox credentials v2 active.'
  },
  {
    label: 'Recent decision',
    text: 'Choose token-based flow for better security.'
  },
  {
    label: 'Learned today',
    text: 'Accounts endpoint requires x-api-key header.'
  }
];

const briefingItems = [
  'Check-in i NorraFin-team.',
  'Kick-off med MWK kl. 14.30-15.30.',
  'Lagg 30 min pa pengar/ekonomi teamet.'
];

const marketItems = [
  { label: 'Bitcoin BTC', value: '72 345.12', tone: '-0.65%' },
  { label: 'Ethereum ETH', value: '3 112.45', tone: '-1.02%' },
  { label: 'Solana SOL', value: '168.31', tone: '+1.36%' }
];

const newsItems = [
  { title: 'Open Banking Europe', detail: 'New PSD3 draft released', time: '21m' },
  { title: 'Nordea Developer', detail: 'API update: pagination limits', time: '1h' },
  { title: 'Finextra', detail: 'Nordic banks speed up APIs', time: '2h' }
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Dot({ active = false }: { active?: boolean }) {
  return (
    <span
      className={cx(
        'size-2 rounded-full',
        active ? 'bg-primary shadow-[0_0_16px_hsl(var(--primary)/0.75)]' : 'bg-muted-foreground/40'
      )}
    />
  );
}

function PanelTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div>
      {eyebrow ? (
        <div className='text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'>
          {eyebrow}
        </div>
      ) : null}
      <h2 className='mt-1 text-lg font-semibold tracking-tight'>{title}</h2>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className='border-r last:border-r-0 max-sm:border-r-0 max-sm:border-b max-sm:last:border-b-0 px-3 py-2'>
      <div className='text-[10px] text-muted-foreground'>{label}</div>
      <div className='mt-1 text-sm font-semibold'>{value}</div>
      <div className='mt-0.5 text-[10px] text-muted-foreground'>{detail}</div>
    </div>
  );
}

function WeatherGlyph() {
  return (
    <div className='relative h-16 w-20 shrink-0'>
      <div className='absolute right-2 top-1 flex size-11 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_28px_hsl(var(--primary)/0.28)]'>
        <Sun className='size-7' />
      </div>
      <div className='absolute bottom-2 left-0 flex h-9 w-14 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm'>
        <CloudSun className='size-7' />
      </div>
    </div>
  );
}

function CommandHero() {
  return (
    <section className='relative overflow-hidden rounded-3xl border bg-card/80 p-4 text-card-foreground shadow-sm md:p-6'>
      <div className='pointer-events-none absolute inset-x-0 top-0 h-40 bg-primary/10' />
      <div className='pointer-events-none absolute left-1/2 top-0 size-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl' />
      <div className='pointer-events-none absolute left-[52%] top-8 hidden size-20 -translate-x-1/2 items-center justify-center rounded-full border bg-background/55 text-sm font-semibold text-primary shadow-[0_0_48px_hsl(var(--primary)/0.45)] md:flex'>
        CA
      </div>

      <div className='relative z-10 mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
              Cai Command Center
            </h1>
            <Badge variant='outline' className='border-primary/35 bg-primary/10 text-primary'>
              <Dot active />
              Live
            </Badge>
          </div>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
            Felipe, Cai is running your mission.
          </p>
        </div>

        <div className='rounded-2xl border bg-background/60 p-2'>
          <div className='mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'>
            Autonomy mode
          </div>
          <div className='grid grid-cols-3 gap-1'>
            {['Observe', 'Suggest', 'Auto-handle'].map((mode) => (
              <button
                key={mode}
                className={cx(
                  'min-h-10 rounded-xl px-3 text-xs font-medium transition',
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

      <div className='relative z-10 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]'>
        <Card className='border-primary/20 bg-background/55 shadow-none'>
          <CardContent className='grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_280px]'>
            <div>
              <Badge
                variant='outline'
                className='mb-4 border-primary/35 bg-primary/10 text-primary'
              >
                <CircleDot className='mr-1 size-3' />
                Top recommendation
              </Badge>
              <CardTitle className='text-2xl leading-tight'>
                Build minimal Nordea Open Banking integration
              </CardTitle>
              <CardDescription className='mt-3 max-w-3xl text-sm leading-6'>
                Unblocks 2 downstream tasks and reduces manual onboarding by 65%. Early tests look
                good. I can implement and validate today.
              </CardDescription>

              <div className='mt-4 grid rounded-xl border bg-card/60 sm:grid-cols-4'>
                {evidence.map((item) => (
                  <Metric key={item.label} {...item} />
                ))}
              </div>
            </div>

            <div>
              <div className='text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'>
                Why it matters
              </div>
              <ul className='mt-3 space-y-2 text-sm text-muted-foreground'>
                {[
                  'Enables transaction sync for onboarding flow',
                  'Improves data accuracy and user trust',
                  'High leverage for this sprint goals'
                ].map((item) => (
                  <li key={item} className='flex gap-2'>
                    <span className='mt-2 size-1.5 rounded-full bg-primary' />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>

          <CardContent className='grid gap-2 border-t p-4 sm:grid-cols-2 xl:grid-cols-4'>
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <Button
                  key={action.label}
                  variant={action.variant}
                  className='h-11 justify-center gap-2 rounded-xl'
                >
                  <span>{action.label}</span>
                  <Icon className='size-4' />
                </Button>
              );
            })}
          </CardContent>
        </Card>

        <Card className='bg-background/55 shadow-none'>
          <CardHeader className='pb-3'>
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
                <div className='flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-xs font-semibold'>
                  {index + 1}
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='line-clamp-1 text-sm font-medium'>{step.title}</div>
                    <Badge variant='outline' className='shrink-0 text-[10px]'>
                      {step.state}
                    </Badge>
                  </div>
                  <p className='mt-1 line-clamp-1 text-xs text-muted-foreground'>{step.detail}</p>
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
    <Card className='bg-card/80 shadow-sm'>
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
      </CardHeader>

      <CardContent className='space-y-4'>
        <div className='rounded-2xl border bg-background/55 p-4'>
          <Badge variant='outline' className='mb-3 border-primary/35 bg-primary/10 text-primary'>
            In progress
          </Badge>
          <h3 className='text-lg font-semibold tracking-tight'>
            Build Nordea Open Banking integration
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
            Implement Open Banking connection and fetch accounts.
          </p>

          <div className='mt-4 flex items-center gap-3'>
            <Progress value={42} className='h-2' />
            <span className='text-xs font-semibold'>42%</span>
          </div>

          <div className='mt-4 grid gap-4 md:grid-cols-[1fr_220px]'>
            <div className='space-y-2'>
              <div className='text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground'>
                Evidence and signals
              </div>
              {missionSignals.map((item) => (
                <div key={item} className='flex items-center gap-2 text-sm'>
                  <Dot active />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <ProgressOverTimeChart />
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

function ProgressOverTimeChart() {
  const points = progressHistory
    .map((point, index) => {
      const x = 12 + index * 34;
      const y = 98 - point.value;
      return `${x},${y}`;
    })
    .join(' ');
  const areaPoints = `12,106 ${points} 182,106`;
  const latest = progressHistory.at(-1);

  return (
    <div className='rounded-xl border bg-card/60 p-3'>
      <div className='flex items-center justify-between gap-3'>
        <div className='text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground'>
          Progress over time
        </div>
        <div className='text-xs font-semibold text-primary'>{latest?.value}%</div>
      </div>
      <svg
        role='img'
        aria-label='Mission progress over time'
        viewBox='0 0 194 118'
        className='mt-2 h-28 w-full overflow-visible'
      >
        <g className='text-border' stroke='currentColor' strokeWidth='1'>
          <line x1='12' x2='182' y1='26' y2='26' opacity='0.45' />
          <line x1='12' x2='182' y1='66' y2='66' opacity='0.45' />
          <line x1='12' x2='182' y1='106' y2='106' />
          <line x1='12' x2='12' y1='18' y2='106' />
        </g>
        <polygon points={areaPoints} className='fill-primary opacity-15' />
        <polyline
          points={points}
          fill='none'
          className='stroke-primary'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth='3'
        />
        {progressHistory.map((point, index) => {
          const x = 12 + index * 34;
          const y = 98 - point.value;

          return (
            <g key={point.label}>
              <circle
                cx={x}
                cy={y}
                r='4'
                className='fill-background stroke-primary'
                strokeWidth='2'
              />
              <text x={x} y='116' textAnchor='middle' className='fill-muted-foreground text-[9px]'>
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LiveAgentFeed() {
  return (
    <Card className='bg-card/80 shadow-sm'>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <PanelTitle eyebrow='Live agent feed' title='Recent activity' />
          <Badge variant='outline' className='border-primary/35 bg-primary/10 text-primary'>
            <Dot active />
            Live
          </Badge>
        </div>
      </CardHeader>

      <CardContent className='space-y-0'>
        {feed.map((item) => (
          <div
            key={`${item.actor}-${item.time}`}
            className='flex gap-3 border-b py-3 last:border-b-0'
          >
            <div className='w-10 shrink-0 text-xs text-muted-foreground'>{item.time}</div>
            <div className='pt-1'>
              <Dot active />
            </div>
            <div className='min-w-0 flex-1'>
              <div className='flex items-start justify-between gap-3'>
                <p className='line-clamp-1 text-sm'>
                  <span className='font-medium'>{item.actor}</span> {item.text}
                </p>
                <Badge variant='outline' className='text-[10px]'>
                  {item.status}
                </Badge>
              </div>
            </div>
          </div>
        ))}

        <Button variant='ghost' className='mt-3 w-full justify-between rounded-xl text-primary'>
          View full feed
          <ArrowRight className='size-4' />
        </Button>
      </CardContent>
    </Card>
  );
}

function AgentHealth() {
  return (
    <Card className='bg-card/80 shadow-sm'>
      <CardHeader>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <PanelTitle eyebrow='Agent health' title='98%' />
            <CardDescription>System readiness optimal.</CardDescription>
          </div>
          <div className='flex size-20 items-center justify-center rounded-full border-4 border-primary bg-primary/10 text-xl font-semibold shadow-[0_0_32px_hsl(var(--primary)/0.25)]'>
            98%
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-2'>
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
    <Card className='bg-card/80 shadow-sm'>
      <CardHeader className='pb-3'>
        <div className='flex items-start justify-between gap-3'>
          <PanelTitle eyebrow='Your agents' title='Available operators' />
          <Button variant='ghost' size='sm' className='rounded-xl text-primary'>
            Manage agents
          </Button>
        </div>
      </CardHeader>

      <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5'>
        {agents.map((agent) => (
          <div
            key={agent.name}
            className='group relative overflow-hidden rounded-2xl border bg-background/55 p-4 transition hover:border-primary/40 hover:bg-primary/5'
          >
            <div className='pointer-events-none absolute inset-x-0 top-0 h-20 bg-primary/10 opacity-0 transition group-hover:opacity-100' />
            <div className='mb-4 flex items-start justify-between gap-3'>
              <AgentOrbAvatar
                name={agent.name}
                icon={agent.avatarIcon}
                column={agent.avatarColumn}
              />
              <Badge variant='outline' className='text-[10px]'>
                {agent.status}
              </Badge>
            </div>

            <div className='relative font-semibold'>{agent.name}</div>
            <div className='mt-1 text-xs text-muted-foreground'>{agent.role}</div>
            <p className='mt-3 min-h-10 text-sm leading-5 text-muted-foreground'>{agent.task}</p>

            <div className='mt-4 flex items-center justify-between text-xs text-muted-foreground'>
              <span>Current task</span>
              <span>{agent.progress}%</span>
            </div>
            <Progress value={agent.progress} className='mt-2 h-2' />
          </div>
        ))}

        <button className='flex min-h-[188px] flex-col items-center justify-center rounded-2xl border border-dashed bg-background/35 p-4 text-center text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground'>
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
      <Card className='bg-card/80 shadow-sm'>
        <CardHeader className='pb-3'>
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

      <Card className='bg-card/80 shadow-sm'>
        <CardHeader className='pb-3'>
          <PanelTitle eyebrow='Runway' title='Compute and budget' />
        </CardHeader>

        <CardContent className='grid gap-3 sm:grid-cols-4'>
          <Metric label='Tasks completed today' value='18/40' detail='current mission' />
          <Metric label='Compute used' value='62%' detail='normal range' />
          <Metric label='Budget burn' value='$18.40/$50' detail='mock cap' />
          <Metric label='Resets in' value='2d 5h' detail='next allowance' />
        </CardContent>
      </Card>
    </section>
  );
}

function ContextRail() {
  return (
    <>
      <Card className='rounded-3xl bg-card/80 text-card-foreground shadow-sm'>
        <CardHeader className='pb-3'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <CardTitle>Live context</CardTitle>
              <CardDescription>Cai is using this information.</CardDescription>
            </div>
            <Button variant='ghost' size='icon' className='size-7 rounded-full'>
              <ArrowRight className='size-3 rotate-[-90deg]' />
            </Button>
          </div>
        </CardHeader>

        <CardContent className='space-y-3'>
          <div className='rounded-2xl border bg-background/45 p-4'>
            <div className='flex items-start justify-between gap-4'>
              <div>
                <div className='text-xs text-muted-foreground'>Upplands Vasby, SE</div>
                <div className='mt-4 text-4xl font-semibold tracking-tight'>+16C</div>
                <div className='mt-1 text-xs text-muted-foreground'>Feels 14C</div>
              </div>
              <div className='text-right'>
                <WeatherGlyph />
                <div className='mt-1 text-xs text-muted-foreground'>Partly cloudy</div>
              </div>
            </div>
          </div>

          <div className='rounded-2xl border bg-background/45 p-4'>
            <div className='grid grid-cols-2 gap-3 border-b pb-3'>
              <div>
                <div className='text-xs text-muted-foreground'>Today</div>
                <div className='mt-1 font-semibold'>May 21</div>
              </div>
              <div className='border-l pl-3'>
                <div className='text-xs text-muted-foreground'>Agenda</div>
                <div className='mt-1 font-semibold'>2 events</div>
              </div>
            </div>
            <div className='space-y-3 pt-3 text-sm'>
              <div className='grid grid-cols-[48px_1fr] gap-3'>
                <span className='text-muted-foreground'>14:30</span>
                <div>
                  <div className='font-medium'>Felipe / Max - misc</div>
                  <div className='text-xs text-muted-foreground'>Conf. room 2, 2nd floor</div>
                </div>
              </div>
              <div className='grid grid-cols-[48px_1fr] gap-3'>
                <span className='text-muted-foreground'>16:00</span>
                <div>
                  <div className='font-medium'>Weekly sync</div>
                  <div className='text-xs text-muted-foreground'>Online</div>
                </div>
              </div>
            </div>
            <Button variant='ghost' size='sm' className='mt-3 h-8 px-0 text-primary'>
              Open calendar
              <ArrowRight className='ml-2 size-3.5' />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className='rounded-3xl bg-card/80 text-card-foreground shadow-sm'>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between gap-3'>
            <PanelTitle eyebrow='Briefing' title='Updated 10m ago' />
          </div>
        </CardHeader>
        <CardContent className='space-y-2'>
          {briefingItems.map((item) => (
            <div key={item} className='flex gap-2 text-sm text-muted-foreground'>
              <span className='mt-2 size-1.5 rounded-full bg-primary' />
              <span>{item}</span>
            </div>
          ))}
          <Button variant='ghost' size='sm' className='h-8 px-0 text-primary'>
            Open briefing
            <ArrowRight className='ml-2 size-3.5' />
          </Button>
        </CardContent>
      </Card>

      <Card className='rounded-3xl bg-card/80 text-card-foreground shadow-sm'>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between gap-3'>
            <PanelTitle eyebrow='Markets' title='Holdings' />
            <span className='text-xs text-primary'>+0.20%</span>
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          {marketItems.map((item) => (
            <div key={item.label} className='grid grid-cols-[1fr_auto_auto] gap-2 text-sm'>
              <span className='truncate'>{item.label}</span>
              <span className='font-mono'>{item.value}</span>
              <span
                className={cx(
                  'font-mono text-xs',
                  item.tone.startsWith('+') ? 'text-primary' : 'text-destructive'
                )}
              >
                {item.tone}
              </span>
            </div>
          ))}
          <Button variant='ghost' size='sm' className='h-8 px-0 text-primary'>
            View markets
            <ArrowRight className='ml-2 size-3.5' />
          </Button>
        </CardContent>
      </Card>

      <Card className='rounded-3xl bg-card/80 text-card-foreground shadow-sm'>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between gap-3'>
            <PanelTitle eyebrow='News signals' title='High signal' />
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          {newsItems.map((item) => (
            <div
              key={item.title}
              className='grid grid-cols-[1fr_auto] gap-3 border-b pb-3 last:border-b-0 last:pb-0'
            >
              <div>
                <div className='text-sm font-medium'>{item.title}</div>
                <div className='text-xs text-muted-foreground'>{item.detail}</div>
              </div>
              <span className='text-xs text-muted-foreground'>{item.time}</span>
            </div>
          ))}
          <Button variant='ghost' size='sm' className='h-8 px-0 text-primary'>
            More news
            <ArrowRight className='ml-2 size-3.5' />
          </Button>
        </CardContent>
      </Card>

      <Card className='rounded-3xl bg-card/80 text-card-foreground shadow-sm'>
        <CardHeader className='pb-3'>
          <PanelTitle eyebrow='Status' title='All systems operational' />
        </CardHeader>
        <CardContent className='space-y-2'>
          {['Cai online', 'OpenCai bridge connected', 'Memory index healthy', 'Build idle'].map(
            (item) => (
              <div key={item} className='flex items-center gap-2 text-sm text-muted-foreground'>
                <Dot active />
                <span>{item}</span>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </>
  );
}

function StatusStrip() {
  return (
    <section className='flex flex-col gap-2 rounded-2xl border bg-card/70 px-4 py-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between'>
      <div className='flex flex-wrap items-center gap-3'>
        <span className='flex items-center gap-1.5'>
          <Dot active /> Bridge
        </span>
        <span>Memory index 98%</span>
      </div>
      <div>Agent OS cockpit - v0.2.1</div>
    </section>
  );
}

export default function Overview2Page() {
  return (
    <PageContainer>
      <ContextRailLayout rail={<ContextRail />}>
        <div className='space-y-4'>
          <CommandHero />

          <section className='grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(330px,0.75fr)_300px]'>
            <ActiveMission />
            <LiveAgentFeed />
            <AgentHealth />
          </section>

          <AgentsPanel />
          <MemoryAndRunway />
          <StatusStrip />
        </div>
      </ContextRailLayout>
    </PageContainer>
  );
}
