import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const priority = String(formData.get('priority') ?? 'medium');
  const ownerAgentId = String(formData.get('ownerAgentId') ?? 'cai');
  const projectId = String(formData.get('projectId') ?? 'agent-os');

  if (!title) {
    return NextResponse.redirect(new URL('/dashboard/kanban?error=missing', request.url), 303);
  }

  await bridgeRequest('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title,
      description,
      priority,
      ownerAgentId,
      projectId,
      status: 'backlog'
    })
  });

  return NextResponse.redirect(new URL('/dashboard/kanban?created=1', request.url), 303);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeRequest('/tasks', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
