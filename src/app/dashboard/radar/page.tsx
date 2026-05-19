import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getRadarSnapshot, type RadarSignal } from '@/lib/radar';

export const metadata = {
  title: 'Agent OS: Inbox Radar'
};

function priorityVariant(priority: RadarSignal['priority']) {
  if (priority === 'high') return 'default' as const;
  if (priority === 'medium') return 'secondary' as const;
  return 'outline' as const;
}

function sourceLabel(source: RadarSignal['source']) {
  return {
    tasks: 'Tasks',
    knowledge: 'Knowledge',
    notifications: 'Notifications',
    observability: 'Observability',
    runway: 'Runway'
  }[source];
}

export default async function RadarPage() {
  const snapshot = await getRadarSnapshot();
  const recommendation = snapshot.recommendation;

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              unified inbox
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Inbox Radar</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              En prioriterad vy över vad Felipe faktiskt behöver bry sig om: tasks, knowledge,
              Gmail, Calendar, GitHub, notifications, observability och runway. V1 är read-only och
              fail-soft.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Source</div>
            <div className='font-mono'>{snapshot.source}</div>
            <div className='text-muted-foreground mt-2 text-xs'>
              {new Date(snapshot.generatedAt).toLocaleString('sv-SE')}
            </div>
          </div>
        </div>

        <Card className='border-primary/30 bg-primary/5'>
          <CardHeader>
            <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
              <div>
                <CardDescription>Recommended next attention</CardDescription>
                <CardTitle className='mt-1 text-2xl'>{recommendation.title}</CardTitle>
              </div>
              <Badge variant={priorityVariant(recommendation.priority)}>
                {recommendation.priority}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            <p className='text-muted-foreground text-sm'>{recommendation.detail}</p>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline'>{sourceLabel(recommendation.source)}</Badge>
              {recommendation.meta && <Badge variant='secondary'>{recommendation.meta}</Badge>}
              <Button asChild size='sm'>
                <Link href={recommendation.href}>{recommendation.actionLabel}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className='grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6'>
          {[
            ['Total', snapshot.counts.total],
            ['High', snapshot.counts.high],
            ['Tasks', snapshot.counts.tasks],
            ['Knowledge', snapshot.counts.knowledge],
            ['Ops', snapshot.counts.observability],
            ['Runway', snapshot.counts.runway]
          ].map(([label, value]) => (
            <Card key={label}>
              <CardHeader className='pb-2'>
                <CardDescription>{label}</CardDescription>
                <CardTitle className='text-3xl'>{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Signals</CardTitle>
              <CardDescription>
                Sorterade efter vad som mest förtjänar uppmärksamhet.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.signals.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  Inget akut i radarn just nu.
                </div>
              ) : (
                snapshot.signals.map((signal) => (
                  <div key={signal.id} className='rounded-xl border bg-background/40 p-4'>
                    <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <div className='font-medium'>{signal.title}</div>
                          <Badge variant='outline'>{sourceLabel(signal.source)}</Badge>
                        </div>
                        <div className='text-muted-foreground mt-2 text-sm'>{signal.detail}</div>
                        {signal.meta && (
                          <div className='text-muted-foreground mt-2 font-mono text-[11px]'>
                            {signal.meta}
                          </div>
                        )}
                      </div>
                      <div className='flex shrink-0 items-center gap-2'>
                        <Badge variant={priorityVariant(signal.priority)}>{signal.priority}</Badge>
                        <Button asChild variant='outline' size='sm'>
                          <Link href={signal.href}>{signal.actionLabel}</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>What this is</CardTitle>
                <CardDescription>
                  Radarn ska minska brus, inte skapa mer dashboardarbete.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                {[
                  'Prioritize across sources instead of making Felipe check every page.',
                  'Keep actions narrow: open, review, inspect — not destructive automation.',
                  'Degraded connectors are signals, not failures, until credentials are configured.',
                  'Next V2 should add persistent snooze/hide and guarded follow-up actions.'
                ].map((item) => (
                  <div key={item} className='rounded-xl border bg-background/40 p-3'>
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>

            {snapshot.sourceErrors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Source errors</CardTitle>
                  <CardDescription>Fail-soft connectors that need inspection.</CardDescription>
                </CardHeader>
                <CardContent className='space-y-2 text-sm'>
                  {snapshot.sourceErrors.map((error) => (
                    <div key={error} className='rounded-xl border bg-background/40 p-3'>
                      {error}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
