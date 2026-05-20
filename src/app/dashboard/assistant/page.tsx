import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getAssistantReadiness } from '@/db/assistant';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Assistant Readiness'
};

function statusBadge(ok: boolean) {
  return <Badge variant={ok ? 'default' : 'secondary'}>{ok ? 'ok' : 'review'}</Badge>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('sv-SE');
}

function formatBytes(value: number | undefined) {
  if (typeof value !== 'number') return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default async function AssistantReadinessPage() {
  const readiness = await getAssistantReadiness();
  const groupedChecks = Object.entries(
    readiness.checks.reduce(
      (groups, check) => {
        groups[check.group] = [...(groups[check.group] ?? []), check];
        return groups;
      },
      {} as Record<string, typeof readiness.checks>
    )
  );
  const memoryChunks = readiness.memory.status.reduce(
    (sum, agent) => sum + (agent.status.chunks ?? 0),
    0
  );
  const sessionFiles = readiness.sessions.reduce((sum, session) => sum + session.sessionFiles, 0);

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              personal assistant readiness
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
              Assistant Readiness
            </h1>
            <p className='text-muted-foreground max-w-3xl text-sm md:text-base'>
              Read-only control panel inspired by OpenClaw Personal Assistant setup: workspace,
              safety posture, memory, sessions, heartbeats and ops signals.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Readiness</div>
            <div className='text-3xl font-semibold'>{readiness.score.percent}%</div>
            <div className='text-muted-foreground mt-1 text-xs'>
              {readiness.score.ok}/{readiness.score.total} checks ·{' '}
              {new Date(readiness.generatedAt).toLocaleString('sv-SE')}
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <CardTitle>Setup score</CardTitle>
                <CardDescription>
                  Not a security audit. A practical readiness checklist for a personal assistant.
                </CardDescription>
              </div>
              <Badge variant={readiness.score.percent >= 80 ? 'default' : 'secondary'}>
                {readiness.score.percent >= 80 ? 'healthy' : 'needs review'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={readiness.score.percent} className='h-2' />
          </CardContent>
        </Card>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Gateway</CardDescription>
              <CardTitle className='text-3xl'>{readiness.system.bridge.status}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>
              OpenClaw {readiness.system.openclaw?.version ?? 'unknown'}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Workspace</CardDescription>
              <CardTitle className='text-3xl'>
                {readiness.workspaceFiles.filter((file) => file.exists).length}/
                {readiness.workspaceFiles.length}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground truncate text-sm'>
              {readiness.workspaceDir}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Memory chunks</CardDescription>
              <CardTitle className='text-3xl'>{memoryChunks.toLocaleString('sv-SE')}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>QMD indexed</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Sessions</CardDescription>
              <CardTitle className='text-3xl'>{sessionFiles.toLocaleString('sv-SE')}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>JSONL session files</CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Logs</CardDescription>
              <CardTitle className='text-3xl'>{readiness.todayLog.exists ? 'live' : '—'}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground truncate text-sm'>
              {readiness.todayLog.path}
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-5'>
          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Readiness checks</CardTitle>
              <CardDescription>
                Green means the assistant setup is observable and conservative enough to operate.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {groupedChecks.map(([group, checks]) => (
                <div key={group} className='rounded-xl border bg-background/40 p-4'>
                  <div className='mb-3 font-medium'>{group}</div>
                  <div className='space-y-3'>
                    {checks.map((check) => (
                      <div
                        key={`${check.group}-${check.label}`}
                        className='flex flex-col gap-2 md:flex-row md:items-start md:justify-between'
                      >
                        <div>
                          <div className='text-sm font-medium'>{check.label}</div>
                          <div className='text-muted-foreground mt-1 text-xs'>{check.detail}</div>
                        </div>
                        {statusBadge(check.ok)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className='space-y-4 xl:col-span-2'>
            <Card>
              <CardHeader>
                <CardTitle>Workspace files</CardTitle>
                <CardDescription>
                  OpenClaw loads these as assistant identity and memory.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-2'>
                {readiness.workspaceFiles.map((file) => (
                  <div key={file.name} className='rounded-xl border bg-background/40 p-3'>
                    <div className='flex items-center justify-between gap-3'>
                      <div className='font-mono text-sm'>{file.name}</div>
                      {statusBadge(file.required ? file.exists : true)}
                    </div>
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {file.exists
                        ? `${formatBytes(file.bytes)} · ${formatDate(file.updatedAt)}`
                        : 'missing'}
                      {file.name === 'HEARTBEAT.md' &&
                        ` · meaningful: ${file.meaningful ? 'yes' : 'no'}`}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Session stores</CardTitle>
                <CardDescription>Matches OpenClaw docs for sessions and metadata.</CardDescription>
              </CardHeader>
              <CardContent className='space-y-2'>
                {readiness.sessions.map((session) => (
                  <div key={session.agentId} className='rounded-xl border bg-background/40 p-3'>
                    <div className='flex items-center justify-between gap-3'>
                      <div className='font-medium'>{session.agentId}</div>
                      <Badge variant={session.exists ? 'default' : 'outline'}>
                        {session.sessionFiles} files
                      </Badge>
                    </div>
                    <div className='text-muted-foreground mt-1 break-all text-xs'>
                      {session.sessionsDir}
                    </div>
                    <div className='text-muted-foreground mt-1 text-xs'>
                      metadata:{' '}
                      {session.metadata.exists ? formatDate(session.metadata.updatedAt) : 'missing'}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          <Card>
            <CardHeader>
              <CardTitle>Recommended commands</CardTitle>
              <CardDescription>Read-only ops checks from the OpenClaw guide.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 font-mono text-xs'>
              {[
                'openclaw status',
                'openclaw status --all',
                'openclaw status --deep',
                'openclaw health --json'
              ].map((command) => (
                <div key={command} className='rounded-xl border bg-background/40 p-3'>
                  {command}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session hygiene</CardTitle>
              <CardDescription>What the docs recommend keeping visible.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              {[
                '/new or /reset starts a clean session for the chat.',
                '/compact preserves useful context before the transcript gets too heavy.',
                'Session metadata tracks usage, route and last activity.',
                'Next build: Session Workspace can expose this directly.'
              ].map((item) => (
                <div key={item} className='rounded-xl border bg-background/40 p-3'>
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Docs quick links</CardTitle>
              <CardDescription>Source material for this readiness view.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {readiness.docs.map((doc) => (
                <Link
                  key={doc.href}
                  href={doc.href}
                  target='_blank'
                  className='hover:bg-muted/50 block rounded-xl border bg-background/40 p-3 text-sm transition-colors'
                >
                  {doc.title}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
