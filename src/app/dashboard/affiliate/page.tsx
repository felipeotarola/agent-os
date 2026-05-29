import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getAffiliateSnapshot, type AffiliateProduct } from '@/db/affiliate';

function money(value: number | null, currency: string) {
  if (value === null || Number.isNaN(value)) return 'Pris saknas';
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(value);
}

function rate(value: number | null) {
  if (value === null || Number.isNaN(value)) return '-';
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(value)}%`;
}

function signalTitle(item: Record<string, unknown>) {
  return String(item.title ?? item.name ?? item.page ?? item.url ?? item.productId ?? 'Signal');
}

function stockLabel(status: string) {
  if (status === 'in_stock') return 'In stock';
  if (status === 'limited') return 'Limited';
  if (status === 'out_of_stock') return 'Out of stock';
  return 'Unknown stock';
}

function stockVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'in_stock') return 'default';
  if (status === 'limited') return 'secondary';
  if (status === 'out_of_stock') return 'destructive';
  return 'outline';
}

function productCompleteness(product: AffiliateProduct) {
  const fields = [
    product.title,
    product.price,
    product.imageUrl,
    product.category,
    product.trackingLink,
    product.stockStatus && product.stockStatus !== 'unknown',
    product.metadata && Object.keys(product.metadata).length > 0
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function scoreVariant(score: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (score >= 70) return 'default';
  if (score >= 45) return 'secondary';
  return 'outline';
}

function riskVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'blocked' || status === 'blocker') return 'destructive';
  if (status === 'clear' || status === 'healthy') return 'default';
  return 'secondary';
}

function ProductCard({ product }: { product: AffiliateProduct }) {
  const completeness = productCompleteness(product);

  return (
    <Card className='overflow-hidden'>
      <div className='bg-muted flex aspect-[4/3] items-center justify-center overflow-hidden'>
        {product.imageUrl ? (
          <div
            role='img'
            aria-label={product.title}
            className='h-full w-full bg-cover bg-center'
            style={{ backgroundImage: `url("${product.imageUrl}")` }}
          />
        ) : (
          <Icons.product className='text-muted-foreground size-10' aria-hidden='true' />
        )}
      </div>
      <CardHeader className='gap-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0 space-y-2'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline'>{product.category || 'Uncategorized'}</Badge>
              <Badge variant={stockVariant(product.stockStatus)}>
                {stockLabel(product.stockStatus)}
              </Badge>
            </div>
            <CardTitle className='line-clamp-2 text-base leading-snug'>{product.title}</CardTitle>
          </div>
          <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
            {product.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-end justify-between gap-3'>
          <div>
            <div className='text-muted-foreground text-xs'>Amazon price</div>
            <div className='text-xl font-semibold'>{money(product.price, product.currency)}</div>
          </div>
          <div className='text-right'>
            <div className='text-muted-foreground text-xs'>Data</div>
            <div className='font-mono text-sm'>{completeness}%</div>
          </div>
        </div>
        <Separator />
        <div className='text-muted-foreground grid grid-cols-2 gap-2 text-xs'>
          <span>source</span>
          <span className='text-right font-mono'>{product.source}</span>
          <span>completeness</span>
          <span className='text-right font-mono'>{product.completeness ?? completeness}%</span>
          <span>tracking</span>
          <span className='truncate text-right font-mono'>{product.trackingLink}</span>
          <span>updated</span>
          <span className='text-right'>
            {new Date(product.updatedAt).toLocaleDateString('sv-SE')}
          </span>
        </div>
        {product.trackingLink ? (
          <Button asChild variant='outline' className='w-full'>
            <a href={product.trackingLink} target='_blank' rel='noreferrer'>
              <Icons.externalLink aria-hidden='true' />
              Open affiliate link
            </a>
          </Button>
        ) : (
          <Button variant='outline' className='w-full' disabled>
            <Icons.externalLink aria-hidden='true' />
            Missing affiliate link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export const metadata = {
  title: 'Agent OS: Sladdis Store'
};

export default async function AffiliatePage() {
  const snapshot = await getAffiliateSnapshot();
  const { catalog, totals } = snapshot;
  const featuredProducts = snapshot.products.filter((product) => product.status === 'active');
  const draftProducts = snapshot.products.filter((product) => product.status !== 'active');

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              Sladdis Storefront
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
              Amazon affiliate store
            </h1>
            <p className='text-muted-foreground max-w-3xl text-sm md:text-base'>
              Produktkatalogen Sladdis behöver för att kunna agera: title, price, image, category,
              tracking link, stock, source och metadata. UI:t är read-only; importen ska ske via
              bridge/Supabase, inte med hemligheter i Vercel.
            </p>
          </div>
          <div className='rounded-lg border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Source</div>
            <div className='font-mono'>{snapshot.source}</div>
            <div className='text-muted-foreground mt-2 text-xs'>
              {new Date(snapshot.generatedAt).toLocaleString('sv-SE')}
            </div>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-4 lg:grid-cols-5'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Products</CardDescription>
              <CardTitle className='text-3xl'>{catalog.totalProducts}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              {catalog.activeProducts} active
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>In stock</CardDescription>
              <CardTitle className='text-3xl'>{catalog.inStockProducts}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>Amazon availability</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Needs data</CardDescription>
              <CardTitle className='text-3xl'>{catalog.needsDataProducts}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Missing price/image/stock
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Clicks</CardDescription>
              <CardTitle className='text-3xl'>{totals.clicks}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>Imported stats</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Commission</CardDescription>
              <CardTitle className='text-3xl'>
                {money(totals.commission, totals.currency)}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>Estimated earnings</CardContent>
          </Card>
        </div>

        <section className='grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]'>
          <Card>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Analytics and revenue loop</CardTitle>
                  <CardDescription>
                    Clicks, conversions, revenue, CTR, ranking changes and content performance.
                  </CardDescription>
                </div>
                <Badge variant={snapshot.analytics.status === 'tracking' ? 'default' : 'outline'}>
                  {snapshot.analytics.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
                <div className='rounded-lg border bg-background/40 p-3'>
                  <div className='text-muted-foreground text-xs'>7d clicks</div>
                  <div className='text-2xl font-semibold'>
                    {snapshot.analytics.last7.current.clicks}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    {rate(snapshot.analytics.deltas.clicks)} vs prev
                  </div>
                </div>
                <div className='rounded-lg border bg-background/40 p-3'>
                  <div className='text-muted-foreground text-xs'>Conversions</div>
                  <div className='text-2xl font-semibold'>
                    {snapshot.analytics.last7.current.orderedItems}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    {rate(snapshot.analytics.last7.current.conversionRate)} CVR
                  </div>
                </div>
                <div className='rounded-lg border bg-background/40 p-3'>
                  <div className='text-muted-foreground text-xs'>Revenue</div>
                  <div className='text-2xl font-semibold'>
                    {money(snapshot.analytics.last7.current.revenue, totals.currency)}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    {rate(snapshot.analytics.deltas.revenue)} vs prev
                  </div>
                </div>
                <div className='rounded-lg border bg-background/40 p-3'>
                  <div className='text-muted-foreground text-xs'>Avg CTR</div>
                  <div className='text-2xl font-semibold'>
                    {rate(snapshot.analytics.averageCtr)}
                  </div>
                  <div className='text-muted-foreground text-xs'>from content rows</div>
                </div>
              </div>
              <div className='space-y-2'>
                {snapshot.analytics.summary.map((item) => (
                  <div key={item} className='flex gap-2 text-sm'>
                    <Icons.arrowRight className='text-muted-foreground mt-0.5 size-4 shrink-0' />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className='rounded-lg border bg-background/40 p-3 text-sm'>
                {snapshot.analytics.suggestedNextAction}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content performance</CardTitle>
              <CardDescription>Imported content/product rows from stats exports.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.analytics.contentPerformance.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  No content performance imported yet. Use{' '}
                  <span className='font-mono'>POST /affiliate/stats/batch</span>.
                </div>
              ) : (
                snapshot.analytics.contentPerformance.slice(0, 5).map((item, index) => (
                  <div
                    key={`${signalTitle(item)}-${item.date}-${index}`}
                    className='rounded-lg border bg-background/40 p-3 text-sm'
                  >
                    <div className='line-clamp-2 font-medium'>{signalTitle(item)}</div>
                    <div className='text-muted-foreground mt-2 grid grid-cols-3 gap-2 text-xs'>
                      <span>{item.clicks} clicks</span>
                      <span>{item.conversions} conv.</span>
                      <span>{rate(item.ctr)}</span>
                    </div>
                    {item.rankingChange !== null && (
                      <div className='mt-2 text-xs'>Ranking change: {item.rankingChange}</div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section className='grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]'>
          <Card>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>SEO and social distribution</CardTitle>
                  <CardDescription>
                    Verified-store keyword clusters, internal links, refreshes and draft candidates.
                  </CardDescription>
                </div>
                <Badge variant={snapshot.seoSocial.status === 'ready' ? 'default' : 'outline'}>
                  {snapshot.seoSocial.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
                <div className='rounded-lg border bg-background/40 p-3'>
                  <div className='text-muted-foreground text-xs'>Verified sources</div>
                  <div className='text-2xl font-semibold'>
                    {snapshot.seoSocial.verifiedSourceCount}
                  </div>
                </div>
                <div className='rounded-lg border bg-background/40 p-3'>
                  <div className='text-muted-foreground text-xs'>Excluded products</div>
                  <div className='text-2xl font-semibold'>
                    {snapshot.seoSocial.excludedUnverifiedProducts}
                  </div>
                </div>
                <div className='rounded-lg border bg-background/40 p-3'>
                  <div className='text-muted-foreground text-xs'>Clusters</div>
                  <div className='text-2xl font-semibold'>
                    {snapshot.seoSocial.keywordClusters.length}
                  </div>
                </div>
                <div className='rounded-lg border bg-background/40 p-3'>
                  <div className='text-muted-foreground text-xs'>Drafts</div>
                  <div className='text-2xl font-semibold'>
                    {snapshot.seoSocial.platformDrafts.length}
                  </div>
                </div>
              </div>
              {snapshot.seoSocial.blockers.length > 0 && (
                <div className='space-y-2'>
                  {snapshot.seoSocial.blockers.map((blocker) => (
                    <div key={blocker} className='rounded-lg border bg-background/40 p-3 text-sm'>
                      {blocker}
                    </div>
                  ))}
                </div>
              )}
              <div className='rounded-lg border bg-background/40 p-3 text-sm'>
                {snapshot.seoSocial.nextAction}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Keyword clusters</CardTitle>
              <CardDescription>{snapshot.seoSocial.sourcePolicy}</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.seoSocial.keywordClusters.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  No verified keyword clusters yet.
                </div>
              ) : (
                snapshot.seoSocial.keywordClusters.slice(0, 5).map((cluster) => (
                  <div key={cluster.id} className='rounded-lg border bg-background/40 p-3 text-sm'>
                    <div className='font-medium'>{cluster.label}</div>
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {cluster.primaryKeyword}
                    </div>
                    <div className='mt-2 flex flex-wrap gap-2'>
                      {cluster.keywords.slice(0, 4).map((keyword) => (
                        <Badge key={keyword} variant='outline'>
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section className='grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]'>
          <Card>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>Opportunity queue</CardTitle>
                  <CardDescription>
                    Ranked by commission, demand, seasonality, conversion likelihood, content fit,
                    stock, reviews and data confidence.
                  </CardDescription>
                </div>
                <Badge variant='outline'>{snapshot.opportunities.length} scored</Badge>
              </div>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.opportunities.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  No scored products yet. Import products to populate Sladdis opportunities.
                </div>
              ) : (
                snapshot.opportunities.slice(0, 6).map((opportunity, index) => (
                  <div
                    key={opportunity.productId}
                    className='rounded-lg border bg-background/40 p-4'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <div className='text-muted-foreground text-xs'>#{index + 1}</div>
                        <div className='line-clamp-2 font-medium'>{opportunity.title}</div>
                      </div>
                      <div className='flex shrink-0 flex-col items-end gap-2'>
                        <Badge variant={scoreVariant(opportunity.score)}>{opportunity.score}</Badge>
                        <span className='text-muted-foreground text-xs'>
                          {opportunity.confidence}% confidence
                        </span>
                      </div>
                    </div>
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {opportunity.evidence.slice(0, 4).map((item) => (
                        <Badge key={item} variant='outline'>
                          {item}
                        </Badge>
                      ))}
                    </div>
                    {opportunity.rejectionReasons.length > 0 && (
                      <div className='text-muted-foreground mt-3 text-xs'>
                        Needs review: {opportunity.rejectionReasons.join(', ')}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <CardTitle>Daily Sladdis brief</CardTitle>
                    <CardDescription>
                      Generated from catalog, scoring and approval state.
                    </CardDescription>
                  </div>
                  <Icons.sparkles className='text-primary size-5' aria-hidden='true' />
                </div>
              </CardHeader>
              <CardContent className='space-y-3 text-sm'>
                <div className='font-medium'>{snapshot.dailyBrief.headline}</div>
                {snapshot.dailyBrief.blockers.length > 0 && (
                  <div className='space-y-2'>
                    {snapshot.dailyBrief.blockers.map((blocker) => (
                      <div key={blocker} className='rounded-lg border bg-background/40 p-3'>
                        {blocker}
                      </div>
                    ))}
                  </div>
                )}
                <Separator />
                <div className='space-y-2'>
                  {snapshot.dailyBrief.suggestedActions.map((action) => (
                    <div key={action} className='flex gap-2'>
                      <Icons.arrowRight className='text-muted-foreground mt-0.5 size-4 shrink-0' />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Catalog health</CardTitle>
                <CardDescription>
                  Broken links, missing media, stale prices, duplicates and weak metadata.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className='flex items-center justify-between gap-3'>
                  <Badge variant={riskVariant(snapshot.catalogHealth.status)}>
                    {snapshot.catalogHealth.status}
                  </Badge>
                  <span className='text-muted-foreground text-sm'>
                    {snapshot.catalogHealth.blockingCount} gaps
                  </span>
                </div>
                {snapshot.catalogHealth.checks.map((check) => (
                  <div key={check.id} className='flex items-center justify-between gap-3 text-sm'>
                    <span>{check.label}</span>
                    <span className='font-mono'>{check.count}</span>
                  </div>
                ))}
                <Separator />
                <div className='space-y-2'>
                  <div className='flex items-center justify-between gap-3'>
                    <div className='text-sm font-medium'>Repair queue</div>
                    <Badge variant='outline'>{snapshot.catalogHealth.repairQueue.length}</Badge>
                  </div>
                  {snapshot.catalogHealth.repairQueue.length === 0 ? (
                    <div className='text-muted-foreground rounded-lg border border-dashed p-3 text-sm'>
                      No catalog repairs queued.
                    </div>
                  ) : (
                    snapshot.catalogHealth.repairQueue.slice(0, 4).map((item) => (
                      <div
                        key={item.productId}
                        className='rounded-lg border bg-background/40 p-3 text-sm'
                      >
                        <div className='flex items-start justify-between gap-3'>
                          <div className='line-clamp-2 font-medium'>{item.title}</div>
                          <Badge variant={riskVariant(item.severity)}>{item.severity}</Badge>
                        </div>
                        <div className='text-muted-foreground mt-2 text-xs'>
                          {item.issues.slice(0, 3).join(', ')}
                        </div>
                        <div className='mt-2 text-xs'>{item.suggestedFixes[0]}</div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
          <Card>
            <CardHeader>
              <CardTitle>Compliance guardrails</CardTitle>
              <CardDescription>
                Disclosure, claims, price freshness and platform risk.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Badge variant={riskVariant(snapshot.compliance.status)}>
                {snapshot.compliance.status}
              </Badge>
              {snapshot.compliance.checks.slice(0, 5).map((check) => (
                <div
                  key={check.productId}
                  className='rounded-lg border bg-background/40 p-3 text-sm'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div className='line-clamp-2 font-medium'>{check.title}</div>
                    <Badge variant={riskVariant(check.status)}>{check.status}</Badge>
                  </div>
                  <div className='text-muted-foreground mt-2 text-xs'>
                    {check.warnings.length ? check.warnings.join(', ') : 'No warnings'}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Draft pipeline</CardTitle>
              <CardDescription>Drafts are prepared, never published automatically.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.contentPipeline.drafts.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  No draft candidates yet.
                </div>
              ) : (
                snapshot.contentPipeline.drafts.slice(0, 5).map((draft) => (
                  <div key={draft.id} className='rounded-lg border bg-background/40 p-3 text-sm'>
                    <div className='font-medium'>{draft.title}</div>
                    <div className='text-muted-foreground mt-1 text-xs'>{draft.angle}</div>
                    <div className='mt-2 flex flex-wrap gap-2'>
                      {draft.formats.map((format) => (
                        <Badge key={format} variant='outline'>
                          {format}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Approval queue</CardTitle>
              <CardDescription>External actions require explicit human approval.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.contentPipeline.approvalQueue.length === 0 ? (
                <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                  No approvals pending.
                </div>
              ) : (
                snapshot.contentPipeline.approvalQueue.slice(0, 5).map((item) => (
                  <div key={item.id} className='rounded-lg border bg-background/40 p-3 text-sm'>
                    <div className='font-medium'>{item.title}</div>
                    <div className='text-muted-foreground mt-1 text-xs'>{item.reason}</div>
                    <div className='mt-2 text-xs'>{item.nextAction}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'>
          <section className='space-y-4'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
              <div>
                <h2 className='text-xl font-semibold tracking-tight'>Storefront products</h2>
                <p className='text-muted-foreground text-sm'>
                  Aktiva produkter visas här först. Drafts ligger kvar längre ned tills datan är
                  komplett.
                </p>
              </div>
              <div className='flex flex-wrap gap-2'>
                {catalog.categories.map((category) => (
                  <Badge key={category} variant='secondary'>
                    {category}
                  </Badge>
                ))}
              </div>
            </div>

            {snapshot.products.length === 0 ? (
              <div className='rounded-lg border border-dashed p-8'>
                <div className='flex max-w-2xl flex-col gap-3'>
                  <Icons.product className='text-muted-foreground size-9' aria-hidden='true' />
                  <h2 className='text-xl font-semibold'>No Amazon products imported yet</h2>
                  <p className='text-muted-foreground text-sm'>
                    Foundationen är på plats. Lägg första produkterna via bridge-endpointen
                    <span className='font-mono'> POST /affiliate/products/batch</span> med products
                    eller items. Varje rad ska minst ha title/name och trackingLink/affiliateUrl.
                  </p>
                </div>
              </div>
            ) : (
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3'>
                {featuredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}

            {draftProducts.length > 0 && (
              <div className='space-y-4'>
                <h2 className='text-xl font-semibold tracking-tight'>Draft queue</h2>
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3'>
                  {draftProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Data contract</CardTitle>
                <CardDescription>
                  Minsta produktdata innan Sladdis kan agera stabilt.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3 text-sm'>
                {[
                  'title',
                  'price',
                  'imageUrl',
                  'category',
                  'trackingLink',
                  'stockStatus',
                  'metadata'
                ].map((field) => (
                  <div key={field} className='flex items-center justify-between gap-3'>
                    <span className='font-mono'>{field}</span>
                    <Icons.circleCheck className='text-primary size-4' aria-hidden='true' />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>Affiliate accounts configured in bridge/Supabase.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {snapshot.accounts.length === 0 ? (
                  <div className='text-muted-foreground rounded-lg border border-dashed p-4 text-sm'>
                    No account configured.
                  </div>
                ) : (
                  snapshot.accounts.map((account) => (
                    <div key={account.id} className='rounded-lg border bg-background/40 p-4'>
                      <div className='flex items-center justify-between gap-3'>
                        <div className='font-medium'>{account.name}</div>
                        <Badge>{account.status}</Badge>
                      </div>
                      <div className='text-muted-foreground mt-2 grid grid-cols-2 gap-2 text-xs'>
                        <span>provider</span>
                        <span className='text-right font-mono'>{account.provider}</span>
                        <span>tracking</span>
                        <span className='text-right font-mono'>{account.trackingId || '-'}</span>
                        <span>market</span>
                        <span className='text-right font-mono'>{account.marketplace || '-'}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Next steps</CardTitle>
                <CardDescription>Rätt ordning för mer autonomi.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-2'>
                {snapshot.nextSteps.map((step) => (
                  <div key={step} className='rounded-lg border bg-background/40 p-3 text-sm'>
                    {step}
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </PageContainer>
  );
}
