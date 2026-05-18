export type AgentId = 'cai' | 'charles' | 'sladdis';

export type ChatAgent = {
  id: AgentId;
  name: string;
  role: string;
  initials: string;
  tone: string;
};

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  pending?: boolean;
  error?: boolean;
};
