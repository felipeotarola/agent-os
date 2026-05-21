import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Overview 2 Concept'
};

const commandActions = [
  {
    label: 'Start mission',
    detail: 'Turn a goal into a scoped agent run',
    icon: '↗',
    primary: true
  },
  { label: 'Approve plan', detail: 'Review the proposed steps before execution', icon: '✓' },
  { label: 'Delegate', detail: 'Assign work to Cai, Charles, or a worker', icon: '→' },
  { label: 'Ask Cai', detail: 'Interrupt the loop with a direct question', icon: '⚛' }
];

const missionFacts = [
  { label: 'Owner', value: 'Felipe', meta: 'human decision-maker' },
  { label: 'Mode', value: 'Mocked', meta: 'safe concept route' },
  { label: 'ETA', value: 'Today', meta: 'prototype pass' },
  { label: 'Risk', value: 'Low', meta: 'no real actions' }
];

const missionSteps = [
  { label: 'Understand screenshot', state: 'done', detail: 'Extract layout + information model' },
  {
    label: 'Match full surface',
    state: 'active',
    detail: 'Header, actions, agents, mission, feed'
  },
  {
    label: 'Reverse-engineer later',
    state: 'queued',
    detail: 'Replace mock arrays with real Agent OS data'
  },
  {
    label: 'Promote if useful',
    state: 'queued',
    detail: 'Move best parts into production overview'
  }
];

const agents = [
  {
    name: 'Cai',
    role: 'Cockpit operator',
    emoji: '⚛️',
    status: 'online',
    task: 'Coordinating mission surface',
    load: 'low'
  },
  {
    name: 'Charles',
    role: 'Product/research',
    emoji: '🧭',
    status: 'ready',
    task: 'Can review product intent',
    load: 'low'
  },
  {
    name: 'Coding worker',
    role: 'Implementation',
    emoji: '🛠️',
    status: 'standby',
    task: 'Ready for scoped code tasks',
    load: 'idle'
  },
  {
    name: 'Radar',
    role: 'Signal intake',
    emoji: '📡',
    status: 'watching',
    task: 'Monitoring useful signals',
    load: 'med'
  }
];

const feed = [
  {
    agent: 'Felipe',
    event: 'Updated goal: match the whole reference, all data.',
    time: 'now',
    type: 'goal'
  },
  {
    agent: 'Cai',
    event: 'Building overview2 as a full mocked mission-control concept.',
    time: '1m',
    type: 'design'
  },
  {
    agent: 'Worker',
    event: 'Ready to wire mission data to real backend once direction lands.',
    time: 'later',
    type: 'code'
  },
  {
    agent: 'System',
    event: 'Production overview remains untouched while concept evolves.',
    time: 'safe',
    type: 'guardrail'
  }
];

const approvals = [
  {
    title: 'Approve mission plan',
    detail: 'Let agents execute the proposed steps.',
    priority: 'high'
  },
  {
    title: 'Create new agent',
    detail: 'Add specialist via guided creation flow.',
    priority: 'mock'
  },
  {
    title: 'Promote design',
    detail: 'Move chosen panels into /dashboard/overview.',
    priority: 'later'
  }
];

const signals = [
  { label: 'Active agents', value: '4', meta: 'mock roster' },
  { label: 'Pending approvals', value: '3', meta: 'needs human call' },
  { label: 'Live feed', value: '4', meta: 'recent events' },
  { label: 'Mission progress', value: '42%', meta: 'concept stage' }
];

const artifacts = [
  { label: 'Mission brief', href: '/dashboard/overview2' },
  { label: 'Current overview', href: '/dashboard/overview' },
  { label: 'Agent roster', href: '/dashboard/agents' },
  { label: 'Chat with Cai', href: '/dashboard/chat' }
];

function StatusPill({ state }: { state: string }) {
  const active = ['online', 'ready', 'watching', 'active', 'done'].includes(state);
  return (
    <span className='inline-flex items-center gap-1.5 rounded-full border bg-background/45 px-2 py-1 text-[11px] text-muted-foreground'>
      <span className={`size-1.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground'}`} />
      {state}
    </span>
  );
}

function MiniPanel({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className='rounded-2xl border bg-background/45 p-3'>
      <div className='text-[10px] uppercase tracking-[0.18em] text-muted-foreground'>{label}</div>
      <div className='mt-1 text-xl font-semibold'>{value}</div>
      <div className='mt-1 text-xs text-muted-foreground'>{meta}</div>
    </div>
  );
}

