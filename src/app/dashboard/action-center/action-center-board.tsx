'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActionCenterItem, ActionCenterSnapshot } from '@/lib/action-center';
import Link from 'next/link';

type FilterKey = 'all' | 'high' | 'task' | 'knowledge' | 'agent' | 'system';
type ActionKind = 'advance' | 'archive' | 'complete' | 'snooze' | 'dismiss';

type HiddenAction = {
  hiddenUntil: string | null;
  action: ActionKind;
};

const hiddenStorageKey = 'agent-os:action-center:hidden:v1';

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

function actionVerb(action: ActionKind) {
  if (action === 'advance') return 'Advancing';
  if (action === 'archive') return 'Archiving';
  if (action === 'complete') return 'Completing';
  if (action === 'snooze') return 'Snoozing';
  return 'Dismissing';
}

function knowledgeStatus(item: ActionCenterItem) {
  return item.kind === 'knowledge' ? (item.meta ?? '').split(' · ')[0] : '';
}

function loadHiddenActions() {
  if (typeof window === 'undefined') return {} as Record<string, HiddenAction>;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(hiddenStorageKey) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed as Record<string, HiddenAction>).filter(([, value]) => {
        if (!value?.hiddenUntil) return true;
        return new Date(value.hiddenUntil).getTime() > now;
      })
    ) as Record<string, HiddenAction>;
  } catch {
    return {};
  }
}

