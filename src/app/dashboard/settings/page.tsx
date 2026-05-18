import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSystemStatus } from '@/db/system';

export const metadata = {
  title: 'Agent OS: Settings'
};

function yesNo(value: boolean) {
  return value ? 'yes' : 'no';
}

function statusVariant(status: string) {
  if (['online', 'ok', 'connected'].includes(status)) return 'default' as const;
  if (['missing', 'unknown', 'fallback'].includes(status)) return 'outline' as const;
  return 'secondary' as const;
}

export default async function SettingsPage() {
  const status = await getSystemStatus();
  const sources = [
    {
      name: 'Bridge',
      status: status.bridge.status,
      detail: process.env.AGENT_OS_BRIDGE_URL
        ? 'AGENT_OS_BRIDGE_URL configured'
        : 'AGENT_OS_BRIDGE_URL missing',
      configured: Boolean(process.env.AGENT_OS_BRIDGE_URL && process.env.AGENT_OS_BRIDGE_TOKEN)
    },
    {
      name: 'Postgres',
      status: status.db.status,
      detail: process.env.DATABASE_URL ? 'DATABASE_URL configured' : 'DATABASE_URL missing',
      configured: Boolean(process.env.DATABASE_URL)
    },
    {
      name: 'OpenClaw CLI',
      status: status.openclaw?.status ?? 'unknown',
      detail: status.openclaw?.version ?? status.openclaw?.error ?? 'No OpenClaw status returned',
      configured: Boolean(status.openclaw?.available)
    },
    {
      name: 'OpenClaw agents',
      status: status.agents.source,
      detail: `${status.agents.count} agents visible`,
      configured: status.agents.count > 0
    },
    {
      name: 'Memory/QMD',
      status: status.memory.ok ? 'ok' : 'missing',
      detail:
        status.memory.error ??
        `${status.memory.summary?.chunks ?? 0} chunks across ${status.memory.summary?.agentCount ?? status.memory.agents.length} agents`,
      configured: status.memory.ok
    },
    {
      name: 'Subagent runs',
      status: status.subagents?.ok ? 'ok' : 'missing',
      detail: status.subagents?.ok
        ? `${status.subagents.runningCount} running · ${status.subagents.recent.length} recent · ${status.subagents.source}`
        : (status.subagents?.error ?? 'No subagent source returned'),
      configured: Boolean(status.subagents?.available)
    }
  ];

  const guardrails = [
    'No runtime mock datasets in product routes.',
    'Write actions should go through guarded API routes or bridge endpoints.',
    'External integrations stay read-only until permission checks exist.',
    'Secrets belong in environment/config, never in visible UI or markdown.'
  ];

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              real configuration only
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Settings</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Systemstatus, datakällor och guardrails. Den här sidan ersätter template-icons sidan
              och visar bara faktisk konfiguration.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>System</div>
            <div className='font-mono'>{status.ok ? 'ok' : 'degraded'}</div>
            <div className='text-muted-foreground mt-2 text-xs'>
              {new Date(status.bridge.now).toLocaleString('sv-SE')}
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Bridge</CardDescription>
              <CardTitle className='text-3xl'>{status.bridge.status}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              v{status.bridge.version ?? 'unknown'} · Uptime{' '}
              {Math.floor(status.bridge.uptimeSeconds / 60)} min
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>DB</CardDescription>
              <CardTitle className='text-3xl'>{status.db.status}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>Postgres read model</CardContent>
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
              <CardDescription>Knowledge</CardDescription>
              <CardTitle className='text-3xl'>{status.knowledge.wikified}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>Wikified nodes</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Subagents</CardDescription>
              <CardTitle className='text-3xl'>{status.subagents?.runningCount ?? 0}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              {status.subagents?.source ?? 'no source'}
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-5'>
          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Data sources</CardTitle>
              <CardDescription>
                Configured sources. No sample links, no fake datasets.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {sources.map((source) => (
                <div key={source.name} className='rounded-xl border bg-background/40 p-4'>
                  <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                    <div>
                      <div className='font-medium'>{source.name}</div>
                      <div className='text-muted-foreground mt-1 text-sm'>{source.detail}</div>
                    </div>
                    <div className='flex gap-2'>
                      <Badge variant={statusVariant(source.status)}>{source.status}</Badge>
                      <Badge variant={source.configured ? 'default' : 'outline'}>
                        configured: {yesNo(source.configured)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Guardrails</CardTitle>
              <CardDescription>Håll copilotten ren medan vi bygger upp den igen.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {guardrails.map((guardrail) => (
                <div key={guardrail} className='rounded-xl border bg-background/40 p-3 text-sm'>
                  {guardrail}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
