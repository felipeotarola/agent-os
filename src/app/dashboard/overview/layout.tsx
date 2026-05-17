import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Icons } from '@/components/icons';
import { getCockpitSnapshot } from '@/db/queries';
import React from 'react';

export default async function OverViewLayout({
  sales,
  pie_stats,
  bar_stats,
  area_stats
}: {
  sales: React.ReactNode;
  pie_stats: React.ReactNode;
  bar_stats: React.ReactNode;
  area_stats: React.ReactNode;
}) {
  const snapshot = await getCockpitSnapshot();

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_left,var(--accent),transparent_30%),linear-gradient(135deg,var(--card),var(--background))] p-6 shadow-md'>
          <div className='relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
            <div className='max-w-3xl space-y-3'>
              <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
                ⚛️ Cai OS / v0 cockpit
              </Badge>
              <div>
                <h1 className='text-3xl font-semibold tracking-tight md:text-5xl'>
                  Agent OS för Felipe × Cai
                </h1>
                <p className='text-muted-foreground mt-3 max-w-2xl text-sm md:text-base'>
                  Lokal-first cockpit för mål, tasks, agenter, wiki, journal och behörigheter.
                  OpenClaw är runtime. Markdown är kunskapslager. Postgres är instrumentpanelen.
                </p>
              </div>
            </div>
            <div className='rounded-xl border bg-background/60 p-4 backdrop-blur'>
              <div className='text-muted-foreground text-xs'>System stance</div>
              <div className='mt-1 font-mono text-sm'>portable · local · auditable</div>
              <div className='text-muted-foreground mt-2 text-xs'>
                DB: {snapshot.dbOnline ? 'online' : 'fallback'}
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
              <CardTitle>Idag</CardTitle>
              <CardDescription>Vad cockpit ska hjälpa oss fatta beslut om.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {snapshot.tasks.map((task) => (
                <div
                  key={task.title}
                  className='flex items-center justify-between gap-4 rounded-xl border bg-background/40 p-4'
                >
                  <div>
                    <div className='font-medium'>{task.title}</div>
                    <div className='text-muted-foreground text-sm'>{task.detail}</div>
                  </div>
                  <Badge variant={task.status === 'waiting' ? 'outline' : 'secondary'}>
                    {task.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Agenter</CardTitle>
              <CardDescription>
                Roller som UI:t ska visa utan att låsa oss till ett harness.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {snapshot.agents.map((agent) => (
                <div key={agent.name} className='rounded-xl border bg-background/40 p-4'>
                  <div className='flex items-center justify-between'>
                    <div className='font-medium'>{agent.name}</div>
                    <Icons.circleCheck className='text-primary size-4' />
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
              <CardTitle>Knowledge pipeline</CardTitle>
              <CardDescription>raw → wiki → index → log</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Progress value={72} />
              <p className='text-muted-foreground text-sm'>
                Nästa: skapa fysisk vault-struktur och spegla metadata till DB.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Behörigheter</CardTitle>
              <CardDescription>
                Agenten ska fråga innan externa/destruktiva actions.
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-wrap gap-2'>
              {['read local', 'write local', 'ask external', 'ask money'].map((item) => (
                <Badge key={item} variant='outline'>
                  {item}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Command panel</CardTitle>
              <CardDescription>Chat är ett interface, inte hela produkten.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='border-primary/30 bg-primary/10 text-primary rounded-xl border p-4 font-mono text-sm'>
                /capture expense · /process raw · /start worker
              </div>
            </CardContent>
          </Card>
        </div>

        <div className='hidden'>
          {sales}
          {pie_stats}
          {bar_stats}
          {area_stats}
        </div>
      </div>
    </PageContainer>
  );
}
