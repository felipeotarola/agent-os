import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeRequest('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
