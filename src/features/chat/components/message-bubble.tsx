'use client';

import { cn } from '@/lib/utils';
import type { ChatMessage } from '../utils/types';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <article
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
      aria-label={message.role + ' message'}
    >
      <div
        className={cn(
          'max-w-[88%] rounded-2xl border px-3 py-2 text-sm leading-6 shadow-sm sm:max-w-[78%] sm:px-4 sm:py-3',
          isUser && 'border-primary/40 bg-primary text-primary-foreground',
          !isUser && !isSystem && 'border-border bg-card text-card-foreground',
          isSystem && 'border-destructive/30 bg-destructive/10 text-destructive',
          message.pending && 'opacity-70',
          message.error && 'border-destructive/40 bg-destructive/10 text-destructive'
        )}
      >
        <p className='whitespace-pre-wrap break-words'>{message.content}</p>
        <div
          className={cn(
            'mt-2 text-[0.7rem]',
            isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {message.pending
            ? 'Sending…'
            : new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
        </div>
      </div>
    </article>
  );
}
