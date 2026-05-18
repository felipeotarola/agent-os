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
  const subagents = snapshot.subagents;
  const recentRuns = subagents?.recent ?? [];
  const runningRuns = recentRuns.filter((run) => run.status === 'running');
  const generatedAt = snapshot.generatedAt ? timeLabel(snapshot.generatedAt) : 'no timestamp';
  const liveAt = snapshot.generatedAt ? new Date(snapshot.generatedAt) : new Date();
  const topAgent = briefing.dispatch.byAgent[0];

  const briefingCards = [
    {
      label: 'Actionable tasks',
      value: String(briefing.dispatch.actionableCount),
      detail: topAgent
        ? `${topAgent.agentName} har mest att ta ställning till`
        : 'Ingen agentkö just nu',
      tone: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100',
      icon: '⌘'
    },
    {
      label: 'Bitcoin',
      value: compactNumber(briefing.bitcoin.priceSek, 'SEK'),
      detail: `${percent(briefing.bitcoin.change24h)} senaste 24h`,
      tone:
        briefing.bitcoin.change24h === null
          ? 'border-slate-400/25 bg-slate-400/10 text-slate-100'
          : briefing.bitcoin.change24h >= 0
            ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100'
            : 'border-rose-400/25 bg-rose-400/10 text-rose-100',
      icon: '₿'
    },
    {
      label: 'News radar',
      value: String(briefing.news.items.length),
      detail: briefing.news.ok ? 'frontpage-signaler hämtade live' : 'nyhetskälla saknas',
      tone: 'border-violet-400/25 bg-violet-400/10 text-violet-100',
      icon: '✦'
    },
    {
      label: 'Open tasks',
      value: String(briefing.pulse.openTasks),
      detail: `${briefing.pulse.waitingTasks} waiting · ${briefing.pulse.reviewTasks} review`,
      tone: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
      icon: '↻'
    }
  ];

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
      value: events[0]?.message ?? 'No recent events',
      href: '/dashboard/knowledge'
    }
  ];

  const bitcoinChange = briefing.bitcoin.change24h ?? 2.4;
  const bitcoinPriceDisplay =
    briefing.bitcoin.priceSek !== null
      ? compactNumber(briefing.bitcoin.priceSek, 'SEK')
      : '$104,230';

  const visibleNews =
    briefing.news.items.length > 0
      ? briefing.news.items.slice(0, 4).map((item, index) => ({
          title: item.title,
          source: item.source,
          url: item.url,
          tag: index === 0 ? 'AI' : index === 1 ? 'Bitcoin' : index === 2 ? 'Sverige' : 'Startups'
        }))
      : [
          {
            title: 'OpenAI lanserar GPT-5.1 med bättre resonemang',
            source: 'Mock news',
            url: '#',
            tag: 'AI'
          },
          {
            title: 'Bitcoin tillbaka över $104k – stark instit demand',
            source: 'Mock news',
            url: '#',
            tag: 'Bitcoin'
          },
          {
            title: 'Riksbanken sänker räntan med 0,25 procentenheter',
            source: 'Mock news',
            url: '#',
            tag: 'Sverige'
          },
          {
            title: 'Northvolt säkrar nytt kapital inför nästa fas',
            source: 'Mock news',
            url: '#',
            tag: 'Startups'
          }
        ];

  const personalSignals = [
    {
      title: 'Lysande',
      body: 'Fortsatt positiv trend i affiliate-intresse. Bevaka konvertering nästa 48h.',
      icon: '☼',
      status: 'up'
    },
    {
      title: 'Sladdis',
      body: 'Amazon stats hämtar felaktiga siffror. Åtgärd behövs i parser-logik.',
      icon: '⚡',
      status: 'warn'
    },
    {
      title: 'OpenClaw',
      body: 'Bridge stabil. 3 nya integrations-möjligheter upptäckta.',
      icon: '⟳',
      status: 'up'
    }
  ];

  const latestKajMessage = [
    'Hej Felipe! 👋',
    '',
    briefing.bitcoin.priceSek !== null
      ? `Dagens läge är stabilt. Bitcoin håller styrkan kring ${compactNumber(
          briefing.bitcoin.priceSek,
          'SEK'
        )} och nyhetsflödet är positivt.`
      : 'Dagens läge är stabilt. Bitcoin håller styrkan över $104k och nyhetsflödet är positivt.',
    '',
    'Fokus idag: affiliate-optimering och Sladdis parser-fix.',
    '',
    '– Kaj'
  ].join('\n');

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-5'>
        <section className='relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_15%_18%,rgba(34,211,238,0.2),transparent_34%),radial-gradient(circle_at_78%_10%,rgba(139,92,246,0.28),transparent_32%),radial-gradient(circle_at_88%_88%,rgba(16,185,129,0.12),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99))] p-6 shadow-2xl shadow-cyan-950/30 md:p-7'>
          <div className='absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent' />
          <div className='absolute -right-24 -top-24 size-64 rounded-full border border-white/10 bg-white/5 blur-2xl' />
          <div className='relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-stretch'>
            <div className='flex min-h-[330px] flex-col justify-between gap-8'>
              <Badge variant='outline' className='border-cyan-300/40 bg-cyan-400/10 text-cyan-100'>
                <StatusDot ok={snapshot.dbOnline} /> Cai briefing · live cockpit
              </Badge>

              <div>
                <h1 className='text-4xl font-semibold tracking-tight text-white md:text-5xl'>
                  Welcome Felipe 👋
                </h1>
                <div className='mt-2 text-2xl font-medium text-slate-200 md:text-3xl'>
                  {stockholmDate(liveAt)}
                </div>
                <div className='mt-3 text-sm text-slate-300'>
                  Stockholm time {stockholmTime(liveAt)} · live snapshot
                </div>
              </div>

              <div className='h-px max-w-4xl bg-gradient-to-r from-slate-700 via-slate-600 to-transparent' />

              <p className='max-w-2xl text-sm leading-6 text-slate-300'>
                Din morgon/kvällsbriefing direkt i Overview: agentkö, beslut som behövs,
                marknadspuls och nyhetssignaler — utan en separat briefing-sida.
              </p>

              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                {briefingCards.map((card) => (
                  <div key={card.label} className={`rounded-2xl border p-4 ${card.tone}`}>
                    <div className='flex items-center justify-between gap-3'>
                      <div className='text-xs text-slate-400'>{card.label}</div>
                      <div className='rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm'>
                        {card.icon}
                      </div>
                    </div>
                    <div className='mt-3 text-2xl font-semibold text-white'>{card.value}</div>
                    <div className='mt-1 line-clamp-2 text-xs text-slate-300'>{card.detail}</div>
                  </div>
                ))}
              </div>

              <div className='flex flex-wrap items-center gap-3 text-xs'>
                <span className='text-slate-400'>Focus now</span>
                <Badge
                  variant='outline'
                  className='border-violet-400/30 bg-violet-400/10 px-3 py-1.5 text-violet-100'
                >
                  ⌘ {Number(taskStatus.review ?? 0)} tasks need review
                </Badge>
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

            <div className='flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-lg shadow-violet-950/20 backdrop-blur'>
              <div>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <div className='text-xs uppercase tracking-[0.2em] text-slate-500'>Resume</div>
                    <div className='mt-1 text-sm text-slate-200'>
                      Pick up where the system left off.
                    </div>
                  </div>
                  <Badge variant='outline' className='border-white/10 bg-white/5 text-slate-200'>
                    LIVE
                  </Badge>
                </div>

                <div className='mt-4 space-y-2'>
                  {resumeItems.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className='group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-cyan-300/40 hover:bg-cyan-300/10'
                    >
                      <span className='flex size-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100'>
                        {item.icon}
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span className='block text-[10px] uppercase tracking-wide text-slate-500'>
                          {item.label}
                        </span>
                        <span className='mt-0.5 block truncate text-sm font-medium text-slate-100'>
                          {item.value}
                        </span>
                      </span>
                      <span className='text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-200'>
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className='grid gap-2 rounded-xl border border-slate-700/70 bg-slate-900/70 p-3 text-xs text-slate-300'>
                <div className='flex items-center gap-2'>
                  <StatusDot ok={snapshot.dbOnline} /> db online
                </div>
                <div className='flex items-center gap-2'>
                  <StatusDot ok={Boolean(subagents?.ok)} /> OpenClaw bridge connected
                </div>
                <div className='flex items-center gap-2'>
                  <StatusDot ok /> Memory index healthy
                </div>
                <div className='font-mono text-[11px] text-slate-400'>
                  Last snapshot {generatedAt}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className='relative overflow-hidden rounded-3xl border border-cyan-400/25 bg-[radial-gradient(circle_at_12%_8%,rgba(34,211,238,0.22),transparent_34%),radial-gradient(circle_at_76%_4%,rgba(139,92,246,0.24),transparent_32%),radial-gradient(circle_at_88%_88%,rgba(16,185,129,0.1),transparent_30%),linear-gradient(135deg,rgba(8,19,35,0.98),rgba(2,6,23,0.99))] p-4 shadow-2xl shadow-cyan-950/35 md:p-5'>
          <div className='absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent' />
          <div className='absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent' />
          <div className='absolute -left-24 top-10 size-72 rounded-full bg-cyan-400/10 blur-3xl' />
          <div className='absolute -right-24 top-0 size-80 rounded-full bg-violet-500/10 blur-3xl' />
          <div className='absolute -right-20 bottom-0 size-72 rounded-full bg-emerald-400/10 blur-3xl' />

          <div className='relative z-10 space-y-5'>
            <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_450px_300px] xl:items-stretch'>
              <div className='flex min-h-[210px] flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-inner shadow-black/20 md:p-6'>
                <div>
                  <Badge
                    variant='outline'
                    className='border-cyan-300/40 bg-cyan-400/10 text-cyan-100'
                  >
                    <StatusDot ok={snapshot.dbOnline} /> live cockpit
                  </Badge>

                  <div className='mt-7'>
                    <h1 className='text-4xl font-semibold tracking-tight text-white md:text-5xl'>
                      Welcome Felipe 👋
                    </h1>
                    <div className='mt-2 text-2xl font-medium text-slate-200 md:text-3xl'>
                      {stockholmDate(liveAt)}
                    </div>
                    <div className='mt-3 text-sm text-slate-300'>
                      Stockholm time {stockholmTime(liveAt)} · live snapshot
                    </div>
                  </div>
                </div>

                <div className='mt-6 flex flex-wrap items-center gap-3 text-xs'>
                  <span className='text-slate-400'>Kaj has your daily cockpit ready</span>
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

              <div className='rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-lg shadow-violet-950/20 backdrop-blur'>
                <div className='mb-4 flex items-center justify-between gap-3'>
                  <div>
                    <div className='text-xs uppercase tracking-[0.2em] text-slate-500'>Resume</div>
                    <div className='mt-1 text-sm text-slate-200'>
                      Pick up where the system left off.
                    </div>
                  </div>
                  <Badge variant='outline' className='border-white/10 bg-white/5 text-slate-200'>
                    LIVE
                  </Badge>
                </div>

                <div className='space-y-2'>
                  {resumeItems.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className='group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-cyan-300/40 hover:bg-cyan-300/10'
                    >
                      <span className='flex size-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100'>
                        {item.icon}
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span className='block text-[10px] uppercase tracking-wide text-slate-500'>
                          {item.label}
                        </span>
                        <span className='mt-0.5 block truncate text-sm font-medium text-slate-100'>
                          {item.value}
                        </span>
                      </span>
                      <span className='text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-200'>
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className='rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-lg shadow-cyan-950/20 backdrop-blur'>
                <div className='grid h-full content-center gap-4 text-sm text-slate-300'>
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
                  <div className='h-px bg-white/10' />
                  <div className='font-mono text-[11px] text-slate-400'>
                    Last snapshot {generatedAt}
                  </div>
                </div>
              </div>
            </div>

            <div className='rounded-3xl border border-white/10 bg-slate-950/35 p-4 shadow-inner shadow-black/20'>
              <div className='mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='flex items-start gap-4'>
                  <div className='flex size-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-3xl shadow-lg shadow-cyan-500/10'>
                    🤖
                  </div>
                  <div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h2 className='text-2xl font-semibold tracking-tight text-white'>
                        Kaj Briefing
                      </h2>
                      <span className='text-xl'>✨</span>
                    </div>
                    <p className='mt-1 text-sm text-slate-300'>
                      Nyheter, bitcoin och signaler Kaj håller koll på åt dig.
                    </p>
                  </div>
                </div>

                <div className='flex flex-wrap items-center gap-3 text-xs text-slate-400'>
                  <span>Senast uppdaterad {stockholmTime(liveAt).replace(' CEST', '')}</span>
                  <span className='hidden text-slate-600 md:inline'>•</span>
                  <span>Nästa briefing 20:00</span>
                  <span className='hidden text-slate-600 md:inline'>•</span>
                  <Badge className='border-emerald-400/25 bg-emerald-400/10 text-emerald-200'>
                    LIVE
                  </Badge>
                </div>
              </div>

              <div className='grid gap-4 xl:grid-cols-[230px_minmax(0,1.35fr)_minmax(0,1fr)_290px]'>
                <div className='rounded-2xl border border-white/10 bg-slate-950/45 p-4 shadow-inner shadow-black/20'>
                  <div className='flex items-center gap-2'>
                    <div className='flex size-9 items-center justify-center rounded-xl bg-orange-500 text-lg shadow-lg shadow-orange-500/20'>
                      ₿
                    </div>
                    <div className='font-semibold text-white'>Bitcoin</div>
                  </div>

                  <div className='mt-4 text-4xl font-semibold tracking-tight text-white'>
                    {bitcoinPriceDisplay}
                  </div>

                  <div
                    className={`mt-2 text-sm font-medium ${
                      bitcoinChange >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {percent(bitcoinChange)} senaste 24h
                  </div>

                  <div className='mt-4 flex flex-wrap gap-2'>
                    <Badge
                      variant='outline'
                      className='border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                    >
                      7d +8.1%
                    </Badge>
                    <Badge
                      variant='outline'
                      className='border-cyan-400/25 bg-cyan-400/10 text-cyan-100'
                    >
                      Fear & Greed 72
                    </Badge>
                  </div>

                  <BitcoinSparkline />

                  <p className='mt-3 text-sm leading-5 text-slate-300'>
                    Lugn uppgång. Viktig nivå att bevaka: $105k.
                  </p>
                </div>

                <div className='rounded-2xl border border-white/10 bg-slate-950/45 p-4 shadow-inner shadow-black/20'>
                  <div className='mb-4 flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-3'>
                      <div className='flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg'>
                        ▣
                      </div>
                      <div className='font-semibold text-white'>Dagens nyheter</div>
                    </div>
                    <Button
                      size='icon'
                      variant='outline'
                      className='size-8 border-white/10 bg-white/[0.03]'
                    >
                      +
                    </Button>
                  </div>

                  <div className='divide-y divide-white/10'>
                    {visibleNews.map((item) => (
                      <a
                        key={`${item.title}-${item.tag}`}
                        href={item.url}
                        target={item.url === '#' ? undefined : '_blank'}
                        rel={item.url === '#' ? undefined : 'noreferrer'}
                        className='group flex items-center gap-3 py-3 first:pt-0 last:pb-0'
                      >
                        <div className='min-w-0 flex-1'>
                          <div className='line-clamp-2 text-sm font-medium text-slate-100 transition group-hover:text-cyan-200'>
                            {item.title}
                          </div>
                        </div>
                        <Badge
                          variant='outline'
                          className={`shrink-0 border-white/10 text-[10px] ${
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
                    ))}
                  </div>

                  <Link
                    href='/dashboard/knowledge'
                    className='mt-5 inline-flex text-sm font-medium text-cyan-200 hover:text-cyan-100'
                  >
                    Visa alla nyheter →
                  </Link>
                </div>

                <div className='rounded-2xl border border-white/10 bg-slate-950/45 p-4 shadow-inner shadow-black/20'>
                  <div className='mb-3 flex items-center gap-3'>
                    <div className='flex size-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-lg text-violet-200'>
                      〽
                    </div>
                    <div className='font-semibold text-white'>Personliga signaler</div>
                  </div>

                  <div className='divide-y divide-white/10'>
                    {personalSignals.map((signal) => (
                      <div key={signal.title} className='flex gap-3 py-3 first:pt-0 last:pb-0'>
                        <div className='flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm text-slate-200'>
                          {signal.icon}
                        </div>
                        <div className='min-w-0 flex-1'>
                          <div className='flex items-start justify-between gap-2'>
                            <div className='font-medium text-white'>{signal.title}</div>
                            <span
                              className={
                                signal.status === 'warn' ? 'text-amber-300' : 'text-emerald-300'
                              }
                            >
                              {signal.status === 'warn' ? '△' : '⌁'}
                            </span>
                          </div>
                          <div className='mt-0.5 line-clamp-2 text-xs leading-5 text-slate-400'>
                            {signal.body}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Link
                    href='/dashboard/kanban'
                    className='mt-5 inline-flex text-sm font-medium text-cyan-200 hover:text-cyan-100'
                  >
                    Visa alla signaler →
                  </Link>
                </div>

                <div className='rounded-2xl border border-white/10 bg-slate-950/45 p-4 shadow-inner shadow-black/20'>
                  <div className='mb-4 flex items-center gap-3'>
                    <div className='flex size-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200'>
                      ✉
                    </div>
                    <div className='font-semibold text-white'>Senaste Kaj-meddelande</div>
                  </div>

                  <div className='rounded-2xl border border-white/10 bg-white/[0.04] p-4'>
                    <p className='whitespace-pre-line text-sm leading-6 text-slate-200'>
                      {latestKajMessage}
                    </p>
                    <div className='mt-3 text-right text-xs text-slate-500'>
                      {stockholmTime(liveAt).replace(' CEST', '')}
                    </div>
                  </div>

                  <div className='mt-4 grid grid-cols-3 gap-2'>
                    <Button size='sm' variant='outline' className='border-white/10 bg-white/[0.03]'>
                      👁 Visa
                    </Button>
                    <Button size='sm' variant='outline' className='border-white/10 bg-white/[0.03]'>
                      ✈ Skicka
                    </Button>
                    <Button size='sm' variant='outline' className='border-white/10 bg-white/[0.03]'>
                      📌 Pin
                    </Button>
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
