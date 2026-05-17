import { bridgeRequest, hasBridge } from '@/lib/bridge';
import type { NotificationAction, NotificationStatus } from '@/components/ui/notification-card';

export type CockpitNotification = {
  id: string;
  title: string;
  body: string;
  status: NotificationStatus;
  kind: string;
  createdAt: string;
  actions?: Array<NotificationAction & { href?: string }>;
};

export type NotificationSnapshot = {
  notifications: CockpitNotification[];
  unreadCount: number;
  generatedAt: string;
  source: string;
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
    return await bridgeRequest<NotificationSnapshot>('/notifications');
  } catch (error) {
    console.error('Notifications bridge request failed', error);
    return emptySnapshot;
  }
}
