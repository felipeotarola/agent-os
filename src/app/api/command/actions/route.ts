import { bridgeRequest } from '@/lib/bridge';
import { NextResponse, type NextRequest } from 'next/server';

type GuardedAction = 'harvest-session-decisions';

const allowedActions = new Set<GuardedAction>(['harvest-session-decisions']);

function redirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/dashboard/command', request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get('action') ?? '').trim() as GuardedAction;
  const confirm = String(form.get('confirm') ?? '') === 'on';

  if (!allowedActions.has(action)) {
    return redirect(request, { action: 'unsupported', status: 'error' });
  }

  if (!confirm) {
    return redirect(request, { action, status: 'confirm-required' });
  }

  if (action === 'harvest-session-decisions') {
    const limit = Math.min(Number(form.get('limit') ?? 5), 20);
    const minScore = Math.max(Number(form.get('minScore') ?? 35), 1);
    const signalsPerSession = Math.min(Math.max(Number(form.get('signalsPerSession') ?? 8), 1), 12);

    await bridgeRequest('/knowledge/sessions/harvest', {
      method: 'POST',
      body: JSON.stringify({ limit, minScore, signalsPerSession, dryRun: false })
    });

    return redirect(request, { action, status: 'ok' });
  }

  return redirect(request, { action, status: 'error' });
}
