import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BuildActivityResumeItem,
  type BuildActivitySnapshot
} from '@/components/build-activity-indicator';
import { LiveActivitySurface } from '@/components/live-activity-surface';
import { MotionCard } from '@/components/motion-card';
import { Progress } from '@/components/ui/progress';
import { getCalendarSignals, type CalendarSignalSnapshot } from '@/db/external-signals';
import { getVercelSnapshot, type VercelDeployment, type VercelSnapshot } from '@/db/vercel';
import { getActionCenterSnapshot, type ActionCenterItem } from '@/lib/action-center';
import { getCaiBriefing } from '@/lib/briefing';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Overview'
};

const statAccents = [
  { icon: '◎', color: 'cyan', classes: 'border-border bg-muted/40 text-card-foreground' },
  { icon: '▣', color: 'violet', classes: 'border-border bg-muted/40 text-card-foreground' },
  {
    icon: '●',
    color: 'emerald',
    classes: 'border-border bg-muted/40 text-card-foreground'
  },
  { icon: '✦', color: 'blue', classes: 'border-border bg-muted/40 text-card-foreground' },
  { icon: '↻', color: 'amber', classes: 'border-border bg-muted/40 text-card-foreground' },
  { icon: '⌁', color: 'slate', classes: 'border-border bg-muted/40 text-card-foreground' }
];

const knowledgeStages = [
  {
    key: 'raw',
    label: 'Raw',
    detail: 'Inbox',
    dot: 'bg-muted-foreground',
    card: 'border-border bg-muted/40 text-card-foreground'
  },
  {
    key: 'extracted',
    label: 'Extracted',
    detail: 'Readable',
    dot: 'bg-primary',
    card: 'border-border bg-muted/40 text-card-foreground'
  },
  {
    key: 'wikified',
    label: 'Wiki',
    detail: 'Notes',
    dot: 'bg-primary',
    card: 'border-border bg-muted/40 text-card-foreground'
  },
  {
    key: 'reviewed',
    label: 'Reviewed',
    detail: 'Trusted',
    dot: 'bg-primary',
    card: 'border-border bg-muted/40 text-card-foreground'
  },
  {
    key: 'promoted',
    label: 'Context',
    detail: 'OpenClaw',
    dot: 'bg-primary',
    card: 'border-border bg-muted/40 text-card-foreground'
  },
  {
    key: 'archived',
    label: 'Archive',
    detail: 'Cold',
    dot: 'bg-muted-foreground',
    card: 'border-border bg-muted/40 text-card-foreground'
  }
] as const;

const taskColors = [
  'var(--primary)', // theme-guard-ignore-line -- chart/canvas color
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)'
];

const agentAvatarPalettes = [
  'from-primary/70 via-primary to-primary/80 text-primary-foreground shadow-primary/20',
  'from-primary/70 via-primary to-primary/80 text-primary-foreground shadow-primary/20',
  'from-primary/70 via-primary to-primary/80 text-primary-foreground shadow-primary/20',
  'from-primary/70 via-primary to-primary/80 text-primary-foreground shadow-primary/20',
  'from-primary/70 via-primary to-primary/80 text-primary-foreground shadow-primary/20',
  'from-primary/70 via-primary to-primary/80 text-primary-foreground shadow-primary/20'
];

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`size-2 rounded-full ${ok ? 'bg-primary' : 'bg-muted-foreground'}`} />;
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (['online', 'in_progress', 'running', 'active', 'done'].includes(status)) return 'default';
  if (['waiting', 'queued', 'pending', 'review'].includes(status)) return 'outline';
  return 'secondary';
}

function timeLabel(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString('sv-SE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function timeLabelFromMs(value?: number | null) {
  if (!value) return null;
  return timeLabel(new Date(value).toISOString());
}

function stockholmDate(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(value);
}

function stockholmTime(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(value);
}

type WeatherSnapshot = {
  location: string;
  condition: string;
  temperature: string;
  feelsLike: string;
  wind: string;
  humidity: string;
  precipitation: string;
  ok: boolean;
};

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
      condition: '—',
      temperature: '—',
      feelsLike: '—',
      wind: '—',
      humidity: '—',
      precipitation: '—',
      ok: false
    };
  }
}

function compactNumber(value: number | null, currency?: string) {
  if (value === null) return '—';
  return new Intl.NumberFormat('sv-SE', {
    maximumFractionDigits: 0,
    ...(currency ? { style: 'currency', currency } : {})
  }).format(value);
}

