import { AvatarSettingsCard } from '@/components/avatar-settings-card';
import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { getSystemStatus } from '@/db/system';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Settings'
};

type SetupState = 'ready' | 'verify' | 'unavailable';
type SettingsSection = 'connections' | 'profile' | 'safety' | 'system';

interface SourceRow {
  name: string;
  status: string;
  detail: string;
  setup: SetupState;
}

interface StatusMetric {
  label: string;
  value: string | number;
  detail: string;
}

interface SystemLink {
  title: string;
  href: string;
  detail: string;
}

interface SystemGroup {
  id: string;
  title: string;
  description: string;
  links: SystemLink[];
}

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'connections', label: 'Connections' },
  { id: 'profile', label: 'Profile' },
  { id: 'safety', label: 'Safety' },
  { id: 'system', label: 'System' }
];

const SYSTEM_GROUPS: SystemGroup[] = [
  {
    id: 'operations',
    title: 'Operations',
    description: 'Daily work, diagnostics, and system signals.',
    links: [
      {
        title: 'Action Center',
        href: '/dashboard/action-center',
        detail: 'Operational task and knowledge queue'
      },
      {
        title: 'Runway',
        href: '/dashboard/runway',
        detail: 'Income and autonomy pressure snapshot'
      },
      {
        title: 'Command',
        href: '/dashboard/command',
        detail: 'Guarded runbooks and operations'
      },
      {
        title: 'Notifications',
        href: '/dashboard/notifications',
        detail: 'Permissions and alerts'
      }
    ]
  },
  {
    id: 'runtime',
    title: 'Runtime & architecture',
    description: 'Agents, relationships, and the system map.',
    links: [
      {
        title: 'Agents',
        href: '/dashboard/agents',
        detail: 'Bindings, status, and visible agents'
      },
      {
        title: 'Assistant',
        href: '/dashboard/assistant',
        detail: 'Cai readiness and memory status'
      },
      {
        title: 'Topology',
        href: '/dashboard/topology',
        detail: 'Runtime graph and bridge topology'
      },
      {
        title: 'Architecture',
        href: '/dashboard/architecture',
        detail: 'System map and documentation'
      }
    ]
  },
  {
    id: 'studios',
    title: 'Studios',
    description: 'Focused workspaces for content and strategy.',
    links: [
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
      }
    ]
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Read-only views into connected services.',
    links: [
      {
        title: 'GitHub',
        href: '/dashboard/github',
        detail: 'Code signals and notifications'
      },
      {
        title: 'Vercel',
        href: '/dashboard/vercel',
        detail: 'Deployment observability'
      },
      {
        title: 'Supabase',
        href: '/dashboard/supabase',
        detail: 'Database observability'
      }
    ]
  }
];

const GUARDRAILS = [
  {
    title: 'Runtime data integrity',
    detail: 'Product routes use real runtime data or an explicit unavailable state.'
  },
  {
    title: 'Guarded writes',
    detail: 'Mutations cross protected API routes or bridge endpoints.'
  },
  {
    title: 'Read-only integrations',
    detail: 'External services stay read-only until permission checks exist.'
  },
  {
    title: 'Secret boundary',
    detail: 'Secret values remain server-side and out of visible UI or markdown.'
  }
];

const statusDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function statusVariant(status: string) {
  if (['online', 'ok', 'connected', 'available'].includes(status)) return 'default' as const;
  if (['missing', 'unknown', 'fallback', 'unavailable'].includes(status)) return 'outline' as const;
  return 'secondary' as const;
}

function setupVariant(setup: SetupState) {
  if (setup === 'ready') return 'default' as const;
  if (setup === 'verify') return 'secondary' as const;
  return 'outline' as const;
}

function setupLabel(setup: SetupState) {
  if (setup === 'ready') return 'Ready';
  if (setup === 'verify') return 'Verify';
  return 'Unavailable';
}

