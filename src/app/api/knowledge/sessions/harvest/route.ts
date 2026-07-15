import { bridgeRequest } from '@/lib/bridge';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const limit = Number(form.get('limit') ?? 5);
  const minScore = Number(form.get('minScore') ?? 35);
  const signalsPerSession = Number(form.get('signalsPerSession') ?? 8);
  const dryRun = true;

  await bridgeRequest('/knowledge/sessions/harvest', {
    method: 'POST',
    body: JSON.stringify({ limit, minScore, signalsPerSession, dryRun })
  });

  const status = 'previewed';
  return NextResponse.redirect(
    new URL(`/dashboard/knowledge?sessions=${status}`, request.url),
    303
  );
}
