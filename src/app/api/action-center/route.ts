import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

type ActionKind = 'advance' | 'archive' | 'complete' | 'snooze' | 'dismiss';

const knowledgeAdvance: Record<string, { path: string; body: Record<string, string> }> = {
  raw: { path: '/knowledge/sources/extract', body: {} },
  extracted: { path: '/knowledge/sources/queue', body: {} },
  wikified: { path: '/knowledge/sources/transition', body: { status: 'reviewed' } },
  reviewed: { path: '/knowledge/sources/transition', body: { status: 'promoted' } }
};

function tomorrowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'cache-control': 'no-store' }
  });
}

function parseItemId(itemId: unknown) {
  const value = String(itemId ?? '').trim();
  const [kind, ...rest] = value.split(':');
  const id = rest.join(':');
  if (!kind || !id) return null;
  return { kind, id, itemId: value };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = parseItemId(body.itemId);
  const action = String(body.action ?? '').trim() as ActionKind;
  if (!parsed || !action) {
    return NextResponse.json({ error: 'itemId and action are required' }, { status: 400 });
  }

  if (action === 'dismiss') {
    return json({ ok: true, itemId: parsed.itemId, action, persistence: 'local' });
  }

  if (parsed.kind === 'task') {
    if (action === 'complete') {
      const task = await bridgeRequest('/tasks', {
        method: 'PATCH',
        body: JSON.stringify({ id: parsed.id, status: 'done' })
      });
      return json({ ok: true, itemId: parsed.itemId, action, persistence: 'task-status', task });
    }

    if (action === 'snooze') {
      const hiddenUntil = tomorrowIso();
      const task = await bridgeRequest('/tasks', {
        method: 'PATCH',
        body: JSON.stringify({ id: parsed.id, status: 'waiting', dueDate: hiddenUntil })
      });
      return json({
        ok: true,
        itemId: parsed.itemId,
        action,
        hiddenUntil,
        persistence: 'task-status-due-date',
        task
      });
    }
  }

  if (parsed.kind === 'knowledge') {
    if (action === 'archive') {
      const source = await bridgeRequest('/knowledge/sources/transition', {
        method: 'POST',
        body: JSON.stringify({ id: parsed.id, status: 'archived' })
      });
      return json({
        ok: true,
        itemId: parsed.itemId,
        action,
        persistence: 'knowledge-status',
        source
      });
    }

    if (action === 'advance') {
      const status = String(body.status ?? '').trim();
      const next = knowledgeAdvance[status];
      if (!next) {
        return NextResponse.json({ error: 'unsupported knowledge status' }, { status: 400 });
      }
      const source = await bridgeRequest(next.path, {
        method: 'POST',
        body: JSON.stringify({ id: parsed.id, ...next.body })
      });
      return json({
        ok: true,
        itemId: parsed.itemId,
        action,
        persistence: 'knowledge-status',
        source
      });
    }
  }

  return json({ error: 'unsupported action for item' }, 400);
}
