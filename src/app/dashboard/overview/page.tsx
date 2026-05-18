import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getCockpitSnapshot } from '@/db/queries';
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
  const snapshot = await getCockpitSnapshot();
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
  const openTasks = taskEntries
    .filter(([status]) => !['done', 'cancelled'].includes(status))
    .reduce((sum, [, count]) => sum + Number(count), 0);
  const onlineAgents = snapshot.agents.filter((agent) => agent.status === 'online').length;

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-5'>
        <section className='relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_80%_15%,rgba(139,92,246,0.22),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.99))] p-6 shadow-2xl shadow-cyan-950/30'>
          <div className='absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent' />
          <div className='relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-center'>
            <div className='space-y-5'>
              <Badge variant='outline' className='border-cyan-300/40 bg-cyan-400/10 text-cyan-100'>
                <StatusDot ok={snapshot.dbOnline} /> live cockpit
              </Badge>

              <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start'>
                <div>
                  <h1 className='text-3xl font-semibold tracking-tight text-white md:text-4xl'>
                    Welcome Felipe 👋
                  </h1>
                  <div className='mt-1 text-2xl font-medium text-slate-200 md:text-3xl'>
                    {stockholmDate(liveAt)}
                  </div>
                  <div className='mt-2 text-sm text-slate-300'>
                    Stockholm time {stockholmTime(liveAt)} · live snapshot
                  </div>
                </div>

                <div className='grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:grid-cols-4'>
                  <div className='rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 shadow-lg shadow-cyan-950/20'>
                    <div className='text-slate-400'>Open tasks</div>
                    <div className='mt-1 text-2xl font-semibold text-white'>{openTasks}</div>
                  </div>
                  <div className='rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 shadow-lg shadow-emerald-950/20'>
                    <div className='text-slate-400'>Agents</div>
                    <div className='mt-1 text-2xl font-semibold text-white'>
                      {onlineAgents}/{snapshot.agents.length}
                    </div>
                  </div>
                  <div className='rounded-xl border border-violet-400/20 bg-violet-400/10 p-3 shadow-lg shadow-violet-950/20'>
                    <div className='text-slate-400'>Knowledge</div>
                    <div className='mt-1 text-2xl font-semibold text-white'>
                      {knowledge.wikified}
                    </div>
                  </div>
                  <div className='rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 shadow-lg shadow-amber-950/20'>
                    <div className='text-slate-400'>Running</div>
                    <div className='mt-1 text-2xl font-semibold text-white'>
                      {subagents?.runningCount ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              <div className='h-px max-w-4xl bg-gradient-to-r from-slate-700 via-slate-600 to-transparent' />

              <p className='max-w-3xl text-sm text-slate-300'>
                Your control center for tasks, workers, knowledge pipeline, and recent activity.
              </p>

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

            <div className='rounded-2xl border border-emerald-400/25 bg-slate-950/70 p-4 shadow-lg shadow-emerald-950/20 backdrop-blur'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <div className='text-xs text-slate-400'>System health</div>
                  <div className='mt-2 flex items-center gap-2 font-mono text-sm text-slate-100'>
                    <StatusDot ok={snapshot.dbOnline} />
                    {snapshot.dbOnline ? 'db online' : 'fallback / degraded'}
                  </div>
                </div>
                <Badge variant={snapshot.dbOnline ? 'default' : 'outline'}>
                  {snapshot.dbOnline ? 'ONLINE' : 'CHECK'}
                </Badge>
              </div>
              <div className='mt-4 rounded-xl border border-slate-700/70 bg-slate-900/70 p-3 text-xs text-slate-400'>
                Latest snapshot
                <div className='mt-1 font-mono text-slate-200'>{generatedAt}</div>
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