function percent(value: number | null) {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function newsTag(item: { title: string; source: string }) {
  const haystack = `${item.title} ${item.source}`.toLowerCase();
  if (haystack.includes('bitcoin') || haystack.includes('btc') || haystack.includes('crypto')) {
    return 'Bitcoin';
  }
  if (haystack.includes('ai') || haystack.includes('openai') || haystack.includes('agent')) {
    return 'AI';
  }
  if (item.source.toLowerCase().includes('svt')) return 'Sverige';
  return 'Tech';
}

function briefPreview(text?: string | null) {
  const value = String(text ?? '').trim();
  if (!value) return 'Ingen skickad Cai-brief hittad ännu.';
  return value.length > 1250 ? `${value.slice(0, 1250).trim()}…` : value;
}

function taskProgress(status: string) {
  if (status === 'done') return 100;
  if (status === 'review') return 82;
  if (status === 'in_progress') return 62;
  if (status === 'waiting') return 34;
  if (status === 'backlog') return 12;
  return 25;
}

function eventTimeLabel(value?: string | null) {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function sameStockholmDay(a: Date, b: Date) {
  return (
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short' }).format(
      a
    ) ===
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short' }).format(b)
  );
}

function stockholmDayKey(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value);
}

function calendarMonthLabel(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    month: 'long',
    year: 'numeric'
  }).format(value);
}

function buildCalendarMonth(value: Date) {
  const year = value.getFullYear();
  const month = value.getMonth();
  const first = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const leadingDays = (first.getDay() + 6) % 7;
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const day = index - leadingDays + 1;
    if (day < 1 || day > daysInMonth) return null;
    return new Date(year, month, day, 12);
  });
}

