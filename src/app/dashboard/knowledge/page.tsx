import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getKnowledgeSnapshot } from '@/db/knowledge';
import Link from 'next/link';
import { SubmitButton } from './submit-button';
import { VaultExplorer } from './vault-explorer';
import { VaultGraph } from './vault-graph';

type KnowledgeSource = Awaited<ReturnType<typeof getKnowledgeSnapshot>>['sources'][number];

type LifecycleStatus = 'raw' | 'extracted' | 'wikified' | 'reviewed' | 'promoted' | 'archived';
type ActiveLifecycleStatus = Exclude<LifecycleStatus, 'archived'>;

const lifecycleSteps: Array<{
  id: ActiveLifecycleStatus;
  label: string;
  short: string;
  detail: string;
  tone: string;
}> = [
  {
    id: 'raw',
    label: 'Råkälla',
    short: 'Raw',
    detail: 'Fångad men ej bearbetad',
    tone: 'border-border bg-muted/40 text-card-foreground'
  },
  {
    id: 'extracted',
    label: 'Extraherad',
    short: 'Extracted',
    detail: 'Läsbar text finns',
    tone: 'border-border bg-muted/40 text-card-foreground'
  },
  {
    id: 'wikified',
    label: 'Wikifierad',
    short: 'Wiki',
    detail: 'Syntetiserad note',
    tone: 'border-border bg-muted/40 text-card-foreground'
  },
  {
    id: 'reviewed',
    label: 'Granskad',
    short: 'Reviewed',
    detail: 'Godkänd av människa/agent',
    tone: 'border-border bg-muted/40 text-card-foreground'
  },
  {
    id: 'promoted',
    label: 'Promoterad',
    short: 'Context',
    detail: 'OpenClaw-context kandidat',
    tone: 'border-border bg-muted/40 text-card-foreground'
  }
];

const archivedMeta = {
  id: 'archived' as const,
  label: 'Arkiverad',
  short: 'Archived',
  detail: 'Utanför aktiv kö',
  tone: 'border-border bg-muted/40 text-card-foreground'
};

const knowledgeDrilldowns = [
  { title: 'Mail Radar', href: '/dashboard/mail-radar', detail: 'Gmail candidates for review' },
  { title: 'Wiki', href: '/dashboard/wiki', detail: 'Promoted markdown knowledge' },
  { title: 'Memory', href: '/dashboard/memory', detail: 'Search and save memory signals' },
  { title: 'Journal', href: '/dashboard/journal', detail: 'Raw notes and capture' }
];

const lifecycleOrder = lifecycleSteps.map((step) => step.id);

function normalizeStatus(status: string): LifecycleStatus {
  if (status === 'archived') return 'archived';
  if (lifecycleOrder.includes(status as ActiveLifecycleStatus))
    return status as ActiveLifecycleStatus;
  if (status === 'queued') return 'extracted';
  return 'raw';
}

function statusMeta(status: string) {
  if (normalizeStatus(status) === 'archived') return archivedMeta;
  return lifecycleSteps.find((step) => step.id === normalizeStatus(status)) ?? lifecycleSteps[0];
}

function statusIndex(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === 'archived') return lifecycleOrder.length - 1;
  return lifecycleOrder.indexOf(normalized);
}

function isActiveLifecycleStatus(status: string): status is ActiveLifecycleStatus {
  return lifecycleOrder.includes(status as ActiveLifecycleStatus);
}

function isArchived(source: KnowledgeSource) {
  return normalizeStatus(source.status) === 'archived';
}

function nextAction(source: KnowledgeSource) {
  const status = normalizeStatus(source.status);
  if (status === 'raw') {
    return {
      label: 'Extract',
      helper: 'Hämta/normalisera full text innan vi gör wiki.',
      action: '/api/knowledge/sources/extract',
      hidden: {}
    };
  }
  if (status === 'extracted') {
    return {
      label: 'Wikify',
      helper: 'Gör råtexten till en länkbar knowledge note.',
      action: '/api/knowledge/sources/queue',
      hidden: {}
    };
  }
  if (status === 'wikified') {
    return {
      label: 'Review',
      helper: 'Kolla om syntesen är värd att lita på.',
      action: '/api/knowledge/sources/transition',
      hidden: { status: 'reviewed' }
    };
  }
  if (status === 'reviewed') {
    return {
      label: 'Promote',
      helper: 'Godkänn som OpenClaw-context kandidat.',
      action: '/api/knowledge/sources/transition',
      hidden: { status: 'promoted' }
    };
  }
  if (status === 'promoted') {
    return {
      label: 'Archive',
      helper: 'Arkivera när den inte längre ska ligga aktivt i vaulten.',
      action: '/api/knowledge/sources/transition',
      hidden: { status: 'archived' }
    };
  }
  return null;
}

