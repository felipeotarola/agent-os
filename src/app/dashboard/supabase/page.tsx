import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseSnapshot } from '@/db/supabase';

export const metadata = {
  title: 'Agent OS: Supabase Observability'
};

function statusVariant(ok: boolean) {
  return ok ? ('default' as const) : ('outline' as const);
}

export default async function SupabasePage() {
  const snapshot = await getSupabaseSnapshot();
  const project = snapshot.project;

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              read-only connector
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
              Supabase Observability
            </h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Global Agent OS-vy för Supabase health, metadata och framtida logs/usage. V1 visar
              aldrig tokens i UI:t och degraderar säkert när config saknas.
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
            <CardContent className='text-muted-foreground text-sm'>Management API read</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Project</CardDescription>
              <CardTitle className='line-clamp-1 text-3xl'>{project?.name ?? '—'}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>No secrets exposed</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Status</CardDescription>
              <CardTitle className='text-3xl'>{project?.status ?? 'unknown'}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              {project?.region ?? 'No region'}
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Connector checks</CardTitle>
              <CardDescription>
                Read-only readiness checks. Secret values are intentionally hidden.
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
              <CardTitle>Safe contract</CardTitle>
              <CardDescription>Vad V1 får och inte får göra.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              {[
                'Read-only metadata first.',
                'No browser OAuth hacks.',
                'No Supabase tokens in UI or markdown.',
                'Logs/usage only after scoped API or drain is confirmed.',
                'Normalize events with retention and redaction before alerts.'
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
