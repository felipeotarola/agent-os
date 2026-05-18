import { bridgeRequest } from '@/lib/bridge';
import { NextResponse } from 'next/server';

export async function GET() {
  const summary = await bridgeRequest('/tasks/dispatch-summary');
  return NextResponse.json(summary, { headers: { 'cache-control': 'no-store' } });
}
