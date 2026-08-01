import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import {
  BuildActivityResumeItem,
  type BuildActivitySnapshot
} from '@/components/build-activity-indicator';
import { InteractiveCalendarOverviewCard } from '@/components/interactive-calendar-overview-card';
import { LiveActivitySurface } from '@/components/live-activity-surface';
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
import { Progress } from '@/components/ui/progress';
import { getCalendarSignals } from '@/db/external-signals';
import { getVercelSnapshot, type VercelDeployment, type VercelSnapshot } from '@/db/vercel';
import { getActionCenterSnapshot, type ActionCenterItem } from '@/lib/action-center';
import { getCaiBriefing, type CaiBriefing } from '@/lib/briefing';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Overview'
};

const TASK_COLORS = [
  'var(--primary)',
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)'
];

const ACTIVE_VERCEL_BUILD_STATES = new Set(['BUILDING', 'QUEUED', 'INITIALIZING', 'DEPLOYING']);

const KNOWLEDGE_STAGES = [
  { key: 'raw', label: 'Raw', detail: 'Inbox' },
  { key: 'extracted', label: 'Extracted', detail: 'Readable' },
  { key: 'wikified', label: 'Wiki', detail: 'Notes' },
  { key: 'reviewed', label: 'Reviewed', detail: 'Trusted' },
  { key: 'promoted', label: 'Context', detail: 'OpenClaw' },
  { key: 'archived', label: 'Archive', detail: 'Cold' }
] as const;

const COCKPIT_VIEWS = [
  {
    key: 'today',
    label: 'Today',
    description: 'Priority, agenda & focus',
    icon: 'sun'
  },
  {
    key: 'operations',
    label: 'Operations',
    description: 'Runs, agents & task flow',
    icon: 'activity'
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    description: 'Pipeline & memory maturity',
    icon: 'brain'
  },
  {
    key: 'signals',
    label: 'Signals',
    description: 'Markets, news & weather',
    icon: 'chartCandle'
  }
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Icons;
}>;

type CockpitView = (typeof COCKPIT_VIEWS)[number]['key'];
type CockpitTask = CaiBriefing['cockpit']['tasks'][number];
type CockpitAgent = CaiBriefing['cockpit']['agents'][number];
type CockpitEvent = NonNullable<CaiBriefing['cockpit']['events']>[number];
type MarketAsset = CaiBriefing['markets']['assets'][number];
type NewsSignal = CaiBriefing['news']['items'][number];
type CalendarSnapshot = Awaited<ReturnType<typeof getCalendarSignals>>;

interface WeatherSnapshot {
  location: string;
  condition: string;
  temperature: string;
  feelsLike: string;
  wind: string;
  humidity: string;
  precipitation: string;
  ok: boolean;
}

function resolveView(value: string | string[] | undefined): CockpitView {
  const requested = Array.isArray(value) ? value[0] : value;
  return COCKPIT_VIEWS.some((view) => view.key === requested)
    ? (requested as CockpitView)
    : 'today';
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (['online', 'in_progress', 'running', 'active', 'done'].includes(status)) return 'default';
  if (['waiting', 'queued', 'pending', 'review'].includes(status)) return 'outline';
  return 'secondary';
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden='true'
      className={cn('size-2 shrink-0 rounded-full', ok ? 'bg-primary' : 'bg-muted-foreground')}
    />
  );
}

function timeLabel(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function timeLabelFromMs(value?: number | null): string | null {
  if (!value) return null;
  return timeLabel(new Date(value).toISOString());
}

function stockholmDate(value: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(value);
}

function stockholmTime(value: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(value);
}

function greetingFor(value: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Stockholm',
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(value)
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

async function getUppsalaWeather(): Promise<WeatherSnapshot> {
  try {
    const response = await fetch('https://wttr.in/Uppsala?m&format=%l|%c|%t|%f|%w|%h|%p', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3500)
    });
    if (!response.ok) throw new Error(`wttr ${response.status}`);
    const [location, condition, temperature, feelsLike, wind, humidity, precipitation] = (
      await response.text()
    )
      .trim()
      .split('|');
    return {
      location: location || 'Uppsala',
      condition: condition || '—',
      temperature: temperature || '—',
      feelsLike: feelsLike || '—',
      wind: wind || '—',
      humidity: humidity || '—',
      precipitation: precipitation || '—',
      ok: true
    };
  } catch {
    return {
      location: 'Uppsala',
      condition: 'Weather unavailable',
      temperature: '—',
      feelsLike: '—',
      wind: '—',
      humidity: '—',
      precipitation: '—',
      ok: false
    };
  }
}

function compactNumber(value: number | null, currency?: string): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('sv-SE', {
    maximumFractionDigits: 0,
    ...(currency ? { style: 'currency', currency } : {})
  }).format(value);
}

