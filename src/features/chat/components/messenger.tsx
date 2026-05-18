'use client';

import { FormEvent, useCallback, useEffect } from 'react';
import { chatAgents } from '../utils/data';
import { useChatStore } from '../utils/store';
import type { AgentId, ChatMessage, ChatMessageRole } from '../utils/types';
import { ChatArea } from './chat-area';
import { ConversationList } from './conversation-list';
import { ConversationSelect } from './conversation-select';

const agentById = Object.fromEntries(chatAgents.map((agent) => [agent.id, agent])) as Record<
  AgentId,
  (typeof chatAgents)[number]
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringFrom(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function textFromContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (isRecord(part)) return stringFrom(part.text, stringFrom(part.content));
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }
  if (isRecord(value)) return stringFrom(value.text, stringFrom(value.content));
  return '';
}

function roleFrom(value: unknown): ChatMessageRole {
  if (value === 'user' || value === 'assistant' || value === 'system') return value;
  if (value === 'contact' || value === 'agent') return 'assistant';
  return 'assistant';
}

function normalizeMessage(value: unknown, index: number): ChatMessage | null {
  if (!isRecord(value)) return null;
  const content =
    textFromContent(value.content) || stringFrom(value.text, stringFrom(value.message));
  if (!content.trim()) return null;

  return {
    id: stringFrom(value.id, 'message-' + index + '-' + Date.now()),
    role: roleFrom(value.role ?? value.sender),
    content,
    createdAt: stringFrom(value.createdAt, stringFrom(value.timestamp, new Date().toISOString()))
  };
}

function extractMessages(payload: unknown): ChatMessage[] {
  const source = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.messages)
      ? payload.messages
      : [];

  return source
    .map((message, index) => normalizeMessage(message, index))
    .filter((message): message is ChatMessage => message !== null);
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
        id: 'assistant-' + Date.now(),
        role: 'assistant',
        content,
        createdAt: new Date().toISOString()
      };
    }
  }

  return null;
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
    replaceMessage,
    setIsLoadingHistory,
    setIsSending,
    setError
  } = useChatStore();

  const selectedAgent = agentById[selectedAgentId];
  const messages = messagesByAgent[selectedAgentId];

  useEffect(() => {
    let ignore = false;

    async function loadHistory() {
      setIsLoadingHistory(true);
      setError(null);

      try {
        const params = new URLSearchParams({ agent: selectedAgentId });
        const response = await fetch('/api/chat/history?' + params.toString(), {
          headers: { accept: 'application/json' }
        });

        if (response.status === 404) return;
        if (!response.ok) throw new Error('History request failed with ' + response.status);

        const payload: unknown = await response.json();
        if (!ignore) setHistory(selectedAgentId, extractMessages(payload));
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

    void loadHistory();

    return () => {
      ignore = true;
    };
  }, [selectedAgentId, setError, setHistory, setIsLoadingHistory]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const content = draft.trim();
      if (!content || isSending) return;

      const agentId = selectedAgentId;
      const optimisticId = 'user-' + Date.now();
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
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
            id: 'run-' + Date.now(),
            role: 'system',
            content:
              'Run started. Streaming UI comes next; refresh history in a moment for the final answer.',
            createdAt: new Date().toISOString()
          }
        );
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
