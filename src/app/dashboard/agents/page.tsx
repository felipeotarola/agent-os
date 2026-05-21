import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getOpenClawAgents } from '@/db/agents';
import Link from 'next/link';

function displayName(agent: Awaited<ReturnType<typeof getOpenClawAgents>>['agents'][number]) {
  return agent.identityName || agent.name || agent.id;
}

const agentGlow = [
  'from-primary/35 via-primary/20 to-primary/10',
  'from-primary/25 via-primary/15 to-primary/30',
  'from-primary/20 via-primary/25 to-primary/10',
  'from-primary/30 via-primary/10 to-primary/20'
];

export default async function AgentsPage() {
  const { agents, source } = await getOpenClawAgents();
  const defaultAgent = agents.find((agent) => agent.isDefault);
  const routedCount = agents.reduce((sum, agent) => sum + (agent.bindings ?? 0), 0);

  return (
    <PageContainer>
      <div className='relative flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border bg-background p-4 md:p-6'>
        <div className='pointer-events-none absolute inset-0 opacity-80'>
          <div className='absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/20 blur-3xl' />
          <div className='absolute right-0 top-10 h-80 w-80 rounded-full bg-primary/25 blur-3xl' />
          <div className='absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-primary/10 blur-3xl' />
          <div className='absolute inset-0 bg-primary/5' />
        </div>

        <div className='relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge
              variant='outline'
              className='border-primary/40 bg-primary/10 text-primary shadow-sm'
            >
              Cai agent network
            </Badge>
            <h1 className='max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl'>
              Agents that feel alive, not like config rows.
            </h1>
            <p className='max-w-2xl text-sm text-muted-foreground md:text-base'>
              Cockpit-vy över OpenClaw-agenterna: identitet, modell, workspace och routing. Nästa
              steg är att göra creation-flowet lika tydligt som korten.
            </p>
          </div>
          <div className='rounded-2xl border bg-card/70 p-4 text-sm shadow-sm backdrop-blur'>
            <div className='text-muted-foreground'>Source</div>
            <div className='font-mono'>{source}</div>
          </div>
        </div>

        <div className='relative grid grid-cols-1 gap-4 md:grid-cols-3'>
          <Card className='border-primary/20 bg-card/75 shadow-sm backdrop-blur'>
            <CardHeader className='pb-2'>
              <CardDescription>Agents</CardDescription>
              <CardTitle className='text-3xl'>{agents.length}</CardTitle>
            </CardHeader>
            <CardContent className='text-sm text-muted-foreground'>
              Configured OpenClaw agents
            </CardContent>
          </Card>
          <Card className='border-primary/20 bg-card/75 shadow-sm backdrop-blur'>
            <CardHeader className='pb-2'>
              <CardDescription>Default</CardDescription>
              <CardTitle className='truncate text-3xl'>
                {defaultAgent?.identityName ?? '—'}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-sm text-muted-foreground'>
              Primary cockpit agent
            </CardContent>
          </Card>
          <Card className='border-primary/20 bg-card/75 shadow-sm backdrop-blur'>
            <CardHeader className='pb-2'>
              <CardDescription>Bindings</CardDescription>
              <CardTitle className='text-3xl'>{routedCount}</CardTitle>
            </CardHeader>
            <CardContent className='text-sm text-muted-foreground'>
              Channel/route bindings
            </CardContent>
          </Card>
        </div>

        <div className='relative grid grid-cols-1 gap-4 xl:grid-cols-3'>
          {agents.map((agent, index) => (
            <Card
              key={agent.id}
              className='group relative overflow-hidden border-primary/15 bg-card/75 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10'
            >
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-br ${
                  agentGlow[index % agentGlow.length]
                } opacity-80 blur-2xl transition group-hover:opacity-100`}
              />
              <CardHeader className='relative'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-background/55 text-3xl shadow-inner'>
                      {agent.identityEmoji ?? '🤖'}
                    </div>
                    <CardTitle className='flex items-center gap-2 text-2xl'>
                      <span className='truncate'>{displayName(agent)}</span>
                    </CardTitle>
                    <CardDescription className='mt-1 font-mono'>{agent.id}</CardDescription>
                  </div>
                  {agent.isDefault && <Badge className='shadow-sm'>default</Badge>}
                </div>
              </CardHeader>
              <CardContent className='relative space-y-4'>
                <div className='grid grid-cols-2 gap-3 text-sm'>
                  <div className='rounded-xl border bg-background/45 p-3'>
                    <div className='text-muted-foreground'>Model</div>
                    <div className='mt-1 line-clamp-2 break-all font-mono text-xs'>
                      {agent.model ?? '—'}
                    </div>
                  </div>
                  <div className='rounded-xl border bg-background/45 p-3'>
                    <div className='text-muted-foreground'>Bindings</div>
                    <div className='mt-1 text-xl font-semibold'>{agent.bindings ?? 0}</div>
                  </div>
                </div>
                <div className='space-y-2 text-xs'>
                  <div>
                    <div className='text-muted-foreground'>Workspace</div>
                    <div className='mt-1 line-clamp-2 break-all rounded-xl border bg-muted/30 p-2 font-mono'>
                      {agent.workspace ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className='text-muted-foreground'>Agent dir</div>
                    <div className='mt-1 line-clamp-2 break-all rounded-xl border bg-muted/30 p-2 font-mono'>
                      {agent.agentDir ?? '—'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card className='group relative flex min-h-[360px] overflow-hidden border-dashed border-primary/35 bg-card/55 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-xl hover:shadow-primary/10'>
            <div className='pointer-events-none absolute inset-0 bg-primary/10' />
            <CardContent className='relative flex flex-1 flex-col items-center justify-center p-6 text-center'>
              <div className='mb-5 flex size-16 items-center justify-center rounded-3xl border border-primary/30 bg-primary/10 text-4xl text-primary shadow-inner transition group-hover:scale-105'>
                +
              </div>
              <CardTitle className='text-2xl'>Add agent</CardTitle>
              <CardDescription className='mt-2 max-w-xs'>
                Skapa nästa specialist: coding worker, research scout, GTM assistant eller något
                helt annat.
              </CardDescription>
              <div className='mt-5 flex flex-col gap-2 sm:flex-row'>
                <Button asChild className='rounded-full'>
                  <Link href='/dashboard/settings'>Configure</Link>
                </Button>
                <Button asChild variant='outline' className='rounded-full'>
                  <Link href='/dashboard/chat'>Ask Cai</Link>
                </Button>
              </div>
              <p className='mt-4 text-xs text-muted-foreground'>
                Placeholder for a real guided creation flow.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