function SettingsRightRail({
  statusOk,
  configuredCount,
  totalSources,
  checkedAt
}: {
  statusOk: boolean;
  configuredCount: number;
  totalSources: number;
  checkedAt: string;
}) {
  const completion = totalSources > 0 ? Math.round((configuredCount / totalSources) * 100) : 0;

  return (
    <>
      <Card className='gap-4 py-4'>
        <CardHeader className='px-4'>
          <CardTitle className='text-base'>Setup pulse</CardTitle>
          <CardDescription>Live readiness, without sample data.</CardDescription>
          <CardAction>
            <Badge variant={statusOk ? 'default' : 'outline'}>
              {statusOk ? 'Healthy' : 'Needs setup'}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className='flex flex-col gap-3 px-4'>
          <div className='flex items-end justify-between gap-3'>
            <div>
              <span className='text-2xl font-semibold tabular-nums'>{configuredCount}</span>
              <span className='text-muted-foreground text-sm'> / {totalSources} confirmed</span>
            </div>
            <span className='text-muted-foreground text-xs tabular-nums'>{completion}%</span>
          </div>
          <Progress value={completion} aria-label={`${completion}% of sources confirmed`} />
          <time className='text-muted-foreground text-xs' dateTime={checkedAt}>
            Checked {statusDateFormatter.format(new Date(checkedAt))}
          </time>
        </CardContent>
      </Card>

      <Card className='gap-4 py-4'>
        <CardHeader className='px-4'>
          <CardTitle className='text-base'>Configuration scope</CardTitle>
          <CardDescription>What belongs in this workspace.</CardDescription>
          <CardAction>
            <Badge variant='outline'>Local-first</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className='px-4'>
          <ul className='text-muted-foreground flex flex-col gap-3 text-sm'>
            <li className='flex items-start gap-3'>
              <Icons.activity
                aria-hidden='true'
                className='text-foreground mt-0.5 size-4 shrink-0'
              />
              <span>Runtime health and data-source readiness.</span>
            </li>
            <li className='flex items-start gap-3'>
              <Icons.account
                aria-hidden='true'
                className='text-foreground mt-0.5 size-4 shrink-0'
              />
              <span>Browser-local profile and avatar preferences.</span>
            </li>
            <li className='flex items-start gap-3'>
              <Icons.lock aria-hidden='true' className='text-foreground mt-0.5 size-4 shrink-0' />
              <span>Secret values are managed in the Credentials workspace.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function SettingsSectionNav({ activeSection }: { activeSection: SettingsSection }) {
  return (
    <nav aria-label='Settings sections' className='rounded-xl border bg-muted/20 p-1'>
      <div className='grid grid-cols-2 gap-1 sm:grid-cols-4'>
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = section.id === activeSection;
          const href =
            section.id === 'connections'
              ? '/dashboard/settings'
              : `/dashboard/settings?section=${section.id}`;

          return (
            <Link
              key={section.id}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' }),
                'w-full'
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function StatusStrip({
  statusOk,
  checkedAt,
  metrics
}: {
  statusOk: boolean;
  checkedAt: string;
  metrics: StatusMetric[];
}) {
  return (
    <Card className='gap-0 overflow-hidden py-0' aria-label='System readiness snapshot'>
      <CardContent className='px-0'>
        <div className='grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]'>
          <div className='flex min-h-24 flex-col justify-between gap-3 border-r border-b bg-muted/20 p-4'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              Real configuration
            </Badge>
            <div>
              <div className='font-semibold'>System {statusOk ? 'healthy' : 'degraded'}</div>
              <time className='text-muted-foreground text-xs tabular-nums' dateTime={checkedAt}>
                {statusDateFormatter.format(new Date(checkedAt))}
              </time>
            </div>
          </div>
          {metrics.map((metric) => (
            <dl
              key={metric.label}
              className='flex min-h-24 flex-col justify-between gap-2 border-r border-b p-4'
            >
              <dt className='text-muted-foreground text-xs font-medium'>{metric.label}</dt>
              <div>
                <dd className='truncate text-xl font-semibold tabular-nums'>{metric.value}</dd>
                <dd className='text-muted-foreground mt-1 truncate text-xs'>{metric.detail}</dd>
              </div>
            </dl>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DataSourcesCard({ sources }: { sources: SourceRow[] }) {
  return (
    <Card className='min-w-0 gap-4'>
      <CardHeader>
        <CardTitle>Data sources</CardTitle>
        <CardDescription>
          Runtime connections and setup state. Missing local credentials are shown honestly.
        </CardDescription>
        <CardAction>
          <Badge variant='outline'>{sources.length} sources</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className='hidden sm:block'>
          <Table>
            <TableCaption className='sr-only'>Agent OS data-source readiness</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Runtime state</TableHead>
                <TableHead className='text-right'>Setup</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.name}>
                  <TableCell className='max-w-md whitespace-normal'>
                    <div className='font-medium'>{source.name}</div>
                    <div className='text-muted-foreground mt-0.5 text-xs leading-relaxed'>
                      {source.detail}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(source.status)}>{source.status}</Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <Badge variant={setupVariant(source.setup)}>{setupLabel(source.setup)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <ul className='flex flex-col divide-y sm:hidden'>
          {sources.map((source) => (
            <li key={source.name} className='flex flex-col gap-2 py-3 first:pt-0 last:pb-0'>
              <div className='flex items-start justify-between gap-3'>
                <div className='font-medium'>{source.name}</div>
                <div className='flex shrink-0 flex-wrap justify-end gap-1'>
                  <Badge variant={statusVariant(source.status)}>{source.status}</Badge>
                  <Badge variant={setupVariant(source.setup)}>{setupLabel(source.setup)}</Badge>
                </div>
              </div>
              <div className='text-muted-foreground text-xs leading-relaxed'>{source.detail}</div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function GuardrailsPanel() {
  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle>Operating contract</CardTitle>
        <CardDescription>
          Safety policies that apply across Agent OS. These describe intent, not synthetic health.
        </CardDescription>
        <CardAction>
          <Badge variant='outline'>{GUARDRAILS.length} policies</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className='grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3'>
          {GUARDRAILS.map((guardrail) => (
            <li key={guardrail.title} className='flex gap-3 rounded-xl border bg-background/40 p-4'>
              <div className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg'>
                <Icons.shieldCheck aria-hidden='true' className='text-muted-foreground size-4' />
              </div>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <div className='font-medium'>{guardrail.title}</div>
                  <Badge variant='outline'>Policy</Badge>
                </div>
                <div className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                  {guardrail.detail}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SystemDirectory() {
  const destinationCount = SYSTEM_GROUPS.reduce((count, group) => count + group.links.length, 0);

  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle>System directory</CardTitle>
        <CardDescription>
          Focused admin views stay available without turning the main sidebar into a catalogue.
        </CardDescription>
        <CardAction>
          <Badge variant='outline'>{destinationCount} destinations</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Accordion type='multiple' defaultValue={['operations']} className='rounded-xl border px-4'>
          {SYSTEM_GROUPS.map((group) => (
            <AccordionItem key={group.id} value={group.id}>
              <AccordionTrigger className='hover:no-underline'>
                <span className='min-w-0 pr-3'>
                  <span className='block font-medium'>{group.title}</span>
                  <span className='text-muted-foreground mt-1 block text-xs font-normal'>
                    {group.description}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className='grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-2'>
                  {group.links.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className='group hover:bg-muted/50 focus-visible:ring-ring flex items-center gap-3 rounded-lg border bg-background/40 p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none'
                    >
                      <div className='min-w-0 flex-1'>
                        <div className='text-sm font-medium'>{item.title}</div>
                        <div className='text-muted-foreground mt-1 text-xs'>{item.detail}</div>
                      </div>
                      <Icons.chevronRight
                        aria-hidden='true'
                        className='text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5'
                      />
                    </Link>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function resolveSettingsSection(value: string | string[] | undefined): SettingsSection {
  const section = Array.isArray(value) ? value[0] : value;
  return SETTINGS_SECTIONS.some((candidate) => candidate.id === section)
    ? (section as SettingsSection)
    : 'connections';
}

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const [status, params] = await Promise.all([getSystemStatus(), searchParams]);
  const activeSection = resolveSettingsSection(params.section);
  const bridgeConfigured = Boolean(
    process.env.AGENT_OS_BRIDGE_URL && process.env.AGENT_OS_BRIDGE_TOKEN
  );
  const runtimeKnown = status.bridge.status !== 'missing';

  const sources: SourceRow[] = [
    {
      name: 'Bridge',
      status: status.bridge.status,
      detail: bridgeConfigured
        ? 'Bridge URL and authentication token are configured.'
        : 'AGENT_OS_BRIDGE_URL or AGENT_OS_BRIDGE_TOKEN is unavailable.',
      setup: bridgeConfigured ? 'ready' : 'unavailable'
    },
    {
      name: status.db.source?.provider === 'supabase' ? 'Supabase Postgres' : 'Postgres',
      status: status.db.status,
      detail: status.db.source
        ? `${status.db.source.host} · ${status.db.source.database} · ${status.db.source.user}`
        : process.env.DATABASE_URL
          ? 'DATABASE_URL is configured; runtime details are not available.'
          : 'DATABASE_URL is unavailable in this environment.',
      setup: process.env.DATABASE_URL || status.db.source ? 'ready' : 'unavailable'
    },
    {
      name: 'OpenClaw CLI',
      status: status.openclaw?.status ?? 'unknown',
      detail: status.openclaw?.version ?? status.openclaw?.error ?? 'No OpenClaw status returned.',
      setup: status.openclaw?.available ? 'ready' : 'unavailable'
    },
    {
      name: 'OpenClaw agents',
      status: status.agents.source,
      detail:
        status.agents.source === 'fallback'
          ? 'Agent registry is unavailable in this environment.'
          : `${status.agents.count} agents visible.`,
      setup: status.agents.source === 'fallback' ? 'unavailable' : 'ready'
    },
    {
      name: 'Memory/QMD',
      status: status.memory.ok ? 'ok' : 'missing',
      detail:
        status.memory.error ??
        `${status.memory.summary?.chunks ?? 0} chunks across ${status.memory.summary?.agentCount ?? status.memory.agents.length} agents.`,
      setup: status.memory.ok ? 'ready' : 'unavailable'
    },
    {
      name: 'Supabase observability',
      status: bridgeConfigured ? 'bridge available' : 'unavailable',
      detail: bridgeConfigured
        ? 'Read-only contract is available; service access is verified in Supabase.'
        : 'Bridge credentials are required before service access can be verified.',
      setup: bridgeConfigured ? 'verify' : 'unavailable'
    },
    {
      name: 'Vercel observability',
      status: bridgeConfigured ? 'bridge available' : 'unavailable',
      detail: bridgeConfigured
        ? 'Read-only contract is available; service access is verified in Vercel.'
        : 'Bridge credentials are required before service access can be verified.',
      setup: bridgeConfigured ? 'verify' : 'unavailable'
    },
    {
      name: 'Subagent runs',
      status: status.subagents?.ok ? 'ok' : 'missing',
      detail: status.subagents?.ok
        ? `${status.subagents.runningCount} running · ${status.subagents.recent.length} recent · ${status.subagents.source}`
        : (status.subagents?.error ?? 'No subagent source returned.'),
      setup: status.subagents?.available ? 'ready' : 'unavailable'
    }
  ];

  const configuredCount = sources.filter((source) => source.setup === 'ready').length;
  const metrics: StatusMetric[] = [
    {
      label: 'Bridge',
      value: status.bridge.status,
      detail: status.bridge.version
        ? `v${status.bridge.version} · ${Math.floor(status.bridge.uptimeSeconds / 60)} min`
        : 'Runtime connection'
    },
    {
      label: 'Database',
      value: status.db.status,
      detail:
        status.db.source?.provider === 'supabase'
          ? `Supabase · ${status.db.source.database}`
          : 'Postgres read model'
    },
    {
      label: 'Agents',
      value: status.agents.source === 'fallback' ? '—' : status.agents.count,
      detail: status.agents.source
    },
    {
      label: 'Knowledge',
      value: runtimeKnown ? status.knowledge.wikified : '—',
      detail: 'Wikified nodes'
    },
    {
      label: 'Subagents',
      value: status.subagents?.available ? status.subagents.runningCount : '—',
      detail: status.subagents?.available ? status.subagents.source : 'Unavailable'
    }
  ];

  return (
    <PageContainer
      pageTitle='Settings'
      pageDescription='System readiness, data sources, profile preferences, and focused administration.'
      pageHeaderAction={
        <Button asChild>
          <Link href='/dashboard/credentials'>
            <Icons.lock data-icon='inline-start' />
            Open Credentials
          </Link>
        </Button>
      }
      rightRailTitle='Settings context'
      rightRailDescription='Readiness and configuration scope.'
      rightRail={
        <SettingsRightRail
          statusOk={status.ok}
          configuredCount={configuredCount}
          totalSources={sources.length}
          checkedAt={status.bridge.now}
        />
      }
    >
      <div className='flex flex-1 flex-col gap-4'>
        <StatusStrip statusOk={status.ok} checkedAt={status.bridge.now} metrics={metrics} />
        <SettingsSectionNav activeSection={activeSection} />

        {activeSection === 'connections' && <DataSourcesCard sources={sources} />}
        {activeSection === 'profile' && <AvatarSettingsCard />}
        {activeSection === 'safety' && <GuardrailsPanel />}
        {activeSection === 'system' && <SystemDirectory />}
      </div>
    </PageContainer>
  );
}
