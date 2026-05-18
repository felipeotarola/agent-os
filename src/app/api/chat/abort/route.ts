import { mirrorChatPayload, sanitizeChatPayload } from '@/db/chat';
import { bridgeRequest } from '@/lib/bridge';
import { normalizeChatBody, requireChatSession } from '@/lib/chat-routing';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const auth = await requireChatSession(request);
  if ('response' in auth) return auth.response;

  const normalized = normalizeChatBody(await request.json());
  if ('error' in normalized) return normalized.error;

  const result = await bridgeRequest('/chat/abort', {
    method: 'POST',
    body: JSON.stringify(normalized.body)
  });

  const sanitized = sanitizeChatPayload(result);
  await mirrorChatPayload(sanitized, normalized.body);

  return NextResponse.json(sanitized, { headers: { 'cache-control': 'no-store' } });
}
