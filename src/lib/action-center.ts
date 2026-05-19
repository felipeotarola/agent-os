import { getKnowledgeSnapshot } from '@/db/knowledge';
import { getCaiBriefing } from '@/lib/briefing';

export type ActionCenterItem = {
  id: string;
  title: string;
  detail: string;
  kind: 'task' | 'knowledge' | 'agent' | 'system';
  priority: 'high' | 'medium' | 'low';
  href: string;
  primaryLabel: string;
  secondaryLabel?: string;
  meta?: string;
};

function priorityFromTask(priority: string): 'high' | 'medium' | 'low' {
  if (priority === 'high') return 'high';
  if (priority === 'low') return 'low';
  return 'medium';
}

function knowledgePriority(status: string): 'high' | 'medium' | 'low' {
  if (status === 'extracted') return 'high';
  if (status === 'wikified') return 'medium';
  return 'low';
}

function isSnoozedTask(task: { status: string; dueDate?: string | null }) {
  if (task.status !== 'waiting' || !task.dueDate) return false;
  const dueAt = new Date(task.dueDate).getTime();
  return Number.isFinite(dueAt) && dueAt > Date.now();
}

export async function getActionCenterSnapshot() {
  const [briefing, knowledge] = await Promise.all([getCaiBriefing(), getKnowledgeSnapshot()]);
  const items: ActionCenterItem[] = [];

  for (const group of briefing.dispatch.byAgent) {
    for (const task of group.tasks.slice(0, 3)) {
      if (isSnoozedTask(task)) continue;
      items.push({
        id: `task:${task.id}`,
        title: task.title,
        detail: `${group.emoji ? `${group.emoji} ` : ''}${group.agentName} väntar på beslut · ${task.status}${task.description ? ` · ${task.description.slice(0, 140)}` : ''}`,
        kind: 'task',
        priority: priorityFromTask(task.priority),
        href: '/dashboard/kanban',
        primaryLabel: task.status === 'review' ? 'Review task' : 'Open task',
        secondaryLabel: 'Defer',
        meta: `${task.priority} · ${task.projectName ?? 'Agent OS'}`
      });
    }
  }

  for (const source of knowledge.sources) {
    if (!['raw', 'extracted', 'wikified', 'reviewed'].includes(source.status)) continue;
    const label =
      source.status === 'raw'
        ? 'Extract'
        : source.status === 'extracted'
          ? 'Wikify'
          : source.status === 'wikified'
            ? 'Review'
            : 'Promote';
    items.push({
      id: `knowledge:${source.id}`,
      title: source.title,
      detail: `${source.kind} · ${source.summary || 'Needs review before it becomes trusted context.'}`,
      kind: 'knowledge',
      priority: knowledgePriority(source.status),
      href: '/dashboard/knowledge',
      primaryLabel: label,
      secondaryLabel: 'Archive',
      meta: source.status
    });
  }

  if (!briefing.latestMessage.latest) {
    items.push({
      id: 'system:no-cai-brief',
      title: 'Cai brief history missing',
      detail: 'No delivered morning/evening briefing could be read from cron history.',
      kind: 'system',
      priority: 'medium',
      href: '/dashboard/settings',
      primaryLabel: 'Check cron',
      meta: briefing.latestMessage.source
    });
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
  const sorted = items.toSorted((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      total: sorted.length,
      high: sorted.filter((item) => item.priority === 'high').length,
      knowledge: sorted.filter((item) => item.kind === 'knowledge').length,
      tasks: sorted.filter((item) => item.kind === 'task').length
    },
    items: sorted.slice(0, 24),
    liveActivity: briefing.cockpit.subagents,
    sources: {
      dispatch: 'bridge:dispatch-summary',
      knowledge: knowledge.dbOnline ? 'bridge/postgres:knowledge_sources' : 'fallback'
    }
  };
}

export type ActionCenterSnapshot = Awaited<ReturnType<typeof getActionCenterSnapshot>>;
