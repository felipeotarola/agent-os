import { getNotifications } from '@/db/notifications';
import { getCalendarSignals, getGitHubSignals, getGmailSignals } from '@/db/external-signals';
import { getSupabaseSnapshot } from '@/db/supabase';
import { getVercelSnapshot } from '@/db/vercel';
import { getActionCenterSnapshot } from '@/lib/action-center';
import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { getRunwaySnapshot } from '@/lib/runway';
import { z } from 'zod';

const radarSignalStateSchema = z.object({
  id: z.string(),
  status: z.string(),
  snoozedUntil: z.string().nullable(),
  updatedAt: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const radarSignalStateSnapshotSchema = z.object({
  states: z.array(radarSignalStateSchema),
  source: z.string()
});

const radarSignalSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  source: z.enum(['tasks', 'knowledge', 'notifications', 'observability', 'runway', 'github']),
  kind: z.enum(['signal', 'review', 'approval', 'draft', 'handoff', 'task']),
  priority: z.enum(['high', 'medium', 'low']),
  href: z.string(),
  actionLabel: z.string(),
  meta: z.string().optional()
});

const radarSnapshotSchema = z.object({
  generatedAt: z.string(),
  source: z.string(),
  stateSource: z.string(),
  counts: z.object({
    total: z.number(),
    high: z.number(),
    tasks: z.number(),
    knowledge: z.number(),
    notifications: z.number(),
    observability: z.number(),
    runway: z.number(),
    github: z.number(),
    review: z.number(),
    approvals: z.number(),
    tasksKind: z.number(),
    signalsKind: z.number()
  }),
  signals: z.array(radarSignalSchema),
  sourceErrors: z.array(z.string()),
  recommendation: radarSignalSchema
});

export type RadarSignalState = z.infer<typeof radarSignalStateSchema>;
export type RadarSignal = z.infer<typeof radarSignalSchema>;
export type RadarSnapshot = z.infer<typeof radarSnapshotSchema>;

const priorityWeight = { high: 0, medium: 1, low: 2 } as const;

function priorityFromAction(priority: string): RadarSignal['priority'] {
  if (priority === 'high') return 'high';
  if (priority === 'low') return 'low';
  return 'medium';
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error';
}

async function getRadarSignalStates() {
  if (!hasBridge()) {
    return {
      states: [] as RadarSignalState[],
      source: 'bridge:not-configured',
      error: null as string | null
    };
  }

  try {
    const snapshot = radarSignalStateSnapshotSchema.parse(await bridgeRequest('/radar/state'));
    return { states: snapshot.states, source: snapshot.source, error: null as string | null };
  } catch (error) {
    return { states: [] as RadarSignalState[], source: 'bridge:error', error: safeMessage(error) };
  }
}

function isSignalHidden(signal: RadarSignal, states: Map<string, RadarSignalState>) {
  const state = states.get(signal.id);
  if (!state) return false;
  if (state.status === 'handled' || state.status === 'dismissed') return true;
  if (state.snoozedUntil) {
    const snoozedUntil = new Date(state.snoozedUntil).getTime();
    return Number.isFinite(snoozedUntil) && snoozedUntil > Date.now();
  }
  return false;
}

