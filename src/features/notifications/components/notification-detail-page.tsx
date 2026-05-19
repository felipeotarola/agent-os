import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getNotificationById, type CockpitNotification } from '@/db/notifications';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { actionHref } from '../utils/store';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function statusVariant(status: CockpitNotification['status']) {
  if (status === 'unread') return 'default';
  if (status === 'archived') return 'secondary';
  return 'outline';
}

function kindIcon(kind: string) {
  if (kind === 'task') return '☑';
  if (kind === 'knowledge') return '◇';
  if (kind === 'memory') return '◎';
  if (kind === 'event') return '⟳';
  return '⚙';
}

function rawRows(notification: CockpitNotification) {
  return [
    ['id', notification.id],
    ['kind', notification.kind],
    ['status', notification.status],
    ['created', formatDate(notification.createdAt)],
    ['actions', String(notification.actions?.length ?? 0)]
  ];
}

export default async function NotificationDetailPage({ id }: { id: string }) {
  const notification = await getNotificationById(decodeURIComponent(id));
  if (!notification) notFound();

  return (
    <PageContainer
      pageTitle='Notification detail'
      pageDescription='Full context for this Agent OS signal.'
      pageHeaderAction={
        <Button asChild variant='outline'>
          <Link href='/dashboard/notifications'>← Back to notifications</Link>
        </Button>
      }
    >
      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'>
        <Card>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='flex min-w-0 items-start gap-3'>
                <div className='flex size-11 shrink-0 items-center justify-center rounded-2xl border bg-muted/40 text-xl'>
                  {kindIcon(notification.kind)}
                </div>
                <div className='min-w-0'>
                  <CardTitle className='text-2xl'>{notification.title}</CardTitle>
                  <CardDescription className='mt-1'>
                    {notification.kind} · {formatDate(notification.createdAt)}
                  </CardDescription>
                </div>
              </div>
              <Badge variant={statusVariant(notification.status)}>{notification.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='rounded-2xl border bg-muted/30 p-4'>
              <div className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                Message
              </div>
              <p className='whitespace-pre-line text-sm leading-6 text-card-foreground'>
                {notification.body}
              </p>
            </div>

            <div>
              <div className='mb-3 flex items-center gap-2'>
                <Icons.externalLink className='h-4 w-4 text-muted-foreground' />
                <h3 className='font-medium'>Actions</h3>
              </div>
              {notification.actions?.length ? (
                <div className='flex flex-wrap gap-2'>
                  {notification.actions.map((action) => (
                    <Button
                      key={action.id}
                      asChild
                      variant={action.style === 'danger' ? 'destructive' : 'outline'}
                    >
                      <Link href={actionHref(action.id, action.href)}>
                        {action.label}
                        <Icons.chevronRight className='ml-1 h-3.5 w-3.5' />
                      </Link>
                    </Button>
                  ))}
                </div>
              ) : (
                <div className='rounded-xl border border-dashed p-4 text-sm text-muted-foreground'>
                  No actions attached.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Raw context</CardTitle>
            <CardDescription>Useful when debugging routing or source data.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2 rounded-2xl border bg-muted/30 p-3 font-mono text-[11px] text-muted-foreground'>
              {rawRows(notification).map(([label, value]) => (
                <div key={label} className='grid grid-cols-[5rem_1fr] gap-2'>
                  <span className='uppercase tracking-wide'>{label}</span>
                  <span className='break-all'>{value}</span>
                </div>
              ))}
            </div>
            <Separator />
            <pre className='max-h-[420px] overflow-auto rounded-2xl border bg-background p-3 text-[11px] text-muted-foreground'>
              {JSON.stringify(notification, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
