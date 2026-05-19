import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getKnowledgeSnapshot } from '@/db/knowledge';
import { getSystemStatus, runCommand } from '@/db/system';

const commands = [
  {
    id: 'bridge-health',
    title: 'Bridge health',
    description: 'DB, bridge uptime, agents, memory och knowledge counters.'
  },
  {
    id: 'memory-status',
    title: 'Memory status',
    description: 'OpenClaw/QMD status per agent: files, chunks, dirty state.'
  },
  {
    id: 'agents-list',
    title: 'Agents list',
    description: 'Configured OpenClaw agent snapshot from the bridge.'
  },
  {
    id: 'knowledge-snapshot',
    title: 'Knowledge snapshot',
    description: 'Counts and vault file totals without dumping the full vault.'
  }
];

function formatUptime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days) return `${days}d ${hours % 24}h`;
  if (hours) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

type CommandKnowledgeSource = Awaited<ReturnType<typeof getKnowledgeSnapshot>>['sources'][number];

function knowledgePrimaryAction(source?: CommandKnowledgeSource) {
  if (!source) return null;
  if (source.status === 'raw') return { label: 'Extract', detail: 'Make raw source readable.' };
  if (source.status === 'extracted')
    return { label: 'Wikify', detail: 'Create reviewable wiki draft.' };
  if (source.status === 'wikified')
    return { label: 'Mark reviewed', detail: 'Approve the wiki draft for promotion review.' };
  if (source.status === 'reviewed')
    return { label: 'Promote', detail: 'Mark as context candidate.' };
  return null;
}