function saveHiddenActions(hidden: Record<string, HiddenAction>) {
  window.localStorage.setItem(hiddenStorageKey, JSON.stringify(hidden));
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

function ActionCard({
  item,
  index,
  pendingAction,
  onAction
}: {
  item: ActionCenterItem;
  index: number;
  pendingAction?: ActionKind;
  onAction: (item: ActionCenterItem, action: ActionKind) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const pending = Boolean(pendingAction);

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

        <div className='flex shrink-0 flex-wrap gap-2 md:max-w-36 md:flex-col md:items-stretch'>
          {item.kind === 'knowledge' ? (
            <Button
              type='button'
              size='sm'
              className='rounded-full'
              disabled={pending}
              onClick={() => onAction(item, 'advance')}
            >
              {pendingAction === 'advance' ? `${actionVerb('advance')}…` : item.primaryLabel}
            </Button>
          ) : (
            <Button asChild size='sm' className='rounded-full'>
              <Link href={item.href}>{item.primaryLabel}</Link>
            </Button>
          )}

          {item.kind === 'task' ? (
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='rounded-full'
              disabled={pending}
              onClick={() => onAction(item, 'complete')}
            >
              {pendingAction === 'complete' ? 'Completing…' : 'Done'}
            </Button>
          ) : null}

          {item.kind === 'knowledge' ? (
            <Button asChild size='sm' variant='outline' className='rounded-full'>
              <Link href={item.href}>Open</Link>
            </Button>
          ) : null}

          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='rounded-full'
            disabled={pending}
            onClick={() =>
              onAction(
                item,
                item.kind === 'knowledge' ? 'archive' : item.kind === 'task' ? 'snooze' : 'dismiss'
              )
            }
          >
            {pendingAction && pendingAction !== 'complete' && pendingAction !== 'advance'
              ? `${actionVerb(pendingAction)}…`
              : item.kind === 'knowledge'
                ? 'Archive'
                : item.kind === 'task'
                  ? 'Snooze'
                  : 'Dismiss'}
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

function NowCard({
  item,
  pendingAction,
  onAction
}: {
  item?: ActionCenterItem;
  pendingAction?: ActionKind;
  onAction: (item: ActionCenterItem, action: ActionKind) => void;
}) {
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
            {item.kind === 'knowledge' ? (
              <Button
                type='button'
                className='rounded-full'
                disabled={Boolean(pendingAction)}
                onClick={() => onAction(item, 'advance')}
              >
                {pendingAction === 'advance' ? 'Advancing…' : item.primaryLabel}
              </Button>
            ) : (
              <Button asChild className='rounded-full'>
                <Link href={item.href}>{item.primaryLabel}</Link>
              </Button>
            )}
            <Button
              type='button'
              variant='outline'
              className='rounded-full'
              disabled={Boolean(pendingAction)}
              onClick={() =>
                onAction(
                  item,
                  item.kind === 'task'
                    ? 'complete'
                    : item.kind === 'knowledge'
                      ? 'archive'
                      : 'dismiss'
                )
              }
            >
              {pendingAction
                ? `${actionVerb(pendingAction)}…`
                : item.kind === 'task'
                  ? 'Done'
                  : item.kind === 'knowledge'
                    ? 'Archive'
                    : 'Dismiss'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ActionCenterBoard({ snapshot }: { snapshot: ActionCenterSnapshot }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [hiddenActions, setHiddenActions] = useState<Record<string, HiddenAction>>({});
  const [pendingById, setPendingById] = useState<Record<string, ActionKind>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const hidden = loadHiddenActions();
    setHiddenActions(hidden);
    saveHiddenActions(hidden);
  }, []);

  const visibleItems = useMemo(
    () => snapshot.items.filter((item) => !hiddenActions[item.id]),
    [hiddenActions, snapshot.items]
  );
  const filteredItems = useMemo(
    () => visibleItems.filter((item) => matchesFilter(item, filter)),
    [filter, visibleItems]
  );
  const highItems = visibleItems.filter((item) => item.priority === 'high');
  const nowItem = highItems[0] ?? visibleItems[0];
  const generated = new Date(snapshot.generatedAt).toLocaleString('sv-SE');
  const counts = useMemo(
    () => ({
      total: visibleItems.length,
      high: visibleItems.filter((item) => item.priority === 'high').length,
      knowledge: visibleItems.filter((item) => item.kind === 'knowledge').length,
      tasks: visibleItems.filter((item) => item.kind === 'task').length
    }),
    [visibleItems]
  );

  const hideItem = (
    item: ActionCenterItem,
    action: ActionKind,
    hiddenUntil: string | null = null
  ) => {
    setHiddenActions((current) => {
      const next = { ...current, [item.id]: { action, hiddenUntil } };
      saveHiddenActions(next);
      return next;
    });
  };

  const handleAction = async (item: ActionCenterItem, action: ActionKind) => {
    setPendingById((current) => ({ ...current, [item.id]: action }));
    setNotice(null);
    try {
      if (action === 'dismiss') {
        hideItem(item, action);
        setNotice('Dismissed locally.');
        return;
      }

      const response = await fetch('/api/action-center', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, action, status: knowledgeStatus(item) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Action failed with ${response.status}`);

      hideItem(item, action, typeof payload.hiddenUntil === 'string' ? payload.hiddenUntil : null);
      setNotice(
        action === 'snooze'
          ? 'Snoozed until tomorrow morning.'
          : action === 'complete'
            ? 'Marked done.'
            : action === 'archive'
              ? 'Archived.'
              : 'Advanced.'
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setPendingById((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  };

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

      <NowCard
        item={nowItem}
        pendingAction={nowItem ? pendingById[nowItem.id] : undefined}
        onAction={handleAction}
      />

      {notice ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className='rounded-2xl border bg-card px-4 py-3 text-sm shadow-sm'
        >
          {notice}
        </motion.div>
      ) : null}

      <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
        <StatTile label='Total' value={counts.total} detail='in queue' />
        <StatTile label='High priority' value={counts.high} detail='decide first' />
        <StatTile label='Knowledge' value={counts.knowledge} detail='reviewable' />
        <StatTile label='Tasks' value={counts.tasks} detail='work queue' />
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
                <ActionCard
                  key={item.id}
                  item={item}
                  index={index}
                  pendingAction={pendingById[item.id]}
                  onAction={handleAction}
                />
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
