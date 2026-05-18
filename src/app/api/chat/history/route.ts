import { mirrorChatPayload, sanitizeChatPayload } from '@/db/chat';
import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const path = query ? `/chat/history?${query}` : '/chat/history';
  const result = await bridgeRequest(path);

  const sanitized = sanitizeChatPayload(result);
  await mirrorChatPayload(sanitized, Object.fromEntries(request.nextUrl.searchParams));

  return NextResponse.json(sanitized, { headers: { 'cache-control': 'no-store' } });
}
