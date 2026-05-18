import { bridgeFetch } from '@/lib/bridge';
import { normalizeChatSearchParams, requireChatSession } from '@/lib/chat-routing';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const auth = await requireChatSession(request);
  if ('response' in auth) return auth.response;

  const routed = normalizeChatSearchParams(request.nextUrl.searchParams);
  if (!routed)
    return NextResponse.json({ error: 'agent or sessionKey is required' }, { status: 400 });

  const bridgeResponse = await bridgeFetch(`/chat/events?${routed.params.toString()}`, {
    headers: { accept: 'text/event-stream' }
  });

  return new Response(bridgeResponse.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive'
    }
  });
}
