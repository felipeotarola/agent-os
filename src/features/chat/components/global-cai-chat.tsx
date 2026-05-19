'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { usePathname } from 'next/navigation';
import {
  extractMessages,
  isRecord,
  messageFromEvent,
  normalizeMessage,
  partsFromRecord,
  stringFrom,
  textFromContent
} from '../utils/event-parts';
import type { ChatMessage } from '../utils/types';
import { MessageBubble } from './message-bubble';

const routeLabels: Array<[RegExp, string]> = [
  [/^\/dashboard\/overview/, 'Overview dashboard'],
  [/^\/dashboard\/notifications/, 'Notifications'],
  [/^\/dashboard\/knowledge/, 'Knowledge vault'],
  [/^\/dashboard\/kanban/, 'Task board'],
  [/^\/dashboard\/chat/, 'Agent chat'],
  [/^\/dashboard\/command/, 'Command center'],
  [/^\/dashboard\/mail-radar/, 'Mail radar'],
  [/^\/dashboard\/memory/, 'Memory'],
  [/^\/dashboard\/agents/, 'Agents']
];

function pageLabel(pathname: string) {
  return routeLabels.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'Dashboard';
}

function contextPrefix(pathname: string) {
  return `Page context: Felipe is currently on ${pageLabel(pathname)} (${pathname}). Use this page context to answer with relevant next steps or navigation-aware help.\n\nFelipe says:`;
}

function extractAssistantMessage(payload: unknown): ChatMessage | null {
  if (isRecord(payload)) {
    const direct = normalizeMessage(payload, 0);
    if (direct) return { ...direct, role: 'assistant' };

    const nested = normalizeMessage(payload.message, 0) ?? normalizeMessage(payload.reply, 0);
    if (nested) return { ...nested, role: 'assistant' };

    const content =
      stringFrom(payload.response) || textFromContent(payload.content) || stringFrom(payload.text);
    if (content.trim()) {
      return {
        id:
          stringFrom(payload.id) ||
          stringFrom(payload.messageId) ||
          stringFrom(payload.runId) ||
          `global-cai-response-${Date.now()}`,
        role: 'assistant',
        content,
        createdAt: new Date().toISOString(),
        parts: partsFromRecord(payload, content)
      };
    }
  }

  return null;
}

