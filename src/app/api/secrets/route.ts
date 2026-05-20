import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const result = await bridgeRequest('/secrets', { timeoutMs: 8000 });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load secrets.' },
      { status: 500, headers: { 'cache-control': 'no-store' } }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await bridgeRequest('/secrets', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 8000
    });

    return NextResponse.json(result, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save secret.' },
      { status: 400, headers: { 'cache-control': 'no-store' } }
    );
  }
}
