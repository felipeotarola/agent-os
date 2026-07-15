export type AgentId = string;

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

export type PartStatus = 'queued' | 'running' | 'completed' | 'error';

export type RunStatusMessagePart = {
  type: 'run-status';
  title: string;
  status: PartStatus;
  detail?: string;
  runId?: string;
};

export type ToolCallMessagePart = {
  type: 'tool-call';
  name: string;
  status: PartStatus;
  title?: string;
  detail?: string;
  toolCallId?: string;
};

export type TaskMessagePart = {
  type: 'task';
  title: string;
  status: PartStatus;
  detail?: string;
  taskId?: string;
};

export type WeatherMessagePart = {
  type: 'weather';
  location: string;
  temperature?: string;
  condition?: string;
  high?: string;
  low?: string;
};

export type ChatMessagePart =
  | TextMessagePart
  | RunStatusMessagePart
  | ToolCallMessagePart
  | TaskMessagePart
  | WeatherMessagePart;

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  parts?: ChatMessagePart[];
  pending?: boolean;
  error?: boolean;
};
