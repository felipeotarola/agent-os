import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getActionCenterSnapshot, type ActionCenterItem } from '@/lib/action-center';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Action Center'
};

const priorityTone = {
  high: 'border-rose-400/35 bg-rose-500/10 text-rose-200',
  medium: 'border-amber-400/35 bg-amber-500/10 text-amber-200',
  low: 'border-slate-400/35 bg-slate-500/10 text-slate-200'
};

const kindTone = {
  task: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
  knowledge: 'border-violet-400/30 bg-violet-500/10 text-violet-200',
  agent: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  system: 'border-slate-400/30 bg-slate-500/10 text-slate-200'
};

function ActionCard({ item }: { item: ActionCenterItem }) {
  return (
    <Card className='overflow-hidden'>
      <CardContent className='p-4'>
        <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0 flex-1 space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className={priorityTone[item.priority]}>
                {item.priority}
              </Badge>
              <Badge variant='outline' className={kindTone[item.kind]}>
                {item.kind}
              </Badge>
              {item.meta && <span className='text-muted-foreground text-xs'>{item.meta}</span>}
            </div>
            <div>
              <h3 className='line-clamp-2 text-base font-semibold text-foreground'>{item.title}</h3>
              <p className='text-muted-foreground mt-1 line-clamp-3 text-sm leading-6'>
                {item.detail}
              </p>
            </div>
          </div>
          <div className='flex shrink-0 gap-2 md:flex-col'>
            <Button asChild size='sm'>
              <Link href={item.href}>{item.primaryLabel}</Link>
            </Button>
            {item.secondaryLabel && (
              <Button asChild size='sm' variant='outline'>
                <Link href={item.href}>{item.secondaryLabel}</Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ActionCenterPage() {
  const snapshot = await getActionCenterSnapshot();

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              decisions · review · controlled action
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Action Center</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              En samlad kö för saker Agent OS tycker att Felipe/Cai ska ta ställning till — tasks,
              knowledge och systemblockers. Inget körs automatiskt här.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Generated</div>
            <div className='font-mono'>
              {new Date(snapshot.generatedAt).toLocaleString('sv-SE')}
            </div>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Total</CardDescription>
              <CardTitle>{snapshot.counts.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>High priority</CardDescription>
              <CardTitle>{snapshot.counts.high}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Knowledge</CardDescription>
              <CardTitle>{snapshot.counts.knowledge}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Tasks</CardDescription>
              <CardTitle>{snapshot.counts.tasks}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
          <div className='space-y-3'>
            {snapshot.items.length === 0 ? (
              <Card>
                <CardContent className='text-muted-foreground p-8 text-sm'>
                  Inga aktuella actions. Skönt, men misstänkt.
                </CardContent>
              </Card>
            ) : (
              snapshot.items.map((item) => <ActionCard key={item.id} item={item} />)
            )}
          </div>
          <Card className='h-fit'>
            <CardHeader>
              <CardTitle>Policy</CardTitle>
              <CardDescription>Varför den här sidan finns.</CardDescription>
            </CardHeader>
            <CardContent className='text-muted-foreground space-y-3 text-sm leading-6'>
              <p>Agent OS ska föreslå, inte smyga igång saker.</p>
              <p>
                High priority betyder: kräver beslut, review eller cleanup innan systemet bör gå
                vidare.
              </p>
              <p>Knowledge blir aldrig permanent context utan review/promote.</p>
              <div className='h-px bg-border' />
              <div className='font-mono text-xs'>dispatch: {snapshot.sources.dispatch}</div>
              <div className='font-mono text-xs'>knowledge: {snapshot.sources.knowledge}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
