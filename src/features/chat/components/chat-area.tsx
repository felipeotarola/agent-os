'use client';

import { useEffect, useRef, type FormEventHandler } from 'react';
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
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
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
          {error ? (
            <MessageBubble
              message={{
                id: 'error',
                role: 'system',
                content: error,
                createdAt: new Date().toISOString(),
                parts: [{ type: 'text', text: error }],
                error: true
              }}
            />
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
