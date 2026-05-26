import { bridgeRequest } from '@/lib/bridge';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/dashboard/knowledge?memory=use-form', request.url), 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const limit = Number(form.get('limit') ?? 20);
  const dryRun = form.get('dryRun') === 'on';

  try {
    await bridgeRequest('/knowledge/memory/harvest', {
      method: 'POST',
      body: JSON.stringify({ limit, dryRun })
    });
  } catch (error) {
    console.error('Memory harvest failed', error);
    return NextResponse.redirect(
      new URL('/dashboard/knowledge?error=memory-harvest', request.url),
      303
    );
  }

  const status = dryRun ? 'previewed' : 'harvested';
  return NextResponse.redirect(new URL(`/dashboard/knowledge?memory=${status}`, request.url), 303);
}
