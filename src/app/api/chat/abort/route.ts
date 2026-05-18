import { mirrorChatPayload, sanitizeChatPayload } from '@/db/chat';
import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeRequest('/chat/abort', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  const sanitized = sanitizeChatPayload(result);
  await mirrorChatPayload(sanitized, body);

  return NextResponse.json(sanitized, { headers: { 'cache-control': 'no-store' } });
}
