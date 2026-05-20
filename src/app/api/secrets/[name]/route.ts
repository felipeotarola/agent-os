import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

type RouteContext = {
  params: Promise<{ name: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const result = await bridgeRequest(`/secrets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      timeoutMs: 8000
    });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete secret.' },
      { status: 400, headers: { 'cache-control': 'no-store' } }
    );
  }
}
