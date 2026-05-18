import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCaiBriefing } from '@/lib/briefing';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Cai Briefing'
};

function stockholmDate(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(value);
}

function stockholmTime(value: string | Date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(value));
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

function changeTone(value: number | null) {
  if (value === null) return 'text-slate-300 border-slate-400/20 bg-slate-400/10';
  if (value >= 0) return 'text-emerald-200 border-emerald-400/30 bg-emerald-400/10';
  return 'text-rose-200 border-rose-400/30 bg-rose-400/10';
}

function shortUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'external';
  }
}

export default async function BriefingPage() {
  const briefing = await getCaiBriefing();
  const now = new Date(briefing.generatedAt);
  const topAgent = briefing.dispatch.byAgent[0];
  const topTasks = briefing.dispatch.byAgent.flatMap((group) =>
    group.tasks
      .slice(0, 2)
      .map((task) => ({ ...task, agentName: group.agentName, emoji: group.emoji }))
  );

  const cards = [
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
      tone: changeTone(briefing.bitcoin.change24h),
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

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-5'>
        <section className='relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_16%_16%,rgba(34,211,238,0.22),transparent_32%),radial-gradient(circle_at_78%_8%,rgba(139,92,246,0.28),transparent_34%),radial-gradient(circle_at_92%_84%,rgba(245,158,11,0.14),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99))] p-6 shadow-2xl shadow-cyan-950/30 md:p-8'>
          <div className='absolute -right-28 -top-28 size-72 rounded-full border border-white/10 bg-white/5 blur-2xl' />
          <div className='absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent' />

          <div className='relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch'>
            <div className='flex min-h-[330px] flex-col justify-between gap-8'>
              <div className='space-y-5'>
                <Badge
                  variant='outline'
                  className='border-cyan-300/40 bg-cyan-400/10 text-cyan-100'
                >
                  <span className='size-2 rounded-full bg-emerald-400' /> Cai briefing · live
                </Badge>
                <div>
                  <h1 className='text-4xl font-semibold tracking-tight text-white md:text-5xl'>
                    God eftermiddag, Felipe.
                  </h1>
                  <div className='mt-3 text-2xl font-medium text-slate-200 md:text-3xl'>
                    {stockholmDate(now)}
                  </div>
                  <div className='mt-3 text-sm text-slate-300'>
                    Stockholm time {stockholmTime(now)} · briefing snapshot
                  </div>
                </div>
                <p className='max-w-2xl text-sm leading-6 text-slate-300'>
                  Det här är Cai-versionen av morgon/kvällsbriefingen: vad som behöver beslut, vad
                  agenterna kan ta vidare, marknadspuls och några nyhetssignaler.
                </p>
              </div>

              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                {cards.map((card) => (
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
            </div>

            <div className='flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-lg shadow-violet-950/20 backdrop-blur'>
              <div>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <div className='text-xs uppercase tracking-[0.2em] text-slate-500'>Today</div>
                    <div className='mt-1 text-sm text-slate-200'>
                      Vad jag skulle ta tag i först.
                    </div>
                  </div>
                  <Badge variant='outline' className='border-white/10 bg-white/5 text-slate-200'>
                    PRIORITY
                  </Badge>
                </div>

                <div className='mt-4 space-y-2'>
                  {topTasks.length === 0 ? (
                    <div className='rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100'>
                      Ingen agentkopplad task behöver beslut just nu.
                    </div>
                  ) : (
                    topTasks.slice(0, 4).map((task) => (
                      <Link
                        key={task.id}
                        href='/dashboard/kanban'
                        className='group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-cyan-300/40 hover:bg-cyan-300/10'
                      >
                        <span className='flex size-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100'>
                          {task.emoji || '⚛'}
                        </span>
                        <span className='min-w-0 flex-1'>
                          <span className='block text-[10px] uppercase tracking-wide text-slate-500'>
                            {task.agentName} · {task.priority}/{task.status}
                          </span>
                          <span className='mt-0.5 block truncate text-sm font-medium text-slate-100'>
                            {task.title}
                          </span>
                        </span>
                        <span className='text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-200'>
                          →
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div className='grid gap-2 rounded-xl border border-slate-700/70 bg-slate-900/70 p-3 text-xs text-slate-300'>
                <div className='flex items-center justify-between gap-3'>
                  <span>Dispatch source</span>
                  <span className='font-mono text-slate-400'>
                    {briefing.dispatch.actionableCount} tasks
                  </span>
                </div>
                <div className='flex items-center justify-between gap-3'>
                  <span>BTC source</span>
                  <span className='font-mono text-slate-400'>{briefing.bitcoin.source}</span>
                </div>
                <div className='flex items-center justify-between gap-3'>
                  <span>News source</span>
                  <span className='font-mono text-slate-400'>{briefing.news.source}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className='grid gap-4 xl:grid-cols-12'>
          <Card className='xl:col-span-5'>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Cai dispatch</CardTitle>
                  <CardDescription>
                    Det som morgon/kvälls-cronjobbet normalt lyfter.
                  </CardDescription>
                </div>
                <Button asChild size='sm' variant='outline'>
                  <Link href='/dashboard/kanban'>Öppna tasks</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              {briefing.dispatch.byAgent.length === 0 ? (
                <div className='rounded-xl border border-dashed p-5 text-sm text-muted-foreground'>
                  Inga agentkopplade tasks i backlog/waiting/review just nu.
                </div>
              ) : (
                briefing.dispatch.byAgent.map((group) => (
                  <div key={group.agentId} className='rounded-2xl border bg-background/40 p-4'>
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <div className='font-medium'>
                          {group.emoji && <span className='mr-2'>{group.emoji}</span>}
                          {group.agentName}
                        </div>
                        <div className='text-muted-foreground mt-1 text-xs'>
                          {group.count} tasks · {group.highPriorityCount} high priority
                        </div>
                      </div>
                      <Badge variant={group.highPriorityCount ? 'default' : 'outline'}>
                        {group.agentId}
                      </Badge>
                    </div>
                    <div className='mt-3 space-y-2'>
                      {group.tasks.slice(0, 3).map((task) => (
                        <div key={task.id} className='rounded-xl border bg-background/50 p-3'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <Badge variant='outline'>{task.priority}</Badge>
                            <Badge variant='secondary'>{task.status}</Badge>
                            {task.projectName && (
                              <span className='text-xs text-muted-foreground'>
                                {task.projectName}
                              </span>
                            )}
                          </div>
                          <div className='mt-2 text-sm font-medium'>{task.title}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className='xl:col-span-4'>
            <CardHeader>
              <CardTitle>News radar</CardTitle>
              <CardDescription>Publika nyhetssignaler utan API-nyckel än.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {briefing.news.items.length === 0 ? (
                <div className='rounded-xl border border-dashed p-5 text-sm text-muted-foreground'>
                  Ingen nyhetskälla svarade just nu.
                </div>
              ) : (
                briefing.news.items.map((item) => (
                  <a
                    key={`${item.title}-${item.url}`}
                    href={item.url}
                    target='_blank'
                    rel='noreferrer'
                    className='block rounded-xl border bg-background/40 p-3 transition hover:border-primary/40 hover:bg-primary/5'
                  >
                    <div className='line-clamp-2 text-sm font-medium'>{item.title}</div>
                    <div className='mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground'>
                      <span>{item.source}</span>
                      <span>{shortUrl(item.url)}</span>
                    </div>
                  </a>
                ))
              )}
            </CardContent>
          </Card>

          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Market pulse</CardTitle>
              <CardDescription>
                Startar med Bitcoin. Fler datapunkter kan läggas på.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5'>
                <div className='text-sm text-amber-100'>Bitcoin / SEK</div>
                <div className='mt-2 text-3xl font-semibold text-white'>
                  {compactNumber(briefing.bitcoin.priceSek, 'SEK')}
                </div>
                <Badge
                  variant='outline'
                  className={`mt-3 ${changeTone(briefing.bitcoin.change24h)}`}
                >
                  {percent(briefing.bitcoin.change24h)} 24h
                </Badge>
              </div>

              <div className='rounded-2xl border bg-background/40 p-4'>
                <div className='text-muted-foreground text-xs'>Latest cockpit event</div>
                <div className='mt-2 line-clamp-3 text-sm'>
                  {briefing.pulse.latestEvent?.message ?? 'No recent event returned.'}
                </div>
                {briefing.pulse.latestEvent?.createdAt && (
                  <div className='text-muted-foreground mt-2 text-xs'>
                    {stockholmTime(briefing.pulse.latestEvent.createdAt)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}
