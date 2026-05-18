'use client';

import { cn } from '@/lib/utils';
import type { ChatMessage, ChatMessagePart } from '../utils/types';
import { MessagePartRenderer } from './message-part-renderer';

interface MessageBubbleProps {
  message: ChatMessage;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(11, 16);
}

function messageParts(message: ChatMessage): ChatMessagePart[] {
  if (message.parts?.length) return message.parts;
  return [{ type: 'text', text: message.content }];
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const parts = messageParts(message);
  const isSingleRichPart = parts.length === 1 && parts[0]?.type !== 'text';

  return (
    <article
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
      aria-label={message.role + ' message'}
    >
      <div
        className={cn(
          'min-w-0 text-sm leading-6',
          isSingleRichPart ? 'w-full max-w-[min(100%,30rem)]' : 'max-w-[88%] sm:max-w-[78%]',
          !isSingleRichPart && 'rounded-2xl border px-3 py-2 shadow-sm sm:px-4 sm:py-3',
          isUser && !isSingleRichPart && 'border-primary/40 bg-primary text-primary-foreground',
          !isUser && !isSystem && !isSingleRichPart && 'border-border bg-card text-card-foreground',
          isSystem &&
            !isSingleRichPart &&
            'border-destructive/30 bg-destructive/10 text-destructive',
          message.pending && 'opacity-80',
          message.error &&
            !isSingleRichPart &&
            'border-destructive/40 bg-destructive/10 text-destructive'
        )}
      >
        <div className='flex min-w-0 flex-col gap-2'>
          {parts.map((part, index) => (
            <MessagePartRenderer
              isUser={isUser}
              key={`${message.id}-${part.type}-${index}`}
              part={part}
            />
          ))}
        </div>
        <div
          className={cn(
            'mt-2 text-[0.7rem]',
            isUser && !isSingleRichPart ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {message.pending ? 'Working…' : formatMessageTime(message.createdAt)}
        </div>
      </div>
    </article>
  );
}
