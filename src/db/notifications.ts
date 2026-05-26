import { bridgeRequest, hasBridge } from '@/lib/bridge';
import type { NotificationAction, NotificationStatus } from '@/components/ui/notification-card';
import { getVercelSnapshot, type VercelDeployment } from './vercel';
import { z } from 'zod';

const notificationStatusSchema = z.enum(['unread', 'read', 'archived']);
const notificationActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['redirect', 'api_call', 'workflow', 'modal']),
  style: z.enum(['primary', 'danger', 'default']).optional(),
  executed: z.boolean().optional(),
  href: z.string().optional()
});

const cockpitNotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  status: notificationStatusSchema,
  kind: z.string(),
  createdAt: z.string(),
  actions: z.array(notificationActionSchema).optional()
});

const notificationSnapshotSchema = z.object({
  notifications: z.array(cockpitNotificationSchema),
  unreadCount: z.number(),
  generatedAt: z.string(),
  source: z.string()
});

export type CockpitNotification = z.infer<typeof cockpitNotificationSchema> & {
  status: NotificationStatus;
  actions?: Array<NotificationAction & { href?: string }>;
};

export type NotificationSnapshot = z.infer<typeof notificationSnapshotSchema> & {
  notifications: CockpitNotification[];
};

const emptySnapshot: NotificationSnapshot = {
  notifications: [],
  unreadCount: 0,
  generatedAt: new Date().toISOString(),
  source: 'fallback'
};

const activeDeploymentStates = new Set(['BUILDING', 'QUEUED', 'INITIALIZING', 'DEPLOYING']);
const failedDeploymentStates = new Set(['ERROR', 'CANCELED']);

function buildAction(
  id: string,
  label: string,
  href: string
): NotificationAction & { href: string } {
  return { id, label, type: 'redirect', style: 'primary', href };
}

function buildNotificationStatus(deployment: VercelDeployment): NotificationStatus {
  const state = deployment.state.toUpperCase();
  return activeDeploymentStates.has(state) || failedDeploymentStates.has(state) ? 'unread' : 'read';
}

function buildNotificationTitle(deployment: VercelDeployment) {
  const state = deployment.state.toUpperCase();
  if (activeDeploymentStates.has(state)) return `Build ${state.toLowerCase()}`;
  if (failedDeploymentStates.has(state)) return `Build ${state.toLowerCase()}`;
  return `Latest build ${state.toLowerCase()}`;
}

function buildNotificationHref(deployment: VercelDeployment) {
  return deployment.inspectorUrl || deployment.url || '/dashboard/vercel';
}

async function withBuildNotifications(
  snapshot: NotificationSnapshot
): Promise<NotificationSnapshot> {
  const vercel = await getVercelSnapshot();
  const existingIds = new Set(snapshot.notifications.map((notification) => notification.id));
  const additions: CockpitNotification[] = [];

  if (vercel.connected) {
    const deployments = vercel.deployments.filter((deployment, index) => {
      const state = deployment.state.toUpperCase();
      return index === 0 || activeDeploymentStates.has(state) || failedDeploymentStates.has(state);
    });

    for (const deployment of deployments.slice(0, 5)) {
      const state = deployment.state.toUpperCase();
      const id = `build:${deployment.uid}:${state}`;
      if (existingIds.has(id)) continue;
      additions.push({
        id,
        title: buildNotificationTitle(deployment),
        body: `${deployment.name} · ${deployment.target ?? 'unknown target'}${deployment.url ? ` · ${deployment.url}` : ''}`,
        status: buildNotificationStatus(deployment),
        kind: 'build',
        createdAt: deployment.createdAt ?? vercel.generatedAt,
        actions: [buildAction('open-build', 'Open build', buildNotificationHref(deployment))]
      });
    }
  } else if (vercel.alerts.length) {
    const id = 'build:vercel-unavailable';
    if (!existingIds.has(id)) {
      additions.push({
        id,
        title: 'Build status unavailable',
        body: vercel.alerts[0]?.detail ?? 'Vercel deployment snapshot is unavailable.',
        status: 'unread',
        kind: 'build',
        createdAt: vercel.generatedAt,
        actions: [buildAction('open-vercel', 'Open Vercel', '/dashboard/vercel')]
      });
    }
  }

  const notifications = [...snapshot.notifications, ...additions].toSorted(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    ...snapshot,
    notifications,
    unreadCount: notifications.filter((notification) => notification.status === 'unread').length,
    source: additions.length ? `${snapshot.source}+vercel` : snapshot.source
  };
}

export async function getNotifications(): Promise<NotificationSnapshot> {
  if (!hasBridge()) return withBuildNotifications(emptySnapshot);
  try {
    return withBuildNotifications(
      notificationSnapshotSchema.parse(await bridgeRequest('/notifications'))
    );
  } catch (error) {
    console.error('Notifications bridge request failed', error);
    return withBuildNotifications(emptySnapshot);
  }
}

export async function getNotificationById(id: string): Promise<CockpitNotification | null> {
  const snapshot = await getNotifications();
  return snapshot.notifications.find((notification) => notification.id === id) ?? null;
}
