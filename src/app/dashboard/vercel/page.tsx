import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getVercelSnapshot } from '@/db/vercel';

export const metadata = {
  title: 'Agent OS: Vercel Observability'
};

function statusVariant(ok: boolean) {
  return ok ? ('default' as const) : ('outline' as const);
}

export default async function VercelPage() {
  const snapshot = await getVercelSnapshot();
  const failed = snapshot.deployments.filter((deployment) =>
    ['ERROR', 'CANCELED'].includes(deployment.state.toUpperCase())
  );

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              read-only connector
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
              Vercel Observability
            </h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Global Agent OS-vy för projekt, deployments och framtida analytics/log drains. V1 är
              server-side only, visar inga tokens och degraderar säkert utan config.
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
            <CardContent className='text-muted-foreground text-sm'>Vercel API read</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Projects</CardDescription>
              <CardTitle className='text-3xl'>{snapshot.projects.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Filtered visible projects
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Failed deploys</CardDescription>
              <CardTitle className='text-3xl'>{failed.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Recent ERROR/CANCELED
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Recent deployments</CardTitle>
              <CardDescription>
                Read-only Vercel deployment metadata. No logs or secrets in V1.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.deployments.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  No deployments visible yet. Configure VERCEL_ACCESS_TOKEN server-side to populate
                  this snapshot.
                </div>
              ) : (
                snapshot.deployments.map((deployment) => (
                  <div key={deployment.uid} className='rounded-xl border bg-background/40 p-4'>
                    <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                      <div className='min-w-0'>
                        <div className='line-clamp-1 font-medium'>{deployment.name}</div>
                        <div className='text-muted-foreground mt-1 text-xs'>
                          {deployment.target ?? 'unknown target'} ·{' '}
                          {deployment.createdAt
                            ? new Date(deployment.createdAt).toLocaleString('sv-SE')
                            : 'unknown time'}
                        </div>
                        {deployment.url && (
                          <div className='text-muted-foreground mt-2 line-clamp-1 font-mono text-[11px]'>
                            {deployment.url}
                          </div>
                        )}
                      </div>
                      <Badge variant={deployment.state === 'READY' ? 'default' : 'outline'}>
                        {deployment.state}
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
              <CardDescription>Vad V1 får och inte får göra.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              {[
                'Read-only projects/deployments first.',
                'No manual OAuth loops in UI.',
                'No Vercel tokens in browser, markdown or logs.',
                'Drains require signature verification before ingest.',
                'Analytics/logs need retention and redaction before alerts.'
              ].map((rule) => (
                <div key={rule} className='rounded-xl border bg-background/40 p-3'>
                  {rule}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Connector checks</CardTitle>
              <CardDescription>
                Readiness checks. Secret values are intentionally hidden.
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
                    <Badge variant={statusVariant(check.ok)}>{check.ok ? 'ok' : 'missing'}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                Visible Vercel projects from the configured token scope.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.projects.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  No projects in snapshot.
                </div>
              ) : (
                snapshot.projects.map((project) => (
                  <div key={project.id} className='rounded-xl border bg-background/40 p-4 text-sm'>
                    <div className='font-medium'>{project.name}</div>
                    <div className='text-muted-foreground mt-1'>
                      {project.framework ?? 'unknown framework'} ·{' '}
                      {project.updatedAt
                        ? new Date(project.updatedAt).toLocaleString('sv-SE')
                        : 'unknown update'}
                    </div>
                  </div>
                ))
              )}
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

        <Card>
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
            <CardDescription>Vägen från metadata till riktig observability.</CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-1 gap-2 md:grid-cols-2'>
            {snapshot.nextSteps.map((step) => (
              <div key={step} className='rounded-xl border bg-background/40 p-3 text-sm'>
                {step}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
