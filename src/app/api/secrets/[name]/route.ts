import { credentialVault } from '@/server/credential-vault.mjs';
import { NextRequest, NextResponse } from 'next/server';
import { credentialErrorResponse } from '../error-response';

type RouteContext = {
  params: Promise<{ name: string }>;
};

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const [{ name }, body] = await Promise.all([context.params, request.json()]);
    const result = await credentialVault.updateSecret(name, body);
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return credentialErrorResponse(error, 'Could not update credential.', 500);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const result = await credentialVault.deleteSecret(name);
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return credentialErrorResponse(error, 'Could not delete credential.', 500);
  }
}
