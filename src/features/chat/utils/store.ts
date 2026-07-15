import { create } from 'zustand';
import { chatAgents, welcomeForAgent } from './data';
import type { AgentId, ChatMessage } from './types';

type MessagesByAgent = Record<AgentId, ChatMessage[]>;

type ChatState = {
  selectedAgentId: AgentId;
  messagesByAgent: MessagesByAgent;
  draft: string;
  isLoadingHistory: boolean;
  isSending: boolean;
  error: string | null;
  configureAgents: (agents: import('./types').ChatAgent[]) => void;

  selectAgent: (agentId: AgentId) => void;
  setDraft: (text: string) => void;
  setHistory: (agentId: AgentId, messages: ChatMessage[]) => void;
  addMessage: (agentId: AgentId, message: ChatMessage) => void;
  upsertMessage: (agentId: AgentId, message: ChatMessage) => void;
  replaceMessage: (agentId: AgentId, messageId: string, message: ChatMessage) => void;
  removeMessage: (agentId: AgentId, messageId: string) => void;
  setIsLoadingHistory: (isLoadingHistory: boolean) => void;
  setIsSending: (isSending: boolean) => void;
  setError: (error: string | null) => void;
};

const INITIAL_WELCOME_TIMESTAMP = '2026-01-01T00:00:00.000Z';

const initialMessages = Object.fromEntries(
  chatAgents.map((agent) => [
    agent.id,
    [
      {
        id: agent.id + '-welcome',
        role: 'assistant',
        content: welcomeForAgent(agent),
        createdAt: INITIAL_WELCOME_TIMESTAMP,
        parts: [{ type: 'text', text: welcomeForAgent(agent) }]
      }
    ]
  ])
) as MessagesByAgent;

function messageFingerprint(message: ChatMessage) {
  const content = message.content.trim();
  const parts = message.parts?.length ? JSON.stringify(message.parts) : '';
  return `${message.role}:${content || parts}`;
}

function sortMessages(messages: ChatMessage[]) {
  return messages.toSorted((a, b) => messageTime(a) - messageTime(b));
}

function messageTime(message: ChatMessage) {
  const timestamp = new Date(message.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isWelcomeMessage(agentId: AgentId, message: ChatMessage) {
  return message.id === `${agentId}-welcome` && message.createdAt === INITIAL_WELCOME_TIMESTAMP;
}

function isPendingRunPlaceholder(message: ChatMessage) {
  return (
    message.pending === true &&
    message.role === 'system' &&
    message.parts?.some((part) => part.type === 'run-status' && part.status === 'running')
  );
}

function pruneResolvedPendingRuns(messages: ChatMessage[], incoming: ChatMessage) {
  if (incoming.role !== 'assistant' || incoming.pending) return messages;
  const incomingTime = messageTime(incoming);

  return messages.filter((message) => {
    if (!isPendingRunPlaceholder(message)) return true;
    const placeholderTime = messageTime(message);
    return placeholderTime > incomingTime || incomingTime - placeholderTime > 15 * 60_000;
  });
}

function mergeMessage(messages: ChatMessage[], incoming: ChatMessage) {
  const incomingFingerprint = messageFingerprint(incoming);
  const pruned = pruneResolvedPendingRuns(messages, incoming);
  let replaced = false;

  const merged = pruned.map((message) => {
    if (message.id !== incoming.id && messageFingerprint(message) !== incomingFingerprint) {
      return message;
    }

    replaced = true;
    return {
      ...incoming,
      createdAt: message.pending || message.error ? message.createdAt : incoming.createdAt,
      pending: incoming.pending,
      error: incoming.error
    };
  });

  if (!replaced) merged.push(incoming);
  return sortMessages(merged);
}

function mergeHistory(agentId: AgentId, current: ChatMessage[], incoming: ChatMessage[]) {
  if (!incoming.length) {
    return current.some((message) => !isWelcomeMessage(agentId, message))
      ? current
      : initialMessages[agentId];
  }

  const incomingIds = new Set(incoming.map((message) => message.id));
  const incomingFingerprints = new Set(incoming.map(messageFingerprint));
  const newestIncomingTime = Math.max(...incoming.map(messageTime));
  const hasFreshCanonicalAssistant = incoming.some(
    (message) => message.role === 'assistant' && messageTime(message) >= newestIncomingTime - 60_000
  );

  const localTail = current.filter((message) => {
    if (isWelcomeMessage(agentId, message)) return false;
    if (incomingIds.has(message.id)) return false;
    if (incomingFingerprints.has(messageFingerprint(message))) return false;
    if (isPendingRunPlaceholder(message) && hasFreshCanonicalAssistant) return false;

    return message.pending || message.error || messageTime(message) >= newestIncomingTime;
  });

  return sortMessages([...incoming, ...localTail]);
}

export const useChatStore = create<ChatState>()((set) => ({
  selectedAgentId: 'cai',
  messagesByAgent: initialMessages,
  draft: '',
  isLoadingHistory: false,
  isSending: false,
  error: null,

  configureAgents: (agents) =>
    set((state) => {
      const messagesByAgent = { ...state.messagesByAgent };
      for (const agent of agents) {
        if (!messagesByAgent[agent.id]) {
          const welcome = welcomeForAgent(agent);
          messagesByAgent[agent.id] = [
            {
              id: `${agent.id}-welcome`,
              role: 'assistant',
              content: welcome,
              createdAt: INITIAL_WELCOME_TIMESTAMP,
              parts: [{ type: 'text', text: welcome }]
            }
          ];
        }
      }
      const selectedAgentId = agents.some((agent) => agent.id === state.selectedAgentId)
        ? state.selectedAgentId
        : (agents[0]?.id ?? state.selectedAgentId);
      return { messagesByAgent, selectedAgentId };
    }),

  selectAgent: (agentId) => set({ selectedAgentId: agentId, error: null }),
  setDraft: (text) => set({ draft: text }),
  setHistory: (agentId, messages) =>
    set((state) => ({
      messagesByAgent: {
        ...state.messagesByAgent,
        [agentId]: mergeHistory(agentId, state.messagesByAgent[agentId], messages)
      }
    })),
  addMessage: (agentId, message) =>
    set((state) => ({
      messagesByAgent: {
        ...state.messagesByAgent,
        [agentId]: sortMessages([...state.messagesByAgent[agentId], message])
      }
    })),
  upsertMessage: (agentId, message) =>
    set((state) => {
      const messages = state.messagesByAgent[agentId];
      return {
        messagesByAgent: {
          ...state.messagesByAgent,
          [agentId]: mergeMessage(messages, message)
        }
      };
    }),
  replaceMessage: (agentId, messageId, message) =>
    set((state) => ({
      messagesByAgent: {
        ...state.messagesByAgent,
        [agentId]: sortMessages(
          state.messagesByAgent[agentId].map((item) => (item.id === messageId ? message : item))
        )
      }
    })),
  removeMessage: (agentId, messageId) =>
    set((state) => ({
      messagesByAgent: {
        ...state.messagesByAgent,
        [agentId]: state.messagesByAgent[agentId].filter((item) => item.id !== messageId)
      }
    })),
  setIsLoadingHistory: (isLoadingHistory) => set({ isLoadingHistory }),
  setIsSending: (isSending) => set({ isSending }),
  setError: (error) => set({ error })
}));
