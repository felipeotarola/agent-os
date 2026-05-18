import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getJournalSnapshot } from '@/db/journal';

export const metadata = {
  title: 'Agent OS: Journal'
};

export default async function JournalPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const [snapshot, params] = await Promise.all([getJournalSnapshot(), searchParams]);

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              local log capture
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Journal</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              En enkel verklig inkorg för dagliga anteckningar, beslut och rålogg. Sparas som
              journal-källor i samma knowledge-lager så de senare kan wikifieras.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Persistence</div>
            <div className='font-mono'>
              {snapshot.dbOnline ? 'Postgres' : 'fallback / read-only'}
            </div>
          </div>
        </div>

        {(params.created || params.error) && (
          <Card className={params.error ? 'border-destructive/40' : 'border-primary/40'}>
            <CardContent className='pt-6 text-sm'>
              {params.created && 'Journalnotering sparad.'}
              {params.error === 'missing' && 'Titel och text krävs.'}
              {params.error === 'no-db' && 'Ingen DATABASE_URL i den här miljön.'}
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
              <CardTitle>Ny notering</CardTitle>
              <CardDescription>Rå text först. Struktur kommer efteråt.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action='/api/journal/entries' method='post' className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='title'>Titel</Label>
                  <Input id='title' name='title' placeholder='Ex. Dagens beslut' required />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='rawContent'>Text</Label>
                  <Textarea
                    id='rawContent'
                    name='rawContent'
                    placeholder='Skriv eller klistra in logg, beslut, observationer...'
                    className='min-h-64'
                    required
                  />
                </div>
                <Button type='submit' className='w-full' disabled={!snapshot.dbOnline}>
                  Spara journalnotering
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Senaste noteringar</CardTitle>
              <CardDescription>
                Journal entries från knowledge_sources kind=journal.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.entries.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  Inga journalnoteringar ännu.
                </div>
              ) : (
                snapshot.entries.map((entry) => (
                  <details key={entry.id} className='rounded-xl border bg-background/40 p-4'>
                    <summary className='cursor-pointer'>
                      <div className='inline-flex max-w-full flex-col gap-1 align-middle'>
                        <span className='font-medium'>{entry.title}</span>
                        <span className='text-muted-foreground font-mono text-xs'>
                          {entry.rawPath} · {new Date(entry.createdAt).toLocaleString('sv-SE')}
                        </span>
                        <span className='text-muted-foreground text-sm'>{entry.summary}</span>
                      </div>
                    </summary>
                    <pre className='text-muted-foreground mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed'>
                      {entry.rawContent}
                    </pre>
                  </details>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
