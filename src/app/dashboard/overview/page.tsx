import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getCaiBriefing } from '@/lib/briefing';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Overview'
};

const statAccents = [
  { icon: '◎', color: 'cyan', classes: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-200' },
  { icon: '▣', color: 'violet', classes: 'border-violet-400/25 bg-violet-500/10 text-violet-200' },
  {
    icon: '●',
    color: 'emerald',
    classes: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
  },
  { icon: '✦', color: 'blue', classes: 'border-blue-400/25 bg-blue-500/10 text-blue-200' },
  { icon: '↻', color: 'amber', classes: 'border-amber-400/25 bg-amber-500/10 text-amber-200' },
  { icon: '⌁', color: 'slate', classes: 'border-slate-400/25 bg-slate-500/10 text-slate-200' }
];

const knowledgeStages = [
  {
    key: 'raw',
    label: 'Raw',
    detail: 'Inbox',
    dot: 'bg-slate-300',
    card: 'border-slate-400/25 bg-slate-400/10 text-slate-200'
  },
  {
    key: 'extracted',
    label: 'Extracted',
    detail: 'Readable',
    dot: 'bg-cyan-300',
    card: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200'
  },
  {
    key: 'wikified',
    label: 'Wiki',
    detail: 'Notes',
    dot: 'bg-violet-300',
    card: 'border-violet-400/25 bg-violet-400/10 text-violet-200'
  },
  {
    key: 'reviewed',
    label: 'Reviewed',
    detail: 'Trusted',
    dot: 'bg-amber-300',
    card: 'border-amber-400/25 bg-amber-400/10 text-amber-200'
  },
  {
    key: 'promoted',
    label: 'Context',
    detail: 'OpenClaw',
    dot: 'bg-emerald-300',
    card: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
  },
  {
    key: 'archived',
    label: 'Archive',
    detail: 'Cold',
    dot: 'bg-zinc-300',
    card: 'border-zinc-400/25 bg-zinc-400/10 text-zinc-200'
  }
] as const;

const taskColors = ['#22d3ee', '#8b5cf6', '#f59e0b', '#10b981', '#64748b', '#ef4444'];

const agentAvatarPalettes = [
  'from-cyan-300 via-blue-400 to-indigo-500 text-slate-950 shadow-cyan-500/20',
  'from-violet-300 via-fuchsia-400 to-pink-500 text-white shadow-fuchsia-500/20',
  'from-emerald-300 via-teal-400 to-cyan-500 text-slate-950 shadow-emerald-500/20',
  'from-amber-300 via-orange-400 to-rose-500 text-slate-950 shadow-orange-500/20',
  'from-lime-300 via-green-400 to-emerald-600 text-slate-950 shadow-green-500/20',
  'from-sky-300 via-cyan-400 to-teal-500 text-slate-950 shadow-sky-500/20'
];

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`size-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />;
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

function BitcoinSparkline() {
  return (
    <svg className='mt-4 h-20 w-full overflow-visible opacity-90' viewBox='0 0 220 80'>
      <defs>
        <linearGradient id='btcArea' x1='0' x2='0' y1='0' y2='1'>
          <stop offset='0%' stopColor='rgb(52 211 153)' stopOpacity='0.38' />
          <stop offset='100%' stopColor='rgb(52 211 153)' stopOpacity='0' />
        </linearGradient>
      </defs>
      <path
        d='M2 66 L24 60 L42 54 L60 64 L76 59 L92 42 L108 35 L126 33 L144 47 L162 35 L182 25 L202 32 L218 20 L218 80 L2 80 Z'
        fill='url(#btcArea)'
      />
      <path
        d='M2 66 L24 60 L42 54 L60 64 L76 59 L92 42 L108 35 L126 33 L144 47 L162 35 L182 25 L202 32 L218 20'
        fill='none'
        stroke='rgb(52 211 153)'
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
      style={{ background: `conic-gradient(${stops || '#334155 0% 100%'})` }}
    >
      <div className='absolute inset-4 flex flex-col items-center justify-center rounded-full bg-background'>
        <div className='text-2xl font-semibold'>{total}</div>
        <div className='text-muted-foreground text-[10px]'>tasks</div>
      </div>
    </div>
  );
}

export default async function OverviewPage() {
  const briefing = await getCaiBriefing();
  const snapshot = briefing.cockpit;
  const knowledge = snapshot.knowledge ?? { raw: 0, queued: 0, wikified: 0, progress: 0 };
  const knowledgeCounts = knowledge as Record<string, number>;
  const taskStatus = snapshot.taskStatus ?? {};
  const taskEntries = Object.entries(taskStatus);
  const events = snapshot.events ?? [];
  const visibleEvents = events.filter((event) => !event.kind.startsWith('cai_brief_cron_'));
  const subagents = snapshot.subagents;
  const recentRuns = subagents?.recent ?? [];
  const runningRuns = recentRuns.filter((run) => run.status === 'running');
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
      value: subagents?.runningCount ? `${subagents.runningCount} active runs` : 'Cai is idle',
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

  const visibleNews =
    briefing.news.items.length > 0
      ? briefing.news.items.slice(0, 4).map((item) => ({
          title: item.title,
          source: item.source,
          url: item.url,
          tag: newsTag(item)
        }))
      : [];

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

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-5'>
        <section className='overview-cockpit relative overflow-hidden rounded-3xl border border-border p-4 text-card-foreground md:p-5'>
          <div className='absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent' />
          <div className='absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent' />
          <div className='absolute -left-24 top-10 size-72 rounded-full bg-primary/10 blur-3xl' />
          <div className='absolute -right-24 top-0 size-80 rounded-full bg-accent/20 blur-3xl' />
          <div className='absolute -right-20 bottom-0 size-72 rounded-full bg-chart-3/10 blur-3xl' />

          <div className='relative z-10 space-y-5'>
            <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_450px_300px] xl:items-stretch'>
              <div className='overview-cockpit-panel flex min-h-[210px] flex-col justify-between rounded-2xl border p-5 shadow-inner md:p-6'>
                <div>
                  <Badge
                    variant='outline'
                    className='border-cyan-300/40 bg-cyan-400/10 text-cyan-100'
                  >
                    <StatusDot ok={snapshot.dbOnline} /> live cockpit
                  </Badge>

                  <div className='mt-7'>
                    <h1 className='text-4xl font-semibold tracking-tight text-foreground md:text-5xl'>
                      Welcome Felipe 👋
                    </h1>
                    <div className='mt-2 text-2xl font-medium text-card-foreground md:text-3xl'>
                      {stockholmDate(liveAt)}
                    </div>
                    <div className='mt-3 text-sm text-muted-foreground'>
                      Stockholm time {stockholmTime(liveAt)} · live snapshot
                    </div>
                  </div>
                </div>

                <div className='mt-6 flex flex-wrap items-center gap-3 text-xs'>
                  <span className='text-muted-foreground'>Cai has your daily cockpit ready</span>
                  <Badge
                    variant='outline'
                    className='border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-emerald-100'
                  >
                    ◎ Memory healthy
                  </Badge>
                  <Badge
                    variant='outline'
                    className='border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-cyan-100'
                  >
                    ↝{' '}
                    {subagents?.runningCount
                      ? `${subagents.runningCount} active runs`
                      : 'No active runs'}
                  </Badge>
                </div>
              </div>

              <div className='overview-cockpit-panel rounded-2xl border p-4 shadow-lg backdrop-blur'>
                <div className='mb-4 flex items-center justify-between gap-3'>
                  <div>
                    <div className='text-muted-foreground text-xs uppercase tracking-[0.2em]'>
                      Resume
                    </div>
                    <div className='mt-1 text-sm text-card-foreground'>
                      Pick up where the system left off.
                    </div>
                  </div>
                  <Badge
                    variant='outline'
                    className='border-border bg-background/40 text-foreground'
                  >
                    LIVE
                  </Badge>
                </div>

                <div className='space-y-2'>
                  {resumeItems.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className='group flex items-center gap-3 rounded-xl border border-border bg-background/45 p-3 transition hover:border-primary/40 hover:bg-primary/10'
                    >
                      <span className='flex size-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100'>
                        {item.icon}
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span className='text-muted-foreground block text-[10px] uppercase tracking-wide'>
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

              <div className='overview-cockpit-panel rounded-2xl border p-4 shadow-lg backdrop-blur'>
                <div className='text-muted-foreground grid h-full content-center gap-4 text-sm'>
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
                  <div className='h-px bg-border' />
                  <div className='font-mono text-[11px] text-muted-foreground'>
                    Last snapshot {generatedAt}
                  </div>
                </div>
              </div>
            </div>

            <div className='overview-cockpit-subpanel rounded-3xl border p-4 shadow-inner'>
              <div className='mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='flex items-start gap-4'>
                  <div className='flex size-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-3xl shadow-lg shadow-cyan-500/10'>
                    🤖
                  </div>
                  <div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h2 className='text-2xl font-semibold tracking-tight text-foreground'>
                        Cai Briefing
                      </h2>
                      <span className='text-xl'>✨</span>
                    </div>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      Nyheter, bitcoin och signaler Cai håller koll på åt dig.
                    </p>
                  </div>
                </div>

                <div className='text-muted-foreground flex flex-wrap items-center gap-3 text-xs'>
                  <span>Senast uppdaterad {stockholmTime(liveAt).replace(' CEST', '')}</span>
                  <span className='hidden text-border md:inline'>•</span>
                  <span>Morgon 08:15 · dispatch 08:30 · kväll 19:45/20:30</span>
                  <span className='hidden text-border md:inline'>•</span>
                  <Badge className='border-emerald-400/25 bg-emerald-400/10 text-emerald-200'>
                    LIVE
                  </Badge>
                </div>
              </div>

              <div className='grid gap-4 xl:grid-cols-[230px_minmax(0,1.35fr)_minmax(0,1fr)_290px]'>
                <div className='overview-cockpit-panel rounded-2xl border p-4 shadow-inner'>
                  <div className='flex items-center gap-2'>
                    <div className='flex size-9 items-center justify-center rounded-xl bg-orange-500 text-lg shadow-lg shadow-orange-500/20'>
                      ₿
                    </div>
                    <div className='font-semibold text-foreground'>Bitcoin</div>
                  </div>

                  <div className='mt-4 text-4xl font-semibold tracking-tight text-foreground'>
                    {bitcoinPriceDisplay}
                  </div>

                  <div
                    className={`mt-2 text-sm font-medium ${
                      bitcoinChange === null
                        ? 'text-muted-foreground'
                        : bitcoinChange >= 0
                          ? 'text-emerald-300'
                          : 'text-rose-300'
                    }`}
                  >
                    {percent(bitcoinChange)} senaste 24h
                  </div>

                  <div className='mt-4 flex flex-wrap gap-2'>
                    <Badge
                      variant='outline'
                      className='border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                    >
                      {briefing.bitcoin.source}
                    </Badge>
                    {briefing.bitcoin.priceUsd !== null && (
                      <Badge
                        variant='outline'
                        className='border-cyan-400/25 bg-cyan-400/10 text-cyan-100'
                      >
                        {compactNumber(briefing.bitcoin.priceUsd, 'USD')}
                      </Badge>
                    )}
                  </div>

                  <BitcoinSparkline />

                  <p className='mt-3 text-sm leading-5 text-muted-foreground'>
                    Livepris via publik crypto-API. Ingen prognos, bara lägesbild.
                  </p>
                </div>

                <div className='overview-cockpit-panel rounded-2xl border p-4 shadow-inner'>
                  <div className='mb-4 flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-3'>
                      <div className='flex size-9 items-center justify-center rounded-xl border border-border bg-background/45 text-lg'>
                        ▣
                      </div>
                      <div className='font-semibold text-foreground'>Dagens nyheter</div>
                    </div>
                    <Badge variant='outline' className='border-border bg-background/45 text-[10px]'>
                      {briefing.news.source}
                    </Badge>
                  </div>

                  <div className='divide-y divide-border'>
                    {visibleNews.length === 0 ? (
                      <div className='text-muted-foreground rounded-xl border border-dashed p-4 text-sm'>
                        RSS-källorna gav inga nyheter just nu.
                      </div>
                    ) : (
                      visibleNews.map((item) => (
                        <a
                          key={`${item.title}-${item.url}`}
                          href={item.url}
                          target='_blank'
                          rel='noreferrer'
                          className='group flex items-center gap-3 py-3 first:pt-0 last:pb-0'
                        >
                          <div className='min-w-0 flex-1'>
                            <div className='line-clamp-2 text-sm font-medium text-card-foreground transition group-hover:text-primary'>
                              {item.title}
                            </div>
                            <div className='text-muted-foreground mt-1 text-[11px]'>
                              {item.source}
                            </div>
                          </div>
                          <Badge
                            variant='outline'
                            className={`shrink-0 border-border text-[10px] ${
                              item.tag === 'AI'
                                ? 'bg-violet-400/15 text-violet-200'
                                : item.tag === 'Bitcoin'
                                  ? 'bg-orange-400/15 text-orange-200'
                                  : item.tag === 'Sverige'
                                    ? 'bg-blue-400/15 text-blue-200'
                                    : 'bg-pink-400/15 text-pink-200'
                            }`}
                          >
                            {item.tag}
                          </Badge>
                        </a>
                      ))
                    )}
                  </div>

                  <Link
                    href='/dashboard/knowledge'
                    className='mt-5 inline-flex text-sm font-medium text-primary hover:text-primary/80'
                  >
                    RSS: SVT + HN + Bitcoin →
                  </Link>
                </div>

                <div className='overview-cockpit-panel rounded-2xl border p-4 shadow-inner'>
                  <div className='mb-3 flex items-center gap-3'>
                    <div className='flex size-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-lg text-violet-200'>
                      〽
                    </div>
                    <div className='font-semibold text-foreground'>Personliga signaler</div>
                  </div>

                  <div className='divide-y divide-border'>
                    {personalSignals.length === 0 ? (
                      <div className='text-muted-foreground rounded-xl border border-dashed p-4 text-sm'>
                        Inga agent- eller eventsignaler i snapshoten just nu.
                      </div>
                    ) : (
                      personalSignals.map((signal) => (
                        <div key={signal.title} className='flex gap-3 py-3 first:pt-0 last:pb-0'>
                          <div className='flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background/45 text-sm text-card-foreground'>
                            {signal.icon}
                          </div>
                          <div className='min-w-0 flex-1'>
                            <div className='flex items-start justify-between gap-2'>
                              <div className='font-medium text-foreground'>{signal.title}</div>
                              <span
                                className={
                                  signal.status === 'warn' ? 'text-amber-300' : 'text-emerald-300'
                                }
                              >
                                {signal.status === 'warn' ? '△' : '⌁'}
                              </span>
                            </div>
                            <div className='text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-5'>
                              {signal.body}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <Link
                    href='/dashboard/kanban'
                    className='mt-5 inline-flex text-sm font-medium text-primary hover:text-primary/80'
                  >
                    Visa alla signaler →
                  </Link>
                </div>

                <div className='overview-cockpit-panel rounded-2xl border p-4 shadow-inner'>
                  <div className='mb-4 flex items-center gap-3'>
                    <div className='flex size-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200'>
                      ✉
                    </div>
                    <div className='font-semibold text-foreground'>Senaste Cai-meddelande</div>
                  </div>

                  <div className='rounded-2xl border border-border bg-background/45 p-4'>
                    <p className='whitespace-pre-line text-sm leading-6 text-card-foreground'>
                      {latestCaiMessage}
                    </p>
                    <div className='mt-3 text-right text-xs text-muted-foreground'>
                      {latestCaiRun
                        ? `${latestCaiRun.label} · ${latestCaiTime} · ${latestCaiRun.deliveryStatus ?? 'unknown'}`
                        : latestCaiTime}
                    </div>
                  </div>

                  <div className='mt-4 text-xs text-muted-foreground'>
                    Källa: OpenClaw cron-runs för morgon-/kvällsbrief och Agent OS-dispatch.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6'>
          {snapshot.stats.map((stat, index) => {
            const accent = statAccents[index % statAccents.length];
            return (
              <Card key={stat.label} className={`overflow-hidden border ${accent.classes}`}>
                <CardContent className='p-4'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='rounded-xl border border-white/10 bg-background/50 px-2.5 py-1.5 text-sm'>
                      {accent.icon}
                    </div>
                    <Badge
                      variant='outline'
                      className='border-white/10 bg-background/40 text-[10px]'
                    >
                      {stat.tone}
                    </Badge>
                  </div>
                  <div className='mt-4 text-muted-foreground text-xs'>{stat.label}</div>
                  <div className='mt-1 text-3xl font-semibold text-white'>{stat.value}</div>
                  <div className='text-muted-foreground mt-2 line-clamp-2 min-h-8 text-xs'>
                    {stat.detail}
                  </div>
                  <div className='mt-2'>
                    <MiniSpark color={accent.color} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className='rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5'>
          <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center'>
            <div className='space-y-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <div className='flex size-9 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200'>
                  ≋
                </div>
                <div className='font-medium text-white'>Live operations</div>
                <Badge variant={subagents?.runningCount ? 'default' : 'outline'}>
                  {subagents?.runningCount ? 'KÖR' : 'IDLE'}
                </Badge>
              </div>
              <p className='text-sm text-slate-300'>
                {subagents?.ok
                  ? runningRuns[0]?.title ||
                    (recentRuns.length > 0
                      ? 'Inga aktiva runs just nu, men OpenClaw har recent task-spår.'
                      : 'Inga aktiva eller recent subagent/background runs just nu.')
                  : `Subagent source unavailable: ${subagents?.error ?? 'bridge did not return a source'}.`}
              </p>
            </div>
            <div className='grid gap-2 sm:grid-cols-3'>
              <div className='rounded-xl border border-slate-700 bg-slate-950/50 p-3'>
                <div className='text-[10px] uppercase tracking-wide text-slate-500'>Source</div>
                <div className='mt-1 truncate font-mono text-xs text-slate-200'>
                  {subagents?.source ?? 'missing'}
                </div>
              </div>
              <div className='rounded-xl border border-slate-700 bg-slate-950/50 p-3'>
                <div className='text-[10px] uppercase tracking-wide text-slate-500'>Heartbeat</div>
                <div className='mt-1 font-mono text-xs text-slate-200'>
                  {timeLabel(subagents?.checkedAt) ?? 'none'}
                </div>
              </div>
              <Button asChild className='h-full min-h-14'>
                <Link href='/dashboard/kanban'>Öppna Tasks →</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
          <Card className='xl:col-span-5'>
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
                  return (
                    <div
                      key={`${task.title}-${task.status}`}
                      className='rounded-xl border bg-background/40 p-3'
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

          <Card className='xl:col-span-4'>
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
                  <div key={agent.name} className='rounded-xl border bg-background/40 p-3'>
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

          <Card className='xl:col-span-3 xl:row-span-2'>
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

          <Card className='xl:col-span-5'>
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
              <div className='rounded-2xl border border-cyan-400/15 bg-slate-950/40 p-4'>
                <div className='relative grid grid-cols-6 gap-2'>
                  <div className='absolute left-[8%] right-[8%] top-4 h-px bg-gradient-to-r from-slate-500/40 via-cyan-300/60 to-emerald-300/50' />
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
                          } ${active ? 'shadow-lg shadow-cyan-500/20 ring-4 ring-white/10' : 'opacity-55'}`}
                        >
                          <span className='size-2 rounded-full bg-slate-950/80' />
                        </div>
                        <div className='min-w-0'>
                          <div className='truncate text-[11px] font-medium text-white'>
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

              <div className='grid grid-cols-2 gap-2 text-center text-sm md:grid-cols-3 xl:grid-cols-6'>
                {knowledgeStages.map((stage) => (
                  <div key={stage.key} className={`rounded-xl border p-3 ${stage.card}`}>
                    <div className='text-2xl font-semibold'>{knowledgeCounts[stage.key] ?? 0}</div>
                    <div className='mt-1 text-[11px]'>{stage.label}</div>
                  </div>
                ))}
              </div>

              <div className='space-y-2'>
                <div className='flex items-center justify-between text-xs'>
                  <span className='text-muted-foreground'>Pipeline maturity</span>
                  <span className='font-mono text-cyan-200'>{knowledge.progress}%</span>
                </div>
                <Progress value={knowledge.progress} className='h-1.5' />
              </div>
            </CardContent>
          </Card>

          <Card className='xl:col-span-4'>
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
                <div className='flex items-center gap-5'>
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

        <section className='flex flex-col gap-2 rounded-2xl border bg-card/70 px-4 py-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between'>
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
