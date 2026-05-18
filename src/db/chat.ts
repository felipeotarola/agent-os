import { db, sql } from '@/db/client';
import { conversations, messages, runs, events } from '@/db/schema';

const MAX_TEXT = 200_000;
let ensurePromise: Promise<void> | null = null;

type JsonRecord = Record<string, unknown>;

type NormalizedConversation = {
  id: string;
  title: string;
  agentId: string | null;
  status: string;
  metadata: JsonRecord;
  createdAt?: Date;
  updatedAt?: Date;
};

type NormalizedMessage = {
  id: string;
  conversationId: string;
  role: string;
  author: string | null;
  content: string;
  attachments: unknown[];
  metadata: JsonRecord;
  createdAt?: Date;
  updatedAt?: Date;
};

type NormalizedRun = {
  id: string;
  conversationId: string | null;
  status: string;
  metadata: JsonRecord;
  createdAt?: Date;
  updatedAt?: Date;
};

type NormalizedEvent = {
  id: string;
  runId: string | null;
  conversationId: string | null;
  kind: string;
  sequence: number;
  payload: JsonRecord;
  createdAt?: Date;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date))
    return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function arrayFrom(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function objectArrayFrom(value: unknown) {
  return arrayFrom(value).filter(isRecord);
}

export function sanitizeChatPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeChatPayload);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/token|authorization|cookie|secret|password/i.test(key))
      .map(([key, nested]) => [key, sanitizeChatPayload(nested)])
  );
}

function metadata(value: unknown): JsonRecord {
  const sanitized = sanitizeChatPayload(value);
  return isRecord(sanitized) ? sanitized : { value: sanitized };
}

function trimText(value: string) {
  return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
}

function conversationIdFrom(record: JsonRecord, fallback?: string) {
  return (
    asString(record.conversationId) ||
    asString(record.conversation_id) ||
    asString(record.threadId) ||
    asString(record.sessionKey) ||
    asString(record.session_key) ||
    fallback
  );
}

function normalizeConversation(record: JsonRecord): NormalizedConversation | null {
  const id = conversationIdFrom(record) || asString(record.id);
  if (!id) return null;
  const name = asString(record.name);
  return {
    id,
    title: asString(record.title, name || id),
    agentId: asString(record.agentId) || asString(record.agent_id) || null,
    status: asString(record.status, 'active'),
    metadata: metadata(record),
    createdAt: asDate(record.createdAt) ?? asDate(record.created_at),
    updatedAt: asDate(record.updatedAt) ?? asDate(record.updated_at)
  };
}

function normalizeMessage(
  record: JsonRecord,
  fallbackConversationId?: string
): NormalizedMessage | null {
  const conversationId = conversationIdFrom(record, fallbackConversationId);
  if (!conversationId) return null;
  const content = asString(record.content) || asString(record.text) || asString(record.message);
  const id = asString(record.id) || asString(record.messageId) || crypto.randomUUID();
  const createdAt =
    asDate(record.createdAt) ?? asDate(record.created_at) ?? asDate(record.timestamp);
  return {
    id,
    conversationId,
    role: asString(record.role) || asString(record.sender, 'assistant'),
    author: asString(record.author) || asString(record.name) || null,
    content: trimText(content),
    attachments: arrayFrom(record.attachments),
    metadata: metadata(record),
    createdAt,
    updatedAt: asDate(record.updatedAt) ?? asDate(record.updated_at) ?? createdAt
  };
}

function normalizeRun(record: JsonRecord, fallbackConversationId?: string): NormalizedRun | null {
  const id = asString(record.id) || asString(record.runId) || asString(record.run_id);
  if (!id) return null;
  return {
    id,
    conversationId: conversationIdFrom(record, fallbackConversationId) || null,
    status: asString(record.status, 'running'),
    metadata: metadata(record),
    createdAt: asDate(record.createdAt) ?? asDate(record.created_at),
    updatedAt: asDate(record.updatedAt) ?? asDate(record.updated_at)
  };
}

function normalizeEvent(
  record: JsonRecord,
  index: number,
  fallbackConversationId?: string,
  fallbackRunId?: string
): NormalizedEvent | null {
  const runId = asString(record.runId) || asString(record.run_id) || fallbackRunId || null;
  const conversationId = conversationIdFrom(record, fallbackConversationId) || null;
  const id = asString(record.id) || asString(record.eventId) || crypto.randomUUID();
  return {
    id,
    runId,
    conversationId,
    kind: asString(record.kind) || asString(record.type, 'event'),
    sequence: typeof record.sequence === 'number' ? record.sequence : index,
    payload: metadata(record),
    createdAt: asDate(record.createdAt) ?? asDate(record.created_at) ?? asDate(record.timestamp)
  };
}

function collectPayloadRecords(payload: unknown, key: string): JsonRecord[] {
  if (!isRecord(payload)) return [];
  const singular = key.endsWith('s') ? key.slice(0, -1) : key;
  return [...objectArrayFrom(payload[key]), ...objectArrayFrom(payload[singular])];
}

