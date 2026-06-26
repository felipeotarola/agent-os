'use client';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import type { RndLoop, RndLoopBoard as RndLoopBoardData } from '@/db/rnd-loops';

type RndLoopBoardProps = {
  board: RndLoopBoardData;
  columnTitles: Record<string, string>;
};

function priorityTone(priority: number) {
  if (priority >= 80) return 'destructive';
  if (priority >= 40) return 'default';
  return 'secondary';
}

function DetailSection({ title, value }: { title: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <section className='space-y-1.5'>
      <h3 className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>{title}</h3>
      <p className='whitespace-pre-wrap text-sm leading-6'>{value}</p>
    </section>
  );
}

function LoopTicket({ loop }: { loop: RndLoop }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type='button'
          className='w-full rounded-md border bg-background p-3 text-left shadow-xs transition-colors hover:bg-accent/45 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-hidden'
        >
          <div className='flex items-start justify-between gap-2'>
            <h3 className='line-clamp-2 text-sm font-medium'>{loop.theme}</h3>
            <Badge
              variant={priorityTone(loop.priority)}
              className='shrink-0 rounded-sm px-1.5 text-[11px]'
            >
              {loop.priority}
            </Badge>
          </div>
          {loop.question && (
            <p className='mt-2 line-clamp-3 text-xs text-muted-foreground'>{loop.question}</p>
          )}
          {loop.hypothesis && (
            <p className='mt-2 line-clamp-2 text-xs text-muted-foreground'>
              Hypothesis: {loop.hypothesis}
            </p>
          )}
          <div className='mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground'>
            {loop.ownerAgentId && (
              <span className='rounded-sm bg-muted px-1.5 py-0.5'>{loop.ownerAgentId}</span>
            )}
            {loop.cadence && (
              <span className='rounded-sm bg-muted px-1.5 py-0.5'>{loop.cadence}</span>
            )}
            {loop.source && (
              <span className='rounded-sm bg-muted px-1.5 py-0.5'>{loop.source}</span>
            )}
            <span className='ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary'>
              <Icons.externalLink className='size-3' />
              Open
            </span>
          </div>
        </button>
      </SheetTrigger>
      <SheetContent className='w-[min(94vw,44rem)] overflow-y-auto sm:max-w-[44rem]'>
        <SheetHeader>
          <div className='flex flex-wrap items-center gap-2 pr-8'>
            <Badge variant={priorityTone(loop.priority)} className='rounded-sm'>
              Priority {loop.priority}
            </Badge>
            <Badge variant='secondary' className='rounded-sm'>
              {loop.status}
            </Badge>
            {loop.ownerAgentId && (
              <Badge variant='outline' className='rounded-sm'>
                {loop.ownerAgentId}
              </Badge>
            )}
          </div>
          <SheetTitle className='pr-8 text-xl leading-7'>{loop.theme}</SheetTitle>
          <SheetDescription className='font-mono text-xs'>{loop.id}</SheetDescription>
        </SheetHeader>

        <div className='space-y-5 pb-6'>
          <DetailSection title='Current Question' value={loop.question} />
          <DetailSection title='Hypothesis' value={loop.hypothesis} />
          <DetailSection title='Notes' value={loop.notes} />
          <DetailSection title='Experiment' value={loop.experiment} />
          <DetailSection title='Result' value={loop.result} />
          <DetailSection title='Next Task' value={loop.nextTask} />

          <section className='grid gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-2'>
            <div>
              <span className='font-medium text-foreground'>Cadence:</span> {loop.cadence ?? 'none'}
            </div>
            <div>
              <span className='font-medium text-foreground'>Source:</span> {loop.source ?? 'manual'}
            </div>
            <div>
              <span className='font-medium text-foreground'>Position:</span> {loop.position ?? 0}
            </div>
            <div>
              <span className='font-medium text-foreground'>Updated:</span>{' '}
              {loop.updatedAt ? new Date(loop.updatedAt).toLocaleString() : 'unknown'}
            </div>
          </section>

          <Button
            type='button'
            variant='outline'
            className='w-full justify-start font-mono text-xs'
            onClick={() => void navigator.clipboard.writeText(loop.id)}
          >
            <Icons.copy className='size-4' />
            Copy ticket id
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function RndLoopBoard({ board, columnTitles }: RndLoopBoardProps) {
  return (
    <div className='grid gap-4 xl:grid-cols-3 2xl:grid-cols-6'>
      {board.columnOrder.map((column) => {
        const loops = board.columns[column] ?? [];
        return (
          <section key={column} className='min-w-0 rounded-md border bg-card p-3'>
            <div className='mb-3 flex items-center justify-between gap-2'>
              <h2 className='text-sm font-semibold'>{columnTitles[column] ?? column}</h2>
              <Badge variant='secondary' className='rounded-sm'>
                {loops.length}
              </Badge>
            </div>
            <div className='space-y-2'>
              {loops.map((loop) => (
                <LoopTicket key={loop.id} loop={loop} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
