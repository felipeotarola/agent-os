import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

type RadarSource = 'knowledge' | 'notifications' | 'observability' | 'runway' | 'github';
type RadarPriority = 'high' | 'medium' | 'low';

type TaskBoard = {
  columns?: Record<string, Array<{ title?: string; description?: string }>>;
};

const ALLOWED_SOURCES = new Set<RadarSource>([
  'knowledge',
  'notifications',
  'observability',
  'runway',
  'github'
]);
const ALLOWED_PRIORITIES = new Set<RadarPriority>(['high', 'medium', 'low']);

function clean(value: FormDataEntryValue | null, maxLength: number) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function normalizeSource(value: string): RadarSource | null {
  return ALLOWED_SOURCES.has(value as RadarSource) ? (value as RadarSource) : null;
}

function normalizePriority(value: string): RadarPriority {
  return ALLOWED_PRIORITIES.has(value as RadarPriority) ? (value as RadarPriority) : 'medium';
}

function redirectToRadar(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/dashboard/radar', request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

function radarSignalMarker(signalId: string) {
  return `Radar signal id: ${signalId}`;
}

function taskExistsForSignal(board: TaskBoard, title: string, signalId: string) {
  const marker = radarSignalMarker(signalId);
  return Object.values(board.columns ?? {})
    .flat()
    .some((task) => task.description?.includes(marker) || task.title === title);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const signalId = clean(formData.get('id'), 160);
  const signalTitle = clean(formData.get('title'), 240);
  const detail = clean(formData.get('detail'), 2_000);
  const source = normalizeSource(clean(formData.get('source'), 40));
  const priority = normalizePriority(clean(formData.get('priority'), 40));
  const href = clean(formData.get('href'), 500);
  const meta = clean(formData.get('meta'), 1_000);

  if (!signalId || !signalTitle || !source) {
    return redirectToRadar(request, { task: 'error', reason: 'invalid-signal' });
  }

  const title = `Follow up: ${signalTitle}`;
  const description = [
    'Created from Inbox Radar.',
    radarSignalMarker(signalId),
    `Radar source: ${source}`,
    detail ? `Detail: ${detail}` : null,
    href ? `Href: ${href}` : null,
    meta ? `Meta: ${meta}` : null
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const board = await bridgeRequest<TaskBoard>('/tasks');
    if (taskExistsForSignal(board, title, signalId)) {
      return redirectToRadar(request, { task: 'duplicate' });
    }

    await bridgeRequest('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        priority,
        ownerAgentId: 'cai',
        projectId: 'agent-os',
        status: 'backlog'
      })
    });

    return redirectToRadar(request, { task: 'created' });
  } catch (error) {
    console.error('Radar create-task failed', error);
    return redirectToRadar(request, { task: 'error', reason: 'bridge' });
  }
}
