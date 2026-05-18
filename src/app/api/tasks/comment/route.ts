import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeRequest('/tasks/comment', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return NextResponse.json(result, { status: 201, headers: { 'cache-control': 'no-store' } });
}
