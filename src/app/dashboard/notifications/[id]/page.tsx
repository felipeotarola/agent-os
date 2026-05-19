import NotificationDetailPage from '@/features/notifications/components/notification-detail-page';

export const metadata = {
  title: 'Dashboard: Notification detail'
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NotificationDetailPage id={id} />;
}
