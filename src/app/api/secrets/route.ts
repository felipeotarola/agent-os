import { credentialVault } from '@/server/credential-vault.mjs';
import { NextRequest, NextResponse } from 'next/server';
import { credentialErrorResponse } from './error-response';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await credentialVault.listSecrets();
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return credentialErrorResponse(error, 'Could not load credentials.', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await credentialVault.createSecret(body);

    return NextResponse.json(result, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return credentialErrorResponse(error, 'Could not save credential.', 500);
  }
}
