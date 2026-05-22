import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  contentPlatforms,
  contentStatuses,
  getContentStudioSnapshot,
  type ContentItem,
  type ContentPlatform,
  type ContentStatus
} from '@/db/content';

export const metadata = {
  title: 'Agent OS: Content Studio'
};

type ContentView = 'active' | ContentStatus | 'all';

const platformLabels: Record<ContentPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube_shorts: 'YouTube Shorts',
  youtube_longform: 'YouTube Longform',
  x: 'X',
  facebook: 'Facebook'
};

const statusLabels: Record<ContentStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  scheduled: 'Scheduled',
  posted: 'Posted',
  failed: 'Failed',
  archived: 'Archived'
};

function statusVariant(status: ContentStatus) {
  if (status === 'ready' || status === 'scheduled') return 'default' as const;
  if (status === 'failed') return 'destructive' as const;
  if (status === 'draft') return 'secondary' as const;
  return 'outline' as const;
}

function formatDate(value?: string | null) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function normalizeView(value?: string): ContentView {
  if (value === 'all' || value === 'active' || contentStatuses.includes(value as ContentStatus)) {
    return value as ContentView;
  }
  return 'active';
}

function matchesView(item: ContentItem, view: ContentView) {
  if (view === 'all') return true;
  if (view === 'active') return !['posted', 'archived'].includes(item.status);
  return item.status === view;
}

function statusCopy(params: {
  created?: string;
  error?: string;
  action?: string;
  launch?: string;
}) {
  if (params.created) return { variant: 'secondary' as const, text: 'Draft created' };
  if (params.action === 'mark-ready')
    return { variant: 'secondary' as const, text: 'Marked ready' };
  if (params.action === 'schedule')
    return { variant: 'secondary' as const, text: 'Scheduled for launch control' };
  if (params.action === 'archive') return { variant: 'secondary' as const, text: 'Archived' };
  if (params.launch === 'blocked')
    return { variant: 'outline' as const, text: 'Manual launch is intentionally disabled in V1' };
  if (params.error)
    return { variant: 'destructive' as const, text: `Content action failed: ${params.error}` };
  return null;
}

function ContentActions({ item }: { item: ContentItem }) {
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <form action='/api/content/items/action' method='post'>
        <input type='hidden' name='id' value={item.id} />
        <input type='hidden' name='action' value='mark-ready' />
        <Button type='submit' size='sm' variant='secondary' disabled={item.status === 'archived'}>
          Mark ready
        </Button>
      </form>
      <form
        action='/api/content/items/action'
        method='post'
        className='flex flex-wrap items-center gap-2'
      >
        <input type='hidden' name='id' value={item.id} />
        <input type='hidden' name='action' value='schedule' />
        <Input
          className='h-8 w-48'
          type='datetime-local'
          name='scheduleAt'
          aria-label={`Schedule ${item.title}`}
        />
        <Button type='submit' size='sm' variant='outline' disabled={item.status === 'archived'}>
          Schedule
        </Button>
      </form>
      <form action='/api/content/items/action' method='post'>
        <input type='hidden' name='id' value={item.id} />
        <input type='hidden' name='action' value='manual-launch' />
        <Button type='submit' size='sm' variant='outline'>
          Manual launch
        </Button>
      </form>
      <form action='/api/content/items/action' method='post'>
        <input type='hidden' name='id' value={item.id} />
        <input type='hidden' name='action' value='archive' />
        <Button type='submit' size='sm' variant='ghost'>
          Archive
        </Button>
      </form>
    </div>
  );
}

function ContentCard({ item }: { item: ContentItem }) {
  const variantPlatforms = item.variants.map((variant) => variant.platform);
  const missingMediaCount = item.variants.filter((variant) => !variant.mediaAssets?.length).length;

  return (
    <div className='rounded-2xl border bg-background/55 p-4 shadow-sm transition hover:border-primary/40 hover:bg-primary/5'>
      <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
        <div className='min-w-0 space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant={statusVariant(item.status)}>{statusLabels[item.status]}</Badge>
            <Badge variant='outline'>{item.campaign || 'sladdis'}</Badge>
            {item.pillar && <Badge variant='secondary'>{item.pillar}</Badge>}
            <Badge variant='outline'>{formatDate(item.scheduleAt)}</Badge>
          </div>
          <div>
            <div className='text-lg font-semibold'>{item.title}</div>
            {item.brief && <div className='text-muted-foreground mt-1 text-sm'>{item.brief}</div>}
          </div>
          <div className='flex flex-wrap gap-2'>
            {variantPlatforms.map((platform) => (
              <Badge key={platform} variant='outline'>
                {platformLabels[platform]}
              </Badge>
            ))}
          </div>
          <div className='text-muted-foreground text-xs'>
            {item.mediaAssets.length} media asset{item.mediaAssets.length === 1 ? '' : 's'} prepared
            · {missingMediaCount} platform variant{missingMediaCount === 1 ? '' : 's'} still need
            media mapping
          </div>
        </div>
        <ContentActions item={item} />
      </div>
    </div>
  );
}

