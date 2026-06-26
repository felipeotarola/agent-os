import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

function redirectToBoard(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/dashboard/kanban/rnd-loops', request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const theme = String(formData.get('theme') ?? '').trim();
  if (!theme) return redirectToBoard(request, { error: 'missing' });

  await bridgeRequest('/rnd-loops', {
    method: 'POST',
    body: JSON.stringify({
      theme,
      question: String(formData.get('question') ?? '').trim(),
      hypothesis: String(formData.get('hypothesis') ?? '').trim(),
      priority: String(formData.get('priority') ?? 'medium'),
      ownerAgentId: String(formData.get('ownerAgentId') ?? 'cai').trim() || 'cai',
      status: 'backlog',
      source: 'cockpit'
    })
  });

  return redirectToBoard(request, { created: '1' });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeRequest('/rnd-loops', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
