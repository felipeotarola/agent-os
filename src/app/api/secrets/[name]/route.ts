import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';
import { credentialErrorResponse } from '../error-response';

type RouteContext = {
  params: Promise<{ name: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const [{ name }, body] = await Promise.all([context.params, request.json()]);
    const result = await bridgeRequest(`/secrets/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      timeoutMs: 8000
    });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return credentialErrorResponse(error, 'Could not update credential.', 400);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const result = await bridgeRequest(`/secrets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      timeoutMs: 8000
    });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return credentialErrorResponse(error, 'Could not delete credential.', 400);
  }
}
