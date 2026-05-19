import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

const allowed = new Set(['handled', 'dismissed', 'snooze', 'reset']);

function redirectToRadar(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/dashboard/radar', request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

function snooze24hIso() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const id = String(formData.get('id') ?? '').trim();
  const action = String(formData.get('action') ?? '').trim();

  if (!id || !allowed.has(action)) {
    return redirectToRadar(request, { error: 'missing-radar-action' });
  }

  if (!hasBridge()) {
    return redirectToRadar(request, { error: 'radar-state-unavailable' });
  }

  try {
    await bridgeRequest('/radar/signals/transition', {
      method: 'POST',
      body: JSON.stringify({
        id,
        action,
        snoozedUntil: action === 'snooze' ? snooze24hIso() : undefined
      })
    });
    return redirectToRadar(request, { radar: action });
  } catch {
    return redirectToRadar(request, { error: 'radar-state-failed' });
  }
}
