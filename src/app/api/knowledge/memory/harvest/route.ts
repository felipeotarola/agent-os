import { bridgeRequest } from '@/lib/bridge';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const limit = Number(form.get('limit') ?? 20);
  const dryRun = form.get('dryRun') === 'on';

  await bridgeRequest('/knowledge/memory/harvest', {
    method: 'POST',
    body: JSON.stringify({ limit, dryRun })
  });

  const status = dryRun ? 'previewed' : 'harvested';
  return NextResponse.redirect(new URL(`/dashboard/knowledge?memory=${status}`, request.url), 303);
}
