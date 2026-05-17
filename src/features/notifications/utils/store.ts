import type { CockpitNotification } from '@/db/notifications';

export type Notification = CockpitNotification;

export function actionHref(actionId: string, fallback?: string) {
  const routes: Record<string, string> = {
    'open-tasks': '/dashboard/kanban',
    'open-knowledge': '/dashboard/knowledge',
    'open-command': '/dashboard/command',
    'open-overview': '/dashboard/overview'
  };
  return fallback ?? routes[actionId] ?? '/dashboard/overview';
}
