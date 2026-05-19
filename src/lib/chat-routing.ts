import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { chatAgentSessionKeys, type ChatAgentId } from '@/lib/chat-session-keys';

export { chatAgentSessionKeys, type ChatAgentId };

const MAX_MESSAGE_CHARS = 12_000;
const MAX_ATTACHMENT_COUNT = 5;

export function isChatAgentId(value: unknown): value is ChatAgentId {
  return typeof value === 'string' && value in chatAgentSessionKeys;
}

export async function requireChatSession(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return {
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    } as const;
  }

  return { session } as const;
}

export function resolveChatRoute(input: Record<string, unknown>) {
  const explicitSessionKey = typeof input.sessionKey === 'string' ? input.sessionKey.trim() : '';
  const agent = input.agent ?? input.agentId;

  if (explicitSessionKey) {
    return {
      agentId: isChatAgentId(agent) ? agent : null,
      sessionKey: explicitSessionKey
    };
  }

  if (!isChatAgentId(agent)) {
    return null;
  }

  return {
    agentId: agent,
    sessionKey: chatAgentSessionKeys[agent]
  };
}

export function normalizeChatBody(body: unknown) {
  const record =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const route = resolveChatRoute(record);
  if (!route) {
    return {
      error: NextResponse.json({ error: 'agent or sessionKey is required' }, { status: 400 })
    } as const;
  }

  const message = typeof record.message === 'string' ? record.message.trim() : '';
  if (message.length > MAX_MESSAGE_CHARS) {
    return {
      error: NextResponse.json(
        { error: `message exceeds ${MAX_MESSAGE_CHARS} characters` },
        { status: 413 }
      )
    } as const;
  }

  const attachments = Array.isArray(record.attachments)
    ? record.attachments.slice(0, MAX_ATTACHMENT_COUNT)
    : undefined;
  const idempotencyKey =
    typeof record.idempotencyKey === 'string' && record.idempotencyKey.trim()
      ? record.idempotencyKey.trim()
      : crypto.randomUUID();

  return {
    body: {
      ...record,
      agentId: route.agentId,
      sessionKey: route.sessionKey,
      message,
      attachments,
      idempotencyKey
    }
  } as const;
}

export function normalizeChatSearchParams(searchParams: URLSearchParams) {
  const route = resolveChatRoute(Object.fromEntries(searchParams));
  if (!route) return null;

  const params = new URLSearchParams(searchParams);
  params.set('sessionKey', route.sessionKey);
  if (route.agentId) params.set('agentId', route.agentId);
  params.delete('agent');

  return {
    agentId: route.agentId,
    sessionKey: route.sessionKey,
    params
  };
}