export default async function ContentStudioPage({
  searchParams
}: {
  searchParams: Promise<{
    view?: string;
    created?: string;
    error?: string;
    action?: string;
    launch?: string;
  }>;
}) {
  const [snapshot, params] = await Promise.all([getContentStudioSnapshot(), searchParams]);
  const selectedView = normalizeView(params.view);
  const visibleItems = snapshot.items.filter((item) => matchesView(item, selectedView));
  const status = statusCopy(params);

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='relative overflow-hidden rounded-3xl border bg-card p-6 shadow-sm'>
          <div className='absolute inset-y-0 right-0 hidden w-1/2 rounded-l-full bg-primary/10 blur-3xl lg:block' />
          <div className='relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
            <div className='space-y-3'>
              <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
                sladdis content pipeline · prepare only
              </Badge>
              <div>
                <h1 className='text-3xl font-semibold tracking-tight md:text-5xl'>
                  Content Studio
                </h1>
                <p className='text-muted-foreground mt-2 max-w-3xl text-sm md:text-base'>
                  Draft, adapt and schedule Sladdis content across Instagram, TikTok and YouTube. V1
                  stores metadata in Postgres and can upload source images through Supabase Edge
                  Functions. No external autopublish runs here.
                </p>
              </div>
            </div>
            <div className='grid grid-cols-3 gap-2 rounded-2xl border bg-background/70 p-3 text-center text-sm backdrop-blur md:grid-cols-6'>
              {contentStatuses.map((contentStatus) => (
                <div key={contentStatus}>
                  <div className='text-muted-foreground text-xs'>{statusLabels[contentStatus]}</div>
                  <div className='text-2xl font-semibold'>{snapshot.counts[contentStatus]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {status && <Badge variant={status.variant}>{status.text}</Badge>}

        <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]'>
          <div className='space-y-4'>
            <div className='flex flex-wrap gap-2'>
              {(['active', 'all', ...contentStatuses] as ContentView[]).map((view) => (
                <Button
                  key={view}
                  asChild
                  size='sm'
                  variant={selectedView === view ? 'default' : 'outline'}
                >
                  <a href={`/dashboard/content-studio?view=${view}`}>
                    {view === 'active' ? 'Active' : view === 'all' ? 'All' : statusLabels[view]}
                  </a>
                </Button>
              ))}
            </div>
            {visibleItems.length ? (
              <div className='space-y-3'>
                {visibleItems.map((item) => (
                  <ContentCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No content items yet</CardTitle>
                  <CardDescription>Create a draft to start the Sladdis pipeline.</CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>New draft</CardTitle>
              <CardDescription>
                Creates DB rows only. Media upload and posting are intentionally deferred.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action='/api/content/items'
                method='post'
                encType='multipart/form-data'
                className='space-y-4'
              >
                <div className='space-y-2'>
                  <label className='text-sm font-medium' htmlFor='title'>
                    Title
                  </label>
                  <Input
                    id='title'
                    name='title'
                    placeholder='e.g. Why Sladdis matters in 20 seconds'
                    required
                  />
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium' htmlFor='brief'>
                    Brief
                  </label>
                  <Textarea
                    id='brief'
                    name='brief'
                    placeholder='Hook, angle, source notes, asset needs…'
                  />
                </div>
                <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-1'>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium' htmlFor='pillar'>
                      Pillar
                    </label>
                    <Input id='pillar' name='pillar' placeholder='education, launch, proof…' />
                  </div>
                  <div className='space-y-2'>
                    <label className='text-sm font-medium' htmlFor='campaign'>
                      Campaign
                    </label>
                    <Input id='campaign' name='campaign' defaultValue='sladdis' />
                  </div>
                </div>
                <div className='space-y-2'>
                  <div className='text-sm font-medium'>Platforms</div>
                  <div className='grid gap-2'>
                    {contentPlatforms.map((platform) => (
                      <label key={platform} className='flex items-center gap-2 text-sm'>
                        <input
                          type='checkbox'
                          name='platforms'
                          value={platform}
                          defaultChecked={['instagram', 'tiktok', 'youtube_shorts'].includes(
                            platform
                          )}
                        />
                        {platformLabels[platform]}
                      </label>
                    ))}
                  </div>
                </div>
                <div className='space-y-2'>
                  <label className='text-sm font-medium' htmlFor='media'>
                    Source images
                  </label>
                  <Input id='media' name='media' type='file' accept='image/*' multiple />
                  <p className='text-muted-foreground text-xs'>
                    Images are uploaded through the Sladdis Supabase Edge Function when configured.
                    Videos and autopublish are still intentionally out of scope for V1.
                  </p>
                </div>
                <input type='hidden' name='ownerAgentId' value='sladdis' />
                <Button type='submit' className='w-full'>
                  Create draft
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
