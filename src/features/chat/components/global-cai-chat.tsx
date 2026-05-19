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
import { agentOsCaiSessionKey } from '@/lib/chat-session-keys';
import { displayableChatMessage, displayableMessages } from '../utils/display';
import {
  extractMessages,
  isRecord,
  messageFromEvent,
  normalizeMessage,
  partsFromRecord,
  stringFrom,
  textFromContent
} from '../utils/event-parts';
import { useChatStore } from '../utils/store';
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

const dashboardCaiSessionKey = agentOsCaiSessionKey;
const pendingCaiText = 'Cai tänker…';

function pageLabel(pathname: string) {
  return routeLabels.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'Dashboard';
}

function contextPrefix(pathname: string) {
  return `You are Cai in the dashboard copilot drawer. Keep answers short, practical, and page-aware. Page context: Felipe is currently on ${pageLabel(pathname)} (${pathname}). Use this page context to answer with relevant next steps or navigation-aware help.\n\nFelipe says:`;
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

function sessionIdFromPayload(payload: unknown) {
  return isRecord(payload) ? stringFrom(payload.sessionId) : '';
}

async function fetchCaiHistory() {
  const params = new URLSearchParams({
    agent: 'cai',
    sessionKey: dashboardCaiSessionKey
  });
  const response = await fetch(`/api/chat/history?${params}`, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) return { messages: [], sessionId: '' };
  const payload = await response.json();
  return {
    sessionId: sessionIdFromPayload(payload),
    messages: extractMessages(payload)
  };
}

export function GlobalCaiChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [abortRunId, setAbortRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef<string>('');
  const historyLoadedRef = useRef(false);
  const label = useMemo(() => pageLabel(pathname), [pathname]);
  const { messagesByAgent, setHistory, addMessage, upsertMessage, replaceMessage, removeMessage } =
    useChatStore();
  const messages = useMemo(
    () => displayableMessages(messagesByAgent.cai, { hideSystem: true }).slice(-12),
    [messagesByAgent.cai]
  );
  const hasPendingCai = messages.some(
    (message) => message.pending && message.content === pendingCaiText
  );

  useEffect(() => {
    if (!open || historyLoadedRef.current) return;
    let ignore = false;
    historyLoadedRef.current = true;
    setIsLoading(true);
    fetchCaiHistory()
      .then(({ messages: history, sessionId }) => {
        if (!ignore) {
          if (sessionId) sessionIdRef.current = sessionId;
          setHistory('cai', history);
        }
      })
      .catch(() => {
        if (!ignore) setError('Could not load Cai history. You can still send a message.');
        historyLoadedRef.current = false;
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [open, setHistory]);

  const refreshHistory = useCallback(async () => {
    const { messages: history, sessionId } = await fetchCaiHistory();
    if (sessionId) sessionIdRef.current = sessionId;
    setHistory('cai', history);
  }, [setHistory]);

  useEffect(() => {
    const params = new URLSearchParams({
      agent: 'cai',
      sessionKey: dashboardCaiSessionKey
    });
    const source = new EventSource(`/api/chat/events?${params}`);
    const handleHistory = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data);
        const sessionId = sessionIdFromPayload(payload);
        if (sessionId) sessionIdRef.current = sessionId;
        setHistory('cai', extractMessages(payload));
      } catch {
        // History snapshots are best-effort only.
      }
    };
    const handleEvent = (eventName: string) => (event: MessageEvent<string>) => {
      try {
        const message = messageFromEvent(eventName, JSON.parse(event.data));
        if (message) upsertMessage('cai', message);
      } catch {
        // SSE is opportunistic; send response/history remains the fallback.
      }
    };

    source.addEventListener('history', handleHistory);
    ['session.message', 'chat'].forEach((eventName) =>
      source.addEventListener(eventName, handleEvent(eventName))
    );
    return () => source.close();
  }, [setHistory, upsertMessage]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const content = draft.trim();
      if (!content || isSending || hasPendingCai) return;

      const submittedAt = Date.now();
      const idempotencyKey = `dashboard-cai-${submittedAt}`;
      const canonicalContent = `${contextPrefix(pathname)} ${content}`;
      const userMessage: ChatMessage = {
        id: `global-cai-user-${submittedAt}`,
        role: 'user',
        content: canonicalContent,
        createdAt: new Date(submittedAt).toISOString(),
        parts: [{ type: 'text', text: canonicalContent }]
      };
      const thinkingMessage: ChatMessage = {
        id: `global-cai-thinking-${submittedAt}`,
        role: 'assistant',
        content: pendingCaiText,
        createdAt: new Date(submittedAt + 1).toISOString(),
        parts: [{ type: 'text', text: pendingCaiText }],
        pending: true
      };

      setDraft('');
      setError(null);
      setIsSending(true);
      setAbortRunId(idempotencyKey);
      addMessage('cai', userMessage);
      addMessage('cai', thinkingMessage);

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
            sessionKey: dashboardCaiSessionKey,
            sessionId: sessionIdRef.current || undefined,
            message: canonicalContent,
            idempotencyKey,
            pageContext: {
              pathname,
              label
            }
          })
        });
        if (!response.ok) throw new Error(`Send failed with ${response.status}`);

        const payload = await response.json();
        const assistant = extractAssistantMessage(payload);
        const runId = isRecord(payload) ? stringFrom(payload.runId, stringFrom(payload.id)) : '';
        if (runId) setAbortRunId(runId);
        if (assistant) replaceMessage('cai', thinkingMessage.id, assistant);
        window.setTimeout(() => {
          refreshHistory().catch(() => undefined);
        }, 1500);
      } catch (sendError) {
        removeMessage('cai', thinkingMessage.id);
        replaceMessage('cai', userMessage.id, {
          ...userMessage,
          pending: false,
          error: true
        });
        setError(sendError instanceof Error ? sendError.message : 'Could not send message.');
      } finally {
        setIsSending(false);
      }
    },
    [
      addMessage,
      draft,
      hasPendingCai,
      isSending,
      label,
      pathname,
      refreshHistory,
      removeMessage,
      replaceMessage
    ]
  );

  const handleAbort = useCallback(async () => {
    if (!abortRunId) return;
    setError(null);
    try {
      await fetch('/api/chat/abort', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          agent: 'cai',
          sessionKey: dashboardCaiSessionKey,
          runId: abortRunId
        })
      });
      for (const message of messagesByAgent.cai) {
        if (
          message.pending &&
          displayableChatMessage(message, { hideSystem: true })?.content === pendingCaiText
        ) {
          removeMessage('cai', message.id);
        }
      }
      setAbortRunId(null);
      setIsSending(false);
    } catch (abortError) {
      setError(abortError instanceof Error ? abortError.message : 'Could not stop Cai.');
    }
  }, [abortRunId, messagesByAgent.cai, removeMessage]);

  const canSend = draft.trim().length > 0 && !isSending && !hasPendingCai;
  const canAbort = hasPendingCai && Boolean(abortRunId);

  return (
    <>
      <Button
        type='button'
        onClick={() => setOpen(true)}
        variant='outline'
        className='group fixed right-2 bottom-2 z-40 size-10 rounded-full border-border bg-background/90 p-0 opacity-90 shadow-lg backdrop-blur transition hover:bg-primary hover:text-primary-foreground min-[390px]:right-3 min-[390px]:bottom-3 md:right-6 md:bottom-6 md:size-12 md:opacity-100 lg:w-auto lg:px-4'
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
              {isLoading && messages.length === 0 ? (
                <div className='text-muted-foreground rounded-2xl border border-dashed px-4 py-3 text-sm'>
                  Synkar tidigare Cai-meddelanden…
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
                type={canAbort ? 'button' : 'submit'}
                size='icon'
                className='size-10 shrink-0 rounded-full'
                disabled={canAbort ? false : !canSend}
                onClick={canAbort ? handleAbort : undefined}
              >
                {canAbort ? <Icons.close className='size-4' /> : <Icons.send className='size-4' />}
                <span className='sr-only'>{canAbort ? 'Stop Cai' : 'Send to Cai'}</span>
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
