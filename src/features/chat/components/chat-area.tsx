'use client';

import { useEffect, useRef, type FormEventHandler } from 'react';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import type { ChatAgent, ChatMessage } from '../utils/types';
import { ChatHeader } from './chat-header';
import { MessageBubble } from './message-bubble';
import { MessageComposer } from './message-composer';

interface ChatAreaProps {
  agent: ChatAgent;
  messages: ChatMessage[];
  draft: string;
  isLoadingHistory: boolean;
  isSending: boolean;
  error: string | null;
  onDraftChange: (text: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function ChatArea({
  agent,
  messages,
  draft,
  isLoadingHistory,
  isSending,
  error,
  onDraftChange,
  onSubmit
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollTo({ top: node.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [messages, agent.id]);

  return (
    <section className='flex min-h-0 flex-1 flex-col bg-background'>
      <ChatHeader agent={agent} isLoadingHistory={isLoadingHistory} />
      <div
        ref={scrollRef}
        className='min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_28rem)] px-3 py-4 sm:px-6'
      >
        <div className='mx-auto flex max-w-3xl flex-col gap-3 pb-3'>
          <div className='mb-1 flex flex-wrap items-center gap-2 px-1'>
            <Badge variant='secondary' className='rounded-full'>
              {agent.tone}
            </Badge>
            <Badge variant='outline' className='rounded-full'>
              Rich mobile chat
            </Badge>
            {isLoadingHistory ? (
              <span className='text-muted-foreground text-xs'>Syncing history…</span>
            ) : null}
          </div>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {!messages.length && !isLoadingHistory && !error ? (
            <div className='text-muted-foreground flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center'>
              <Icons.chat aria-hidden='true' className='mb-3 size-5' />
              <div className='text-foreground text-sm font-medium'>Start a conversation</div>
              <p className='mt-1 max-w-sm text-xs'>
                Messages will appear here after they are accepted by the OpenClaw runtime.
              </p>
            </div>
          ) : null}
          {error ? (
            <div
              className='border-destructive/40 bg-destructive/10 text-destructive rounded-xl border p-4 text-sm'
              role='alert'
            >
              <div className='font-medium'>Chat connection unavailable</div>
              <p className='mt-1 text-xs leading-relaxed'>{error}</p>
            </div>
          ) : null}
        </div>
      </div>
      <MessageComposer
        draft={draft}
        isSending={isSending}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
      />
    </section>
  );
}
