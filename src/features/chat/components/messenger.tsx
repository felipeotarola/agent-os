'use client';

import { FormEvent, useCallback, useEffect } from 'react';
import { chatAgents } from '../utils/data';
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
import type { AgentId, ChatMessage } from '../utils/types';
import { ChatArea } from './chat-area';
import { ConversationList } from './conversation-list';
import { ConversationSelect } from './conversation-select';

const agentById = Object.fromEntries(chatAgents.map((agent) => [agent.id, agent])) as Record<
  AgentId,
  (typeof chatAgents)[number]
>;

const historyPollDelaysMs = [900, 1800, 3200, 5200, 8000];

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
          `assistant-response-${Date.now()}`,
        role: 'assistant',
        content,
        createdAt: new Date().toISOString(),
        parts: partsFromRecord(payload, content)
      };
    }
  }

  return null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHistory(agentId: AgentId) {
  const params = new URLSearchParams({ agent: agentId });
  const response = await fetch('/api/chat/history?' + params.toString(), {
    headers: { accept: 'application/json' }
  });

  if (response.status === 404) return [];
  if (!response.ok) throw new Error('History request failed with ' + response.status);

  const payload: unknown = await response.json();
  return extractMessages(payload);
}

export function Messenger() {
  const {
    selectedAgentId,
    messagesByAgent,
    draft,
    isLoadingHistory,
    isSending,
    error,
    selectAgent,
    setDraft,
    setHistory,
    addMessage,
    upsertMessage,
    replaceMessage,
    setIsLoadingHistory,
    setIsSending,
    setError
  } = useChatStore();

  const selectedAgent = agentById[selectedAgentId];
  const messages = messagesByAgent[selectedAgentId];

  const loadHistory = useCallback(
    async (agentId: AgentId) => {
      const history = await fetchHistory(agentId);
      setHistory(agentId, history);
      return history;
    },
    [setHistory]
  );

  useEffect(() => {
    let ignore = false;

    async function loadSelectedAgentHistory() {
      setIsLoadingHistory(true);
      setError(null);

      try {
        const history = await fetchHistory(selectedAgentId);
        if (!ignore) setHistory(selectedAgentId, history);
      } catch (loadError) {
        if (!ignore) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Could not load chat history. Showing local starter thread.'
          );
        }
      } finally {
        if (!ignore) setIsLoadingHistory(false);
      }
    }

    void loadSelectedAgentHistory();

    return () => {
      ignore = true;
    };
  }, [selectedAgentId, setError, setHistory, setIsLoadingHistory]);

  useEffect(() => {
    const params = new URLSearchParams({ agent: selectedAgentId });
    const source = new EventSource('/api/chat/events?' + params.toString());

    const handleHistory = (event: MessageEvent<string>) => {
      try {
        const payload: unknown = JSON.parse(event.data);
        const history = extractMessages(payload);
        if (history.length) setHistory(selectedAgentId, history);
      } catch {
        // Ignore malformed bridge events; the polling fallback still refreshes history.
      }
    };

    const handleEvent = (eventName: string) => (event: MessageEvent<string>) => {
      try {
        const payload: unknown = JSON.parse(event.data);
        const message = messageFromEvent(eventName, payload);
        if (message) upsertMessage(selectedAgentId, message);
      } catch {
        // Ignore malformed bridge events; SSE is opportunistic, not the source of truth.
      }
    };

    source.addEventListener('history', handleHistory);
    [
      'chat',
      'session.message',
      'session.tool',
      'tool_call',
      'tool_call_update',
      'run',
      'task',
      'weather'
    ].forEach((eventName) => source.addEventListener(eventName, handleEvent(eventName)));

    return () => source.close();
  }, [selectedAgentId, setHistory, upsertMessage]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const content = draft.trim();
      if (!content || isSending) return;

      const agentId = selectedAgentId;
      const submittedAt = Date.now();
      const optimisticId = 'user-' + submittedAt;
      const pendingRunId = 'run-pending-' + submittedAt;
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        role: 'user',
        content,
        createdAt: new Date(submittedAt).toISOString(),
        parts: [{ type: 'text', text: content }],
        pending: true
      };

      setDraft('');
      setError(null);
      setIsSending(true);
      addMessage(agentId, optimisticMessage);

      try {
        const response = await fetch('/api/chat/send', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            agent: agentId,
            agentName: agentById[agentId].name,
            message: content
          })
        });

        if (!response.ok) throw new Error('Send request failed with ' + response.status);

        const payload: unknown = await response.json();
        const assistantMessage = extractAssistantMessage(payload);

        replaceMessage(agentId, optimisticId, { ...optimisticMessage, pending: false });
        addMessage(
          agentId,
          assistantMessage ?? {
            id: pendingRunId,
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
        );

        for (const delayMs of historyPollDelaysMs) {
          await delay(delayMs);
          const history = await loadHistory(agentId);
          const hasFreshAssistant = history.some(
            (message) =>
              message.role === 'assistant' && new Date(message.createdAt).getTime() >= submittedAt
          );
          if (hasFreshAssistant) break;
        }
      } catch (sendError) {
        replaceMessage(agentId, optimisticId, {
          ...optimisticMessage,
          pending: false,
          error: true
        });
        setError(
          sendError instanceof Error
            ? sendError.message
            : 'Could not send message. The backend API may not be implemented yet.'
        );
      } finally {
        setIsSending(false);
      }
    },
    [
      addMessage,
      draft,
      isSending,
      loadHistory,
      replaceMessage,
      selectedAgentId,
      setDraft,
      setError,
      setIsSending
    ]
  );

  return (
    <div className='flex h-[calc(100dvh-5rem)] min-h-[620px] overflow-hidden rounded-3xl border bg-background shadow-sm sm:h-[calc(100dvh-7rem)]'>
      <ConversationList
        agents={chatAgents}
        selectedId={selectedAgentId}
        messagesByAgent={messagesByAgent}
        onSelect={selectAgent}
      />
      <div className='flex min-w-0 flex-1 flex-col'>
        <ConversationSelect
          agents={chatAgents}
          selectedId={selectedAgentId}
          onSelect={selectAgent}
        />
        <ChatArea
          agent={selectedAgent}
          messages={messages}
          draft={draft}
          isLoadingHistory={isLoadingHistory}
          isSending={isSending}
          error={error}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
