import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAffiliateSnapshot } from '@/db/affiliate';

function money(value: number, currency: string) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(value);
}

export const metadata = {
  title: 'Agent OS: Affiliate'
};

export default async function AffiliatePage() {
  const snapshot = await getAffiliateSnapshot();
  const { totals } = snapshot;

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              Affiliate intelligence
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Affiliate Stats</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Sladdis yta för Amazon Associates/affiliate-analytics. V1 är read-only och byggd för
              officiell API/export-källa — inga browser/OAuth-hack i UI:t.
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
              <CardDescription>Clicks</CardDescription>
              <CardTitle className='text-3xl'>{totals.clicks}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Imported/reporting period
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Ordered items</CardDescription>
              <CardTitle className='text-3xl'>{totals.orderedItems}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Amazon affiliate orders
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Commission</CardDescription>
              <CardTitle className='text-3xl'>
                {money(totals.commission, totals.currency)}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Estimated/imported earnings
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Conversion</CardDescription>
              <CardTitle className='text-3xl'>{totals.conversionRate}%</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>Orders / clicks</CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Daily stats</CardTitle>
              <CardDescription>
                Hämtas från affiliate_daily_stats när Sladdis kopplat officiell källa/import.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {snapshot.rows.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  Inga importerade affiliate-stats ännu. Kontot är förberett; nästa steg är att
                  koppla Amazon reporting/API/export på bridge-sidan.
                </div>
              ) : (
                <div className='space-y-2'>
                  {snapshot.rows.map((row) => (
                    <div
                      key={row.id}
                      className='grid grid-cols-2 gap-3 rounded-xl border bg-background/40 p-4 text-sm md:grid-cols-6'
                    >
                      <div>
                        <div className='text-muted-foreground text-xs'>Date</div>
                        {row.date}
                      </div>
                      <div>
                        <div className='text-muted-foreground text-xs'>Clicks</div>
                        {row.clicks}
                      </div>
                      <div>
                        <div className='text-muted-foreground text-xs'>Orders</div>
                        {row.orderedItems}
                      </div>
                      <div>
                        <div className='text-muted-foreground text-xs'>Shipped</div>
                        {row.shippedItems}
                      </div>
                      <div>
                        <div className='text-muted-foreground text-xs'>Revenue</div>
                        {money(row.revenue, row.currency)}
                      </div>
                      <div>
                        <div className='text-muted-foreground text-xs'>Commission</div>
                        {money(row.commission, row.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>Affiliate accounts configured in bridge/Postgres.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.accounts.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-4 text-sm'>
                  No account configured.
                </div>
              ) : (
                snapshot.accounts.map((account) => (
                  <div key={account.id} className='rounded-xl border bg-background/40 p-4'>
                    <div className='flex items-center justify-between gap-3'>
                      <div className='font-medium'>{account.name}</div>
                      <Badge>{account.status}</Badge>
                    </div>
                    <div className='text-muted-foreground mt-2 grid grid-cols-2 gap-2 text-xs'>
                      <span>provider</span>
                      <span className='text-right font-mono'>{account.provider}</span>
                      <span>tracking</span>
                      <span className='text-right font-mono'>{account.trackingId || '—'}</span>
                      <span>market</span>
                      <span className='text-right font-mono'>{account.marketplace || '—'}</span>
                    </div>
                    {account.notes && (
                      <p className='text-muted-foreground mt-3 text-xs'>{account.notes}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sladdis next steps</CardTitle>
            <CardDescription>
              Det här är rätt integrationsordning — säkert först, data sen.
            </CardDescription>
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
