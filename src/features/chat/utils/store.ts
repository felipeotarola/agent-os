import { create } from 'zustand';
import { chatAgents, defaultWelcomeByAgent } from './data';
import type { AgentId, ChatMessage } from './types';

type MessagesByAgent = Record<AgentId, ChatMessage[]>;

type ChatState = {
  selectedAgentId: AgentId;
  messagesByAgent: MessagesByAgent;
  draft: string;
  isLoadingHistory: boolean;
  isSending: boolean;
  error: string | null;

  selectAgent: (agentId: AgentId) => void;
  setDraft: (text: string) => void;
  setHistory: (agentId: AgentId, messages: ChatMessage[]) => void;
  addMessage: (agentId: AgentId, message: ChatMessage) => void;
  upsertMessage: (agentId: AgentId, message: ChatMessage) => void;
  replaceMessage: (agentId: AgentId, messageId: string, message: ChatMessage) => void;
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
        content: defaultWelcomeByAgent[agent.id],
        createdAt: INITIAL_WELCOME_TIMESTAMP,
        parts: [{ type: 'text', text: defaultWelcomeByAgent[agent.id] }]
      }
    ]
  ])
) as MessagesByAgent;

export const useChatStore = create<ChatState>()((set) => ({
  selectedAgentId: 'cai',
  messagesByAgent: initialMessages,
  draft: '',
  isLoadingHistory: false,
  isSending: false,
  error: null,

  selectAgent: (agentId) => set({ selectedAgentId: agentId, error: null }),
  setDraft: (text) => set({ draft: text }),
  setHistory: (agentId, messages) =>
    set((state) => ({
      messagesByAgent: {
        ...state.messagesByAgent,
        [agentId]: messages.length ? messages : initialMessages[agentId]
      }
    })),
  addMessage: (agentId, message) =>
    set((state) => ({
      messagesByAgent: {
        ...state.messagesByAgent,
        [agentId]: [...state.messagesByAgent[agentId], message]
      }
    })),
  upsertMessage: (agentId, message) =>
    set((state) => {
      const messages = state.messagesByAgent[agentId];
      const existing = messages.some((item) => item.id === message.id);
      return {
        messagesByAgent: {
          ...state.messagesByAgent,
          [agentId]: existing
            ? messages.map((item) => (item.id === message.id ? message : item))
            : [...messages, message]
        }
      };
    }),
  replaceMessage: (agentId, messageId, message) =>
    set((state) => ({
      messagesByAgent: {
        ...state.messagesByAgent,
        [agentId]: state.messagesByAgent[agentId].map((item) =>
          item.id === messageId ? message : item
        )
      }
    })),
  setIsLoadingHistory: (isLoadingHistory) => set({ isLoadingHistory }),
  setIsSending: (isSending) => set({ isSending }),
  setError: (error) => set({ error })
}));
