import type { ChatMessage, ChatMessagePart, ChatMessageRole } from './types';

export type JsonRecord = Record<string, unknown>;

function isMessagePart(value: ChatMessagePart | null): value is ChatMessagePart {
  return value !== null;
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringFrom(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberString(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value));
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

export function textFromContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!isRecord(part)) return '';
        if (part.type === 'text' || part.type === 'output_text') {
          return stringFrom(part.text, stringFrom(part.content));
        }
        return stringFrom(part.text, stringFrom(part.content));
      })
      .filter(Boolean)
      .join('\n\n');
  }
  if (isRecord(value)) return stringFrom(value.text, stringFrom(value.content));
  return '';
}

export function roleFrom(value: unknown): ChatMessageRole {
  if (value === 'user' || value === 'assistant' || value === 'system') return value;
  if (value === 'contact' || value === 'agent') return 'assistant';
  return 'assistant';
}

export function timestampFrom(value: JsonRecord, fallback: string) {
  const timestamp = stringFrom(value.createdAt, stringFrom(value.timestamp));
  if (timestamp) return timestamp;

  const numericTimestamp = value.ts;
  if (typeof numericTimestamp === 'number' && Number.isFinite(numericTimestamp)) {
    return new Date(numericTimestamp).toISOString();
  }

  return fallback;
}

function partRecord(value: unknown): ChatMessagePart | null {
  if (!isRecord(value)) return null;

  if (value.type === 'text') {
    const text = stringFrom(value.text, stringFrom(value.content));
    return text ? { type: 'text', text } : null;
  }

  if (value.type === 'run-status') {
    const status = statusFrom(value.status);
    return {
      type: 'run-status',
      title: stringFrom(value.title, 'Run update'),
      status,
      detail: stringFrom(value.detail) || undefined,
      runId: stringFrom(value.runId, stringFrom(value.id)) || undefined
    };
  }

  if (value.type === 'weather') return weatherPartFrom(value);
  if (value.type === 'task') return taskPartFrom(value);
  if (value.type === 'tool-call') return toolPartFrom(value);

  return null;
}

function statusFrom(value: unknown): 'queued' | 'running' | 'completed' | 'error' {
  const status = String(value ?? '').toLowerCase();
  if (['queued', 'pending'].includes(status)) return 'queued';
  if (['completed', 'complete', 'succeeded', 'success', 'done'].includes(status))
    return 'completed';
  if (['failed', 'error', 'timed_out', 'cancelled', 'lost'].includes(status)) return 'error';
  return 'running';
}

function weatherPartFrom(value: JsonRecord): ChatMessagePart | null {
  const weather = isRecord(value.weather) ? value.weather : value;
  const location = stringFrom(
    weather.location,
    stringFrom(weather.place, stringFrom(weather.city))
  );
  if (!location && value.type !== 'weather') return null;

  const temperature = numberString(weather.temperature ?? weather.temp ?? weather.temperatureC);
  const condition = stringFrom(weather.condition, stringFrom(weather.summary));
  const high = numberString(weather.high ?? weather.max ?? weather.highC);
  const low = numberString(weather.low ?? weather.min ?? weather.lowC);

  return {
    type: 'weather',
    location: location || 'Weather',
    temperature: temperature ? formatTemperature(temperature) : undefined,
    condition: condition || undefined,
    high: high ? formatTemperature(high) : undefined,
    low: low ? formatTemperature(low) : undefined
  };
}

function formatTemperature(value: string) {
  return /°|c|f/i.test(value) ? value : `${value}°`;
}

function toolPartFrom(value: JsonRecord): ChatMessagePart | null {
  const tool = isRecord(value.toolCall) ? value.toolCall : value;
  const name =
    stringFrom(tool.name) ||
    stringFrom(tool.toolName) ||
    stringFrom(tool.functionName) ||
    stringFrom(tool.title) ||
    stringFrom(value.name) ||
    stringFrom(value.toolName);
  if (!name && value.type !== 'tool-call') return null;

  return {
    type: 'tool-call',
    name: name || 'tool',
    title: stringFrom(value.title, stringFrom(tool.title)) || undefined,
    status: statusFrom(value.status ?? tool.status),
    detail:
      stringFrom(value.detail) ||
      stringFrom(value.message) ||
      stringFrom(tool.message) ||
      stringFrom(tool.status) ||
      undefined,
    toolCallId:
      stringFrom(value.toolCallId) ||
      stringFrom(tool.toolCallId) ||
      stringFrom(value.id) ||
      stringFrom(tool.id) ||
      undefined
  };
}

function taskPartFrom(value: JsonRecord): ChatMessagePart | null {
  const task = isRecord(value.task) ? value.task : value;
  const title =
    stringFrom(task.title) ||
    stringFrom(task.label) ||
    stringFrom(task.name) ||
    stringFrom(value.title);
  if (!title && value.type !== 'task') return null;

  return {
    type: 'task',
    title: title || 'Task',
    status: statusFrom(task.status ?? value.status),
    detail:
      stringFrom(task.detail, stringFrom(task.message, stringFrom(value.detail))) || undefined,
    taskId:
      stringFrom(task.taskId) ||
      stringFrom(task.id) ||
      stringFrom(value.taskId) ||
      stringFrom(value.id) ||
      undefined
  };
}