function ActionForm({
  source,
  action,
  label,
  hidden = {},
  variant = 'outline',
  disabled = false
}: {
  source: KnowledgeSource;
  action: string;
  label: string;
  hidden?: Record<string, string>;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary';
  disabled?: boolean;
}) {
  return (
    <form action={action} method='post'>
      <input type='hidden' name='id' value={source.id} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type='hidden' name={name} value={value} />
      ))}
      <SubmitButton
        size='sm'
        variant={variant}
        disabled={disabled}
        className='w-full whitespace-nowrap'
        pendingText={`${label}…`}
      >
        {label}
      </SubmitButton>
    </form>
  );
}

function compactDate(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('sv-SE', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function rawSourceRows(source: KnowledgeSource) {
  return [
    ['id', source.id],
    ['kind', source.kind],
    ['status', source.status],
    ['source', source.sourceUrl],
    ['raw', source.rawPath],
    ['wiki', source.wikiPath],
    ['created', compactDate(source.createdAt)]
  ].filter(([, value]) => Boolean(value));
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function contentText(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = value.map(contentText).filter(Boolean);
    return parts.length ? parts.join('\n\n') : null;
  }
  if (typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.content === 'string') return record.content;
  if (record.content) return contentText(record.content);
  if (record.message) return contentText(record.message);
  return null;
}

function readableSourceContent(source: KnowledgeSource) {
  const parsedSummary = source.summary ? parseJson(source.summary) : null;
  return (
    contentText(parsedSummary) ??
    source.wikiContent ??
    source.summary ??
    source.sourceUrl ??
    source.rawPath ??
    'Ingen läsbar content hittades för den här källan.'
  );
}

function rawSourceContent(source: KnowledgeSource) {
  const parsedSummary = source.summary ? parseJson(source.summary) : null;
  if (parsedSummary) return JSON.stringify(parsedSummary, null, 2);
  return source.summary || source.wikiContent || source.rawPath || '';
}

function ProgressRail({ status }: { status: string }) {
  const current = statusIndex(status);
  return (
    <div className='flex items-center gap-1.5'>
      {lifecycleSteps.map((step, index) => {
        const active = index <= current;
        const currentStep = index === current;
        return (
          <div key={step.id} className='flex items-center gap-1.5'>
            <div
              className={`size-2.5 rounded-full border ${
                active ? 'border-primary bg-primary' : 'border-muted-foreground/30 bg-muted'
              } ${currentStep ? 'ring-2 ring-primary/30' : ''}`}
              title={step.label}
            />
            {index < lifecycleSteps.length - 1 && (
              <div className={`h-px w-5 ${active ? 'bg-primary/60' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PipelineStep({ status, count }: { status: string; count: number }) {
  const meta = statusMeta(status);
  return (
    <div className={`rounded-xl border p-4 ${meta.tone}`}>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='text-sm font-medium'>{meta.label}</div>
          <div className='mt-1 text-xs opacity-80'>{meta.detail}</div>
        </div>
        <div className='rounded-full bg-background/70 px-2 py-0.5 font-mono text-xs'>{count}</div>
      </div>
    </div>
  );
}

function SourceActions({ source }: { source: KnowledgeSource }) {
  const action = nextAction(source);
  const showArchive = normalizeStatus(source.status) !== 'archived' && action?.label !== 'Archive';
  return (
    <div className='grid grid-cols-2 gap-2 lg:grid-cols-1'>
      {action ? (
        <ActionForm
          source={source}
          action={action.action}
          label={action.label}
          hidden={action.hidden as Record<string, string>}
        />
      ) : (
        <Badge variant='secondary' className='justify-center py-2'>
          No next action
        </Badge>
      )}
      {showArchive && (
        <ActionForm
          source={source}
          action='/api/knowledge/sources/transition'
          label='Archive'
          hidden={{ status: 'archived' }}
        />
      )}
    </div>
  );
}

function ReviewQueue({ sources }: { sources: KnowledgeSource[] }) {
  const reviewable = sources.filter((source) =>
    ['raw', 'extracted', 'wikified', 'reviewed'].includes(normalizeStatus(source.status))
  );

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
          <div>
            <CardTitle>Review queue</CardTitle>
            <CardDescription>
              Snabb triage: behåll, wikifiera, reviewa, promotera eller arkivera. Permanent delete
              ligger fortfarande separat.
            </CardDescription>
          </div>
          <Badge variant='outline'>{reviewable.length} pending</Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-2'>
        {reviewable.length === 0 ? (
          <div className='text-muted-foreground rounded-xl border border-dashed p-5 text-sm'>
            Ingen knowledge-review behövs just nu.
          </div>
        ) : (
          reviewable.slice(0, 8).map((source) => {
            const action = nextAction(source);
            const meta = statusMeta(source.status);
            const showArchive = action?.label !== 'Archive';
            const readable = readableSourceContent(source);
            const raw = rawSourceContent(source);
            return (
              <div key={source.id} className='rounded-xl border bg-background/40 p-3'>
                <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant='outline' className={meta.tone}>
                        {meta.short}
                      </Badge>
                      <Badge variant='secondary'>{source.kind}</Badge>
                      <div className='truncate font-medium'>{source.title}</div>
                    </div>
                    <div className='text-muted-foreground mt-1 line-clamp-2 text-xs leading-5'>
                      {source.summary || source.rawPath}
                    </div>
                  </div>
                  <div className='grid grid-cols-2 gap-2 md:w-44 md:grid-cols-1'>
                    {action && (
                      <ActionForm
                        source={source}
                        action={action.action}
                        label={action.label}
                        hidden={action.hidden as Record<string, string>}
                        variant='default'
                      />
                    )}
                    {showArchive && (
                      <ActionForm
                        source={source}
                        action='/api/knowledge/sources/transition'
                        label='Archive'
                        hidden={{ status: 'archived' }}
                      />
                    )}
                  </div>
                </div>
                <details className='group mt-3 rounded-lg border bg-muted/20'>
                  <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-medium marker:hidden'>
                    <span>Läs innehåll och metadata</span>
                    <span className='text-muted-foreground group-open:hidden'>Expandera</span>
                    <span className='text-muted-foreground hidden group-open:inline'>Stäng</span>
                  </summary>
                  <div className='space-y-3 border-t p-3'>
                    <div>
                      <div className='mb-1 text-xs font-medium'>Läsbar content</div>
                      <pre className='max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 p-3 text-xs leading-5 text-muted-foreground'>
                        {readable}
                      </pre>
                    </div>
                    <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]'>
                      <div>
                        <div className='mb-1 text-xs font-medium'>Rådata</div>
                        <pre className='max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 p-3 font-mono text-[10px] leading-4 text-muted-foreground'>
                          {raw}
                        </pre>
                      </div>
                      <div>
                        <div className='mb-1 text-xs font-medium'>Metadata</div>
                        <div className='space-y-1 rounded-lg bg-background/70 p-3 font-mono text-[10px] text-muted-foreground'>
                          {rawSourceRows(source).map(([label, value]) => (
                            <div key={label} className='grid grid-cols-[4.5rem_1fr] gap-2'>
                              <span className='uppercase tracking-wide'>{label}</span>
                              <span className='break-all'>{String(value)}</span>
                            </div>
                          ))}
                        </div>
                        {source.sourceUrl && (
                          <Button asChild variant='outline' size='sm' className='mt-3 w-full'>
                            <Link href={source.sourceUrl} target='_blank'>
                              Öppna källa
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function SourceInspector({ source }: { source?: KnowledgeSource }) {
  if (!source) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nästa steg</CardTitle>
          <CardDescription>Inga knowledge sources i kön.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const current = statusIndex(source.status);
  const action = nextAction(source);
  const meta = statusMeta(source.status);

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between gap-3'>
          <CardTitle>Nästa i kön</CardTitle>
          <Badge className={meta.tone} variant='outline'>
            {meta.label}
          </Badge>
        </div>
        <CardDescription className='line-clamp-2'>{source.title}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-3'>
          {lifecycleSteps.map((step, index) => {
            const done = index < current;
            const active = index === current;
            return (
              <div key={step.id} className='flex gap-3'>
                <div className='flex flex-col items-center'>
                  <div
                    className={`mt-0.5 size-3 rounded-full border ${
                      done || active
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30 bg-muted'
                    } ${active ? 'ring-4 ring-primary/15' : ''}`}
                  />
                  {index < lifecycleSteps.length - 1 && <div className='h-8 w-px bg-border' />}
                </div>
                <div className='min-w-0 pb-2'>
                  <div className='text-sm font-medium'>{step.label}</div>
                  <div className='text-muted-foreground text-xs'>{step.detail}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className='rounded-xl border bg-muted/30 p-3'>
          <div className='text-xs font-medium'>Rekommenderat nästa steg</div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {action?.helper ?? 'Den här källan är redan arkiverad eller saknar nästa steg.'}
          </div>
          {action && (
            <div className='mt-3'>
              <ActionForm
                source={source}
                action={action.action}
                label={action.label}
                hidden={action.hidden as Record<string, string>}
                variant='default'
              />
            </div>
          )}
        </div>

        <div className='rounded-xl border bg-muted/30 p-3'>
          <div className='text-xs font-medium'>Rådata</div>
          <div className='mt-2 space-y-1 font-mono text-[10px] text-muted-foreground'>
            {rawSourceRows(source).map(([label, value]) => (
              <div key={label} className='grid grid-cols-[4.5rem_1fr] gap-2'>
                <span className='uppercase tracking-wide'>{label}</span>
                <span className='truncate' title={String(value)}>
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
          {source.summary ? (
            <div className='mt-3 line-clamp-3 rounded-lg bg-background/60 p-2 text-xs text-muted-foreground'>
              {source.summary}
            </div>
          ) : null}
          {source.sourceUrl && (
            <a
              className='text-primary mt-3 block truncate text-xs underline'
              href={source.sourceUrl}
              target='_blank'
            >
              Öppna källa →
            </a>
          )}
        </div>

        <div className='border-t pt-3'>
          <div className='mb-2 text-xs font-medium'>Danger zone</div>
          <ActionForm
            source={source}
            action='/api/knowledge/sources/delete'
            label='Ta bort permanent'
            variant='destructive'
          />
        </div>
      </CardContent>
    </Card>
  );
}

function KnowledgeRightRail({
  nextSource,
  dbOnline
}: {
  nextSource?: KnowledgeSource;
  dbOnline: boolean;
}) {
  return (
    <>
      <SourceInspector source={nextSource} />
      <Card>
        <CardHeader>
          <CardTitle>Knowledge drill-downs</CardTitle>
          <CardDescription>
            Related subviews without keeping them in the main sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-2'>
          {knowledgeDrilldowns.map((item) => (
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
          <CardTitle>Agent session harvester</CardTitle>
          <CardDescription>
            Importerar långa/högsignal-sessioner från Cai, Charles och Sladdis som reviewbara
            Knowledge-källor. Inget promoteras automatiskt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action='/api/knowledge/sessions/harvest' method='post' className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='session-limit'>Max</Label>
                <Input
                  id='session-limit'
                  name='limit'
                  type='number'
                  defaultValue={5}
                  min={1}
                  max={20}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='session-score'>Min score</Label>
                <Input id='session-score' name='minScore' type='number' defaultValue={35} min={1} />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='session-signals'>Signals/session</Label>
                <Input
                  id='session-signals'
                  name='signalsPerSession'
                  type='number'
                  defaultValue={8}
                  min={1}
                  max={12}
                />
              </div>
            </div>
            <div className='text-muted-foreground text-xs leading-5'>
              Skapar status <code>extracted</code> med rå transcript-excerpt och separata reviewbara
              decision/TODO/preference-items. Review/Wikify/Promote görs separat.
            </div>
            <SubmitButton className='w-full' disabled={!dbOnline} pendingText='Skördar...'>
              Harvest sessions to inbox
            </SubmitButton>
          </form>
          <Button asChild variant='outline' className='mt-3 w-full'>
            <Link href='/api/knowledge/sessions/inventory' target='_blank'>
              Preview inventory JSON
            </Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Memory harvester</CardTitle>
          <CardDescription>
            Speglar MEMORY.md, daily notes, DREAMS och dreaming/short-term recall till Knowledge
            Inbox som reviewbara källor. Det här är varför minnen inte alltid syntes här tidigare:
            QMD-memory och Knowledge DB är separata lager.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action='/api/knowledge/memory/harvest' method='post' className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='memory-limit'>Max files / agent</Label>
              <Input
                id='memory-limit'
                name='limit'
                type='number'
                defaultValue={20}
                min={1}
                max={80}
              />
            </div>
            <div className='text-muted-foreground text-xs leading-5'>
              Importerar balanserat per agent som <code>extracted</code>; inget blir
              promoted/context-ready utan review.
            </div>
            <SubmitButton className='w-full' disabled={!dbOnline} pendingText='Synkar...'>
              Sync memory to Knowledge
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Session retention policy</CardTitle>
          <CardDescription>
            V1-policy: extrahera först, arkivera hellre än radera, ingen automatisk hard delete.
          </CardDescription>
        </CardHeader>
        <CardContent className='text-muted-foreground space-y-3 text-sm leading-6'>
          <ul className='list-disc space-y-1 pl-4'>
            <li>
              Behåll sessioner med promoted/reviewed knowledge, audit trail eller aktivt
              projektvärde.
            </li>
            <li>Reviewa högsignal-sessioner innan arkiv/delete.</li>
            <li>Delete kräver dry-run, dependency checks och explicit confirm.</li>
          </ul>
          <Button asChild variant='outline' className='w-full'>
            <Link
              href='https://github.com/felipeotarola/agent-os/blob/main/docs/SESSION_RETENTION_POLICY.md'
              target='_blank'
            >
              Open policy
            </Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lägg till rådata</CardTitle>
          <CardDescription>Text/URL först. Fil/PDF kommer senare.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action='/api/knowledge/sources' method='post' className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='title'>Titel</Label>
              <Input id='title' name='title' placeholder='Ex. Karpathy LLM wiki' required />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='sourceUrl'>URL</Label>
              <Input id='sourceUrl' name='sourceUrl' type='url' placeholder='https://...' />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='rawContent'>Råtext</Label>
              <Textarea
                id='rawContent'
                name='rawContent'
                placeholder='Klistra in anteckningar, transkript, research, lösa tankar...'
                className='min-h-32'
              />
            </div>
            <SubmitButton className='w-full' disabled={!dbOnline} pendingText='Sparar...'>
              Spara till raw inbox
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

export default async function KnowledgePage({
  searchParams
}: {
  searchParams: Promise<{
    created?: string;
    queued?: string;
    extracted?: string;
    wikified?: string;
    reviewed?: string;
    promoted?: string;
    archived?: string;
    deleted?: string;
    sessions?: string;
    memory?: string;
    error?: string;
  }>;
}) {
  const [snapshot, params] = await Promise.all([getKnowledgeSnapshot(), searchParams]);
  const pipeline = (snapshot.lifecycle ?? lifecycleOrder).filter(isActiveLifecycleStatus);
  const counts = snapshot.lifecycleCounts ?? {};
  const activeSources = snapshot.sources.filter((source) => !isArchived(source));
  const archivedSources = snapshot.sources.filter(isArchived);
  const nextSource = activeSources.find((source) => nextAction(source)) ?? activeSources[0];

  return (
    <PageContainer
      rightRailTitle='Knowledge context'
      rightRailDescription='Queue, drill-downs, and capture actions.'
      rightRail={<KnowledgeRightRail nextSource={nextSource} dbOnline={snapshot.dbOnline} />}
    >
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              cockpit · context governance · OpenClaw runtime
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Knowledge inbox</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Följ varje källa från rå input till granskad context-kandidat. Agent OS visar och styr
              livscykeln; OpenClaw kör arbetet.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>DB</div>
            <div className='font-mono'>{snapshot.dbOnline ? 'online' : 'fallback / read-only'}</div>
          </div>
        </div>

        {(params.created ||
          params.queued ||
          params.extracted ||
          params.wikified ||
          params.reviewed ||
          params.promoted ||
          params.archived ||
          params.deleted ||
          params.sessions ||
          params.memory ||
          params.error) && (
          <Card className={params.error ? 'border-destructive/40' : 'border-primary/40'}>
            <CardContent className='pt-6 text-sm'>
              {params.created && 'Källa sparad i raw-inboxen.'}
              {params.queued && 'Källa köad för wikifiering.'}
              {params.extracted && 'Källa extraherad till läsbar råtext.'}
              {params.wikified && 'Källa wikifierad till en knowledge page.'}
              {params.reviewed && 'Knowledge markerad som reviewed.'}
              {params.promoted && 'Knowledge promoted som OpenClaw context-kandidat.'}
              {params.archived && 'Knowledge arkiverad.'}
              {params.deleted && 'Knowledge-källa borttagen.'}
              {params.sessions === 'harvested' &&
                'Agent-/chat-sessioner importerade till Knowledge Inbox för review.'}
              {params.sessions === 'previewed' &&
                'Session harvester preview körd. Använd JSON-endpointen för detaljer.'}
              {params.memory === 'harvested' &&
                'Memory/dreaming-filer synkade till Knowledge Inbox för review.'}
              {params.memory === 'previewed' && 'Memory harvester preview körd.'}
              {params.memory === 'use-form' &&
                'Memory harvest körs från formuläret här på Knowledge-sidan, inte som en fristående API-sida.'}
              {params.error === 'no-db' &&
                'Ingen DATABASE_URL i den här miljön. Kör lokalt eller koppla hosted DB.'}
              {params.error === 'missing' && 'Titel och antingen URL eller råtext krävs.'}
              {params.error === 'memory-harvest' &&
                'Memory harvest misslyckades mot bridgen. Försök igen om en stund eller kolla bridge-status.'}
            </CardContent>
          </Card>
        )}

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          {snapshot.stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className='pb-2'>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className='text-3xl'>{stat.value}</CardTitle>
              </CardHeader>
              <CardContent className='text-muted-foreground text-sm'>{stat.detail}</CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Kunskapsflöde</CardTitle>
            <CardDescription>
              raw → extracted → wikified → reviewed → promoted → used as context in OpenClaw.
              Archive är en sidoväg, inte ett aktivt steg.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5'>
              {pipeline.map((status) => (
                <PipelineStep key={status} status={status} count={counts[status] ?? 0} />
              ))}
            </div>
            {archivedSources.length > 0 && (
              <div className='text-muted-foreground mt-4 rounded-xl border bg-muted/30 p-3 text-sm'>
                {archivedSources.length} arkiverade källor ligger utanför den aktiva kön.
              </div>
            )}
          </CardContent>
        </Card>

        <ReviewQueue sources={snapshot.sources} />

        <div className='grid grid-cols-1 gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>Kunskapskö</CardTitle>
              <CardDescription>
                Se exakt var varje dokument är och vad nästa steg är.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeSources.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  Inga aktiva källor i kön. Lägg in första råtexten/URL:en eller återställ något
                  från archive senare.
                </div>
              ) : (
                <div className='space-y-2'>
                  {activeSources.map((source) => {
                    const meta = statusMeta(source.status);
                    return (
                      <div key={source.id} className='rounded-xl border bg-background/40 p-4'>
                        <div className='grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_auto_minmax(170px,0.8fr)_120px] lg:items-center'>
                          <div className='min-w-0'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <div className='truncate font-medium'>{source.title}</div>
                              <Badge variant='secondary'>{source.kind}</Badge>
                            </div>
                            <div className='text-muted-foreground mt-1 line-clamp-2 text-sm'>
                              {source.summary || 'Ingen sammanfattning ännu.'}
                            </div>
                            <div className='text-muted-foreground mt-1 truncate font-mono text-[11px]'>
                              {source.wikiPath ?? source.rawPath}
                            </div>
                          </div>
                          <Badge className={meta.tone} variant='outline'>
                            {meta.label}
                          </Badge>
                          <ProgressRail status={source.status} />
                          <SourceActions source={source} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
              <div>
                <CardTitle>Obsidian vault</CardTitle>
                <CardDescription>
                  Markdown-strukturen som agenter och Obsidian ska läsa: raw, wiki, index, log och
                  agents.md.
                </CardDescription>
              </div>
              <Button asChild variant='outline'>
                <Link href='/api/knowledge/vault/export'>Download vault.zip</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
            <div className='rounded-xl border bg-background/40 p-4'>
              <div className='text-muted-foreground text-sm'>Vault files</div>
              <div className='text-3xl font-semibold'>{snapshot.vault.files.length}</div>
              <div className='text-muted-foreground mt-2 text-xs'>
                Root docs + active raw/wiki sources
              </div>
            </div>
            <details className='rounded-xl border bg-muted/30 p-4 xl:col-span-2'>
              <summary className='cursor-pointer text-sm font-medium'>Visa index.md</summary>
              <pre className='text-muted-foreground mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed'>
                {snapshot.vault.indexMd}
              </pre>
            </details>
            <div className='xl:col-span-3'>
              <VaultGraph files={snapshot.vault.files} />
            </div>
            <div className='xl:col-span-3'>
              <VaultExplorer files={snapshot.vault.files} />
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
