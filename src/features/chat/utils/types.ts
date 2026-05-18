export type AgentId = 'cai' | 'charles' | 'sladdis';

export type ChatAgent = {
  id: AgentId;
  name: string;
  role: string;
  initials: string;
  tone: string;
};

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export type TextMessagePart = {
  type: 'text';
  text: string;
};

export type RunStatusMessagePart = {
  type: 'run-status';
  title: string;
  status: 'queued' | 'running' | 'completed' | 'error';
  detail?: string;
  runId?: string;
};

export type WeatherMessagePart = {
  type: 'weather';
  location: string;
  temperature?: string;
  condition?: string;
  high?: string;
  low?: string;
};

export type ChatMessagePart = TextMessagePart | RunStatusMessagePart | WeatherMessagePart;

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  parts?: ChatMessagePart[];
  pending?: boolean;
  error?: boolean;
};
