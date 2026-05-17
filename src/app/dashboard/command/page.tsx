import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

export default async function CommandPage({
  searchParams
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const params = await searchParams;
  const [status, commandResult] = await Promise.all([
    getSystemStatus(),
    params.run ? runCommand(params.run) : Promise.resolve(null)
  ]);

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
              Läs av OpenClaw brainstemmen från cockpitten. V1 är medvetet read-only: status,
              diagnostics och snapshots först; actions senare med guardrails.
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
      </div>
    </PageContainer>
  );
}
