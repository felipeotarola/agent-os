import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';
import { credentialErrorResponse } from './error-response';

export async function GET() {
  try {
    const result = await bridgeRequest('/secrets', { timeoutMs: 8000 });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return credentialErrorResponse(error, 'Could not load credentials.', 500);
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
    return credentialErrorResponse(error, 'Could not save credential.', 400);
  }
}