function CalendarOverviewCard({ calendar }: { calendar: CalendarSignalSnapshot }) {
  const now = new Date();
  const upcoming = calendar.events
    .filter((event) => {
      const start = new Date(event.start).getTime();
      return Number.isFinite(start) && start >= Date.now() - 60 * 60 * 1000;
    })
    .slice(0, 4);
  const todayEvents = calendar.events.filter((event) =>
    sameStockholmDay(new Date(event.start), now)
  );
  const eventsByDay = calendar.events.reduce<Record<string, number>>((days, event) => {
    const date = new Date(event.start);
    if (!Number.isFinite(date.getTime())) return days;
    const key = stockholmDayKey(date);
    days[key] = (days[key] ?? 0) + 1;
    return days;
  }, {});
  const monthDays = buildCalendarMonth(now);
  const todayKey = stockholmDayKey(now);

  return (
    <section className='mobile-feed-card overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm'>
      <div className='space-y-5 p-4 md:p-5'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='text-xs uppercase tracking-[0.22em] text-muted-foreground'>
              Calendar
            </div>
            <h2 className='mt-1 text-2xl font-semibold leading-tight tracking-tight'>
              {calendarMonthLabel(now)}
            </h2>
            <div className='mt-1 text-sm text-muted-foreground'>
              {calendar.connected ? 'Month overview · Stockholm time' : 'Calendar needs attention'}
            </div>
          </div>
          <Badge variant={calendar.connected ? 'default' : 'outline'} className='shrink-0'>
            {calendar.connected ? `${calendar.counts.next24h} next 24h` : 'degraded'}
          </Badge>
        </div>

        <div className='rounded-3xl border bg-background/55 p-3 shadow-inner'>
          <div className='mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
            {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map((day) => (
              <div key={day} className='py-1'>
                {day}
              </div>
            ))}
          </div>

          <div className='grid grid-cols-7 gap-1.5'>
            {monthDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className='min-h-11 rounded-2xl' />;
              }

              const key = stockholmDayKey(date);
              const eventCount = eventsByDay[key] ?? 0;
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  className={`relative flex min-h-11 flex-col items-center justify-center rounded-2xl border text-sm transition ${
                    isToday
                      ? 'border-primary/60 bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                      : eventCount > 0
                        ? 'border-primary/25 bg-primary/10 text-foreground'
                        : 'border-border/70 bg-muted/20 text-muted-foreground'
                  }`}
                >
                  <span className='font-semibold'>{date.getDate()}</span>
                  <span className='mt-1 flex h-1.5 items-center justify-center gap-0.5'>
                    {eventCount > 0
                      ? Array.from({ length: Math.min(eventCount, 3) }, (_, dot) => (
                          <span
                            key={dot}
                            className={`size-1.5 rounded-full ${
                              isToday ? 'bg-primary-foreground' : 'bg-primary'
                            }`}
                          />
                        ))
                      : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-1'>
          <div className='rounded-2xl border bg-background/45 p-4'>
            <div className='text-[10px] uppercase tracking-[0.18em] text-muted-foreground'>
              Today
            </div>
            {todayEvents.length > 0 ? (
              <>
                <div className='mt-2 text-xl font-semibold'>
                  {todayEvents.length} event{todayEvents.length === 1 ? '' : 's'} today
                </div>
                <div className='mt-1 line-clamp-2 text-sm text-muted-foreground'>
                  Next: {todayEvents[0]?.title} · {eventTimeLabel(todayEvents[0]?.start)}
                </div>
              </>
            ) : (
              <div className='mt-2 text-sm text-muted-foreground'>No events left today.</div>
            )}
          </div>

          <div className='rounded-2xl border bg-background/45 p-4'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <div className='font-semibold'>Next up</div>
              <Badge variant='outline' className='border-border bg-muted/30 text-[10px]'>
                {calendar.source}
              </Badge>
            </div>
            {upcoming.length === 0 ? (
              <div className='text-sm text-muted-foreground'>
                {calendar.connected
                  ? 'No calendar events coming up.'
                  : (calendar.alerts[0]?.detail ?? 'Calendar connector is degraded.')}
              </div>
            ) : (
              <div className='space-y-2'>
                {upcoming.slice(0, 3).map((event) => (
                  <a
                    key={event.id}
                    href={event.htmlLink ?? 'https://calendar.google.com/calendar/u/0/r'}
                    target='_blank'
                    rel='noreferrer'
                    className='group flex gap-3 rounded-2xl border bg-muted/20 p-3 transition hover:border-primary/40 hover:bg-primary/10'
                  >
                    <div className='flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border bg-background/60 px-2 py-2 text-center'>
                      <span className='text-lg font-semibold'>{eventTimeLabel(event.start)}</span>
                      <span className='text-[10px] text-muted-foreground'>STHLM</span>
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='line-clamp-1 font-medium group-hover:text-primary'>
                        {event.title}
                      </div>
                      <div className='mt-1 text-xs leading-5 text-muted-foreground'>
                        {event.status} · {event.attendees} attendees
                        {event.hangoutLink ? ' · Meet ready' : ''}
                      </div>
                    </div>
                    <span className='text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary'>
                      →
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const activeVercelBuildStates = new Set(['BUILDING', 'QUEUED', 'INITIALIZING', 'DEPLOYING']);

function isActiveVercelBuild(deployment: VercelDeployment) {
  return activeVercelBuildStates.has(String(deployment.state).toUpperCase());
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

function taskRawData(task: {
  id?: string;
  owner?: string | null;
  project?: string | null;
  priority?: string;
  updatedAt?: string | null;
}) {
  return [
    task.id ? `id:${task.id}` : null,
    task.owner ? `owner:${task.owner}` : null,
    task.project ? `project:${task.project}` : null,
    task.priority ? `priority:${task.priority}` : null,
    task.updatedAt ? `updated:${timeLabel(task.updatedAt)}` : null
  ]
    .filter(Boolean)
    .join(' · ');
}

function actionPriorityTone(priority: ActionCenterItem['priority']) {
  if (priority === 'high') return 'border-primary/40 bg-primary/10 text-primary';
  if (priority === 'medium') return 'border-border bg-muted/50 text-muted-foreground';
  return 'border-border bg-background text-muted-foreground';
}

function MiniSpark({ color = 'cyan' }: { color?: string }) {
  const stroke =
    color === 'violet'
      ? 'stroke-violet-300'
      : color === 'emerald'
        ? 'stroke-emerald-300'
        : color === 'amber'
          ? 'stroke-amber-300'
          : color === 'blue'
            ? 'stroke-blue-300'
            : color === 'slate'
              ? 'stroke-slate-300'
              : 'stroke-cyan-300';

  return (
    <svg className='h-8 w-full opacity-80' viewBox='0 0 120 32' preserveAspectRatio='none'>
      <path
        d='M0 24 C 16 18, 22 26, 34 17 S 54 10, 66 15 S 86 26, 98 12 S 112 9, 120 7'
        className={`${stroke} fill-none`}
        strokeWidth='2'
      />
    </svg>
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
      return `${taskColors[index % taskColors.length]} ${start}% ${cursor}%`;
    })
    .join(', ');

  return (
    <div
      className='relative size-28 shrink-0 rounded-full'
      style={{ background: `conic-gradient(${stops || 'var(--muted) 0% 100%'})` }}
    >
      <div className='absolute inset-4 flex flex-col items-center justify-center rounded-full bg-background'>
        <div className='text-2xl font-semibold'>{total}</div>
        <div className='text-muted-foreground text-[10px]'>tasks</div>
      </div>
    </div>
  );
}

export default async function OverviewPage() {
  const [briefing, actionCenter, calendar, vercel, weather] = await Promise.all([
    getCaiBriefing(),
    getActionCenterSnapshot(),
    getCalendarSignals(),
    getVercelSnapshot(),
    getUppsalaWeather()
  ]);
  const snapshot = briefing.cockpit;
  const knowledge = snapshot.knowledge ?? { raw: 0, queued: 0, wikified: 0, progress: 0 };
  const knowledgeCounts = knowledge as Record<string, number>;
  const taskStatus = snapshot.taskStatus ?? {};
  const taskEntries = Object.entries(taskStatus);
  const events = snapshot.events ?? [];
  const visibleEvents = events.filter((event) => !event.kind.startsWith('cai_brief_cron_'));
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
  const activeRunLabel = activeRunCount
    ? `${activeRunCount} active ${activeRunCount === 1 ? 'run/session' : 'runs/sessions'}`
    : 'No active runs';
  const generatedAt = snapshot.generatedAt ? timeLabel(snapshot.generatedAt) : 'no timestamp';
  const liveAt = snapshot.generatedAt ? new Date(snapshot.generatedAt) : new Date();
  const resumeItems = [
    {
      icon: '↗',
      label: 'Briefing priority',
      value:
        briefing.dispatch.byAgent[0]?.tasks[0]?.title ??
        snapshot.tasks[0]?.title ??
        'No priority task selected',
      href: '/dashboard/kanban'
    },
    {
      icon: '⚛',
      label: 'Agent check-in',
      value: activeRunCount ? activeRunLabel : 'Cai is idle',
      href: '/dashboard/agents'
    },
    {
      icon: '✦',
      label: 'Latest change',
      value: visibleEvents[0]?.message ?? 'No recent events',
      href: '/dashboard/knowledge'
    }
  ];

  const bitcoinChange = briefing.bitcoin.change24h;
  const bitcoinPriceDisplay =
    briefing.bitcoin.priceSek !== null
      ? compactNumber(briefing.bitcoin.priceSek, 'SEK')
      : briefing.bitcoin.priceUsd !== null
        ? compactNumber(briefing.bitcoin.priceUsd, 'USD')
        : 'Ingen BTC-data';
  const briefingNews = briefing.news.items.map((item) => ({
    title: item.title,
    source: item.source,
    url: item.url,
    imageUrl: item.imageUrl,
    tag: newsTag(item)
  }));
  const visibleNews = briefingNews.filter((item) => item.tag !== 'Bitcoin').slice(0, 4);

  const personalSignals = [
    ...briefing.dispatch.byAgent.slice(0, 3).map((group) => ({
      title: group.agentName,
      body: `${group.count} agentägda tasks väntar${group.highPriorityCount ? ` · ${group.highPriorityCount} high priority` : ''}. Först: ${group.tasks[0]?.title ?? 'öppna task-kön'}.`,
      icon: group.emoji || '⚛',
      status: group.highPriorityCount ? 'warn' : 'up'
    })),
    ...visibleEvents.slice(0, 2).map((event) => ({
      title: event.kind,
      body: event.message,
      icon: '⟳',
      status: 'up'
    }))
  ].slice(0, 4);

  const latestCaiRun = briefing.latestMessage.latest;
  const latestCaiMessage = briefPreview(latestCaiRun?.summary);
  const latestCaiTime = timeLabelFromMs(latestCaiRun?.runAtMs) ?? 'ingen cron-run hittad';
  const nextAction =
    actionCenter.items.find((item) => item.priority === 'high') ?? actionCenter.items[0];

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4 md:gap-5'>
        <section className='space-y-4'>
          <section className='mobile-feed-section rounded-3xl border bg-card p-5 text-card-foreground shadow-sm md:p-6'>
            <div className='flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between'>
              <div className='min-w-0 space-y-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge className='rounded-full'>Today Command</Badge>
                  <Badge
                    variant='outline'
                    className='border-border bg-muted/40 text-card-foreground'
                  >
                    <StatusDot ok={snapshot.dbOnline} /> live cockpit
                  </Badge>
                  <Badge
                    variant='outline'
                    className='border-border bg-muted/40 text-card-foreground'
                  >
                    {actionCenter.counts.high} high · {actionCenter.counts.total} queued
                  </Badge>
                  {buildActivity.activeCount ? (
                    <Badge variant='default'>▲ {buildActivity.activeCount} build live</Badge>
                  ) : null}
                </div>

                <div>
                  <h1 className='text-[1.85rem] font-semibold tracking-tight text-foreground min-[390px]:text-3xl md:text-5xl'>
                    Good evening Felipe
                  </h1>
                  <p className='mt-2 text-sm text-muted-foreground md:text-base'>
                    {stockholmDate(liveAt)} · Uppsala time {stockholmTime(liveAt)}
                  </p>
                </div>

                <div className='rounded-2xl border bg-background/45 p-4'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge variant='outline' className='border-border bg-muted/40'>
                      Resume where we left off
                    </Badge>
                    {nextAction ? (
                      <Badge variant='outline' className={actionPriorityTone(nextAction.priority)}>
                        {nextAction.priority}
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className='mt-3 line-clamp-2 text-xl font-semibold tracking-tight text-foreground md:text-2xl'>
                    {nextAction?.title ?? snapshot.tasks[0]?.title ?? 'Decision queue is clear'}
                  </h2>
                  <p className='mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground'>
                    {nextAction?.detail ??
                      snapshot.tasks[0]?.detail ??
                      'No high-signal cockpit item needs attention right now.'}
                  </p>
                  <div className='mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap'>
                    <Button asChild className='rounded-full'>
                      <Link href='/dashboard/action-center'>Open Action Center →</Link>
                    </Button>
                    {nextAction ? (
                      <Button asChild variant='outline' className='rounded-full'>
                        <Link href={nextAction.href}>{nextAction.primaryLabel}</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className='shrink-0 space-y-3 lg:w-[380px]'>
                <div className='grid grid-cols-3 gap-2'>
                  <div className='rounded-2xl border bg-muted/40 p-3 text-center'>
                    <div className='text-lg font-semibold'>{actionCenter.counts.total}</div>
                    <div className='text-muted-foreground text-[10px] uppercase tracking-wide'>
                      Queued
                    </div>
                  </div>
                  <div className='rounded-2xl border bg-muted/40 p-3 text-center'>
                    <div className='text-lg font-semibold'>{activeRunCount}</div>
                    <div className='text-muted-foreground text-[10px] uppercase tracking-wide'>
                      Runs
                    </div>
                  </div>
                  <div className='rounded-2xl border bg-muted/40 p-3 text-center'>
                    <div className='text-lg font-semibold'>{buildActivity.activeCount}</div>
                    <div className='text-muted-foreground text-[10px] uppercase tracking-wide'>
                      Builds
                    </div>
                  </div>
                </div>

                <div className='rounded-2xl border bg-background/45 p-3'>
                  <div className='mb-3 flex items-center justify-between gap-3'>
                    <div>
                      <div className='text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground'>
                        Live shortcuts
                      </div>
                    </div>
                    <Badge
                      variant='outline'
                      className='border-border bg-muted/40 text-[10px] text-foreground'
                    >
                      LIVE
                    </Badge>
                  </div>

                  <div className='space-y-2'>
                    <BuildActivityResumeItem initial={buildActivity} />
                    {resumeItems.map((item) => (
                      <Link
                        key={item.label}
                        href={item.href}
                        className='mobile-feed-row group flex items-center gap-3 rounded-xl border border-border bg-muted/35 p-3 transition hover:border-primary/40 hover:bg-primary/10'
                      >
                        <span className='flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background/45 text-card-foreground'>
                          {item.icon}
                        </span>
                        <span className='min-w-0 flex-1'>
                          <span className='block text-[10px] uppercase tracking-wide text-muted-foreground'>
                            {item.label}
                          </span>
                          <span className='mt-0.5 block truncate text-sm font-medium text-card-foreground'>
                            {item.value}
                          </span>
                        </span>
                        <span className='text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary'>
                          →
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className='columns-1 gap-4 xl:columns-2 2xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid'>
            <MotionCard className='mobile-feed-card rounded-3xl border bg-card py-6 text-card-foreground shadow-sm max-sm:py-4'>
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <CardTitle>Focus Queue</CardTitle>
                    <CardDescription>Max fem saker. Det här är nästa arbetsyta.</CardDescription>
                  </div>
                  <Link href='/dashboard/kanban' className='text-primary text-xs hover:underline'>
                    Tasks →
                  </Link>
                </div>
              </CardHeader>
              <CardContent className='space-y-2'>
                {snapshot.tasks.slice(0, 5).length === 0 ? (
                  <div className='text-muted-foreground rounded-xl border border-dashed p-5 text-sm'>
                    Inga prioriterade tasks hittades.
                  </div>
                ) : (
                  snapshot.tasks.slice(0, 5).map((task, index) => (
                    <Link
                      key={`${task.title}-${task.status}-${index}`}
                      href='/dashboard/kanban'
                      className='mobile-feed-row group flex gap-3 rounded-xl border bg-background/40 p-3 transition hover:border-primary/40 hover:bg-primary/10'
                    >
                      <div className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-xs font-semibold'>
                        {index + 1}
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='flex flex-wrap items-start justify-between gap-2'>
                          <div className='line-clamp-1 font-medium'>{task.title}</div>
                          <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
                        </div>
                        <div className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>
                          {task.detail}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </MotionCard>

            <MotionCard className='mobile-feed-card rounded-3xl border bg-card py-6 text-card-foreground shadow-sm max-sm:py-4'>
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <CardTitle>Cai Briefing</CardTitle>
                    <CardDescription>
                      Digest först. Rå briefing/detailjer under ytan.
                    </CardDescription>
                  </div>
                  <Badge
                    variant='outline'
                    className='border-border bg-muted/40 text-card-foreground'
                  >
                    {latestCaiRun?.label ?? 'brief'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='rounded-2xl border bg-background/45 p-4'>
                  <div className='mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground'>
                    Dagen kort
                  </div>
                  <p className='line-clamp-8 whitespace-pre-line text-sm leading-6 text-card-foreground/90'>
                    {latestCaiMessage}
                  </p>
                  <div className='mt-3 border-t pt-3 text-[11px] text-muted-foreground'>
                    {latestCaiRun
                      ? `${latestCaiTime} · ${latestCaiRun.deliveryStatus ?? 'unknown'}`
                      : latestCaiTime}
                  </div>
                </div>

                <div className='grid grid-cols-1 gap-2 md:grid-cols-3'>
                  <div className='rounded-2xl border bg-muted/35 p-3'>
                    <div className='text-muted-foreground text-[10px] uppercase tracking-wide'>
                      Bitcoin
                    </div>
                    <div className='mt-1 text-lg font-semibold'>{bitcoinPriceDisplay}</div>
                    <div
                      className={
                        bitcoinChange === null
                          ? 'text-xs text-muted-foreground'
                          : bitcoinChange >= 0
                            ? 'text-xs text-primary'
                            : 'text-xs text-destructive'
                      }
                    >
                      {percent(bitcoinChange)} 24h
                    </div>
                  </div>
                  <div className='rounded-2xl border bg-muted/35 p-3'>
                    <div className='text-muted-foreground text-[10px] uppercase tracking-wide'>
                      News
                    </div>
                    <div className='mt-1 text-lg font-semibold'>{visibleNews.length}</div>
                    <div className='text-xs text-muted-foreground'>top headlines</div>
                  </div>
                  <div className='rounded-2xl border bg-muted/35 p-3'>
                    <div className='text-muted-foreground text-[10px] uppercase tracking-wide'>
                      Signals
                    </div>
                    <div className='mt-1 text-lg font-semibold'>{personalSignals.length}</div>
                    <div className='text-xs text-muted-foreground'>personal/system</div>
                  </div>
                </div>
              </CardContent>
            </MotionCard>

            <CalendarOverviewCard calendar={calendar} />

            <MotionCard className='mobile-feed-card rounded-3xl border bg-card p-4 text-card-foreground shadow-sm'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <div>
                  <div className='font-semibold text-foreground'>Uppsala weather</div>
                  <div className='text-xs text-muted-foreground'>Live from wttr.in</div>
                </div>
                <Badge variant='outline' className='border-border bg-muted/40'>
                  {weather.ok ? 'live' : 'degraded'}
                </Badge>
              </div>
              <div className='rounded-2xl border bg-background/45 p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <div className='text-muted-foreground text-xs'>{weather.location}</div>
                    <div className='mt-1 text-3xl font-semibold'>{weather.temperature}</div>
                  </div>
                  <div className='text-3xl'>{weather.condition}</div>
                </div>
                <div className='mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
                  <div className='rounded-xl border bg-muted/30 p-2'>Feels {weather.feelsLike}</div>
                  <div className='rounded-xl border bg-muted/30 p-2'>Wind {weather.wind}</div>
                  <div className='rounded-xl border bg-muted/30 p-2'>
                    Humidity {weather.humidity}
                  </div>
                  <div className='rounded-xl border bg-muted/30 p-2'>
                    Rain {weather.precipitation}
                  </div>
                </div>
              </div>
            </MotionCard>

            <MotionCard className='mobile-feed-card rounded-3xl border bg-card p-4 text-card-foreground shadow-sm'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <div>
                  <div className='font-semibold text-foreground'>System Health</div>
                  <div className='text-xs text-muted-foreground'>
                    Trust signals, not debug spam.
                  </div>
                </div>
                <Badge variant='outline' className='border-border bg-muted/40'>
                  ops
                </Badge>
              </div>
              <div className='text-muted-foreground grid gap-3 text-sm'>
                <div className='flex items-center gap-3'>
                  <StatusDot ok={snapshot.dbOnline} />
                  <span>db online</span>
                </div>
                <div className='flex items-center gap-3'>
                  <StatusDot ok={Boolean(subagents?.ok)} />
                  <span>OpenClaw bridge connected</span>
                </div>
                <div className='flex items-center gap-3'>
                  <StatusDot ok />
                  <span>Memory index healthy</span>
                </div>
                <div className='flex items-center gap-3'>
                  <StatusDot ok={buildActivity.activeCount > 0} />
                  <span>
                    {buildActivity.activeCount
                      ? `${buildActivity.activeCount} build running`
                      : 'Build idle'}
                  </span>
                </div>
                <div className='h-px bg-border' />
                <div className='font-mono text-[11px] text-muted-foreground'>
                  Last snapshot {generatedAt}
                </div>
              </div>
            </MotionCard>
          </section>
        </section>

        <section className='grid grid-cols-2 gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3 2xl:grid-cols-6'>
          {snapshot.stats.map((stat, index) => {
            const accent = statAccents[index % statAccents.length];
            return (
              <Card
                key={stat.label}
                className={`mobile-compact-stat overflow-hidden border ${accent.classes}`}
              >
                <CardContent className='p-3 md:p-4'>
                  <div className='flex items-start justify-between gap-2 md:gap-3'>
                    <div className='rounded-xl border border-white/10 bg-background/50 px-2 py-1 text-xs md:px-2.5 md:py-1.5 md:text-sm'>
                      {accent.icon}
                    </div>
                    <Badge
                      variant='outline'
                      className='border-white/10 bg-background/40 text-[10px]'
                    >
                      {stat.tone}
                    </Badge>
                  </div>
                  <div className='mt-3 text-muted-foreground text-[11px] md:mt-4 md:text-xs'>
                    {stat.label}
                  </div>
                  <div className='mt-1 text-2xl font-semibold text-card-foreground md:text-3xl'>
                    {stat.value}
                  </div>
                  <div className='text-muted-foreground mt-1 line-clamp-2 min-h-7 text-[11px] md:mt-2 md:min-h-8 md:text-xs'>
                    {stat.detail}
                  </div>
                  <div className='mt-1.5 md:mt-2'>
                    <MiniSpark color={accent.color} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <LiveActivitySurface
          subagents={subagents}
          href='/dashboard/kanban'
          className='rounded-3xl'
        />

        <section className='grid grid-cols-1 gap-4 2xl:grid-cols-12'>
          <Card className='mobile-feed-card 2xl:col-span-5'>
            <CardHeader className='pb-3'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Prioriterade tasks</CardTitle>
                  <CardDescription>Det här är kön att titta på först.</CardDescription>
                </div>
                <Link href='/dashboard/kanban' className='text-primary text-xs hover:underline'>
                  Visa alla →
                </Link>
              </div>
            </CardHeader>
            <CardContent className='space-y-2'>
              {snapshot.tasks.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-5 text-sm'>
                  Inga prioriterade tasks hittades.
                </div>
              ) : (
                snapshot.tasks.slice(0, 5).map((task, index) => {
                  const progress = taskProgress(task.status);
                  const rawData = taskRawData(task);
                  return (
                    <div
                      key={`${task.title}-${task.status}`}
                      className='mobile-feed-row rounded-xl border bg-background/40 p-3'
                    >
                      <div className='flex gap-3'>
                        <div
                          className='mt-1 size-3 rounded-sm'
                          style={{ backgroundColor: taskColors[index % taskColors.length] }}
                        />
                        <div className='min-w-0 flex-1'>
                          <div className='flex flex-wrap items-start justify-between gap-2'>
                            <div className='min-w-0 font-medium'>{task.title}</div>
                            <div className='flex shrink-0 gap-1'>
                              <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
                              {task.priority && <Badge variant='secondary'>{task.priority}</Badge>}
                            </div>
                          </div>
                          <div className='text-muted-foreground mt-1 line-clamp-1 text-xs'>
                            {task.detail}
                          </div>
                          {rawData ? (
                            <div className='mt-2 rounded-lg border border-border bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground max-md:border-0 max-md:bg-transparent max-md:px-0'>
                              rådata · {rawData}
                            </div>
                          ) : null}
                          <div className='mt-3 flex items-center gap-2'>
                            <Progress value={progress} className='h-1.5' />
                            <span className='text-muted-foreground w-8 text-right text-[10px]'>
                              {progress}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className='mobile-feed-card 2xl:col-span-4'>
            <CardHeader className='pb-3'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Agenter</CardTitle>
                  <CardDescription>Roller och driftstatus.</CardDescription>
                </div>
                <Link href='/dashboard/agents' className='text-primary text-xs hover:underline'>
                  Hantera →
                </Link>
              </div>
            </CardHeader>
            <CardContent className='space-y-2'>
              {snapshot.agents.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-5 text-sm'>
                  Inga agenter hittades i snapshoten.
                </div>
              ) : (
                snapshot.agents.slice(0, 5).map((agent, index) => (
                  <div
                    key={agent.name}
                    className='mobile-feed-row rounded-xl border bg-background/40 p-3'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div className='flex min-w-0 gap-3'>
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold shadow-lg ${
                            agentAvatarPalettes[index % agentAvatarPalettes.length]
                          }`}
                        >
                          {agent.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className='min-w-0'>
                          <div className='font-medium'>{agent.name}</div>
                          <div className='text-sm'>{agent.role}</div>
                          <div className='text-muted-foreground mt-1 line-clamp-1 text-xs'>
                            {agent.detail}
                          </div>
                        </div>
                      </div>
                      <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className='mobile-feed-card 2xl:col-span-3 2xl:row-span-2'>
            <CardHeader className='pb-3'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Recent events</CardTitle>
                  <CardDescription>Senaste audit-spår.</CardDescription>
                </div>
                <span className='text-primary text-xs'>Live</span>
              </div>
            </CardHeader>
            <CardContent className='space-y-0'>
              {events.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-5 text-sm'>
                  Inga events.
                </div>
              ) : (
                events.slice(0, 9).map((event, index) => (
                  <div
                    key={`${event.createdAt}-${event.kind}`}
                    className='border-b py-3 last:border-b-0'
                  >
                    <div className='flex gap-3'>
                      <div
                        className='mt-1 size-2 rounded-full'
                        style={{ backgroundColor: taskColors[index % taskColors.length] }}
                      />
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-start justify-between gap-2'>
                          <div className='truncate text-sm font-medium'>{event.kind}</div>
                          <span className='text-muted-foreground shrink-0 text-[10px]'>
                            {timeLabel(event.createdAt)}
                          </span>
                        </div>
                        <div className='text-muted-foreground mt-1 line-clamp-2 text-xs'>
                          {event.message}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className='mobile-feed-card 2xl:col-span-5'>
            <CardHeader className='pb-3'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Knowledge pipeline</CardTitle>
                  <CardDescription>Raw input → reviewed context.</CardDescription>
                </div>
                <Link href='/dashboard/knowledge' className='text-primary text-xs hover:underline'>
                  Öppna Knowledge inbox →
                </Link>
              </div>
            </CardHeader>
            <CardContent className='space-y-5'>
              <div className='mobile-chart-shell rounded-2xl border border-border bg-muted/40 p-4'>
                <div className='relative grid grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-2'>
                  <div className='absolute left-[8%] right-[8%] top-4 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent' />
                  {knowledgeStages.map((stage) => {
                    const count = knowledgeCounts[stage.key] ?? 0;
                    const active = count > 0;
                    return (
                      <div
                        key={stage.key}
                        className='relative flex flex-col items-center gap-2 text-center'
                      >
                        <div
                          className={`z-10 flex size-8 items-center justify-center rounded-full border border-white/15 ${
                            stage.dot
                          } ${active ? 'shadow-lg shadow-primary/20 ring-4 ring-primary/10' : 'opacity-55'}`}
                        >
                          <span className='size-2 rounded-full bg-background' />
                        </div>
                        <div className='min-w-0'>
                          <div className='truncate text-[11px] font-medium text-card-foreground'>
                            {stage.label}
                          </div>
                          <div className='text-muted-foreground truncate text-[10px]'>
                            {stage.detail}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className='grid grid-cols-3 gap-2 text-center text-sm md:grid-cols-3 2xl:grid-cols-6'>
                {knowledgeStages.map((stage) => (
                  <div
                    key={stage.key}
                    className={`mobile-compact-stat rounded-xl border p-2 md:p-3 ${stage.card}`}
                  >
                    <div className='text-xl font-semibold md:text-2xl'>
                      {knowledgeCounts[stage.key] ?? 0}
                    </div>
                    <div className='mt-1 text-[11px]'>{stage.label}</div>
                  </div>
                ))}
              </div>

              <div className='space-y-2'>
                <div className='flex items-center justify-between text-xs'>
                  <span className='text-muted-foreground'>Pipeline maturity</span>
                  <span className='font-mono text-primary'>{knowledge.progress}%</span>
                </div>
                <Progress value={knowledge.progress} className='h-1.5' />
              </div>
            </CardContent>
          </Card>

          <Card className='mobile-feed-card 2xl:col-span-4'>
            <CardHeader className='pb-3'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Task flow</CardTitle>
                  <CardDescription>Statusfördelning från boarden.</CardDescription>
                </div>
                <Link href='/dashboard/kanban' className='text-primary text-xs hover:underline'>
                  Öppna Tasks →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {taskEntries.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  Ingen task-statusdata.
                </div>
              ) : (
                <div className='flex flex-col gap-5 sm:flex-row sm:items-center'>
                  <Donut entries={taskEntries} />
                  <div className='min-w-0 flex-1 space-y-2'>
                    {taskEntries.map(([status, count], index) => (
                      <div key={status} className='flex items-center justify-between gap-2 text-sm'>
                        <div className='flex min-w-0 items-center gap-2'>
                          <span
                            className='size-2 rounded-full'
                            style={{ backgroundColor: taskColors[index % taskColors.length] }}
                          />
                          <span className='truncate'>{status}</span>
                        </div>
                        <Badge variant='secondary'>{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className='mobile-status-strip mobile-feed-card flex flex-col gap-2 rounded-2xl border bg-card/70 px-4 py-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between'>
          <div className='flex flex-wrap items-center gap-3'>
            <span className='flex items-center gap-1.5'>
              <StatusDot ok={snapshot.dbOnline} /> db
            </span>
            <span className='flex items-center gap-1.5'>
              <StatusDot ok={Boolean(subagents?.ok)} /> bridge
            </span>
            <span>
              memory index:{' '}
              {snapshot.stats.find((stat) => stat.label.toLowerCase().includes('memory'))?.value ??
                '—'}
            </span>
          </div>
          <div>Agent OS cockpit · updated {generatedAt}</div>
        </section>
      </div>
    </PageContainer>
  );
}
