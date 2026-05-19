'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActionCenterItem, ActionCenterSnapshot } from '@/lib/action-center';
import Link from 'next/link';

type FilterKey = 'all' | 'high' | 'task' | 'knowledge' | 'agent' | 'system';

const priorityTone = {
  high: 'border-primary/40 bg-primary/10 text-primary',
  medium: 'border-border bg-muted/50 text-muted-foreground',
  low: 'border-border bg-background text-muted-foreground'
} satisfies Record<ActionCenterItem['priority'], string>;

const kindTone = {
  task: 'border-border bg-muted/50 text-card-foreground',
  knowledge: 'border-border bg-muted/50 text-card-foreground',
  agent: 'border-border bg-muted/50 text-card-foreground',
  system: 'border-border bg-muted/50 text-card-foreground'
} satisfies Record<ActionCenterItem['kind'], string>;

const kindLabels = {
  task: 'Task',
  knowledge: 'Knowledge',
  agent: 'Agent',
  system: 'System'
} satisfies Record<ActionCenterItem['kind'], string>;

const filterLabels: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High' },
  { key: 'task', label: 'Tasks' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'agent', label: 'Agents' },
  { key: 'system', label: 'System' }
];

function reasonFor(item: ActionCenterItem) {
  if (item.priority === 'high') return 'Needs decision before the system should move on.';
  if (item.kind === 'knowledge') return 'Could become durable context after review.';
  if (item.kind === 'task') return 'Queued work item that may need Felipe/Cai attention.';
  if (item.kind === 'agent') return 'Agent state worth checking before more work is queued.';
  return 'System signal that may need cleanup or confirmation.';
}

function matchesFilter(item: ActionCenterItem, filter: FilterKey) {
  if (filter === 'all') return true;
  if (filter === 'high') return item.priority === 'high';
  return item.kind === filter;
}

function StatTile({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <Card className='overflow-hidden transition-colors hover:border-primary/30'>
      <CardHeader className='space-y-1 pb-3'>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='flex items-end justify-between gap-3'>
          <span className='text-3xl'>{value}</span>
          <span className='text-muted-foreground text-xs font-normal'>{detail}</span>
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function ActionCard({ item, index }: { item: ActionCenterItem; index: number }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.article
      layout
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8, scale: 0.985 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.025, 0.12), ease: 'easeOut' }}
      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
      className='group rounded-2xl border bg-card shadow-sm transition-colors hover:border-primary/30'
    >
      <div className='grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'>
        <div className='min-w-0 space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className={priorityTone[item.priority]}>
              {item.priority}
            </Badge>
            <Badge variant='outline' className={kindTone[item.kind]}>
              {kindLabels[item.kind]}
            </Badge>
            {item.meta ? <span className='text-muted-foreground text-xs'>{item.meta}</span> : null}
          </div>

          <div className='space-y-1'>
            <h3 className='line-clamp-2 text-base font-semibold tracking-tight text-foreground'>
              {item.title}
            </h3>
            <p className='text-muted-foreground line-clamp-2 text-sm leading-6'>{item.detail}</p>
          </div>

          <div className='text-muted-foreground flex items-center gap-2 text-xs'>
            <span className='size-1.5 rounded-full bg-primary/70' />
            <span>{reasonFor(item)}</span>
          </div>
        </div>

        <div className='flex shrink-0 gap-2 md:flex-col md:items-stretch'>
          <Button asChild size='sm' className='rounded-full'>
            <Link href={item.href}>{item.primaryLabel}</Link>
          </Button>
          {item.secondaryLabel ? (
            <Button asChild size='sm' variant='outline' className='rounded-full'>
              <Link href={item.href}>{item.secondaryLabel}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </motion.article>
  );
}

