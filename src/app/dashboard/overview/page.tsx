import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getCockpitSnapshot } from '@/db/queries';

export const metadata = {
  title: 'Agent OS: Overview'
};

export default async function OverviewPage() {
  const snapshot = await getCockpitSnapshot();
  const knowledge = snapshot.knowledge ?? { raw: 0, queued: 0, wikified: 0, progress: 0 };
  const taskStatus = snapshot.taskStatus ?? {};
  const events = snapshot.events ?? [];

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_left,var(--accent),transparent_30%),linear-gradient(135deg,var(--card),var(--background))] p-6 shadow-md'>
          <div className='relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
            <div className='max-w-3xl space-y-3'>
              <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
                ⚛️ live cockpit
              </Badge>
              <div>
                <h1 className='text-3xl font-semibold tracking-tight md:text-5xl'>
                  Agent OS Overview
                </h1>
                <p className='text-muted-foreground mt-3 max-w-2xl text-sm md:text-base'>
                  Riktiga signaler från OpenClaw, bridge och privat Postgres: tasks, agents,
                  knowledge och memory. Ingen template-SaaS-mockdata.
                </p>
              </div>
            </div>
            <div className='rounded-xl border bg-background/60 p-4 backdrop-blur'>
              <div className='text-muted-foreground text-xs'>System</div>
              <div className='mt-1 font-mono text-sm'>
                {snapshot.dbOnline ? 'db online' : 'fallback'}
              </div>
              <div className='text-muted-foreground mt-2 text-xs'>
                {snapshot.generatedAt
                  ? new Date(snapshot.generatedAt).toLocaleString('sv-SE')
                  : 'no timestamp'}
              </div>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {snapshot.stats.map((stat) => (
            <Card key={stat.label} className='bg-gradient-to-br from-card to-primary/5'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between gap-3'>
                  <CardDescription>{stat.label}</CardDescription>
                  <Badge variant='secondary'>{stat.tone}</Badge>
                </div>
                <CardTitle className='text-3xl'>{stat.value}</CardTitle>
              </CardHeader>
              <CardContent className='text-muted-foreground text-sm'>{stat.detail}</CardContent>
            </Card>
          ))}
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-7'>
          <Card className='xl:col-span-4'>
            <CardHeader>
              <CardTitle>Prioriterade tasks</CardTitle>
              <CardDescription>Hämtas från samma Postgres-board som Tasks/Kanban.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.tasks.map((task) => (
                <div
                  key={`${task.title}-${task.status}`}
                  className='rounded-xl border bg-background/40 p-4'
                >
                  <div className='flex flex-col gap-2 md:flex-row md:items-start md:justify-between'>
                    <div>
                      <div className='font-medium'>{task.title}</div>
                      <div className='text-muted-foreground mt-1 text-sm'>{task.detail}</div>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      <Badge variant={task.status === 'waiting' ? 'outline' : 'secondary'}>
                        {task.status}
                      </Badge>
                      {task.priority && <Badge>{task.priority}</Badge>}
                    </div>
                  </div>
                  <div className='text-muted-foreground mt-3 flex flex-wrap gap-2 text-xs'>
                    {task.project && <span>{task.project}</span>}
                    {task.owner && <span>owner: {task.owner}</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Agenter</CardTitle>
              <CardDescription>Från Agent OS DB/OpenClaw-konfiguration.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.agents.map((agent) => (
                <div key={agent.name} className='rounded-xl border bg-background/40 p-4'>
                  <div className='flex items-center justify-between gap-3'>
                    <div className='font-medium'>{agent.name}</div>
                    <Badge variant={agent.status === 'online' ? 'default' : 'outline'}>
                      {agent.status}
                    </Badge>
                  </div>
                  <div className='text-sm'>{agent.role}</div>
                  <div className='text-muted-foreground mt-1 text-xs'>{agent.detail}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          <Card>
            <CardHeader>
              <CardTitle>Knowledge</CardTitle>
              <CardDescription>raw → wiki progress från DB.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Progress value={knowledge.progress} />
              <div className='grid grid-cols-3 gap-2 text-center text-sm'>
                <div className='rounded-lg border p-2'>
                  <div className='text-2xl font-semibold'>{knowledge.raw}</div>
                  <div className='text-muted-foreground text-xs'>raw</div>
                </div>
                <div className='rounded-lg border p-2'>
                  <div className='text-2xl font-semibold'>{knowledge.queued}</div>
                  <div className='text-muted-foreground text-xs'>queued</div>
                </div>
                <div className='rounded-lg border p-2'>
                  <div className='text-2xl font-semibold'>{knowledge.wikified}</div>
                  <div className='text-muted-foreground text-xs'>wiki</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Task flow</CardTitle>
              <CardDescription>Statusfördelning från tasks-tabellen.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {Object.entries(taskStatus).map(([status, count]) => (
                <div
                  key={status}
                  className='flex items-center justify-between rounded-lg border p-2 text-sm'
                >
                  <span>{status}</span>
                  <Badge variant='secondary'>{count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent events</CardTitle>
              <CardDescription>Senaste task events/audit-spår.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {events.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  Inga events.
                </div>
              ) : (
                events.map((event) => (
                  <div
                    key={`${event.createdAt}-${event.kind}`}
                    className='rounded-lg border p-3 text-sm'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <Badge variant='outline'>{event.kind}</Badge>
                      <span className='text-muted-foreground text-xs'>
                        {new Date(event.createdAt).toLocaleString('sv-SE')}
                      </span>
                    </div>
                    <div className='text-muted-foreground mt-2 text-xs'>{event.message}</div>
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
