'use client';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChatMessagePart } from '../utils/types';

interface MessagePartRendererProps {
  part: ChatMessagePart;
  isUser: boolean;
}

function RunStatusCard({ part }: { part: Extract<ChatMessagePart, { type: 'run-status' }> }) {
  const statusTone = {
    queued: 'border-border bg-muted text-muted-foreground',
    running: 'border-primary/30 bg-primary/10 text-primary',
    completed: 'border-primary/30 bg-primary/10 text-primary',
    error: 'border-destructive/40 bg-destructive/10 text-destructive'
  }[part.status];

  return (
    <div className='w-full rounded-2xl border bg-card/90 p-3 shadow-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-3'>
          <div className='bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full'>
            <Icons.sparkles
              className={cn('size-4', part.status === 'running' && 'animate-pulse')}
            />
          </div>
          <div className='min-w-0'>
            <div className='font-medium text-sm'>{part.title}</div>
            {part.detail ? (
              <div className='text-muted-foreground mt-0.5 text-xs'>{part.detail}</div>
            ) : null}
            {part.runId ? (
              <div className='text-muted-foreground/80 mt-1 truncate text-[0.68rem]'>
                run {part.runId}
              </div>
            ) : null}
          </div>
        </div>
        <Badge variant='outline' className={cn('shrink-0 rounded-full capitalize', statusTone)}>
          {part.status}
        </Badge>
      </div>
    </div>
  );
}

function WeatherCard({ part }: { part: Extract<ChatMessagePart, { type: 'weather' }> }) {
  return (
    <div className='w-full overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/15 via-background to-muted p-4 shadow-sm'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <div className='text-muted-foreground text-xs uppercase tracking-wide'>Weather</div>
          <div className='mt-1 text-lg font-semibold'>{part.location}</div>
          {part.condition ? (
            <div className='text-muted-foreground text-sm'>{part.condition}</div>
          ) : null}
        </div>
        <div className='text-right'>
          <div className='text-3xl font-semibold'>{part.temperature ?? '—'}</div>
          {(part.high || part.low) && (
            <div className='text-muted-foreground text-xs'>
              {part.high ? `H ${part.high}` : ''} {part.low ? `L ${part.low}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessagePartRenderer({ part, isUser }: MessagePartRendererProps) {
  if (part.type === 'text') {
    return <p className='whitespace-pre-wrap break-words'>{part.text}</p>;
  }

  if (part.type === 'run-status') return <RunStatusCard part={part} />;
  if (part.type === 'weather') return <WeatherCard part={part} />;

  return (
    <p className={cn('whitespace-pre-wrap break-words', isUser && 'text-primary-foreground')}>
      Unsupported message part
    </p>
  );
}
