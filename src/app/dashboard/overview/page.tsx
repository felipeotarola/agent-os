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

const knowledgeStages = [
  { key: 'raw', label: 'Raw' },
  { key: 'queued', label: 'Queued' },
  { key: 'wikified', label: 'Wiki' }
] as const;

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`size-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />;
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (['online', 'in_progress', 'running', 'active'].includes(status)) return 'default';
  if (['waiting', 'queued', 'pending'].includes(status)) return 'outline';
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

export default async function OverviewPage() {
  const snapshot = await getCockpitSnapshot();
  const knowledge = snapshot.knowledge ?? { raw: 0, queued: 0, wikified: 0, progress: 0 };
  const taskStatus = snapshot.taskStatus ?? {};
  const events = snapshot.events ?? [];
  const subagents = snapshot.subagents;
  const recentRuns = subagents?.recent ?? [];
  const runningRuns = recentRuns.filter((run) => run.status === 'running');
  const generatedAt = snapshot.generatedAt ? timeLabel(snapshot.generatedAt) : 'no timestamp';

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='max-w-3xl space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              ⚛️ live cockpit
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-5xl'>Agent OS Overview</h1>
            <p className='text-muted-foreground text-sm md:text-base'>
              En snabb läsbar cockpit för agentarbete: vad körs, vad väntar, vad är friskt och vad
              behöver Felipe/Cai göra härnäst.
            </p>
          </div>
          <Card className='min-w-64'>
            <CardContent className='flex items-center justify-between gap-4 p-4'>
              <div>
                <div className='text-muted-foreground text-xs'>System health</div>
                <div className='mt-1 flex items-center gap-2 font-mono text-sm'>
                  <StatusDot ok={snapshot.dbOnline} />
                  {snapshot.dbOnline ? 'db online' : 'fallback / degraded'}
                </div>
                <div className='text-muted-foreground mt-1 text-xs'>Updated {generatedAt}</div>
              </div>
              <Badge variant={snapshot.dbOnline ? 'default' : 'outline'}>
                {snapshot.dbOnline ? 'Live' : 'Check'}
              </Badge>
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4'>
          {snapshot.stats.map((stat) => (
            <Card key={stat.label} className='overflow-hidden'>
              <CardContent className='p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <div className='text-muted-foreground text-xs'>{stat.label}</div>
                    <div className='mt-2 text-3xl font-semibold'>{stat.value}</div>
                  </div>
                  <Badge variant='secondary'>{stat.tone}</Badge>
                </div>
                <div className='text-muted-foreground mt-3 line-clamp-2 text-xs'>{stat.detail}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className='border-primary/30 bg-primary/5'>
          <CardContent className='p-5'>
            <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
              <div className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <Badge variant={subagents?.ok ? 'default' : 'outline'}>
                    {subagents?.runningCount ?? 0} running
                  </Badge>
                  <span className='text-sm font-medium'>Live operations</span>
                </div>
                <p className='text-muted-foreground max-w-3xl text-sm'>
                  {subagents?.ok
                    ? runningRuns[0]?.title ||
                      (recentRuns.length > 0
                        ? 'Inga aktiva runs, men det finns recent OpenClaw-taskar.'
                        : 'Inga aktiva eller recent subagent/background runs just nu.')
                    : `Subagent source unavailable: ${subagents?.error ?? 'bridge did not return a source'}.`}
                </p>
                <div className='text-muted-foreground flex flex-wrap gap-3 text-xs'>
                  <span>Source: {subagents?.source ?? 'missing'}</span>
                  {subagents?.checkedAt && <span>Heartbeat: {timeLabel(subagents.checkedAt)}</span>}
                </div>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button asChild variant='outline'>
                  <Link href='/dashboard/tasks'>Öppna Tasks</Link>
                </Button>
                <Button asChild>
                  <Link href='/dashboard/agents'>Hantera agenter</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
          <Card className='xl:col-span-7'>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Prioriterade tasks</CardTitle>
                  <CardDescription>Det här är kön att titta på först.</CardDescription>
                </div>
                <Button asChild variant='outline' size='sm'>
                  <Link href='/dashboard/kanban'>Visa alla</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.tasks.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-5 text-sm'>
                  Inga prioriterade tasks hittades.
                </div>
              ) : (
                snapshot.tasks.slice(0, 5).map((task) => (
                  <div
                    key={`${task.title}-${task.status}`}
                    className='rounded-xl border bg-background/40 p-4'
                  >
                    <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                      <div className='min-w-0'>
                        <div className='font-medium'>{task.title}</div>
                        <div className='text-muted-foreground mt-1 line-clamp-2 text-sm'>
                          {task.detail}
                        </div>
                        <div className='text-muted-foreground mt-3 flex flex-wrap gap-2 text-xs'>
                          {task.project && <span>{task.project}</span>}
                          {task.owner && <span>owner: {task.owner}</span>}
                        </div>
                      </div>
                      <div className='flex shrink-0 flex-wrap gap-2'>
                        <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
                        {task.priority && <Badge>{task.priority}</Badge>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className='xl:col-span-5'>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Agenter</CardTitle>
                  <CardDescription>Roller och driftstatus.</CardDescription>
                </div>
                <Button asChild variant='outline' size='sm'>
                  <Link href='/dashboard/agents'>Öppna</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.agents.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-5 text-sm'>
                  Inga agenter hittades i snapshoten.
                </div>
              ) : (
                snapshot.agents.map((agent) => (
                  <div key={agent.name} className='rounded-xl border bg-background/40 p-4'>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <div className='flex items-center gap-2 font-medium'>
                          <StatusDot ok={agent.status === 'online'} />
                          {agent.name}
                        </div>
                        <div className='mt-1 text-sm'>{agent.role}</div>
                        <div className='text-muted-foreground mt-1 line-clamp-2 text-xs'>
                          {agent.detail}
                        </div>
                      </div>
                      <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
          <Card className='xl:col-span-4'>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Knowledge pipeline</CardTitle>
                  <CardDescription>Rådata till wiki/context-kandidat.</CardDescription>
                </div>
                <Button asChild variant='outline' size='sm'>
                  <Link href='/dashboard/knowledge'>Inbox</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Progress value={knowledge.progress} />
              <div className='grid grid-cols-3 gap-2 text-center text-sm'>
                {knowledgeStages.map((stage) => (
                  <div key={stage.key} className='rounded-lg border bg-background/40 p-3'>
                    <div className='text-2xl font-semibold'>{knowledge[stage.key]}</div>
                    <div className='text-muted-foreground text-xs'>{stage.label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Task flow</CardTitle>
              <CardDescription>Statusfördelning.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {Object.entries(taskStatus).length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  Ingen task-statusdata.
                </div>
              ) : (
                Object.entries(taskStatus).map(([status, count]) => (
                  <div
                    key={status}
                    className='flex items-center justify-between rounded-lg border p-2 text-sm'
                  >
                    <span>{status}</span>
                    <Badge variant='secondary'>{count}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className='xl:col-span-5'>
            <CardHeader>
              <CardTitle>Recent events</CardTitle>
              <CardDescription>Senaste audit-spår från bridge/DB.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {events.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  Inga events.
                </div>
              ) : (
                events.slice(0, 6).map((event) => (
                  <div
                    key={`${event.createdAt}-${event.kind}`}
                    className='rounded-lg border bg-background/40 p-3 text-sm'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <Badge variant='outline'>{event.kind}</Badge>
                      <span className='text-muted-foreground text-xs'>
                        {timeLabel(event.createdAt)}
                      </span>
                    </div>
                    <div className='text-muted-foreground mt-2 line-clamp-2 text-xs'>
                      {event.message}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
