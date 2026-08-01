import PageContainer from '@/components/layout/page-container';
import { AvatarSettingsCard } from '@/components/avatar-settings-card';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSystemStatus } from '@/db/system';
import Link from 'next/link';

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

function SettingsRightRail() {
  const quickPaths = [
    {
      title: 'Credentials',
      href: '/dashboard/credentials',
      detail: 'Manage project keys and local secrets'
    },
    {
      title: 'Topology',
      href: '/dashboard/topology',
      detail: 'Inspect runtime and bridge relationships'
    },
    {
      title: 'Command',
      href: '/dashboard/command',
      detail: 'Open guarded diagnostics and runbooks'
    }
  ];

  return (
    <>
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between gap-3'>
            <CardTitle className='text-base'>Configuration scope</CardTitle>
            <Badge variant='outline'>Local-first</Badge>
          </div>
          <CardDescription>What belongs in this system settings view.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className='text-muted-foreground flex flex-col gap-3 text-sm'>
            <li className='flex items-start gap-3'>
              <Icons.check aria-hidden='true' className='text-foreground mt-0.5 size-4 shrink-0' />
              <span>Runtime health and configured data-source readiness.</span>
            </li>
            <li className='flex items-start gap-3'>
              <Icons.check aria-hidden='true' className='text-foreground mt-0.5 size-4 shrink-0' />
              <span>Browser-local profile name and avatar preferences.</span>
            </li>
            <li className='flex items-start gap-3'>
              <Icons.lock aria-hidden='true' className='text-foreground mt-0.5 size-4 shrink-0' />
              <span>Secret values stay in server-side storage and are managed in Credentials.</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Quick paths</CardTitle>
          <CardDescription>Continue into focused configuration views.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          {quickPaths.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className='hover:bg-muted/50 focus-visible:ring-ring flex items-center gap-3 rounded-xl border bg-background/40 p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none'
            >
              <div className='min-w-0 flex-1'>
                <div className='text-sm font-medium'>{item.title}</div>
                <div className='text-muted-foreground mt-1 text-xs'>{item.detail}</div>
              </div>
              <Icons.chevronRight
                aria-hidden='true'
                className='text-muted-foreground size-4 shrink-0'
              />
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
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
      name: status.db.source?.provider === 'supabase' ? 'Supabase Postgres' : 'Postgres',
      status: status.db.status,
      detail: status.db.source
        ? `${status.db.source.host} · ${status.db.source.database} · ${status.db.source.user}`
        : process.env.DATABASE_URL
          ? 'DATABASE_URL configured'
          : 'DATABASE_URL missing',
      configured: Boolean(process.env.DATABASE_URL || status.db.source)
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
      name: 'Supabase observability',
      status: 'bridge-ready',
      detail: 'Read-only snapshot contract at /supabase/snapshot; credentials stay server-side.',
      configured: Boolean(process.env.AGENT_OS_BRIDGE_URL && process.env.AGENT_OS_BRIDGE_TOKEN)
    },
    {
      name: 'Vercel observability',
      status: 'bridge-ready',
      detail: 'Read-only snapshot contract at /vercel/snapshot; credentials stay server-side.',
      configured: Boolean(process.env.AGENT_OS_BRIDGE_URL && process.env.AGENT_OS_BRIDGE_TOKEN)
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

  const systemDrilldowns = [
    {
      title: 'Action Center',
      href: '/dashboard/action-center',
      detail: 'Operational task and knowledge queue'
    },
    { title: 'Runway', href: '/dashboard/runway', detail: 'Income and autonomy pressure snapshot' },
    {
      title: 'Content Studio',
      href: '/dashboard/content-studio',
      detail: 'Sladdis content and media workflow'
    },
    {
      title: 'Affiliate Store',
      href: '/dashboard/affiliate',
      detail: 'Store opportunities and catalog health'
    },
    {
      title: 'QA Strategy',
      href: '/dashboard/qa-knowledge',
      detail: 'QA offer and strategy knowledge'
    },
    { title: 'Agents', href: '/dashboard/agents', detail: 'Bindings, status and visible agents' },
    { title: 'Assistant', href: '/dashboard/assistant', detail: 'Cai readiness and memory status' },
    { title: 'Topology', href: '/dashboard/topology', detail: 'Runtime graph and bridge topology' },
    { title: 'Command', href: '/dashboard/command', detail: 'Guarded runbooks and operations' },
    { title: 'Architecture', href: '/dashboard/architecture', detail: 'System map and docs' },
    { title: 'Notifications', href: '/dashboard/notifications', detail: 'Permissions and alerts' },
    { title: 'GitHub', href: '/dashboard/github', detail: 'Code signals and notifications' },
    { title: 'Vercel', href: '/dashboard/vercel', detail: 'Deployment observability' },
    { title: 'Supabase', href: '/dashboard/supabase', detail: 'Database observability' }
  ];

  return (
    <PageContainer
      pageTitle='Settings'
      pageDescription='System status, data sources, and operating guardrails. Only live configuration is shown.'
      rightRailTitle='Settings context'
      rightRailDescription='Scope, safeguards, and configuration paths.'
      rightRail={<SettingsRightRail />}
    >
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex flex-wrap items-center gap-3'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              Real configuration only
            </Badge>
            <div className='text-muted-foreground text-sm'>
              Runtime and source readiness snapshot
            </div>
          </div>
          <div className='flex items-center gap-3 text-sm'>
            <Badge variant={status.ok ? 'default' : 'outline'}>
              System {status.ok ? 'ok' : 'degraded'}
            </Badge>
            <div className='text-muted-foreground text-xs tabular-nums'>
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
            <CardContent className='text-muted-foreground text-sm'>
              {status.db.source?.provider === 'supabase'
                ? `Supabase · ${status.db.source.database}`
                : 'Postgres read model'}
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

          <div className='space-y-4 xl:col-span-2'>
            <AvatarSettingsCard />

            <Card>
              <CardHeader>
                <CardTitle>Credentials</CardTitle>
                <CardDescription>
                  Project keys and server-side secrets now live in a dedicated workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant='outline' className='w-full'>
                  <Link href='/dashboard/credentials'>
                    <Icons.lock data-icon='inline-start' />
                    Open Credentials
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System drill-downs</CardTitle>
                <CardDescription>
                  Hidden admin pages kept available without sidebar noise.
                </CardDescription>
              </CardHeader>
              <CardContent className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1'>
                {systemDrilldowns.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className='hover:bg-muted/50 rounded-xl border bg-background/40 p-3 transition-colors'
                  >
                    <div className='text-sm font-medium'>{item.title}</div>
                    <div className='text-muted-foreground mt-1 text-xs'>{item.detail}</div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Guardrails</CardTitle>
                <CardDescription>
                  Keep the cockpit safe and trustworthy as it evolves.
                </CardDescription>
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
      </div>
    </PageContainer>
  );
}
