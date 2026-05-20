import { bridgeRequest, hasBridge } from '@/lib/bridge';
import type { NotificationAction, NotificationStatus } from '@/components/ui/notification-card';
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

export async function getNotifications(): Promise<NotificationSnapshot> {
  if (!hasBridge()) return emptySnapshot;
  try {
    return notificationSnapshotSchema.parse(await bridgeRequest('/notifications'));
  } catch (error) {
    console.error('Notifications bridge request failed', error);
    return emptySnapshot;
  }
}

export async function getNotificationById(id: string): Promise<CockpitNotification | null> {
  const snapshot = await getNotifications();
  return snapshot.notifications.find((notification) => notification.id === id) ?? null;
}
