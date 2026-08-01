import { BridgeRequestError } from '@/lib/bridge';
import { NextResponse } from 'next/server';

function bridgeMessage(error: BridgeRequestError, fallbackMessage: string): string {
  try {
    const payload = JSON.parse(error.responseBody) as { error?: unknown };
    return typeof payload.error === 'string' && payload.error ? payload.error : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function localBridgeStatus(error: Error, fallbackStatus: number): number {
  if (error.message.includes('not configured')) return 503;
  if (error.message.includes('timed out')) return 504;
  if (error.message.includes('aborted')) return 408;
  if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) return 502;
  return fallbackStatus;
}

export function credentialErrorResponse(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus: number
): NextResponse {
  const status =
    error instanceof BridgeRequestError
      ? error.status
      : error instanceof Error
        ? localBridgeStatus(error, fallbackStatus)
        : fallbackStatus;
  const message =
    error instanceof BridgeRequestError
      ? bridgeMessage(error, fallbackMessage)
      : error instanceof Error
        ? error.message
        : fallbackMessage;

  return NextResponse.json(
    { error: message },
    { status, headers: { 'cache-control': 'no-store' } }
  );
}
