import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  const result = await bridgeRequest(`/tasks/events?id=${encodeURIComponent(id)}`);
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
