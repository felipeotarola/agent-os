import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getGitHubSignals } from '@/db/external-signals';

export const metadata = {
  title: 'Agent OS: GitHub Signals'
};

function statusVariant(ok: boolean) {
  return ok ? ('default' as const) : ('outline' as const);
}

export default async function GitHubPage() {
  const snapshot = await getGitHubSignals();
  const unread = snapshot.notifications.filter((notification) => notification.unread);
  const openPulls = snapshot.pullRequests.filter((pull) => pull.state === 'open');

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              read-only signal connector
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>GitHub Signals</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              GitHub-lagret för Agent OS: konto, token-readiness, notifications och öppna PRs. V1 är
              read-only och gör inga repo-actions.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Source</div>
            <div className='font-mono'>{snapshot.source}</div>
            <div className='text-muted-foreground mt-2 text-xs'>
              {new Date(snapshot.generatedAt).toLocaleString('sv-SE')}
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Configured</CardDescription>
              <CardTitle className='text-3xl'>{snapshot.configured ? 'yes' : 'no'}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>Bridge env only</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Connected</CardDescription>
              <CardTitle className='text-3xl'>{snapshot.connected ? 'yes' : 'no'}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>GitHub API read</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Unread</CardDescription>
              <CardTitle className='text-3xl'>{unread.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              GitHub notifications
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Open PRs</CardDescription>
              <CardTitle className='text-3xl'>{openPulls.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Configured repo filter
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Open pull requests</CardTitle>
              <CardDescription>Read-only list from the configured repo filter.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.pullRequests.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  No open PRs visible for the configured repo filter.
                </div>
              ) : (
                snapshot.pullRequests.map((pull) => (
                  <div key={pull.id} className='rounded-xl border bg-background/40 p-4'>
                    <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                      <div className='min-w-0'>
                        <div className='line-clamp-1 font-medium'>
                          #{pull.number} · {pull.title}
                        </div>
                        <div className='text-muted-foreground mt-1 text-sm'>
                          {pull.author} · {pull.draft ? 'draft' : pull.state} · updated{' '}
                          {pull.updatedAt
                            ? new Date(pull.updatedAt).toLocaleString('sv-SE')
                            : 'unknown'}
                        </div>
                        {pull.htmlUrl && (
                          <div className='text-muted-foreground mt-2 line-clamp-1 font-mono text-[11px]'>
                            {pull.htmlUrl}
                          </div>
                        )}
                      </div>
                      <Badge variant={pull.draft ? 'outline' : 'default'}>
                        {pull.draft ? 'draft' : pull.state}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connector checks</CardTitle>
              <CardDescription>
                Partial-ready is okay: PR/repo reads can work even if notifications scope is
                missing.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.checks.map((check) => (
                <div key={check.id} className='rounded-xl border bg-background/40 p-4'>
                  <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                    <div>
                      <div className='font-medium'>{check.label}</div>
                      <div className='text-muted-foreground mt-1 text-sm'>{check.detail}</div>
                    </div>
                    <Badge variant={statusVariant(check.ok)}>{check.ok ? 'ok' : 'warning'}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Unread GitHub notifications when token scope allows it.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.notifications.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  No notifications visible. If the connector check warns, the token likely lacks
                  notification access.
                </div>
              ) : (
                snapshot.notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className='rounded-xl border bg-background/40 p-4 text-sm'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <div className='font-medium'>{notification.title}</div>
                        <div className='text-muted-foreground mt-1'>
                          {notification.repository} · {notification.reason} · {notification.type}
                        </div>
                      </div>
                      <Badge variant={notification.unread ? 'default' : 'outline'}>
                        {notification.unread ? 'unread' : 'read'}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Safe contract</CardTitle>
              <CardDescription>Vad GitHub V1 får göra.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              {[
                'Read-only metadata, notifications and PRs.',
                'No comments, issue edits, merges or workflow actions.',
                'No token values in UI or docs.',
                'Repo allowlist/filter before future write actions.',
                'Radar consumes warnings instead of hiding partial failures.'
              ].map((rule) => (
                <div key={rule} className='rounded-xl border bg-background/40 p-3'>
                  {rule}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {snapshot.alerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
              <CardDescription>Connector warnings from the latest snapshot.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {snapshot.alerts.map((alert) => (
                <div
                  key={`${alert.title}-${alert.detail}`}
                  className='rounded-xl border bg-background/40 p-4 text-sm'
                >
                  <div className='font-medium'>{alert.title}</div>
                  <div className='text-muted-foreground mt-1'>{alert.detail}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