function NowCard({ item }: { item?: ActionCenterItem }) {
  if (!item) {
    return (
      <Card className='overflow-hidden border-primary/20 bg-primary/5'>
        <CardContent className='p-5'>
          <div className='text-sm font-medium'>No active decision queue.</div>
          <p className='text-muted-foreground mt-1 text-sm'>Clean queue. Rare. Suspicious.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='overflow-hidden border-primary/30 bg-primary/5'>
      <CardContent className='p-5'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='min-w-0 space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge className='rounded-full'>Next best action</Badge>
              <Badge variant='outline' className={priorityTone[item.priority]}>
                {item.priority}
              </Badge>
              <Badge variant='outline' className={kindTone[item.kind]}>
                {kindLabels[item.kind]}
              </Badge>
            </div>
            <div>
              <h2 className='line-clamp-2 text-xl font-semibold tracking-tight'>{item.title}</h2>
              <p className='text-muted-foreground mt-1 line-clamp-2 text-sm leading-6'>
                {item.detail}
              </p>
            </div>
            <p className='text-muted-foreground text-xs'>{reasonFor(item)}</p>
          </div>
          <div className='flex shrink-0 gap-2'>
            <Button asChild className='rounded-full'>
              <Link href={item.href}>{item.primaryLabel}</Link>
            </Button>
            {item.secondaryLabel ? (
              <Button asChild variant='outline' className='rounded-full'>
                <Link href={item.href}>{item.secondaryLabel}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ActionCenterBoard({ snapshot }: { snapshot: ActionCenterSnapshot }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const filteredItems = useMemo(
    () => snapshot.items.filter((item) => matchesFilter(item, filter)),
    [filter, snapshot.items]
  );
  const highItems = snapshot.items.filter((item) => item.priority === 'high');
  const nowItem = highItems[0] ?? snapshot.items[0];
  const generated = new Date(snapshot.generatedAt).toLocaleString('sv-SE');

  return (
    <div className='flex flex-1 flex-col gap-6'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div className='space-y-2'>
          <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
            decisions · review · controlled action
          </Badge>
          <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Action Center</h1>
          <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
            En snabb beslutskö för det som faktiskt kräver uppmärksamhet. Snappy, men fortfarande
            kontrollerat: Agent OS föreslår — du/Cai bestämmer.
          </p>
        </div>
        <div className='rounded-2xl border bg-card/80 p-4 text-sm shadow-sm'>
          <div className='text-muted-foreground'>Generated</div>
          <div className='font-mono'>{generated}</div>
        </div>
      </div>

      <NowCard item={nowItem} />

      <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
        <StatTile label='Total' value={snapshot.counts.total} detail='in queue' />
        <StatTile label='High priority' value={snapshot.counts.high} detail='decide first' />
        <StatTile label='Knowledge' value={snapshot.counts.knowledge} detail='reviewable' />
        <StatTile label='Tasks' value={snapshot.counts.tasks} detail='work queue' />
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
        <div className='space-y-3'>
          <div className='sticky top-2 z-10 -mx-1 flex gap-2 overflow-x-auto rounded-2xl border bg-background/85 p-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70'>
            {filterLabels.map((option) => {
              const active = filter === option.key;
              return (
                <button
                  key={option.key}
                  type='button'
                  onClick={() => setFilter(option.key)}
                  className={`relative rounded-full px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {active ? (
                    <motion.span
                      layoutId='action-filter-pill'
                      className='absolute inset-0 rounded-full bg-primary'
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  <span className='relative'>{option.label}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode='popLayout'>
            {filteredItems.length === 0 ? (
              <motion.div
                key='empty'
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <Card>
                  <CardContent className='text-muted-foreground p-8 text-sm'>
                    Inga actions i det här filtret.
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              filteredItems.map((item, index) => (
                <ActionCard key={item.id} item={item} index={index} />
              ))
            )}
          </AnimatePresence>
        </div>

        <Card className='h-fit overflow-hidden'>
          <CardHeader>
            <CardTitle>Operating policy</CardTitle>
            <CardDescription>Vad Action Center ska vara.</CardDescription>
          </CardHeader>
          <CardContent className='text-muted-foreground space-y-4 text-sm leading-6'>
            <p>Prioritering först. Dashboard sen. Det här ska kännas som kontrollrummet.</p>
            <div className='rounded-2xl border bg-muted/30 p-3'>
              <div className='text-foreground text-sm font-medium'>Rules</div>
              <ul className='mt-2 list-disc space-y-1 pl-4'>
                <li>High priority kräver beslut, review eller cleanup.</li>
                <li>Knowledge blir inte trusted context utan review/promote.</li>
                <li>Inget externt/destruktivt körs automatiskt här.</li>
              </ul>
            </div>
            <div className='h-px bg-border' />
            <div className='space-y-1 font-mono text-xs'>
              <div>dispatch: {snapshot.sources.dispatch}</div>
              <div>knowledge: {snapshot.sources.knowledge}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