async function fetchCaiHistory() {
  const response = await fetch('/api/chat/history?agent=cai', {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) return [];
  return extractMessages(await response.json()).slice(-12);
}

export function GlobalCaiChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const label = useMemo(() => pageLabel(pathname), [pathname]);

  useEffect(() => {
    if (!open || messages.length) return;
    let ignore = false;
    setIsLoading(true);
    fetchCaiHistory()
      .then((history) => {
        if (!ignore) setMessages(history);
      })
      .catch(() => {
        if (!ignore) setError('Could not load Cai history. You can still send a message.');
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [messages.length, open]);

  useEffect(() => {
    const source = new EventSource('/api/chat/events?agent=cai');
    const handleEvent = (eventName: string) => (event: MessageEvent<string>) => {
      try {
        const message = messageFromEvent(eventName, JSON.parse(event.data));
        if (message) {
          setMessages((current) => {
            const existing = current.findIndex((item) => item.id === message.id);
            if (existing >= 0) {
              return current.map((item, index) => (index === existing ? message : item));
            }
            return [
              ...current.filter((item) => !(item.pending && message.role === 'assistant')),
              message
            ];
          });
        }
      } catch {
        // SSE is opportunistic; send response/history remains the fallback.
      }
    };

    ['session.message', 'session.tool', 'chat', 'run', 'task'].forEach((eventName) =>
      source.addEventListener(eventName, handleEvent(eventName))
    );
    return () => source.close();
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const content = draft.trim();
      if (!content || isSending) return;

      const submittedAt = Date.now();
      const userMessage: ChatMessage = {
        id: `global-cai-user-${submittedAt}`,
        role: 'user',
        content,
        createdAt: new Date(submittedAt).toISOString(),
        parts: [{ type: 'text', text: content }],
        pending: true
      };

      setDraft('');
      setError(null);
      setIsSending(true);
      setMessages((current) => [...current, userMessage]);

      try {
        const response = await fetch('/api/chat/send', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            agent: 'cai',
            agentName: 'Cai',
            message: `${contextPrefix(pathname)} ${content}`,
            pageContext: {
              pathname,
              label
            }
          })
        });
        if (!response.ok) throw new Error(`Send failed with ${response.status}`);

        const payload = await response.json();
        const assistant = extractAssistantMessage(payload);
        setMessages((current) => [
          ...current.map((item) =>
            item.id === userMessage.id ? { ...item, pending: false } : item
          ),
          assistant ?? {
            id: `global-cai-run-${submittedAt}`,
            role: 'system',
            content: 'Run started. Waiting for Cai’s answer…',
            createdAt: new Date().toISOString(),
            parts: [
              {
                type: 'run-status',
                title: 'Run started',
                status: 'running',
                detail: 'Waiting for Cai’s answer…',
                runId: isRecord(payload) ? stringFrom(payload.runId) : undefined
              }
            ],
            pending: true
          }
        ]);
      } catch (sendError) {
        setMessages((current) =>
          current.map((item) =>
            item.id === userMessage.id ? { ...item, pending: false, error: true } : item
          )
        );
        setError(sendError instanceof Error ? sendError.message : 'Could not send message.');
      } finally {
        setIsSending(false);
      }
    },
    [draft, isSending, label, pathname]
  );

  const canSend = draft.trim().length > 0 && !isSending;

  return (
    <>
      <Button
        type='button'
        onClick={() => setOpen(true)}
        variant='outline'
        className='group fixed right-4 bottom-4 z-40 size-12 rounded-full border-border bg-background/90 p-0 shadow-lg backdrop-blur transition hover:bg-primary hover:text-primary-foreground md:right-6 md:bottom-6 lg:w-auto lg:px-4'
        aria-label={`Ask Cai about ${label}`}
      >
        <Icons.sparkles className='size-4 lg:mr-2' />
        <span className='hidden lg:inline'>Ask Cai</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className='w-[calc(100vw-1rem)] gap-0 p-0 sm:max-w-[520px]'>
          <SheetHeader className='border-b px-5 py-4 pr-12'>
            <div className='flex items-center gap-2'>
              <SheetTitle>Chatta med Cai</SheetTitle>
              <Badge variant='outline'>{label}</Badge>
            </div>
            <SheetDescription>
              Cai får med sig sidkontext från <span className='font-medium'>{label}</span> och kan
              svara mer relevant för just den här vyn.
            </SheetDescription>
          </SheetHeader>

          <div ref={scrollRef} className='min-h-0 flex-1 overflow-y-auto px-4 py-4'>
            <div className='flex flex-col gap-3'>
              {isLoading ? (
                <div className='text-muted-foreground rounded-2xl border border-dashed p-4 text-sm'>
                  Loading Cai history…
                </div>
              ) : null}
              {messages.length === 0 && !isLoading ? (
                <div className='text-muted-foreground rounded-2xl border bg-muted/30 p-4 text-sm leading-6'>
                  Fråga Cai om den här sidan, nästa steg, varför något ser konstigt ut, eller be mig
                  skapa/fixa något utifrån aktuell vy.
                  <div className='mt-3 rounded-xl border bg-background/60 px-3 py-2 font-mono text-[11px]'>
                    context · {pathname}
                  </div>
                </div>
              ) : null}
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {error ? (
                <div className='text-destructive rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm'>
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <form onSubmit={handleSubmit} className='border-t bg-background p-3'>
            <div className='flex items-end gap-2 rounded-2xl border bg-card p-2'>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (canSend) event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={`Ask Cai about ${label.toLowerCase()}…`}
                rows={1}
                className='max-h-32 min-h-10 resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 sm:text-sm'
                disabled={isSending}
              />
              <Button
                type='submit'
                size='icon'
                className='size-10 shrink-0 rounded-full'
                disabled={!canSend}
              >
                {isSending ? (
                  <Icons.spinner className='size-4 animate-spin' />
                ) : (
                  <Icons.send className='size-4' />
                )}
                <span className='sr-only'>Send to Cai</span>
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