export default async function CommandPage({
  searchParams
}: {
  searchParams: Promise<{ run?: string; action?: string; status?: string }>;
}) {
  const params = await searchParams;
  const [status, commandResult, knowledge] = await Promise.all([
    getSystemStatus(),
    params.run ? runCommand(params.run) : Promise.resolve(null),
    getKnowledgeSnapshot()
  ]);
  const nextKnowledgeSource =
    knowledge.sources.find((source) =>
      ['raw', 'extracted', 'wikified', 'reviewed'].includes(source.status)
    ) ?? null;
  const nextKnowledgeAction = knowledgePrimaryAction(nextKnowledgeSource ?? undefined);

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              Command center
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Command</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Läs av OpenClaw brainstemmen från cockpitten och kör ett litet antal allowlistade
              actions. Writes kräver explicit confirm och går via bridge/auditade endpoints.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Bridge</div>
            <div className='font-mono'>{status.bridge.status}</div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>DB</CardDescription>
              <CardTitle className='text-3xl'>{status.db.status}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Private Postgres via bridge
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Agents</CardDescription>
              <CardTitle className='text-3xl'>{status.agents.count}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              {status.agents.source}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Wiki</CardDescription>
              <CardTitle className='text-3xl'>{status.knowledge.wikified}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Wikified knowledge nodes
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Uptime</CardDescription>
              <CardTitle className='text-3xl'>
                {formatUptime(status.bridge.uptimeSeconds)}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Bridge process uptime
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Memory/QMD</CardTitle>
            <CardDescription>Current indexed memory state from OpenClaw.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {status.memory.error && (
              <div className='rounded-xl border border-destructive/40 p-3 text-sm'>
                {status.memory.error}
              </div>
            )}
            <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
              {status.memory.agents.map((agent) => (
                <div key={agent.agentId} className='rounded-xl border bg-background/40 p-4'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='font-medium'>{agent.agentId}</div>
                    <Badge variant={agent.dirty ? 'destructive' : 'secondary'}>
                      {agent.dirty ? 'dirty' : 'clean'}
                    </Badge>
                  </div>
                  <div className='text-muted-foreground mt-2 grid grid-cols-2 gap-2 text-sm'>
                    <div>backend</div>
                    <div className='text-right font-mono'>{agent.backend ?? '—'}</div>
                    <div>files</div>
                    <div className='text-right font-mono'>{agent.files ?? '—'}</div>
                    <div>chunks</div>
                    <div className='text-right font-mono'>{agent.chunks ?? '—'}</div>
                  </div>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    {(agent.sources ?? []).map((source) => (
                      <Badge key={source} variant='outline'>
                        {source}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-5'>
          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Runbook</CardTitle>
              <CardDescription>Safe read-only commands exposed to the cockpit.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {commands.map((command) => (
                <div key={command.id} className='rounded-xl border bg-background/40 p-4'>
                  <div className='font-medium'>{command.title}</div>
                  <p className='text-muted-foreground mt-1 text-sm'>{command.description}</p>
                  <Button asChild size='sm' variant='outline' className='mt-3'>
                    <a href={`/dashboard/command?run=${command.id}`}>Run</a>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Output</CardTitle>
              <CardDescription>
                {commandResult
                  ? `${commandResult.command} completed`
                  : 'Run a command to inspect output.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {commandResult ? (
                <pre className='text-muted-foreground max-h-[640px] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/30 p-4 text-xs leading-relaxed'>
                  {JSON.stringify(commandResult, null, 2)}
                </pre>
              ) : (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  Ingen command körd ännu.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Guarded actions</CardTitle>
            <CardDescription>
              Smala write-actions med confirm. Inga generiska shell-/Gateway-kommandon exponeras.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {params.action && (
              <div className='rounded-xl border bg-muted/30 p-3 text-sm'>
                <span className='font-medium'>{params.action}</span>: {params.status}
              </div>
            )}

            <div className='rounded-2xl border bg-background/40 p-4'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='max-w-2xl space-y-1'>
                  <div className='font-medium'>Harvest session decisions</div>
                  <p className='text-muted-foreground text-sm leading-6'>
                    Importera högsignal-sessioner och skapa reviewbara decision/TODO/preference
                    items i Knowledge inbox. Inget promoteras automatiskt.
                  </p>
                </div>
                <form
                  action='/api/command/actions'
                  method='post'
                  className='w-full space-y-3 lg:max-w-sm'
                >
                  <input type='hidden' name='action' value='harvest-session-decisions' />
                  <div className='grid grid-cols-3 gap-2'>
                    <div className='space-y-1'>
                      <Label htmlFor='command-session-limit'>Max</Label>
                      <Input
                        id='command-session-limit'
                        name='limit'
                        type='number'
                        defaultValue={5}
                        min={1}
                        max={20}
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label htmlFor='command-session-score'>Score</Label>
                      <Input
                        id='command-session-score'
                        name='minScore'
                        type='number'
                        defaultValue={35}
                        min={1}
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label htmlFor='command-session-signals'>Signals</Label>
                      <Input
                        id='command-session-signals'
                        name='signalsPerSession'
                        type='number'
                        defaultValue={8}
                        min={1}
                        max={12}
                      />
                    </div>
                  </div>
                  <label className='flex items-start gap-2 text-xs text-muted-foreground'>
                    <input name='confirm' type='checkbox' className='mt-0.5' />
                    <span>Confirm: create extracted Knowledge inbox items for review.</span>
                  </label>
                  <Button type='submit' className='w-full'>
                    Run guarded harvest
                  </Button>
                </form>
              </div>
            </div>

            <div className='rounded-2xl border bg-background/40 p-4'>
              <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                <div className='max-w-2xl space-y-2'>
                  <div className='font-medium'>Process next Knowledge source</div>
                  {nextKnowledgeSource && nextKnowledgeAction ? (
                    <>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Badge variant='outline'>{nextKnowledgeSource.status}</Badge>
                        <Badge variant='outline'>{nextKnowledgeSource.kind}</Badge>
                      </div>
                      <p className='text-sm font-medium'>{nextKnowledgeSource.title}</p>
                      <p className='text-muted-foreground line-clamp-2 text-sm leading-6'>
                        {nextKnowledgeSource.summary || nextKnowledgeAction.detail}
                      </p>
                    </>
                  ) : (
                    <p className='text-muted-foreground text-sm leading-6'>
                      Ingen raw/extracted/wikified/reviewed knowledge source väntar just nu.
                    </p>
                  )}
                </div>

                {nextKnowledgeSource && nextKnowledgeAction ? (
                  <form
                    action='/api/command/actions'
                    method='post'
                    className='w-full space-y-3 lg:max-w-sm'
                  >
                    <input type='hidden' name='action' value='process-knowledge-source' />
                    <input type='hidden' name='sourceId' value={nextKnowledgeSource.id} />
                    <input type='hidden' name='sourceStatus' value={nextKnowledgeSource.status} />
                    <input type='hidden' name='mode' value='advance' />
                    <label className='flex items-start gap-2 text-xs text-muted-foreground'>
                      <input name='confirm' type='checkbox' className='mt-0.5' />
                      <span>Confirm: run “{nextKnowledgeAction.label}” on this exact source.</span>
                    </label>
                    <Button type='submit' className='w-full'>
                      {nextKnowledgeAction.label} source
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>

            {nextKnowledgeSource ? (
              <div className='rounded-2xl border bg-background/40 p-4'>
                <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
                  <div className='max-w-2xl space-y-1'>
                    <div className='font-medium'>Archive next Knowledge source</div>
                    <p className='text-muted-foreground text-sm leading-6'>
                      Flyttar samma valda source ur aktiv kö. Använd när den är noise eller inte ska
                      bli context.
                    </p>
                  </div>
                  <form
                    action='/api/command/actions'
                    method='post'
                    className='w-full space-y-3 lg:max-w-sm'
                  >
                    <input type='hidden' name='action' value='process-knowledge-source' />
                    <input type='hidden' name='sourceId' value={nextKnowledgeSource.id} />
                    <input type='hidden' name='sourceStatus' value={nextKnowledgeSource.status} />
                    <input type='hidden' name='mode' value='archive' />
                    <label className='flex items-start gap-2 text-xs text-muted-foreground'>
                      <input name='confirm' type='checkbox' className='mt-0.5' />
                      <span>Confirm: archive this exact source.</span>
                    </label>
                    <Button type='submit' variant='outline' className='w-full'>
                      Archive source
                    </Button>
                  </form>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
