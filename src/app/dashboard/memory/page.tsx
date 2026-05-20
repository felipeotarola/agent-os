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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getMemoryStatus, searchMemory, type MemoryStatusAgent } from '@/db/memory';

function formatNumber(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('sv-SE') : '—';
}

function formatBytes(value: number | undefined) {
  if (typeof value !== 'number') return '—';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function issueCount(agent: MemoryStatusAgent) {
  return (
    (agent.scan?.issues?.length ?? 0) +
    (agent.audit?.issues?.length ?? 0) +
    (agent.dreamingAudit?.issues?.length ?? 0) +
    (agent.scan?.sources?.reduce((sum, source) => sum + (source.issues?.length ?? 0), 0) ?? 0)
  );
}

function healthTone(agent: MemoryStatusAgent) {
  if (issueCount(agent) > 0) return 'warning';
  if (agent.status.dirty) return 'dirty';
  if (agent.audit?.invalidEntryCount) return 'invalid';
  return 'ok';
}

function memoryHealthLabel(agent: MemoryStatusAgent) {
  const tone = healthTone(agent);
  if (tone === 'ok') return 'clean';
  if (tone === 'dirty') return 'needs index';
  if (tone === 'invalid') return 'invalid entries';
  return 'review';
}

function MemoryAgentCard({ agent }: { agent: MemoryStatusAgent }) {
  const tone = healthTone(agent);
  const badgeVariant = tone === 'ok' ? 'default' : tone === 'dirty' ? 'secondary' : 'destructive';

  return (
    <Card>
      <CardHeader className='space-y-3'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardDescription>Agent</CardDescription>
            <CardTitle className='text-2xl'>{agent.agentId}</CardTitle>
          </div>
          <Badge variant={badgeVariant}>{memoryHealthLabel(agent)}</Badge>
        </div>
        <CardDescription className='font-mono text-xs'>{agent.status.workspaceDir}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-3 text-sm'>
          <div className='rounded-xl border bg-background/40 p-3'>
            <div className='text-muted-foreground'>Chunks</div>
            <div className='text-xl font-semibold'>{formatNumber(agent.status.chunks)}</div>
          </div>
          <div className='rounded-xl border bg-background/40 p-3'>
            <div className='text-muted-foreground'>Files</div>
            <div className='text-xl font-semibold'>{formatNumber(agent.status.files)}</div>
          </div>
          <div className='rounded-xl border bg-background/40 p-3'>
            <div className='text-muted-foreground'>Dream entries</div>
            <div className='text-xl font-semibold'>{formatNumber(agent.audit?.entryCount)}</div>
          </div>
          <div className='rounded-xl border bg-background/40 p-3'>
            <div className='text-muted-foreground'>Promoted</div>
            <div className='text-xl font-semibold'>{formatNumber(agent.audit?.promotedCount)}</div>
          </div>
        </div>

        <div className='space-y-2 text-sm'>
          <div className='flex justify-between gap-3'>
            <span className='text-muted-foreground'>Backend</span>
            <span className='font-mono'>{agent.status.backend ?? 'unknown'}</span>
          </div>
          <div className='flex justify-between gap-3'>
            <span className='text-muted-foreground'>Vector</span>
            <span className='font-mono'>{agent.status.vector?.enabled ? 'enabled' : 'off'}</span>
          </div>
          <div className='flex justify-between gap-3'>
            <span className='text-muted-foreground'>QMD collections</span>
            <span className='font-mono'>
              {formatNumber(agent.status.custom?.qmd?.collections ?? agent.audit?.qmd?.collections)}
            </span>
          </div>
          <div className='flex justify-between gap-3'>
            <span className='text-muted-foreground'>QMD db</span>
            <span className='font-mono'>{formatBytes(agent.audit?.qmd?.dbBytes)}</span>
          </div>
          <div className='flex justify-between gap-3'>
            <span className='text-muted-foreground'>Last dreaming audit</span>
            <span className='font-mono text-xs'>{agent.audit?.updatedAt ?? '—'}</span>
          </div>
        </div>

        <div className='rounded-xl border bg-muted/30 p-3 text-xs'>
          <div className='mb-2 font-medium'>Sources</div>
          <div className='space-y-1'>
            {agent.status.sourceCounts?.map((source) => (
              <div key={source.source} className='flex justify-between gap-3'>
                <span>{source.source}</span>
                <span className='font-mono'>
                  {source.files} files · {source.chunks} chunks
                </span>
              </div>
            )) ?? <div className='text-muted-foreground'>No source breakdown.</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
  const [memory, status] = await Promise.all([searchMemory(query, corpus), getMemoryStatus()]);
  const agents = status.status;
  const totalChunks = agents.reduce((sum, agent) => sum + (agent.status.chunks ?? 0), 0);
  const totalDreamEntries = agents.reduce((sum, agent) => sum + (agent.audit?.entryCount ?? 0), 0);
  const totalPromoted = agents.reduce((sum, agent) => sum + (agent.audit?.promotedCount ?? 0), 0);
  const dirtyAgents = agents.filter((agent) => agent.status.dirty).length;
  const totalIssues = agents.reduce((sum, agent) => sum + issueCount(agent), 0);

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              Memory Cockpit · QMD
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Memory Cockpit</h1>
            <p className='text-muted-foreground max-w-3xl text-sm md:text-base'>
              Status, search och hygiene för OpenClaw-minnet. QMD är recall-lagret; MEMORY.md, daily
              notes och DREAMS.md är review-ytorna.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Source</div>
            <div className='font-mono'>{status.source || memory.source}</div>
          </div>
        </div>

        {(params.saved || params.error || memory.error || status.error) && (
          <Card
            className={
              params.error || memory.error || status.error
                ? 'border-destructive/40'
                : 'border-primary/40'
            }
          >
            <CardContent className='pt-6 text-sm'>
              {params.saved &&
                `Minnesträff sparad som raw source${params.wikified ? ' och wikifierad' : ''} i Knowledge Inbox.`}
              {params.error === 'missing' && 'Titel och snippet krävs.'}
              {memory.error && `Memory search error: ${memory.error}`}
              {status.error && ` Memory status error: ${status.error}`}
            </CardContent>
          </Card>
        )}

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Agents</CardDescription>
              <CardTitle className='text-3xl'>{agents.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Memory indexes tracked
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Chunks</CardDescription>
              <CardTitle className='text-3xl'>{formatNumber(totalChunks)}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              QMD searchable chunks
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Dream entries</CardDescription>
              <CardTitle className='text-3xl'>{formatNumber(totalDreamEntries)}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Short-term recall store
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Promoted</CardDescription>
              <CardTitle className='text-3xl'>{formatNumber(totalPromoted)}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>Dreaming promotions</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Hygiene</CardDescription>
              <CardTitle className='text-3xl'>
                {totalIssues || dirtyAgents ? 'Review' : 'Clean'}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              {dirtyAgents} dirty · {totalIssues} issues
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue='health' className='gap-4'>
          <TabsList>
            <TabsTrigger value='health'>Health</TabsTrigger>
            <TabsTrigger value='search'>Search</TabsTrigger>
            <TabsTrigger value='hygiene'>Hygiene</TabsTrigger>
          </TabsList>

          <TabsContent value='health' className='space-y-4'>
            <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
              {agents.length === 0 ? (
                <Card className='xl:col-span-3'>
                  <CardContent className='text-muted-foreground pt-6 text-sm'>
                    Ingen memory status kunde läsas från bridge.
                  </CardContent>
                </Card>
              ) : (
                agents.map((agent) => <MemoryAgentCard key={agent.agentId} agent={agent} />)
              )}
            </div>
          </TabsContent>

          <TabsContent value='search' className='space-y-4'>
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
                <CardContent className='text-muted-foreground text-sm'>
                  Matching QMD chunks
                </CardContent>
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
          </TabsContent>

          <TabsContent value='hygiene' className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Memory hygiene</CardTitle>
                <CardDescription>
                  Det här är review-signaler, inte automatiska ändringar i MEMORY.md.
                </CardDescription>
              </CardHeader>
              <CardContent className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4'>
                {[
                  {
                    title: 'Dirty indexes',
                    value: dirtyAgents,
                    detail: 'Kör index rebuild bara om dirty > 0.'
                  },
                  {
                    title: 'Audit issues',
                    value: totalIssues,
                    detail: 'Scan/dreaming-problem som bör granskas.'
                  },
                  {
                    title: 'Spaced entries',
                    value: agents.reduce(
                      (sum, agent) => sum + (agent.audit?.spacedEntryCount ?? 0),
                      0
                    ),
                    detail: 'Kandidater som återkommer över tid.'
                  },
                  {
                    title: 'Invalid dream entries',
                    value: agents.reduce(
                      (sum, agent) => sum + (agent.audit?.invalidEntryCount ?? 0),
                      0
                    ),
                    detail: 'Bör vara 0.'
                  }
                ].map((item) => (
                  <div key={item.title} className='rounded-xl border bg-background/40 p-4'>
                    <div className='text-muted-foreground text-sm'>{item.title}</div>
                    <div className='text-2xl font-semibold'>{formatNumber(item.value)}</div>
                    <div className='text-muted-foreground mt-1 text-xs'>{item.detail}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recommended loop</CardTitle>
                <CardDescription>Safe order for improving recall quality.</CardDescription>
              </CardHeader>
              <CardContent className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                {[
                  ['1. Search', 'Use QMD to find relevant prior context before decisions.'],
                  [
                    '2. Save raw',
                    'Promote useful search hits into Knowledge Inbox, not directly to MEMORY.md.'
                  ],
                  [
                    '3. Review dreams',
                    'Use DREAMS.md as the human-readable promotion diary before long-term memory edits.'
                  ]
                ].map(([title, detail]) => (
                  <div key={title} className='rounded-xl border bg-background/40 p-4'>
                    <div className='font-medium'>{title}</div>
                    <div className='text-muted-foreground mt-1 text-sm'>{detail}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
