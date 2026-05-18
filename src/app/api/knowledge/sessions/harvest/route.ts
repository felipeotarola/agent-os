import { bridgeRequest } from '@/lib/bridge';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const limit = Number(form.get('limit') ?? 5);
  const minScore = Number(form.get('minScore') ?? 35);
  const dryRun = form.get('dryRun') === 'on';

  await bridgeRequest('/knowledge/sessions/harvest', {
    method: 'POST',
    body: JSON.stringify({ limit, minScore, dryRun })
  });

  const status = dryRun ? 'previewed' : 'harvested';
  return NextResponse.redirect(
    new URL(`/dashboard/knowledge?sessions=${status}`, request.url),
    303
  );
}
