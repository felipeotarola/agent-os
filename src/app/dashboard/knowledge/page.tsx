import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getKnowledgeSnapshot } from '@/db/knowledge';

export default async function KnowledgePage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; queued?: string; error?: string }>;
}) {
  const [snapshot, params] = await Promise.all([getKnowledgeSnapshot(), searchParams]);

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              raw → wiki → index → log
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Knowledge inbox</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Dumpa rådata här. Cockpitten sparar källan i raw-inboxen och köar nästa steg:
              wikifiering till agent-läsbara markdown-sidor.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>DB</div>
            <div className='font-mono'>{snapshot.dbOnline ? 'online' : 'fallback / read-only'}</div>
          </div>
        </div>

        {(params.created || params.queued || params.error) && (
          <Card className={params.error ? 'border-destructive/40' : 'border-primary/40'}>
            <CardContent className='pt-6 text-sm'>
              {params.created && 'Källa sparad i raw-inboxen.'}
              {params.queued && 'Källa köad för wikifiering.'}
              {params.error === 'no-db' &&
                'Ingen DATABASE_URL i den här miljön. Kör lokalt eller koppla hosted DB.'}
              {params.error === 'missing' && 'Titel och antingen URL eller råtext krävs.'}
            </CardContent>
          </Card>
        )}

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          {snapshot.stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className='pb-2'>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className='text-3xl'>{stat.value}</CardTitle>
              </CardHeader>
              <CardContent className='text-muted-foreground text-sm'>{stat.detail}</CardContent>
            </Card>
          ))}
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-5'>
          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Lägg till rådata</CardTitle>
              <CardDescription>
                V0 stödjer text och URL. Fil/PDF kommer efter att flödet sitter.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action='/api/knowledge/sources' method='post' className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='title'>Titel</Label>
                  <Input
                    id='title'
                    name='title'
                    placeholder='Ex. Lysande customer notes'
                    required
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='sourceUrl'>URL</Label>
                  <Input id='sourceUrl' name='sourceUrl' type='url' placeholder='https://...' />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='rawContent'>Råtext</Label>
                  <Textarea
                    id='rawContent'
                    name='rawContent'
                    placeholder='Klistra in anteckningar, transkript, research, lösa tankar...'
                    className='min-h-48'
                  />
                </div>
                <Button type='submit' className='w-full' disabled={!snapshot.dbOnline}>
                  Spara till raw inbox
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Raw inbox</CardTitle>
              <CardDescription>Källor som ska processas till wiki-sidor.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.sources.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  Inga källor ännu. Lägg in första råtexten eller URL:en.
                </div>
              ) : (
                snapshot.sources.map((source) => (
                  <div key={source.id} className='rounded-xl border bg-background/40 p-4'>
                    <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                      <div className='min-w-0 space-y-1'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <div className='font-medium'>{source.title}</div>
                          <Badge variant='secondary'>{source.kind}</Badge>
                          <Badge variant={source.status === 'raw' ? 'outline' : 'default'}>
                            {source.status}
                          </Badge>
                        </div>
                        <div className='text-muted-foreground text-sm'>
                          {source.summary || 'Ingen sammanfattning ännu.'}
                        </div>
                        <div className='text-muted-foreground font-mono text-xs'>
                          {source.rawPath}
                        </div>
                        {source.sourceUrl && (
                          <a
                            className='text-primary text-xs underline'
                            href={source.sourceUrl}
                            target='_blank'
                          >
                            {source.sourceUrl}
                          </a>
                        )}
                      </div>
                      <form action='/api/knowledge/sources/queue' method='post'>
                        <input type='hidden' name='id' value={source.id} />
                        <Button size='sm' variant='outline' disabled={source.status !== 'raw'}>
                          Wikifiera
                        </Button>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
