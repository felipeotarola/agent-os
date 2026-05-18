import { mirrorChatPayload, sanitizeChatPayload } from '@/db/chat';
import { bridgeRequest } from '@/lib/bridge';
import { normalizeChatSearchParams, requireChatSession } from '@/lib/chat-routing';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const auth = await requireChatSession(request);
  if ('response' in auth) return auth.response;

  const routed = normalizeChatSearchParams(request.nextUrl.searchParams);
  if (!routed)
    return NextResponse.json({ error: 'agent or sessionKey is required' }, { status: 400 });

  const result = await bridgeRequest(`/chat/history?${routed.params.toString()}`);

  const sanitized = sanitizeChatPayload(result);
  await mirrorChatPayload(sanitized, Object.fromEntries(routed.params));

  return NextResponse.json(sanitized, { headers: { 'cache-control': 'no-store' } });
}
