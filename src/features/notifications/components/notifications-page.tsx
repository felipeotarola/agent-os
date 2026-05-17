import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { NotificationCard } from '@/components/ui/notification-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getNotifications, type CockpitNotification } from '@/db/notifications';

function renderList(items: CockpitNotification[]) {
  if (items.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-16'>
        <Icons.notification className='text-muted-foreground/40 mb-3 h-10 w-10' />
        <p className='text-muted-foreground text-sm'>No notifications</p>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-2'>
      {items.map((notification) => (
        <NotificationCard
          key={notification.id}
          id={notification.id}
          title={notification.title}
          body={notification.body}
          status={notification.status}
          createdAt={notification.createdAt}
          actions={notification.actions}
        />
      ))}
    </div>
  );
}

export default async function NotificationsPage() {
  const snapshot = await getNotifications();
  const notifications = snapshot.notifications;
  const unreadNotifications = notifications.filter(
    (notification) => notification.status === 'unread'
  );
  const readNotifications = notifications.filter((notification) => notification.status === 'read');

  return (
    <PageContainer
      pageTitle='Notifications'
      pageDescription='Relevant Agent OS signals from tasks, knowledge, memory and audit events.'
      pageHeaderAction={
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>{snapshot.source}</Badge>
          <Badge variant='secondary'>{snapshot.unreadCount} unread</Badge>
        </div>
      }
    >
      <Tabs defaultValue='all'>
        <TabsList>
          <TabsTrigger value='all'>All ({notifications.length})</TabsTrigger>
          <TabsTrigger value='unread'>Unread ({unreadNotifications.length})</TabsTrigger>
          <TabsTrigger value='read'>Read ({readNotifications.length})</TabsTrigger>
        </TabsList>
        <TabsContent value='all' className='mt-4'>
          {renderList(notifications)}
        </TabsContent>
        <TabsContent value='unread' className='mt-4'>
          {renderList(unreadNotifications)}
        </TabsContent>
        <TabsContent value='read' className='mt-4'>
          {renderList(readNotifications)}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
