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
          <span>tracking</span>
          <span className='truncate text-right font-mono'>{product.trackingLink}</span>
          <span>updated</span>
          <span className='text-right'>
            {new Date(product.updatedAt).toLocaleDateString('sv-SE')}
          </span>
        </div>
        <Button asChild variant='outline' className='w-full' disabled={!product.trackingLink}>
          <a href={product.trackingLink || product.productUrl} target='_blank' rel='noreferrer'>
            <Icons.externalLink aria-hidden='true' />
            Open affiliate link
          </a>
        </Button>
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
                    <span className='font-mono'> POST /affiliate/products</span> med title, price,
                    imageUrl, category, trackingLink, stockStatus, source och metadata.
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