function contentParts(value: unknown): ChatMessagePart[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string') return item ? [{ type: 'text' as const, text: item }] : [];
      if (!isRecord(item)) return [];

      const direct = partRecord(item);
      if (direct) return [direct];

      if (item.type === 'tool_use' || item.type === 'toolCall' || item.type === 'tool_call') {
        const part = toolPartFrom({ ...item, status: 'running' });
        return part ? [part] : [];
      }

      if (item.type === 'tool_result' || item.type === 'toolCallResult') {
        const part = toolPartFrom({ ...item, status: item.is_error ? 'error' : 'completed' });
        return part ? [part] : [];
      }

      const text = textFromContent(item);
      return text ? [{ type: 'text' as const, text }] : [];
    });
  }

  const text = textFromContent(value);
  return text ? [{ type: 'text', text }] : [];
}

export function partsFromRecord(record: JsonRecord, fallbackText = ''): ChatMessagePart[] {
  const explicitParts = Array.isArray(record.parts)
    ? record.parts.map(partRecord).filter(isMessagePart)
    : [];
  if (explicitParts.length) return explicitParts;

  const parts = contentParts(record.content);
  const toolCalls = Array.isArray(record.toolCalls)
    ? record.toolCalls
    : Array.isArray(record.tool_calls)
      ? record.tool_calls
      : [];

  const toolParts = toolCalls
    .map((toolCall) =>
      isRecord(toolCall) ? toolPartFrom({ ...toolCall, status: 'running' }) : null
    )
    .filter(isMessagePart);

  const weather = weatherPartFrom(record);
  const task = taskPartFrom(record);
  const typed = [weather, task].filter(isMessagePart);
  const merged = [...parts, ...toolParts, ...typed];
  if (merged.length) return merged;

  return fallbackText ? [{ type: 'text', text: fallbackText }] : [];
}

export function normalizeMessage(value: unknown, index: number): ChatMessage | null {
  if (!isRecord(value)) return null;
  const content =
    textFromContent(value.content) || stringFrom(value.text, stringFrom(value.message));
  const parts = partsFromRecord(value, content);
  if (!content.trim() && !parts.length) return null;

  return {
    id: stringFrom(value.id, stringFrom(value.messageId, 'history-message-' + index)),
    role: roleFrom(value.role ?? value.sender),
    content,
    createdAt: timestampFrom(value, new Date().toISOString()),
    parts
  };
}

export function extractMessages(payload: unknown): ChatMessage[] {
  const source = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.messages)
      ? payload.messages
      : [];

  return source
    .map((message, index) => normalizeMessage(message, index))
    .filter((message): message is ChatMessage => message !== null);
}

export function messageFromEvent(eventName: string, payload: unknown): ChatMessage | null {
  if (!isRecord(payload)) return null;
  const kind = stringFrom(payload.kind, stringFrom(payload.type, eventName));
  const timestamp = timestampFrom(payload, new Date().toISOString());

  if (eventName === 'history') return null;
  if (eventName === 'keepalive' || eventName === 'hello' || eventName === 'done') return null;

  const maybeMessage = normalizeMessage(payload.message ?? payload, 0);
  if (maybeMessage && (eventName.includes('message') || kind.includes('message'))) {
    return maybeMessage;
  }

  const lower = `${eventName} ${kind}`.toLowerCase();
  const part = lower.includes('weather')
    ? weatherPartFrom(payload)
    : lower.includes('task')
      ? taskPartFrom(payload)
      : lower.includes('tool')
        ? toolPartFrom(payload)
        : lower.includes('run') || lower.includes('session')
          ? {
              type: 'run-status' as const,
              title: stringFrom(payload.title, stringFrom(payload.label, 'Run update')),
              status: statusFrom(payload.status),
              detail: stringFrom(payload.message, stringFrom(payload.detail)) || undefined,
              runId: stringFrom(payload.runId, stringFrom(payload.id)) || undefined
            }
          : null;

  if (!part) return null;

  const id =
    stringFrom(payload.eventId) ||
    stringFrom(payload.id) ||
    stringFrom(payload.toolCallId) ||
    stringFrom(payload.runId) ||
    `${eventName}-${Date.now()}`;

  return {
    id: `event-${eventName}-${id}`,
    role: 'system',
    content: stringFrom(payload.message, stringFrom(payload.detail)),
    createdAt: timestamp,
    parts: [part],
    pending:
      part.type === 'run-status' || part.type === 'tool-call' || part.type === 'task'
        ? part.status === 'running' || part.status === 'queued'
        : false,
    error:
      part.type === 'run-status' || part.type === 'tool-call' || part.type === 'task'
        ? part.status === 'error'
        : false
  };
}
