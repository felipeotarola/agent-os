import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { searchMemory } from '@/db/memory';

export default async function MemoryPage({
  searchParams
}: {
  searchParams: Promise<{
    query?: string;
    corpus?: string;
    saved?: string;
    wikified?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.query ?? '';
  const corpus = params.corpus ?? 'all';
  const memory = await searchMemory(query, corpus);

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              QMD semantic memory
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Memory Search</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Sök i OpenClaw/QMD-minnet och promotera relevanta träffar till raw inbox för
              wikifiering.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Source</div>
            <div className='font-mono'>{memory.source}</div>
          </div>
        </div>

        {(params.saved || params.error || memory.error) && (
          <Card
            className={params.error || memory.error ? 'border-destructive/40' : 'border-primary/40'}
          >
            <CardContent className='pt-6 text-sm'>
              {params.saved &&
                `Minnesträff sparad som raw source${params.wikified ? ' och wikifierad' : ''} i Knowledge Inbox.`}
              {params.error === 'missing' && 'Titel och snippet krävs.'}
              {memory.error && `Memory search error: ${memory.error}`}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Sök memory</CardTitle>
            <CardDescription>Corpus-filter är v1: all, memory eller sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_auto]' method='get'>
              <div className='space-y-2'>
                <Label htmlFor='query'>Query</Label>
                <Input
                  id='query'
                  name='query'
                  defaultValue={query}
                  placeholder='Ex. Agent OS bridge'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='corpus'>Corpus</Label>
                <Select name='corpus' defaultValue={corpus}>
                  <SelectTrigger id='corpus'>
                    <SelectValue placeholder='Corpus' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>all</SelectItem>
                    <SelectItem value='memory'>memory</SelectItem>
                    <SelectItem value='sessions'>sessions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='flex items-end'>
                <Button type='submit' className='w-full'>
                  Sök
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Results</CardDescription>
              <CardTitle className='text-3xl'>{memory.results.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>Matching QMD chunks</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Corpus</CardDescription>
              <CardTitle className='text-3xl'>{memory.corpus}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Selected source filter
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Query</CardDescription>
              <CardTitle className='truncate text-3xl'>{memory.query || '—'}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Semantic recall prompt
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              Save as raw source skickar träffen till Knowledge Inbox.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {!query ? (
              <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                Sök efter något för att visa QMD-träffar.
              </div>
            ) : memory.results.length === 0 ? (
              <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                Inga träffar.
              </div>
            ) : (
              memory.results.map((result, index) => (
                <div
                  key={`${result.path}-${result.startLine}-${index}`}
                  className='rounded-xl border bg-background/40 p-4'
                >
                  <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                    <div className='min-w-0 space-y-2'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Badge>{result.source ?? 'memory'}</Badge>
                        {typeof result.score === 'number' && (
                          <Badge variant='secondary'>{result.score.toFixed(2)}</Badge>
                        )}
                        {result.startLine && (
                          <Badge variant='outline'>
                            L{result.startLine}-{result.endLine}
                          </Badge>
                        )}
                      </div>
                      <div className='text-muted-foreground break-all font-mono text-xs'>
                        {result.path}
                      </div>
                      <pre className='text-muted-foreground max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed'>
                        {result.snippet}
                      </pre>
                    </div>
                    <form action='/api/memory/save' method='post' className='min-w-40'>
                      <input type='hidden' name='title' value={`Memory: ${query}`} />
                      <input type='hidden' name='path' value={result.path} />
                      <input type='hidden' name='source' value={result.source ?? 'memory'} />
                      <input type='hidden' name='snippet' value={result.snippet} />
                      <Button type='submit' size='sm' variant='outline' className='w-full'>
                        Save as raw
                      </Button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
