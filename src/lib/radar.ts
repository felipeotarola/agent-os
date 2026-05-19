import { getNotifications } from '@/db/notifications';
import { getSupabaseSnapshot } from '@/db/supabase';
import { getVercelSnapshot } from '@/db/vercel';
import { getActionCenterSnapshot } from '@/lib/action-center';
import { getRunwaySnapshot } from '@/lib/runway';

export type RadarSignal = {
  id: string;
  title: string;
  detail: string;
  source: 'tasks' | 'knowledge' | 'notifications' | 'observability' | 'runway';
  priority: 'high' | 'medium' | 'low';
  href: string;
  actionLabel: string;
  meta?: string;
};

const priorityWeight = { high: 0, medium: 1, low: 2 } as const;

function priorityFromAction(priority: string): RadarSignal['priority'] {
  if (priority === 'high') return 'high';
  if (priority === 'low') return 'low';
  return 'medium';
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error';
}

export async function getRadarSnapshot() {
  const [actionCenterResult, notificationsResult, supabaseResult, vercelResult] =
    await Promise.allSettled([
      getActionCenterSnapshot(),
      getNotifications(),
      getSupabaseSnapshot(),
      getVercelSnapshot()
    ]);
  const runway = getRunwaySnapshot();
  const signals: RadarSignal[] = [];
  const sourceErrors: string[] = [];

  if (actionCenterResult.status === 'fulfilled') {
    for (const item of actionCenterResult.value.items.slice(0, 10)) {
      signals.push({
        id: `action:${item.id}`,
        title: item.title,
        detail: item.detail,
        source: item.kind === 'knowledge' ? 'knowledge' : 'tasks',
        priority: priorityFromAction(item.priority),
        href: item.href,
        actionLabel: item.primaryLabel,
        meta: item.meta
      });
    }
  } else {
    sourceErrors.push(`Action Center: ${safeMessage(actionCenterResult.reason)}`);
  }

  if (notificationsResult.status === 'fulfilled') {
    for (const notification of notificationsResult.value.notifications.slice(0, 8)) {
      const unread = notification.status !== 'read';
      signals.push({
        id: `notification:${notification.id}`,
        title: notification.title,
        detail: notification.body,
        source: 'notifications',
        priority: unread ? 'high' : 'low',
        href: `/dashboard/notifications/${notification.id}`,
        actionLabel: unread ? 'Review notification' : 'Open',
        meta: `${notification.kind} · ${notification.status}`
      });
    }
  } else {
    sourceErrors.push(`Notifications: ${safeMessage(notificationsResult.reason)}`);
  }

  if (supabaseResult.status === 'fulfilled') {
    const supabase = supabaseResult.value;
    if (!supabase.connected) {
      signals.push({
        id: 'observability:supabase-degraded',
        title: 'Supabase observability not connected',
        detail:
          supabase.alerts[0]?.detail ??
          'Connector is configured as degraded or missing environment.',
        source: 'observability',
        priority: supabase.configured ? 'medium' : 'low',
        href: '/dashboard/supabase',
        actionLabel: 'Open Supabase',
        meta: supabase.source
      });
    }
    for (const alert of supabase.alerts.slice(0, 3)) {
      signals.push({
        id: `observability:supabase:${alert.title}`,
        title: alert.title,
        detail: alert.detail,
        source: 'observability',
        priority: alert.severity === 'error' ? 'high' : 'medium',
        href: '/dashboard/supabase',
        actionLabel: 'Inspect',
        meta: 'Supabase'
      });
    }
  } else {
    sourceErrors.push(`Supabase: ${safeMessage(supabaseResult.reason)}`);
  }

  if (vercelResult.status === 'fulfilled') {
    const vercel = vercelResult.value;
    if (!vercel.connected) {
      signals.push({
        id: 'observability:vercel-degraded',
        title: 'Vercel observability not connected',
        detail:
          vercel.alerts[0]?.detail ?? 'Connector is configured as degraded or missing environment.',
        source: 'observability',
        priority: vercel.configured ? 'medium' : 'low',
        href: '/dashboard/vercel',
        actionLabel: 'Open Vercel',
        meta: vercel.source
      });
    }
    for (const alert of vercel.alerts.slice(0, 3)) {
      signals.push({
        id: `observability:vercel:${alert.title}:${alert.detail}`,
        title: alert.title,
        detail: alert.detail,
        source: 'observability',
        priority: alert.severity === 'error' ? 'high' : 'medium',
        href: '/dashboard/vercel',
        actionLabel: 'Inspect',
        meta: 'Vercel'
      });
    }
  } else {
    sourceErrors.push(`Vercel: ${safeMessage(vercelResult.reason)}`);
  }

  if (runway.posture === 'urgent') {
    signals.push({
      id: 'runway:urgent',
      title: 'Runway needs active attention',
      detail: runway.nextSevenDays[0] ?? 'Use the runway plan to pick the next income action.',
      source: 'runway',
      priority: 'high',
      href: '/dashboard/runway',
      actionLabel: 'Open runway',
      meta: runway.source
    });
  }

  const deduped = Array.from(new Map(signals.map((signal) => [signal.id, signal])).values())
    .toSorted((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority])
    .slice(0, 32);

  return {
    generatedAt: new Date().toISOString(),
    source: 'agent-os:radar-v1',
    counts: {
      total: deduped.length,
      high: deduped.filter((signal) => signal.priority === 'high').length,
      tasks: deduped.filter((signal) => signal.source === 'tasks').length,
      knowledge: deduped.filter((signal) => signal.source === 'knowledge').length,
      notifications: deduped.filter((signal) => signal.source === 'notifications').length,
      observability: deduped.filter((signal) => signal.source === 'observability').length,
      runway: deduped.filter((signal) => signal.source === 'runway').length
    },
    signals: deduped,
    sourceErrors,
    recommendation: deduped.find((signal) => signal.priority === 'high') ??
      deduped[0] ?? {
        id: 'radar:empty',
        title: 'Nothing urgent in radar',
        detail:
          'No high-priority signals from tasks, knowledge, notifications, observability or runway.',
        source: 'tasks' as const,
        priority: 'low' as const,
        href: '/dashboard/overview',
        actionLabel: 'Open cockpit'
      }
  };
}

export type RadarSnapshot = Awaited<ReturnType<typeof getRadarSnapshot>>;
