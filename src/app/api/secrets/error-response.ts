import { CredentialVaultError } from '@/server/credential-vault.mjs';
import { NextResponse } from 'next/server';

export function credentialErrorResponse(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus: number
): NextResponse {
  const invalidJson = error instanceof SyntaxError;
  const status =
    error instanceof CredentialVaultError ? error.status : invalidJson ? 400 : fallbackStatus;
  const message =
    error instanceof CredentialVaultError
      ? error.message
      : invalidJson
        ? 'Credential payload must be valid JSON.'
        : fallbackMessage;

  return NextResponse.json(
    { error: message },
    { status, headers: { 'cache-control': 'no-store' } }
  );
}
