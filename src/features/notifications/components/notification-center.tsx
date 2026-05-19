'use client';

import { Icons } from '@/components/icons';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { NotificationCard } from '@/components/ui/notification-card';
import { useEffect, useState } from 'react';
import type { NotificationSnapshot } from '@/db/notifications';
import { actionHref } from '../utils/store';

const MAX_VISIBLE = 5;
const READ_STORAGE_KEY = 'agent-os.read-notifications';

const emptySnapshot: NotificationSnapshot = {
  notifications: [],
  unreadCount: 0,
  generatedAt: new Date().toISOString(),
  source: 'loading'
};

export function NotificationCenter() {
  const [snapshot, setSnapshot] = useState<NotificationSnapshot>(emptySnapshot);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(READ_STORAGE_KEY);
      if (stored) setReadIds(new Set(JSON.parse(stored)));
    } catch {
      // Local read state is a convenience only.
    }
  }, []);

  const updateReadIds = (next: Set<string>) => {
    setReadIds(next);
    try {
      window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...next].slice(-200)));
    } catch {
      // Ignore storage failures.
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notifications', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: NotificationSnapshot) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const notifications = snapshot.notifications.map((notification) =>
    readIds.has(notification.id) ? { ...notification, status: 'read' as const } : notification
  );
  const count = notifications.filter((notification) => notification.status === 'unread').length;
  const visibleNotifications = notifications.slice(0, MAX_VISIBLE);
  const markAsRead = (id: string) => updateReadIds(new Set([...readIds, id]));
  const markAllAsRead = () =>
    updateReadIds(new Set(notifications.map((notification) => notification.id)));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='relative h-8 w-8 rounded-full bg-transparent shadow-none hover:bg-transparent hover:text-foreground'
        >
          <Icons.notification className='h-4 w-4' />
          {count > 0 && (
            <span className='bg-destructive text-destructive-foreground absolute top-0 right-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-medium'>
              {count > 9 ? '9+' : count}
            </span>
          )}
          <span className='sr-only'>Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-[calc(100vw-2rem)] p-0 sm:w-[420px]' sideOffset={8}>
        <div className='flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
          <Link href='/dashboard/notifications' className='group flex min-w-0 items-center gap-1'>
            <h4 className='text-sm font-semibold group-hover:underline'>Notifications</h4>
            <Icons.chevronRight className='text-muted-foreground h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5' />
          </Link>
          <div className='flex flex-wrap items-center gap-2 sm:justify-end'>
            <span className='bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs'>
              {snapshot.source}
            </span>
            {count > 0 && (
              <Button
                variant='ghost'
                size='sm'
                className='text-muted-foreground h-auto max-w-full whitespace-normal px-2 py-1 text-left text-xs leading-snug'
                onClick={markAllAsRead}
              >
                Mark all as read
              </Button>
            )}
          </div>
        </div>
        <Separator />
        <ScrollArea className='h-[420px]'>
          {notifications.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12'>
              <Icons.notification className='text-muted-foreground/40 mb-2 h-8 w-8' />
              <p className='text-muted-foreground text-sm'>No relevant notifications</p>
            </div>
          ) : (
            <div className='flex flex-col gap-1 p-2 max-sm:gap-0 max-sm:px-4'>
              {visibleNotifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  id={notification.id}
                  title={notification.title}
                  body={notification.body}
                  status={notification.status}
                  createdAt={notification.createdAt}
                  actions={notification.actions}
                  detailHref={`/dashboard/notifications/${encodeURIComponent(notification.id)}`}
                  onMarkAsRead={markAsRead}
                  onAction={(notifId, actionId) => {
                    markAsRead(notifId);
                    window.location.href = actionHref(
                      actionId,
                      notification.actions?.find((action) => action.id === actionId)?.href
                    );
                  }}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