async function ensureChatMirrorTables() {
  ensurePromise ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id text PRIMARY KEY,
        title text NOT NULL DEFAULT '',
        agent_id text,
        status text NOT NULL DEFAULT 'active',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id text PRIMARY KEY,
        conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'assistant',
        author text,
        content text NOT NULL DEFAULT '',
        attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS runs (
        id text PRIMARY KEY,
        conversation_id text REFERENCES conversations(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'running',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id text PRIMARY KEY,
        run_id text REFERENCES runs(id) ON DELETE SET NULL,
        conversation_id text REFERENCES conversations(id) ON DELETE SET NULL,
        kind text NOT NULL DEFAULT 'event',
        sequence integer NOT NULL DEFAULT 0,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `;
  })();

  return ensurePromise;
}

export async function mirrorChatPayload(payload: unknown, context: unknown = {}) {
  try {
    await ensureChatMirrorTables();

    const contextRecord = isRecord(context) ? context : {};
    const records = isRecord(payload) ? payload : {};
    const fallbackConversationId = conversationIdFrom(contextRecord) || conversationIdFrom(records);

    const conversationRecords = [
      ...collectPayloadRecords(payload, 'conversations'),
      ...(isRecord(records.conversation) ? [records.conversation] : [])
    ];

    const normalizedConversations = conversationRecords
      .map(normalizeConversation)
      .filter((conversation): conversation is NormalizedConversation => Boolean(conversation));

    if (
      fallbackConversationId &&
      !normalizedConversations.some((item) => item.id === fallbackConversationId)
    ) {
      normalizedConversations.push({
        id: fallbackConversationId,
        title:
          asString(contextRecord.agentId) ||
          asString(contextRecord.agent) ||
          fallbackConversationId,
        agentId: asString(contextRecord.agentId) || asString(contextRecord.agent) || null,
        status: 'active',
        metadata: metadata({ context, source: 'chat-mirror-fallback' })
      });
    }

    const messageRecords = [
      ...collectPayloadRecords(payload, 'messages'),
      ...(isRecord(records.message) ? [records.message] : [])
    ];

    const normalizedMessages = messageRecords
      .map((message) => normalizeMessage(message, fallbackConversationId))
      .filter((message): message is NormalizedMessage => Boolean(message));

    const runRecords = [
      ...collectPayloadRecords(payload, 'runs'),
      ...(isRecord(records.run) ? [records.run] : [])
    ];
    const normalizedRuns = runRecords
      .map((run) => normalizeRun(run, fallbackConversationId))
      .filter((run): run is NormalizedRun => Boolean(run));

    const fallbackRunId = normalizedRuns[0]?.id;
    const eventRecords = [
      ...collectPayloadRecords(payload, 'events'),
      ...(isRecord(records.event) ? [records.event] : [])
    ];
    const normalizedEvents = eventRecords
      .map((event, index) => normalizeEvent(event, index, fallbackConversationId, fallbackRunId))
      .filter((event): event is NormalizedEvent => Boolean(event));

    const missingConversationIds = new Set<string>();
    normalizedMessages.forEach((message) => missingConversationIds.add(message.conversationId));
    normalizedRuns.forEach(
      (run) => run.conversationId && missingConversationIds.add(run.conversationId)
    );
    normalizedEvents.forEach(
      (event) => event.conversationId && missingConversationIds.add(event.conversationId)
    );
    normalizedConversations.forEach((conversation) =>
      missingConversationIds.delete(conversation.id)
    );

    for (const id of missingConversationIds) {
      normalizedConversations.push({
        id,
        title: id,
        agentId: null,
        status: 'active',
        metadata: { mirroredFrom: 'chat-api-fallback' }
      });
    }

    for (const conversation of normalizedConversations) {
      await db
        .insert(conversations)
        .values(conversation)
        .onConflictDoUpdate({
          target: conversations.id,
          set: {
            title: conversation.title,
            agentId: conversation.agentId,
            status: conversation.status,
            metadata: conversation.metadata,
            updatedAt: conversation.updatedAt ?? new Date()
          }
        });
    }

    for (const message of normalizedMessages) {
      await db
        .insert(messages)
        .values(message)
        .onConflictDoUpdate({
          target: messages.id,
          set: {
            conversationId: message.conversationId,
            role: message.role,
            author: message.author,
            content: message.content,
            attachments: message.attachments,
            metadata: message.metadata,
            updatedAt: message.updatedAt ?? new Date()
          }
        });
    }

    for (const run of normalizedRuns) {
      await db
        .insert(runs)
        .values(run)
        .onConflictDoUpdate({
          target: runs.id,
          set: {
            conversationId: run.conversationId,
            status: run.status,
            metadata: run.metadata,
            updatedAt: run.updatedAt ?? new Date()
          }
        });
    }

    for (const event of normalizedEvents) {
      await db.insert(events).values(event).onConflictDoNothing();
    }
  } catch (error) {
    console.warn('Chat mirror persistence skipped', error);
  }
}
