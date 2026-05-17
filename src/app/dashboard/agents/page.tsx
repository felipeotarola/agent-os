import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getOpenClawAgents } from '@/db/agents';

function displayName(agent: Awaited<ReturnType<typeof getOpenClawAgents>>['agents'][number]) {
  return agent.identityName || agent.name || agent.id;
}

export default async function AgentsPage() {
  const { agents, source } = await getOpenClawAgents();
  const defaultAgent = agents.find((agent) => agent.isDefault);
  const routedCount = agents.reduce((sum, agent) => sum + (agent.bindings ?? 0), 0);

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              OpenClaw agents
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Agents</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Cockpit-vy över OpenClaw-agenterna: identitet, modell, workspace och routing-bindings.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Source</div>
            <div className='font-mono'>{source}</div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Agents</CardDescription>
              <CardTitle className='text-3xl'>{agents.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Configured OpenClaw agents
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Default</CardDescription>
              <CardTitle className='truncate text-3xl'>
                {defaultAgent?.identityName ?? '—'}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Primary cockpit agent
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Bindings</CardDescription>
              <CardTitle className='text-3xl'>{routedCount}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              Channel/route bindings
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          {agents.map((agent) => (
            <Card key={agent.id} className='overflow-hidden'>
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <CardTitle className='flex items-center gap-2 text-2xl'>
                      <span>{agent.identityEmoji ?? '🤖'}</span>
                      <span className='truncate'>{displayName(agent)}</span>
                    </CardTitle>
                    <CardDescription className='mt-1 font-mono'>{agent.id}</CardDescription>
                  </div>
                  {agent.isDefault && <Badge>default</Badge>}
                </div>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-2 gap-3 text-sm'>
                  <div className='rounded-lg border bg-background/40 p-3'>
                    <div className='text-muted-foreground'>Model</div>
                    <div className='mt-1 break-all font-mono text-xs'>{agent.model ?? '—'}</div>
                  </div>
                  <div className='rounded-lg border bg-background/40 p-3'>
                    <div className='text-muted-foreground'>Bindings</div>
                    <div className='mt-1 text-xl font-semibold'>{agent.bindings ?? 0}</div>
                  </div>
                </div>
                <div className='space-y-2 text-xs'>
                  <div>
                    <div className='text-muted-foreground'>Workspace</div>
                    <div className='mt-1 break-all rounded-lg border bg-muted/30 p-2 font-mono'>
                      {agent.workspace ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>Agent dir</div>
                    <div className='mt-1 break-all rounded-lg border bg-muted/30 p-2 font-mono'>
                      {agent.agentDir ?? '—'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
