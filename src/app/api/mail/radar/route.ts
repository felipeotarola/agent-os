import { bridgeRequest } from '@/lib/bridge';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  try {
    const snapshot = await bridgeRequest(`/mail/radar${query ? `?${query}` : ''}`);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'mail_radar_failed' },
      { status: 503 }
    );
  }
}