export async function getRadarSnapshot(): Promise<RadarSnapshot> {
  const [
    actionCenterResult,
    notificationsResult,
    supabaseResult,
    vercelResult,
    gmailResult,
    calendarResult,
    githubResult,
    radarStateResult
  ] = await Promise.allSettled([
    getActionCenterSnapshot(),
    getNotifications(),
    getSupabaseSnapshot(),
    getVercelSnapshot(),
    getGmailSignals(),
    getCalendarSignals(),
    getGitHubSignals(),
    getRadarSignalStates()
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
        kind: item.kind === 'knowledge' ? 'review' : 'task',
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
        kind: unread ? 'review' : 'signal',
        priority: unread ? 'high' : 'low',
        href: `/dashboard/notifications/${notification.id}`,
        actionLabel: unread ? 'Review notification' : 'Open',
        meta: `${notification.kind} · ${notification.status}`
      });
    }
  } else {
    sourceErrors.push(`Notifications: ${safeMessage(notificationsResult.reason)}`);
  }

  if (gmailResult.status === 'fulfilled') {
    for (const candidate of gmailResult.value.candidates
      .filter((item) => item.score >= 55 && !item.saved)
      .slice(0, 5)) {
      signals.push({
        id: `gmail:${candidate.threadId}`,
        title: candidate.title,
        detail: `${candidate.from} · ${candidate.snippet}`,
        source: 'notifications',
        kind: 'review',
        priority: candidate.score >= 70 ? 'high' : 'medium',
        href: '/dashboard/mail-radar',
        actionLabel: 'Open mail radar',
        meta: `Gmail · score ${candidate.score} · ${candidate.reasons.join(', ')}`
      });
    }
  } else {
    sourceErrors.push(`Gmail: ${safeMessage(gmailResult.reason)}`);
  }

  if (calendarResult.status === 'fulfilled') {
    const calendar = calendarResult.value;
    if (!calendar.connected) {
      signals.push({
        id: 'calendar:degraded',
        title: 'Calendar signals not connected',
        detail: calendar.alerts[0]?.detail ?? 'Calendar read scope is missing or unavailable.',
        source: 'notifications',
        kind: 'signal',
        priority: calendar.configured ? 'medium' : 'low',
        href: '/dashboard/radar',
        actionLabel: 'Review connector',
        meta: calendar.source
      });
    }
    for (const event of calendar.events.slice(0, 5)) {
      const start = new Date(event.start).getTime();
      const hoursAway = Number.isFinite(start) ? (start - Date.now()) / (60 * 60 * 1000) : 999;
      if (hoursAway < -1 || hoursAway > 48) continue;
      signals.push({
        id: `calendar:${event.id}`,
        title: event.title,
        detail: `${event.start ? new Date(event.start).toLocaleString('sv-SE') : 'unknown time'} · ${event.attendees} attendees`,
        source: 'notifications',
        kind: hoursAway <= 4 ? 'review' : 'signal',
        priority: hoursAway <= 4 ? 'high' : 'medium',
        href: '/dashboard/radar',
        actionLabel: 'Open calendar',
        meta: `Calendar · ${event.status}`
      });
    }
  } else {
    sourceErrors.push(`Calendar: ${safeMessage(calendarResult.reason)}`);
  }

  if (githubResult.status === 'fulfilled') {
    const github = githubResult.value;
    if (!github.connected) {
      signals.push({
        id: 'github:degraded',
        title: 'GitHub signals not connected',
        detail: github.alerts[0]?.detail ?? 'GitHub token is missing or read failed.',
        source: 'notifications',
        kind: 'signal',
        priority: github.configured ? 'medium' : 'low',
        href: '/dashboard/github',
        actionLabel: 'Review connector',
        meta: github.source
      });
    }
    for (const notification of github.notifications.filter((item) => item.unread).slice(0, 5)) {
      signals.push({
        id: `github:notification:${notification.id}`,
        title: notification.title,
        detail: `${notification.repository} · ${notification.reason}`,
        source: 'notifications',
        kind: notification.reason === 'mention' ? 'review' : 'signal',
        priority: notification.reason === 'mention' ? 'high' : 'medium',
        href: '/dashboard/github',
        actionLabel: 'Open GitHub',
        meta: `GitHub · ${notification.type}`
      });
    }
    for (const pull of github.pullRequests.filter((item) => !item.draft).slice(0, 3)) {
      signals.push({
        id: `github:pr:${pull.id}`,
        title: pull.title,
        detail: `#${pull.number} by ${pull.author} · updated ${pull.updatedAt ? new Date(pull.updatedAt).toLocaleDateString('sv-SE') : 'unknown'}`,
        source: 'github',
        kind: 'review',
        priority: 'medium',
        href: '/dashboard/github',
        actionLabel: 'Open GitHub',
        meta: 'GitHub PR'
      });
    }
  } else {
    sourceErrors.push(`GitHub: ${safeMessage(githubResult.reason)}`);
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
        kind: 'signal',
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
        kind: alert.severity === 'error' ? 'review' : 'signal',
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
        kind: 'signal',
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
        kind: alert.severity === 'error' ? 'review' : 'signal',
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
      kind: 'approval',
      priority: 'high',
      href: '/dashboard/runway',
      actionLabel: 'Open runway',
      meta: runway.source
    });
  }

  const radarState =
    radarStateResult.status === 'fulfilled'
      ? radarStateResult.value
      : {
          states: [] as RadarSignalState[],
          source: 'bridge:error',
          error: safeMessage(radarStateResult.reason)
        };
  if (radarState.error) sourceErrors.push(`Radar state: ${radarState.error}`);

  const activeSignalStates = new Map(radarState.states.map((state) => [state.id, state]));
  const deduped = Array.from(new Map(signals.map((signal) => [signal.id, signal])).values())
    .filter((signal) => !isSignalHidden(signal, activeSignalStates))
    .toSorted((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority])
    .slice(0, 32);

  return radarSnapshotSchema.parse({
    generatedAt: new Date().toISOString(),
    source: 'agent-os:radar-v1',
    stateSource: radarState.source,
    counts: {
      total: deduped.length,
      high: deduped.filter((signal) => signal.priority === 'high').length,
      tasks: deduped.filter((signal) => signal.source === 'tasks').length,
      knowledge: deduped.filter((signal) => signal.source === 'knowledge').length,
      notifications: deduped.filter((signal) => signal.source === 'notifications').length,
      observability: deduped.filter((signal) => signal.source === 'observability').length,
      runway: deduped.filter((signal) => signal.source === 'runway').length,
      github: deduped.filter((signal) => signal.source === 'github').length,
      review: deduped.filter((signal) => signal.kind === 'review').length,
      approvals: deduped.filter((signal) => signal.kind === 'approval').length,
      tasksKind: deduped.filter((signal) => signal.kind === 'task').length,
      signalsKind: deduped.filter((signal) => signal.kind === 'signal').length
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
        kind: 'signal' as const,
        priority: 'low' as const,
        href: '/dashboard/overview',
        actionLabel: 'Open cockpit'
      }
  });
}