function percent(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function marketPrice(asset: MarketAsset): string {
  if (asset.priceSek !== null) return compactNumber(asset.priceSek, 'SEK');
  if (asset.priceUsd !== null) return compactNumber(asset.priceUsd, 'USD');
  return 'Watch';
}

function marketTone(change24h: number | null): string {
  if (change24h === null) return 'text-muted-foreground';
  return change24h >= 0 ? 'text-primary' : 'text-destructive';
}

function holdingDirection(change24h: number | null): string {
  if (change24h === null) return 'No live move yet';
  if (change24h > 0) return 'Holdings up';
  if (change24h < 0) return 'Holdings down';
  return 'Flat today';
}

function briefPreview(text?: string | null): string {
  const value = String(text ?? '').trim();
  if (!value) return 'No delivered Cai briefing was found.';
  return value.length > 900 ? `${value.slice(0, 900).trim()}…` : value;
}

function isOpenTaskStatus(status?: string | null): boolean {
  const normalized = String(status ?? '').toLowerCase();
  return normalized !== 'done' && normalized !== 'cancelled' && normalized !== 'canceled';
}

function isActiveVercelBuild(deployment: VercelDeployment): boolean {
  return ACTIVE_VERCEL_BUILD_STATES.has(String(deployment.state).toUpperCase());
}

function buildActivitySnapshot(
  vercel: VercelSnapshot,
  localBuildCount: number
): BuildActivitySnapshot {
  const activeDeployments = vercel.deployments.filter(isActiveVercelBuild);
  const latest = activeDeployments[0] ?? vercel.deployments[0] ?? null;
  return {
    generatedAt: vercel.generatedAt,
    connected: vercel.connected,
    activeCount: activeDeployments.length + localBuildCount,
    activeVercelCount: activeDeployments.length,
    localBuildCount,
    source: vercel.source,
    latest: latest
      ? {
          name: latest.name,
          state: latest.state,
          target: latest.target,
          createdAt: latest.createdAt,
          url: latest.url,
          inspectorUrl: latest.inspectorUrl
        }
      : null
  };
}

function actionPriorityTone(priority: ActionCenterItem['priority']): string {
  if (priority === 'high') return 'border-primary/40 bg-primary/10 text-primary';
  if (priority === 'medium') return 'border-border bg-muted/50 text-muted-foreground';
  return 'border-border bg-background text-muted-foreground';
}

function ViewNavigation({ activeView }: { activeView: CockpitView }) {
  return (
    <nav aria-label='Cockpit views' className='rounded-xl border bg-card p-1 shadow-xs'>
      <div className='grid grid-cols-2 gap-1 lg:grid-cols-4'>
        {COCKPIT_VIEWS.map((view) => {
          const Icon = Icons[view.icon];
          const active = view.key === activeView;
          return (
            <Link
              key={view.key}
              href={{ pathname: '/dashboard/overview', query: { view: view.key } }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-visible:ring-ring flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className='size-4 shrink-0' aria-hidden='true' />
              <span className='min-w-0 text-left'>
                <span className='block text-sm font-medium'>{view.label}</span>
                <span
                  className={cn(
                    'hidden truncate text-[11px] lg:block',
                    active ? 'text-primary-foreground/75' : 'text-muted-foreground'
                  )}
                >
                  {view.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function PulseStrip({
  queueCount,
  highCount,
  openTaskCount,
  activeRunCount,
  activeBuildCount,
  dbOnline
}: {
  queueCount: number;
  highCount: number;
  openTaskCount: number;
  activeRunCount: number;
  activeBuildCount: number;
  dbOnline: boolean;
}) {
  const items = [
    {
      label: 'Queue',
      value: queueCount,
      detail: `${highCount} high priority`,
      icon: Icons.listChecks
    },
    {
      label: 'Open tasks',
      value: openTaskCount,
      detail: 'Across the task board',
      icon: Icons.kanban
    },
    {
      label: 'Active runs',
      value: activeRunCount,
      detail: activeRunCount ? 'Work in motion' : 'Runtime idle',
      icon: Icons.activity
    },
    {
      label: 'Builds',
      value: activeBuildCount,
      detail: activeBuildCount ? 'Build activity live' : 'Build pipeline idle',
      icon: Icons.rocket
    }
  ];

  return (
    <div className='overflow-hidden rounded-xl border bg-card shadow-xs'>
      <div className='grid grid-cols-2 lg:grid-cols-4'>
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={cn(
                'flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4',
                index % 2 !== 0 && 'border-l',
                index >= 2 && 'border-t lg:border-t-0',
                index > 0 && 'lg:border-l'
              )}
            >
              <div className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg'>
                <Icon className='size-4' aria-hidden='true' />
              </div>
              <div className='min-w-0'>
                <div className='flex items-baseline gap-2'>
                  <span className='text-xl font-semibold tabular-nums'>{item.value}</span>
                  <span className='truncate text-xs font-medium'>{item.label}</span>
                </div>
                <p className='text-muted-foreground truncate text-[11px]'>{item.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className='text-muted-foreground flex items-center gap-2 border-t px-4 py-2 text-xs'>
        <StatusDot ok={dbOnline} />
        <span>
          {dbOnline ? 'Primary data source connected' : 'Running with degraded data access'}
        </span>
      </div>
    </div>
  );
}

function CompactEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className='text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm'>
      {children}
    </div>
  );
}

function FocusQueueCard({ tasks }: { tasks: CockpitTask[] }) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>Focus queue</CardTitle>
        <CardDescription>The next 5 open tasks, ordered by the runtime snapshot.</CardDescription>
        <CardAction>
          <Button asChild size='sm' variant='ghost'>
            <Link href='/dashboard/kanban'>Open board</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='divide-y p-0'>
        {tasks.length === 0 ? (
          <div className='p-4'>
            <CompactEmpty>No priority tasks were found.</CompactEmpty>
          </div>
        ) : (
          tasks.slice(0, 5).map((task, index) => {
            const meta = [task.project, task.owner, timeLabel(task.updatedAt)].filter(Boolean);
            return (
              <Link
                key={`${task.id ?? task.title}-${task.status}`}
                href='/dashboard/kanban'
                className='group flex min-w-0 gap-3 px-4 py-3 transition-colors hover:bg-muted/50'
              >
                <span className='bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums group-hover:bg-primary/10 group-hover:text-primary'>
                  {index + 1}
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='flex min-w-0 items-start justify-between gap-3'>
                    <span className='line-clamp-1 text-sm font-medium'>{task.title}</span>
                    <Badge variant={statusVariant(task.status)} className='shrink-0'>
                      {task.status}
                    </Badge>
                  </span>
                  <span className='text-muted-foreground mt-1 block line-clamp-1 text-xs'>
                    {task.detail || meta.join(' · ') || 'No additional task context'}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function NextActionCard({
  action,
  fallbackTask
}: {
  action?: ActionCenterItem;
  fallbackTask?: CockpitTask;
}) {
  const title = action?.title ?? fallbackTask?.title ?? 'Decision queue is clear';
  const detail =
    action?.detail ??
    fallbackTask?.detail ??
    'No high-signal cockpit item needs attention right now.';

  return (
    <Card className='relative overflow-hidden border-primary/25 bg-card'>
      <div aria-hidden='true' className='absolute inset-y-0 left-0 w-1 bg-primary' />
      <CardHeader>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>Resume here</Badge>
          {action ? (
            <Badge variant='outline' className={actionPriorityTone(action.priority)}>
              {action.priority}
            </Badge>
          ) : null}
        </div>
        <CardTitle className='max-w-3xl text-xl text-pretty sm:text-2xl'>{title}</CardTitle>
        <CardDescription className='max-w-3xl text-sm leading-6'>{detail}</CardDescription>
      </CardHeader>
      <CardFooter className='flex-wrap gap-2'>
        <Button asChild>
          <Link href='/dashboard/action-center'>
            Open Action Center
            <Icons.arrowRight data-icon='inline-end' />
          </Link>
        </Button>
        {action ? (
          <Button asChild variant='outline'>
            <Link href={action.href}>{action.primaryLabel}</Link>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function DailyContextCard({
  calendar,
  weather,
  date
}: {
  calendar: CalendarSnapshot;
  weather: WeatherSnapshot;
  date: Date;
}) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>Today at a glance</CardTitle>
        <CardDescription className='capitalize'>{stockholmDate(date)}</CardDescription>
        <CardAction>
          <Badge variant={weather.ok ? 'secondary' : 'outline'}>
            {weather.ok ? 'Live' : 'Degraded'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className='grid grid-cols-2 divide-x p-0'>
        <div className='flex items-center gap-3 p-4'>
          <div className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg'>
            <Icons.cloudSun className='size-5' aria-hidden='true' />
          </div>
          <div className='min-w-0'>
            <div className='text-xl font-semibold tabular-nums'>{weather.temperature}</div>
            <div className='text-muted-foreground truncate text-xs'>
              {weather.location} · {weather.condition}
            </div>
          </div>
        </div>
        <div className='flex items-center gap-3 p-4'>
          <div className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg'>
            <Icons.calendarDays className='size-5' aria-hidden='true' />
          </div>
          <div>
            <div className='text-xl font-semibold tabular-nums'>{calendar.counts.next24h}</div>
            <div className='text-muted-foreground text-xs'>Events in the next 24h</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemMetricsCard({ stats }: { stats: CaiBriefing['cockpit']['stats'] }) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>Runtime metrics</CardTitle>
        <CardDescription>Live values from the cockpit snapshot.</CardDescription>
      </CardHeader>
      <CardContent className='grid grid-cols-2 p-0 sm:grid-cols-3'>
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              'min-w-0 px-4 py-3',
              index % 2 !== 0 && 'border-l sm:border-l-0',
              index % 3 !== 0 && 'sm:border-l',
              index >= 2 && 'border-t sm:border-t-0',
              index >= 3 && 'sm:border-t'
            )}
          >
            <div className='text-muted-foreground truncate text-xs'>{stat.label}</div>
            <div className='mt-1 text-2xl font-semibold tabular-nums'>{stat.value}</div>
            <div className='text-muted-foreground mt-1 line-clamp-1 text-[11px]'>{stat.detail}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AgentsCard({ agents }: { agents: CockpitAgent[] }) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>Agents</CardTitle>
        <CardDescription>Roles and runtime state.</CardDescription>
        <CardAction>
          <Button asChild size='sm' variant='ghost'>
            <Link href='/dashboard/agents'>Manage</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='max-h-80 divide-y overflow-y-auto p-0'>
        {agents.length === 0 ? (
          <div className='p-4'>
            <CompactEmpty>No agents were returned by the snapshot.</CompactEmpty>
          </div>
        ) : (
          agents.slice(0, 8).map((agent) => (
            <div key={agent.name} className='flex min-w-0 items-center gap-3 px-4 py-3'>
              <div className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold'>
                {agent.name.slice(0, 2).toUpperCase()}
              </div>
              <div className='min-w-0 flex-1'>
                <div className='truncate text-sm font-medium'>{agent.name}</div>
                <div className='text-muted-foreground truncate text-xs'>
                  {agent.role} · {agent.detail}
                </div>
              </div>
              <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function EventsCard({ events }: { events: CockpitEvent[] }) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>Recent events</CardTitle>
        <CardDescription>Latest audit signals, not raw logs.</CardDescription>
        <CardAction>
          <Badge variant='outline'>Live</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className='max-h-80 divide-y overflow-y-auto p-0'>
        {events.length === 0 ? (
          <div className='p-4'>
            <CompactEmpty>No recent events.</CompactEmpty>
          </div>
        ) : (
          events.slice(0, 10).map((event, index) => (
            <div key={`${event.createdAt}-${event.kind}`} className='flex gap-3 px-4 py-3'>
              <span
                aria-hidden='true'
                className='mt-1.5 size-2 shrink-0 rounded-full'
                style={{ backgroundColor: TASK_COLORS[index % TASK_COLORS.length] }}
              />
              <div className='min-w-0 flex-1'>
                <div className='flex items-start justify-between gap-2'>
                  <span className='truncate text-sm font-medium'>{event.kind}</span>
                  <time
                    dateTime={event.createdAt}
                    className='text-muted-foreground shrink-0 text-[10px] tabular-nums'
                  >
                    {timeLabel(event.createdAt)}
                  </time>
                </div>
                <p className='text-muted-foreground mt-1 line-clamp-2 text-xs'>{event.message}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Donut({ entries }: { entries: Array<[string, number]> }) {
  const total = entries.reduce((sum, [, count]) => sum + Number(count), 0);
  let cursor = 0;
  const stops = entries
    .map(([, count], index) => {
      const start = cursor;
      const size = total > 0 ? (Number(count) / total) * 100 : 0;
      cursor += size;
      return `${TASK_COLORS[index % TASK_COLORS.length]} ${start}% ${cursor}%`;
    })
    .join(', ');

  return (
    <div
      className='relative size-24 shrink-0 rounded-full'
      style={{ background: `conic-gradient(${stops || 'var(--muted) 0% 100%'})` }}
    >
      <div className='bg-card absolute inset-3 flex flex-col items-center justify-center rounded-full'>
        <div className='text-xl font-semibold tabular-nums'>{total}</div>
        <div className='text-muted-foreground text-[10px]'>tasks</div>
      </div>
    </div>
  );
}

function TaskFlowCard({ entries }: { entries: Array<[string, number]> }) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>Task flow</CardTitle>
        <CardDescription>Open work by board state.</CardDescription>
        <CardAction>
          <Button asChild size='sm' variant='ghost'>
            <Link href='/dashboard/kanban'>Open tasks</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='p-4'>
        {entries.length === 0 ? (
          <CompactEmpty>No task status data is available.</CompactEmpty>
        ) : (
          <div className='flex items-center gap-5'>
            <Donut entries={entries} />
            <div className='min-w-0 flex-1 space-y-2'>
              {entries.map(([status, count], index) => (
                <div key={status} className='flex items-center justify-between gap-3 text-sm'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <span
                      aria-hidden='true'
                      className='size-2 shrink-0 rounded-full'
                      style={{ backgroundColor: TASK_COLORS[index % TASK_COLORS.length] }}
                    />
                    <span className='truncate'>{status}</span>
                  </div>
                  <span className='font-medium tabular-nums'>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KnowledgePipelineCard({
  counts,
  progress
}: {
  counts: Record<string, number>;
  progress: number;
}) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>Knowledge pipeline</CardTitle>
        <CardDescription>From raw capture to trusted OpenClaw context.</CardDescription>
        <CardAction>
          <Button asChild size='sm' variant='ghost'>
            <Link href='/dashboard/knowledge'>Open studio</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-5 p-4 sm:p-5'>
        <div className='relative grid grid-cols-3 gap-3 sm:grid-cols-6'>
          <div
            aria-hidden='true'
            className='absolute top-4 right-[8%] left-[8%] hidden h-px bg-border sm:block'
          />
          {KNOWLEDGE_STAGES.map((stage) => {
            const count = counts[stage.key] ?? 0;
            return (
              <div
                key={stage.key}
                className='relative flex min-w-0 flex-col items-center text-center'
              >
                <div
                  className={cn(
                    'bg-card z-10 flex size-8 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                    count > 0
                      ? 'border-primary text-primary ring-4 ring-primary/10'
                      : 'text-muted-foreground'
                  )}
                >
                  {count}
                </div>
                <div className='mt-2 truncate text-xs font-medium'>{stage.label}</div>
                <div className='text-muted-foreground truncate text-[10px]'>{stage.detail}</div>
              </div>
            );
          })}
        </div>
        <div className='rounded-lg border bg-muted/30 p-4'>
          <div className='mb-2 flex items-center justify-between gap-3 text-xs'>
            <span className='text-muted-foreground'>Pipeline maturity</span>
            <span className='font-medium tabular-nums'>{progress}%</span>
          </div>
          <Progress value={progress} className='h-1.5' />
        </div>
      </CardContent>
    </Card>
  );
}

function MarketsCard({
  assets,
  averageChange,
  liveCount,
  holdingCount,
  ok
}: {
  assets: MarketAsset[];
  averageChange: number | null;
  liveCount: number;
  holdingCount: number;
  ok: boolean;
}) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>Markets</CardTitle>
        <CardDescription>Holdings and watchlist movement.</CardDescription>
        <CardAction>
          <Badge variant={ok ? 'secondary' : 'outline'}>{ok ? 'Live' : 'Watch'}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className='p-0'>
        <div className='flex items-start justify-between gap-3 border-b bg-muted/25 px-4 py-3'>
          <div>
            <div className='text-sm font-medium'>{holdingDirection(averageChange)}</div>
            <div className='text-muted-foreground text-xs'>
              {liveCount}/{holdingCount} live instruments
            </div>
          </div>
          <div className={cn('text-lg font-semibold tabular-nums', marketTone(averageChange))}>
            {percent(averageChange)}
          </div>
        </div>
        <div className='max-h-[30rem] divide-y overflow-y-auto'>
          {assets.length === 0 ? (
            <div className='p-4'>
              <CompactEmpty>No market assets are configured.</CompactEmpty>
            </div>
          ) : (
            assets.map((asset) => (
              <div
                key={asset.id}
                className='flex min-w-0 items-center justify-between gap-3 px-4 py-3'
              >
                <div className='min-w-0'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <span className='truncate text-sm font-medium'>{asset.label}</span>
                    {asset.holding ? (
                      <Badge variant='secondary' className='shrink-0 text-[10px]'>
                        Holding
                      </Badge>
                    ) : null}
                  </div>
                  <div className='text-muted-foreground mt-0.5 text-[11px] uppercase tracking-wide'>
                    {asset.symbol} · {asset.kind}
                    {asset.quantity ? ` · ${asset.quantity}` : ''}
                  </div>
                </div>
                <div className='shrink-0 text-right'>
                  <div className='text-sm font-semibold tabular-nums'>{marketPrice(asset)}</div>
                  <div className={cn('text-xs tabular-nums', marketTone(asset.change24h))}>
                    {asset.change24h === null ? '—' : `${percent(asset.change24h)} 24h`}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NewsCard({ signals, ok }: { signals: NewsSignal[]; ok: boolean }) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>News signals</CardTitle>
        <CardDescription>High-signal headlines from connected sources.</CardDescription>
        <CardAction>
          <Badge variant={ok ? 'secondary' : 'outline'}>{ok ? 'Live' : 'Degraded'}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className='max-h-[24rem] divide-y overflow-y-auto p-0'>
        {signals.length === 0 ? (
          <div className='p-4'>
            <CompactEmpty>No news signals are available.</CompactEmpty>
          </div>
        ) : (
          signals.map((item) => (
            <a
              key={`${item.source}-${item.url}`}
              href={item.url}
              target='_blank'
              rel='noreferrer'
              className='group flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50'
            >
              <div className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg'>
                <Icons.news className='size-4' aria-hidden='true' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='line-clamp-2 text-sm font-medium leading-5 group-hover:text-primary'>
                  {item.title}
                </div>
                <div className='text-muted-foreground mt-1 flex items-center gap-1 text-[11px] uppercase tracking-wide'>
                  <span className='truncate'>{item.source}</span>
                  <Icons.externalLink className='size-3 shrink-0' aria-hidden='true' />
                </div>
              </div>
            </a>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function WeatherCard({ weather }: { weather: WeatherSnapshot }) {
  const details = [
    { label: 'Feels like', value: weather.feelsLike },
    { label: 'Wind', value: weather.wind },
    { label: 'Humidity', value: weather.humidity },
    { label: 'Rain', value: weather.precipitation }
  ];

  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='border-b py-4'>
        <CardTitle>Weather</CardTitle>
        <CardDescription>Live conditions for {weather.location}.</CardDescription>
        <CardAction>
          <Badge variant={weather.ok ? 'secondary' : 'outline'}>
            {weather.ok ? 'Live' : 'Degraded'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className='p-4'>
        <div className='flex items-end justify-between gap-4 rounded-lg border bg-muted/25 p-4'>
          <div>
            <div className='text-muted-foreground text-xs'>{weather.condition}</div>
            <div className='mt-1 text-3xl font-semibold tracking-tight tabular-nums'>
              {weather.temperature}
            </div>
          </div>
          <Icons.cloudSun className='text-primary size-9' aria-hidden='true' />
        </div>
        <dl className='mt-3 grid grid-cols-2 gap-2'>
          {details.map((detail) => (
            <div key={detail.label} className='rounded-lg border px-3 py-2'>
              <dt className='text-muted-foreground text-[11px]'>{detail.label}</dt>
              <dd className='mt-0.5 text-sm font-medium'>{detail.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function CockpitRightRail({
  activeView,
  buildActivity,
  dbOnline,
  generatedAt,
  latestBrief,
  latestBriefLabel,
  latestBriefMeta,
  subagentsOk
}: {
  activeView: CockpitView;
  buildActivity: BuildActivitySnapshot;
  dbOnline: boolean;
  generatedAt: string;
  latestBrief: string;
  latestBriefLabel: string;
  latestBriefMeta: string;
  subagentsOk: boolean;
}) {
  const view = COCKPIT_VIEWS.find((item) => item.key === activeView) ?? COCKPIT_VIEWS[0];
  const ViewIcon = Icons[view.icon];

  return (
    <>
      <Card className='gap-0 py-0'>
        <CardHeader className='py-4'>
          <div className='bg-primary/10 text-primary mb-2 flex size-9 items-center justify-center rounded-lg'>
            <ViewIcon className='size-4' aria-hidden='true' />
          </div>
          <CardTitle>{view.label}</CardTitle>
          <CardDescription>{view.description}</CardDescription>
        </CardHeader>
      </Card>

      <Card className='gap-0 py-0'>
        <CardHeader className='border-b py-4'>
          <CardTitle>Quick actions</CardTitle>
          <CardDescription>Move directly into the next workspace.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-2 p-3'>
          <Button asChild variant='outline' className='justify-start'>
            <Link href='/dashboard/action-center'>
              <Icons.zap data-icon='inline-start' />
              Open Action Center
            </Link>
          </Button>
          <Button asChild variant='outline' className='justify-start'>
            <Link href='/dashboard/kanban'>
              <Icons.kanban data-icon='inline-start' />
              Open task board
            </Link>
          </Button>
          <Button asChild variant='outline' className='justify-start'>
            <Link href='/dashboard/chat'>
              <Icons.chat data-icon='inline-start' />
              Ask Cai
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className='gap-0 py-0'>
        <CardHeader className='border-b py-4'>
          <CardTitle>System pulse</CardTitle>
          <CardDescription>Signals, not raw logs.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2 p-3 text-sm'>
          <BuildActivityResumeItem initial={buildActivity} />
          <div className='flex items-center gap-3 rounded-lg border px-3 py-2.5'>
            <StatusDot ok={dbOnline} />
            <span className='min-w-0 flex-1'>Database</span>
            <span className='text-muted-foreground text-xs'>
              {dbOnline ? 'online' : 'degraded'}
            </span>
          </div>
          <div className='flex items-center gap-3 rounded-lg border px-3 py-2.5'>
            <StatusDot ok={subagentsOk} />
            <span className='min-w-0 flex-1'>OpenClaw bridge</span>
            <span className='text-muted-foreground text-xs'>
              {subagentsOk ? 'connected' : 'fallback'}
            </span>
          </div>
        </CardContent>
        <CardFooter className='text-muted-foreground border-t py-3 text-xs tabular-nums'>
          Updated {generatedAt}
        </CardFooter>
      </Card>

      <Card className='gap-0 py-0'>
        <CardHeader className='border-b py-4'>
          <CardTitle>Cai briefing</CardTitle>
          <CardDescription>Latest delivered digest.</CardDescription>
          <CardAction>
            <Badge variant='outline'>{latestBriefLabel}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className='p-4'>
          <p className='max-h-48 overflow-y-auto whitespace-pre-line text-sm leading-6'>
            {latestBrief}
          </p>
        </CardContent>
        <CardFooter className='text-muted-foreground border-t py-3 text-[11px]'>
          {latestBriefMeta}
        </CardFooter>
      </Card>
    </>
  );
}

function TodayView({
  calendar,
  weather,
  liveAt,
  nextAction,
  tasks
}: {
  calendar: CalendarSnapshot;
  weather: WeatherSnapshot;
  liveAt: Date;
  nextAction?: ActionCenterItem;
  tasks: CockpitTask[];
}) {
  return (
    <div className='space-y-4'>
      <div className='grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]'>
        <NextActionCard action={nextAction} fallbackTask={tasks[0]} />
        <DailyContextCard calendar={calendar} weather={weather} date={liveAt} />
      </div>
      <div className='grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.78fr)]'>
        <FocusQueueCard tasks={tasks} />
        <InteractiveCalendarOverviewCard calendar={calendar} />
      </div>
    </div>
  );
}

function OperationsView({
  agents,
  events,
  stats,
  subagents,
  taskEntries
}: {
  agents: CockpitAgent[];
  events: CockpitEvent[];
  stats: CaiBriefing['cockpit']['stats'];
  subagents: CaiBriefing['cockpit']['subagents'];
  taskEntries: Array<[string, number]>;
}) {
  return (
    <div className='space-y-4'>
      <SystemMetricsCard stats={stats} />
      <LiveActivitySurface subagents={subagents} href='/dashboard/kanban' className='rounded-xl' />
      <div className='grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3'>
        <TaskFlowCard entries={taskEntries} />
        <AgentsCard agents={agents} />
        <EventsCard events={events} />
      </div>
    </div>
  );
}

function SignalsView({
  assets,
  averageChange,
  holdingCount,
  liveCount,
  marketsOk,
  news,
  newsOk,
  weather
}: {
  assets: MarketAsset[];
  averageChange: number | null;
  holdingCount: number;
  liveCount: number;
  marketsOk: boolean;
  news: NewsSignal[];
  newsOk: boolean;
  weather: WeatherSnapshot;
}) {
  return (
    <div className='grid items-start gap-4 lg:grid-cols-2'>
      <MarketsCard
        assets={assets}
        averageChange={averageChange}
        liveCount={liveCount}
        holdingCount={holdingCount}
        ok={marketsOk}
      />
      <div className='space-y-4'>
        <WeatherCard weather={weather} />
        <NewsCard signals={news} ok={newsOk} />
      </div>
    </div>
  );
}

export default async function OverviewPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const params = await searchParams;
  const activeView = resolveView(params.view);
  const needsCalendar = activeView === 'today';
  const needsWeather = activeView === 'today' || activeView === 'signals';

  const [briefing, actionCenter, vercel, calendar, weather] = await Promise.all([
    getCaiBriefing(),
    getActionCenterSnapshot(),
    getVercelSnapshot(),
    needsCalendar ? getCalendarSignals() : Promise.resolve(null),
    needsWeather ? getUppsalaWeather() : Promise.resolve(null)
  ]);

  const snapshot = briefing.cockpit;
  const knowledge = snapshot.knowledge ?? { raw: 0, queued: 0, wikified: 0, progress: 0 };
  const knowledgeCounts = knowledge as Record<string, number>;
  const overviewTasks = snapshot.tasks.filter((task) => isOpenTaskStatus(task.status));
  const taskEntries = Object.entries(snapshot.taskStatus ?? {}).filter(([status]) =>
    isOpenTaskStatus(status)
  );
  const visibleEvents = (snapshot.events ?? []).filter(
    (event) => !event.kind.startsWith('cai_brief_cron_')
  );
  const subagents = snapshot.subagents;
  const recentRuns = subagents?.recent ?? [];
  const runningRuns = recentRuns.filter((run) =>
    ['queued', 'running', 'active'].includes(run.status)
  );
  const localBuildRunCount = runningRuns.filter((run) =>
    /\b(build|deploy|typecheck|lint|verify)\b/i.test(`${run.title} ${run.label}`)
  ).length;
  const buildActivity = buildActivitySnapshot(vercel, localBuildRunCount);
  const activeRunCount = subagents?.runningCount ?? runningRuns.length;
  const generatedAt = snapshot.generatedAt ? timeLabel(snapshot.generatedAt) : null;
  const parsedLiveAt = snapshot.generatedAt ? new Date(snapshot.generatedAt) : new Date();
  const liveAt = Number.isNaN(parsedLiveAt.getTime()) ? new Date() : parsedLiveAt;
  const latestCaiRun = briefing.latestMessage.latest;
  const latestCaiMessage = briefPreview(latestCaiRun?.summary);
  const latestCaiTime = timeLabelFromMs(latestCaiRun?.runAtMs) ?? 'No cron run found';
  const nextAction =
    actionCenter.items.find((item) => item.priority === 'high') ?? actionCenter.items[0];
  const activeViewDefinition =
    COCKPIT_VIEWS.find((view) => view.key === activeView) ?? COCKPIT_VIEWS[0];

  return (
    <PageContainer
      pageTitle={`${greetingFor(liveAt)}, Felipe`}
      pageDescription={`${stockholmDate(liveAt)} · Uppsala time ${stockholmTime(liveAt)}`}
      pageHeaderAction={
        <div className='flex flex-wrap gap-2'>
          <Button asChild variant='outline' size='sm'>
            <Link href='/dashboard/chat'>
              <Icons.chat data-icon='inline-start' />
              Ask Cai
            </Link>
          </Button>
          <Button asChild size='sm'>
            <Link href='/dashboard/action-center'>
              <Icons.zap data-icon='inline-start' />
              Action Center
            </Link>
          </Button>
        </div>
      }
      rightRailTitle='Cockpit context'
      rightRailDescription={`${activeViewDefinition.label}: ${activeViewDefinition.description}`}
      rightRail={
        <CockpitRightRail
          activeView={activeView}
          buildActivity={buildActivity}
          dbOnline={snapshot.dbOnline}
          generatedAt={generatedAt ?? 'No timestamp'}
          latestBrief={latestCaiMessage}
          latestBriefLabel={latestCaiRun?.label ?? 'Brief'}
          latestBriefMeta={
            latestCaiRun
              ? `${latestCaiTime} · ${latestCaiRun.deliveryStatus ?? 'unknown'}`
              : latestCaiTime
          }
          subagentsOk={Boolean(subagents?.ok)}
        />
      }
    >
      <div className='flex min-w-0 flex-col gap-4'>
        <PulseStrip
          queueCount={actionCenter.counts.total}
          highCount={actionCenter.counts.high}
          openTaskCount={briefing.pulse.openTasks}
          activeRunCount={activeRunCount}
          activeBuildCount={buildActivity.activeCount}
          dbOnline={snapshot.dbOnline}
        />
        <ViewNavigation activeView={activeView} />

        <main className='min-w-0'>
          {activeView === 'today' && calendar && weather ? (
            <TodayView
              calendar={calendar}
              weather={weather}
              liveAt={liveAt}
              nextAction={nextAction}
              tasks={overviewTasks}
            />
          ) : null}

          {activeView === 'operations' ? (
            <OperationsView
              agents={snapshot.agents}
              events={visibleEvents}
              stats={snapshot.stats}
              subagents={subagents}
              taskEntries={taskEntries}
            />
          ) : null}

          {activeView === 'knowledge' ? (
            <KnowledgePipelineCard counts={knowledgeCounts} progress={knowledge.progress} />
          ) : null}

          {activeView === 'signals' && weather ? (
            <SignalsView
              assets={briefing.markets.assets.slice(0, 12)}
              averageChange={briefing.markets.holdings.averageChange24h}
              holdingCount={briefing.markets.holdings.count}
              liveCount={briefing.markets.holdings.liveCount}
              marketsOk={briefing.markets.ok}
              news={briefing.news.items.slice(0, 8)}
              newsOk={briefing.news.ok}
              weather={weather}
            />
          ) : null}
        </main>

        <footer className='text-muted-foreground flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex flex-wrap items-center gap-3'>
            <span className='flex items-center gap-1.5'>
              <StatusDot ok={snapshot.dbOnline} /> Database
            </span>
            <span className='flex items-center gap-1.5'>
              <StatusDot ok={Boolean(subagents?.ok)} /> Bridge
            </span>
            <span>Memory index: {briefing.pulse.memoryChunks}</span>
          </div>
          <span className='tabular-nums'>Updated {generatedAt ?? 'without timestamp'}</span>
        </footer>
      </div>
    </PageContainer>
  );
}