export default function Overview2Page() {
  return (
    <PageContainer>
      <div className='relative min-h-[calc(100vh-6rem)] overflow-hidden rounded-[2rem] border bg-background p-3 text-foreground shadow-sm md:p-5'>
        <div className='pointer-events-none absolute inset-0'>
          <div className='absolute -left-24 top-0 h-80 w-80 rounded-full bg-primary/20 blur-3xl' />
          <div className='absolute right-[-10%] top-12 h-96 w-96 rounded-full bg-primary/25 blur-3xl' />
          <div className='absolute bottom-[-15%] left-1/3 h-96 w-96 rounded-full bg-primary/10 blur-3xl' />
          <div className='absolute inset-0 bg-primary/5' />
        </div>

        <div className='relative grid gap-3 2xl:grid-cols-[260px_minmax(0,1fr)_360px]'>
          <aside className='hidden space-y-3 2xl:block'>
            <Card className='border-primary/15 bg-card/70 shadow-sm backdrop-blur'>
              <CardHeader>
                <CardTitle className='text-lg'>Mission OS</CardTitle>
                <CardDescription>Mocked navigation</CardDescription>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                {['Mission', 'Agents', 'Approvals', 'Live feed', 'Artifacts'].map((item, index) => (
                  <div
                    key={item}
                    className={`rounded-2xl border p-3 ${
                      index === 0
                        ? 'border-primary/35 bg-primary/10 text-primary'
                        : 'bg-background/45'
                    }`}
                  >
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className='border-primary/15 bg-card/70 shadow-sm backdrop-blur'>
              <CardHeader>
                <CardTitle className='text-lg'>Artifacts</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                {artifacts.map((artifact) => (
                  <Link
                    key={artifact.label}
                    href={artifact.href}
                    className='flex items-center justify-between rounded-2xl border bg-background/45 p-3 text-sm transition hover:border-primary/40 hover:bg-primary/10'
                  >
                    {artifact.label}
                    <span className='text-muted-foreground'>→</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </aside>

          <main className='space-y-3'>
            <section className='relative overflow-hidden rounded-[1.75rem] border bg-card/75 p-4 shadow-sm backdrop-blur md:p-6'>
              <div className='pointer-events-none absolute inset-x-0 top-0 h-52 bg-primary/10 blur-2xl' />
              <div className='relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]'>
                <div className='space-y-5'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge
                      variant='outline'
                      className='border-primary/40 bg-primary/10 text-primary'
                    >
                      Active mission
                    </Badge>
                    <Badge variant='outline' className='border-border bg-background/45'>
                      full mock · no real execution
                    </Badge>
                  </div>

                  <div>
                    <h1 className='max-w-4xl text-3xl font-semibold tracking-tight md:text-5xl'>
                      Match the reference cockpit with all mission data.
                    </h1>
                    <p className='mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base'>
                      This page is the playground for the complete agent-control surface: mission
                      intent, why it matters, action buttons, approvals, roster, live feed,
                      artifacts, and compact operational signals.
                    </p>
                  </div>

                  <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
                    {commandActions.map((action) => (
                      <button
                        key={action.label}
                        className={`group rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/10 ${
                          action.primary ? 'border-primary/35 bg-primary/15' : 'bg-background/45'
                        }`}
                      >
                        <div className='flex items-center justify-between gap-3'>
                          <span className='text-sm font-semibold'>{action.label}</span>
                          <span className='flex size-7 items-center justify-center rounded-xl border bg-card/60 text-primary transition group-hover:scale-105'>
                            {action.icon}
                          </span>
                        </div>
                        <div className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>
                          {action.detail}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className='flex flex-col justify-between rounded-3xl border bg-background/45 p-4'>
                  <div>
                    <div className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
                      Why it matters
                    </div>
                    <h2 className='mt-2 text-xl font-semibold'>
                      It turns the dashboard into a command loop.
                    </h2>
                    <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                      The old overview shows status. This concept should answer: what are we trying
                      to do, who is working, what needs approval, and what happened most recently?
                    </p>
                  </div>
                  <div className='mt-5 grid grid-cols-2 gap-2'>
                    {missionFacts.map((fact) => (
                      <MiniPanel key={fact.label} {...fact} />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className='grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]'>
              <Card className='relative overflow-hidden border-primary/20 bg-card/75 shadow-sm backdrop-blur'>
                <div className='pointer-events-none absolute inset-x-0 top-0 h-40 bg-primary/10 blur-2xl' />
                <CardHeader className='relative'>
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <CardTitle className='text-2xl'>Current mission plan</CardTitle>
                      <CardDescription>
                        Mocked planner block matching the reference density.
                      </CardDescription>
                    </div>
                    <Badge className='bg-primary text-primary-foreground'>active</Badge>
                  </div>
                </CardHeader>
                <CardContent className='relative space-y-4'>
                  <div className='rounded-3xl border bg-background/45 p-4'>
                    <div className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
                      Goal
                    </div>
                    <h2 className='mt-2 text-2xl font-semibold'>
                      Make Overview 2 feel like the screenshot.
                    </h2>
                    <p className='mt-2 text-sm leading-6 text-muted-foreground'>
                      Use mocked data now: mission actions, approvals, active agents, live feed, and
                      side context. Later we reverse-engineer it into real Agent OS mission state.
                    </p>
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
                        <div className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>
                          {step.detail}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className='grid gap-2 md:grid-cols-3'>
                    {approvals.map((approval) => (
                      <div key={approval.title} className='rounded-2xl border bg-background/45 p-3'>
                        <div className='flex items-center justify-between gap-2'>
                          <div className='line-clamp-1 text-sm font-medium'>{approval.title}</div>
                          <Badge variant='outline' className='text-[10px]'>
                            {approval.priority}
                          </Badge>
                        </div>
                        <div className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>
                          {approval.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className='border-primary/15 bg-card/75 shadow-sm backdrop-blur'>
                <CardHeader>
                  <CardTitle>Agent roster</CardTitle>
                  <CardDescription>Mocked availability and current assignments.</CardDescription>
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
                        <div className='mt-1 line-clamp-1 text-xs text-muted-foreground'>
                          {agent.task}
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

          <aside className='space-y-3'>
            <Card className='border-primary/15 bg-card/75 shadow-sm backdrop-blur'>
              <CardHeader>
                <CardTitle>Live agent feed</CardTitle>
                <CardDescription>Everything important that just happened.</CardDescription>
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
                <CardDescription>Compact mission telemetry.</CardDescription>
              </CardHeader>
              <CardContent className='grid grid-cols-2 gap-2'>
                {signals.map((signal) => (
                  <MiniPanel key={signal.label} {...signal} />
                ))}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}
