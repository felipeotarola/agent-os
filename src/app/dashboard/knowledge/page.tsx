import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getKnowledgeSnapshot } from '@/db/knowledge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { SubmitButton } from './submit-button';
import { VaultExplorer } from './vault-explorer';
import { VaultGraph } from './vault-graph';

type KnowledgeSnapshot = Awaited<ReturnType<typeof getKnowledgeSnapshot>>;
type KnowledgeSource = KnowledgeSnapshot['sources'][number];

type LifecycleStatus = 'raw' | 'extracted' | 'wikified' | 'reviewed' | 'promoted' | 'archived';
type ActiveLifecycleStatus = Exclude<LifecycleStatus, 'archived'>;
type KnowledgeView = 'queue' | 'review' | 'vault' | 'automation';
type VaultView = 'files' | 'graph';

interface KnowledgeSearchParams {
  view?: string;
  vault?: string;
  source?: string;
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
}

const knowledgeViews = [
  {
    id: 'queue' as const,
    label: 'Queue',
    description: 'Active sources and capture',
    icon: Icons.inbox
  },
  {
    id: 'review' as const,
    label: 'Review',
    description: 'Human attention and transitions',
    icon: Icons.checks
  },
  {
    id: 'vault' as const,
    label: 'Vault',
    description: 'Markdown graph and files',
    icon: Icons.library
  },
  {
    id: 'automation' as const,
    label: 'Automation',
    description: 'Guarded harvesting jobs',
    icon: Icons.zap
  }
];

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

function resolveKnowledgeView(params: KnowledgeSearchParams): KnowledgeView {
  if (knowledgeViews.some((view) => view.id === params.view)) {
    return params.view as KnowledgeView;
  }
  if (params.sessions || params.memory || params.error === 'memory-harvest') return 'automation';
  if (params.reviewed || params.promoted || params.archived || params.deleted) return 'review';
  return 'queue';
}

function resolveVaultView(value?: string): VaultView {
  return value === 'graph' ? 'graph' : 'files';
}

function viewHref(view: KnowledgeView) {
  return `/dashboard/knowledge?view=${view}`;
}

function isReviewableSource(source: KnowledgeSource) {
  if (!['raw', 'extracted', 'wikified', 'reviewed'].includes(normalizeStatus(source.status))) {
    return false;
  }
  if (!source.metadata?.memoryRoute) return true;
  return source.metadata.reviewRequired === true;
}

function feedbackFor(params: KnowledgeSearchParams) {
  if (params.error === 'no-db') {
    return {
      title: 'Database unavailable',
      description:
        'No DATABASE_URL is available in this environment. Run locally or connect a hosted database.',
      variant: 'destructive' as const
    };
  }
  if (params.error === 'missing') {
    return {
      title: 'Source details missing',
      description: 'Add a title and either a URL or raw text before saving.',
      variant: 'destructive' as const
    };
  }
  if (params.error === 'memory-harvest') {
    return {
      title: 'Memory harvest failed',
      description: 'Try again shortly or inspect the bridge status before running another sync.',
      variant: 'destructive' as const
    };
  }

  const successMessages: Array<[string | undefined | boolean, string, string]> = [
    [params.created, 'Source captured', 'The source was saved to the raw inbox.'],
    [params.queued, 'Source queued', 'The source was queued for wikification.'],
    [params.extracted, 'Source extracted', 'Readable raw text is ready for the next step.'],
    [params.wikified, 'Source wikified', 'A linked knowledge page was created.'],
    [params.reviewed, 'Review complete', 'The knowledge source is marked as reviewed.'],
    [params.promoted, 'Context candidate ready', 'The source was promoted for OpenClaw context.'],
    [params.archived, 'Source archived', 'The source moved out of the active queue.'],
    [params.deleted, 'Source deleted', 'The knowledge source was permanently removed.'],
    [
      params.sessions === 'harvested',
      'Sessions harvested',
      'Agent and chat sessions were imported for review.'
    ],
    [
      params.sessions === 'previewed',
      'Session preview ready',
      'The preview completed. Open the inventory JSON for detailed routing results.'
    ],
    [
      params.memory === 'harvested',
      'Memory synced',
      'Memory and dreaming files were imported for review.'
    ],
    [
      params.memory === 'previewed',
      'Memory preview ready',
      'The memory harvest preview completed.'
    ],
    [
      params.memory === 'use-form',
      'Use the guarded form',
      'Run memory harvesting from the Automation view instead of the standalone API route.'
    ]
  ];
  const match = successMessages.find(([condition]) => Boolean(condition));
  return match ? { title: match[1], description: match[2], variant: 'default' as const } : null;
}

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
    <div
      className='flex items-center gap-1.5'
      aria-label={`Lifecycle: ${statusMeta(status).label}`}
    >
      {lifecycleSteps.map((step, index) => {
        const active = index <= current;
        const currentStep = index === current;
        return (
          <div key={step.id} className='flex items-center gap-1.5'>
            <div
              aria-hidden='true'
              className={cn(
                'size-2.5 rounded-full border',
                active ? 'border-primary bg-primary' : 'border-muted-foreground/30 bg-muted',
                currentStep && 'ring-2 ring-primary/30'
              )}
              title={step.label}
            />
            {index < lifecycleSteps.length - 1 ? (
              <div
                aria-hidden='true'
                className={cn('h-px w-5', active ? 'bg-primary/60' : 'bg-border')}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PipelineStep({ status, count }: { status: string; count: number }) {
  const meta = statusMeta(status);
  return (
    <div className={cn('rounded-lg border p-3', meta.tone)}>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='text-sm font-medium'>{meta.label}</div>
          <div className='mt-1 line-clamp-2 text-xs opacity-80'>{meta.detail}</div>
        </div>
        <Badge variant='outline' className='tabular-nums'>
          {count}
        </Badge>
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

function ReviewQueue({
  sources,
  selectedSourceId
}: {
  sources: KnowledgeSource[];
  selectedSourceId?: string;
}) {
  const reviewable = sources.filter(isReviewableSource);
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
          <div>
            <CardTitle>Exception review</CardTitle>
            <CardDescription>
              Manuell triage för knowledge-källor och legacy-poster. Agentminne routas automatiskt;
              endast känsliga, motsägande eller osäkra minnessignaler ska hamna här.
            </CardDescription>
          </div>
          <Badge variant='outline'>{reviewable.length} pending</Badge>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        {reviewable.length === 0 ? (
          <Empty className='border py-10'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Icons.checks aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>Review queue clear</EmptyTitle>
              <EmptyDescription>
                No knowledge sources need manual attention right now.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
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
                      <Link
                        href={`/dashboard/knowledge?view=review&source=${encodeURIComponent(source.id)}`}
                        aria-current={selectedSourceId === source.id ? 'true' : undefined}
                        className='hover:text-primary focus-visible:ring-ring min-w-0 truncate rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
                      >
                        {source.title}
                      </Link>
                    </div>
                    <div className='text-muted-foreground mt-1 line-clamp-2 text-xs leading-5'>
                      {source.summary || source.rawPath}
                    </div>
                  </div>
                  <div className='grid grid-cols-2 gap-2 md:w-44 md:grid-cols-1'>
                    {action ? (
                      <ActionForm
                        source={source}
                        action={action.action}
                        label={action.label}
                        hidden={action.hidden as Record<string, string>}
                        variant='default'
                      />
                    ) : null}
                    {showArchive ? (
                      <ActionForm
                        source={source}
                        action='/api/knowledge/sources/transition'
                        label='Archive'
                        hidden={{ status: 'archived' }}
                      />
                    ) : null}
                  </div>
                </div>
                <details className='group mt-3 rounded-lg border bg-muted/20'>
                  <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-medium marker:hidden'>
                    <span>Läs innehåll och metadata</span>
                    <span className='text-muted-foreground group-open:hidden'>Expandera</span>
                    <span className='text-muted-foreground hidden group-open:inline'>Stäng</span>
                  </summary>
                  <div className='flex flex-col gap-3 border-t p-3'>
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
                        <div className='flex flex-col gap-1 rounded-lg bg-background/70 p-3 font-mono text-[10px] text-muted-foreground'>
                          {rawSourceRows(source).map(([label, value]) => (
                            <div key={label} className='grid grid-cols-[4.5rem_1fr] gap-2'>
                              <span className='uppercase tracking-wide'>{label}</span>
                              <span className='break-all'>{String(value)}</span>
                            </div>
                          ))}
                        </div>
                        {source.sourceUrl ? (
                          <Button asChild variant='outline' size='sm' className='mt-3 w-full'>
                            <Link href={source.sourceUrl} target='_blank' rel='noreferrer'>
                              Öppna källa
                            </Link>
                          </Button>
                        ) : null}
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
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-col gap-3'>
          {lifecycleSteps.map((step, index) => {
            const done = index < current;
            const active = index === current;
            return (
              <div key={step.id} className='flex gap-3'>
                <div className='flex flex-col items-center'>
                  <div
                    aria-hidden='true'
                    className={cn(
                      'mt-0.5 size-3 rounded-full border',
                      done || active
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30 bg-muted',
                      active && 'ring-4 ring-primary/15'
                    )}
                  />
                  {index < lifecycleSteps.length - 1 ? (
                    <div aria-hidden='true' className='h-8 w-px bg-border' />
                  ) : null}
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
          {action ? (
            <div className='mt-3'>
              <ActionForm
                source={source}
                action={action.action}
                label={action.label}
                hidden={action.hidden as Record<string, string>}
                variant='default'
              />
            </div>
          ) : null}
        </div>

        <div className='rounded-xl border bg-muted/30 p-3'>
          <div className='text-xs font-medium'>Rådata</div>
          <div className='mt-2 flex flex-col gap-1 font-mono text-[10px] text-muted-foreground'>
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
          {source.sourceUrl ? (
            <a
              className='text-primary focus-visible:ring-ring mt-3 block truncate rounded-sm text-xs underline focus-visible:ring-2 focus-visible:outline-none'
              href={source.sourceUrl}
              target='_blank'
              rel='noreferrer'
            >
              Öppna källa →
            </a>
          ) : null}
        </div>

        <div className='border-t pt-3'>
          <div className='mb-2 text-xs font-medium'>Danger zone</div>
          <form id='delete-knowledge-source' action='/api/knowledge/sources/delete' method='post'>
            <input type='hidden' name='id' value={source.id} />
          </form>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type='button' variant='destructive' size='sm' className='w-full'>
                <Icons.trash data-icon='inline-start' />
                Ta bort permanent
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Ta bort “{source.title}” permanent?</AlertDialogTitle>
                <AlertDialogDescription>
                  Åtgärden kan inte ångras. Arkivera källan i stället om den kan behövas senare.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Behåll källan</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button type='submit' form='delete-knowledge-source' variant='destructive'>
                    Ta bort permanent
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function KnowledgeDrilldownsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge drill-downs</CardTitle>
        <CardDescription>
          Focused views for promoted knowledge, memory, and capture.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        {knowledgeDrilldowns.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className='hover:bg-muted/50 focus-visible:ring-ring flex items-center gap-3 rounded-lg border bg-background/40 p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none'
          >
            <div className='min-w-0 flex-1'>
              <div className='text-sm font-medium'>{item.title}</div>
              <div className='text-muted-foreground mt-0.5 truncate text-xs'>{item.detail}</div>
            </div>
            <Icons.chevronRight
              aria-hidden='true'
              className='text-muted-foreground size-4 shrink-0'
            />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function SessionHarvesterCard({ dbOnline }: { dbOnline: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle>Agent session harvester</CardTitle>
            <CardDescription className='mt-1'>
              Preview high-signal sessions before the guarded local runner activates writes.
            </CardDescription>
          </div>
          <Badge variant='outline'>Preview only</Badge>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <form
          action='/api/knowledge/sessions/harvest'
          method='post'
          className='flex flex-col gap-4'
        >
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='session-limit'>Max sessions</Label>
              <Input
                id='session-limit'
                name='limit'
                type='number'
                autoComplete='off'
                defaultValue={5}
                min={1}
                max={20}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='session-score'>Min score</Label>
              <Input
                id='session-score'
                name='minScore'
                type='number'
                autoComplete='off'
                defaultValue={35}
                min={1}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='session-signals'>Signals / session</Label>
              <Input
                id='session-signals'
                name='signalsPerSession'
                type='number'
                autoComplete='off'
                defaultValue={8}
                min={1}
                max={12}
              />
            </div>
          </div>
          <p className='text-muted-foreground text-xs leading-5'>
            Classification runs without SQL, memory, or task writes and cannot backfill old
            sessions. Activation remains watermark-protected in the local runner.
          </p>
          <SubmitButton className='w-full' disabled={!dbOnline} pendingText='Previewing…'>
            Preview memory routes
          </SubmitButton>
        </form>
        <Button asChild variant='outline' className='w-full'>
          <Link href='/api/knowledge/sessions/inventory' target='_blank' rel='noreferrer'>
            Preview inventory JSON
            <Icons.externalLink data-icon='inline-end' />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function MemoryHarvesterCard({ dbOnline }: { dbOnline: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle>Memory harvester</CardTitle>
            <CardDescription className='mt-1'>
              Mirror memory files for audit, provenance, and vault export without changing recall.
            </CardDescription>
          </div>
          <Badge variant='outline'>Extracted</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form action='/api/knowledge/memory/harvest' method='post' className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='memory-limit'>Max files / agent</Label>
            <Input
              id='memory-limit'
              name='limit'
              type='number'
              autoComplete='off'
              defaultValue={20}
              min={1}
              max={80}
            />
          </div>
          <p className='text-muted-foreground text-xs leading-5'>
            Files are imported evenly per agent as <code>extracted</code>. QMD/OpenClaw remains the
            recall layer; this is not a promotion path.
          </p>
          <SubmitButton className='w-full' disabled={!dbOnline} pendingText='Syncing…'>
            Sync memory to Knowledge
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function RetentionPolicyCard() {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <CardTitle>Retention policy</CardTitle>
          <Badge variant='outline'>V1</Badge>
        </div>
        <CardDescription>
          Extract first, archive before delete, never automate hard delete.
        </CardDescription>
      </CardHeader>
      <CardContent className='text-muted-foreground flex flex-col gap-3 text-sm leading-6'>
        <ul className='flex list-disc flex-col gap-1 pl-4'>
          <li>Keep sessions with reviewed knowledge, audit history, or active project value.</li>
          <li>Review high-signal sessions before archive or deletion.</li>
          <li>Deletion requires dependency checks and explicit confirmation.</li>
        </ul>
        <Button asChild variant='outline' className='w-full'>
          <Link
            href='https://github.com/felipeotarola/agent-os/blob/main/docs/SESSION_RETENTION_POLICY.md'
            target='_blank'
            rel='noreferrer'
          >
            Open retention policy
            <Icons.externalLink data-icon='inline-end' />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CaptureSourceCard({ dbOnline }: { dbOnline: boolean }) {
  return (
    <Card id='capture'>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle>Capture source</CardTitle>
            <CardDescription className='mt-1'>
              Start with text or a URL. File upload comes later.
            </CardDescription>
          </div>
          <Badge variant={dbOnline ? 'secondary' : 'outline'}>
            {dbOnline ? 'Writable' : 'Read-only'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form action='/api/knowledge/sources' method='post' className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='title'>Title</Label>
            <Input
              id='title'
              name='title'
              autoComplete='off'
              placeholder='Ex. Karpathy LLM wiki…'
              required
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='sourceUrl'>URL</Label>
            <Input
              id='sourceUrl'
              name='sourceUrl'
              type='url'
              autoComplete='off'
              placeholder='https://…'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='rawContent'>Raw text</Label>
            <Textarea
              id='rawContent'
              name='rawContent'
              autoComplete='off'
              placeholder='Paste notes, transcripts, research, or loose thoughts…'
              className='min-h-32'
            />
          </div>
          <SubmitButton className='w-full' disabled={!dbOnline} pendingText='Saving…'>
            Save to raw inbox
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function QueueFocusCard({ source }: { source?: KnowledgeSource }) {
  if (!source) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Queue focus</CardTitle>
          <CardDescription>No active source is waiting for a transition.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const action = nextAction(source);
  const meta = statusMeta(source.status);
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <CardTitle>Queue focus</CardTitle>
          <Badge variant='outline' className={meta.tone}>
            {meta.short}
          </Badge>
        </div>
        <CardDescription className='line-clamp-2'>{source.title}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <ProgressRail status={source.status} />
        <p className='text-muted-foreground text-xs leading-5'>
          {action?.helper ?? 'This source has no remaining active transition.'}
        </p>
        {action ? (
          <ActionForm
            source={source}
            action={action.action}
            label={action.label}
            hidden={action.hidden as Record<string, string>}
            variant='default'
          />
        ) : null}
        <Button asChild variant='outline' size='sm' className='w-full'>
          <Link href={`/dashboard/knowledge?view=review&source=${encodeURIComponent(source.id)}`}>
            Inspect source
            <Icons.arrowRight data-icon='inline-end' />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ViewContextCard({
  title,
  description,
  metric,
  metricLabel,
  dbOnline
}: {
  title: string;
  description: string;
  metric: number;
  metricLabel: string;
  dbOnline: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className='mt-1'>{description}</CardDescription>
          </div>
          <Badge variant={dbOnline ? 'secondary' : 'outline'}>
            {dbOnline ? 'DB online' : 'Read-only'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className='rounded-lg border bg-muted/20 p-3'>
          <div className='text-2xl font-semibold tabular-nums'>{metric}</div>
          <div className='text-muted-foreground text-xs'>{metricLabel}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function KnowledgeRightRail({
  view,
  focusedSource,
  dbOnline,
  activeCount,
  reviewCount,
  vaultFileCount
}: {
  view: KnowledgeView;
  focusedSource?: KnowledgeSource;
  dbOnline: boolean;
  activeCount: number;
  reviewCount: number;
  vaultFileCount: number;
}) {
  if (view === 'review') {
    return (
      <>
        <ViewContextCard
          title='Review context'
          description='Inspect one source, advance it, archive it, or remove it with confirmation.'
          metric={reviewCount}
          metricLabel='sources need attention'
          dbOnline={dbOnline}
        />
        <SourceInspector source={focusedSource} />
      </>
    );
  }

  if (view === 'vault') {
    return (
      <>
        <ViewContextCard
          title='Vault context'
          description='Browse the generated Markdown surface and connected knowledge views.'
          metric={vaultFileCount}
          metricLabel='Markdown files'
          dbOnline={dbOnline}
        />
        <KnowledgeDrilldownsCard />
      </>
    );
  }

  if (view === 'automation') {
    return (
      <>
        <ViewContextCard
          title='Automation context'
          description='Manual previews and guarded imports only; no automatic hard deletes.'
          metric={2}
          metricLabel='guarded harvest jobs'
          dbOnline={dbOnline}
        />
        <RetentionPolicyCard />
      </>
    );
  }

  return (
    <>
      <ViewContextCard
        title='Queue context'
        description='Capture sources and advance the next useful item through the lifecycle.'
        metric={activeCount}
        metricLabel='active sources'
        dbOnline={dbOnline}
      />
      <QueueFocusCard source={focusedSource} />
    </>
  );
}

function KnowledgeViewNavigation({
  view,
  counts
}: {
  view: KnowledgeView;
  counts: Record<KnowledgeView, number>;
}) {
  return (
    <nav
      aria-label='Knowledge workspace views'
      className='grid grid-cols-2 gap-1 rounded-xl border bg-card p-1.5 lg:grid-cols-4'
    >
      {knowledgeViews.map((item) => {
        const Icon = item.icon;
        const active = item.id === view;
        return (
          <Button
            key={item.id}
            asChild
            size='sm'
            variant={active ? 'secondary' : 'ghost'}
            className='min-w-0 justify-start lg:justify-center'
          >
            <Link
              href={viewHref(item.id)}
              aria-current={active ? 'page' : undefined}
              title={item.description}
            >
              <Icon data-icon='inline-start' />
              <span className='truncate'>{item.label}</span>
              <span className='text-muted-foreground ml-auto text-xs tabular-nums lg:ml-1'>
                {counts[item.id]}
              </span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

function KnowledgeStatusStrip({ snapshot }: { snapshot: KnowledgeSnapshot }) {
  const statusCells = [
    {
      label: 'Database',
      value: snapshot.dbOnline ? 'online' : 'read-only',
      detail: snapshot.dbOnline ? 'Live Postgres read model' : 'Fallback snapshot'
    },
    ...snapshot.stats
  ];

  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <CardContent className='grid grid-cols-2 gap-px bg-border p-0 xl:grid-cols-4'>
        {statusCells.map((stat) => (
          <div key={stat.label} className='min-w-0 bg-card p-4'>
            <div className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {stat.label}
            </div>
            <div className='mt-1 truncate text-xl font-semibold tabular-nums'>{stat.value}</div>
            <div className='text-muted-foreground mt-1 truncate text-xs' title={stat.detail}>
              {stat.detail}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function KnowledgePipelineCard({
  pipeline,
  counts,
  archivedCount
}: {
  pipeline: ActiveLifecycleStatus[];
  counts: Record<string, number>;
  archivedCount: number;
}) {
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle>Knowledge flow</CardTitle>
            <CardDescription className='mt-1'>
              Raw → extracted → wikified → reviewed → promoted for OpenClaw context.
            </CardDescription>
          </div>
          <Badge variant='outline' className='w-fit tabular-nums'>
            {archivedCount} archived
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='grid grid-cols-2 gap-2 xl:grid-cols-5 [&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1'>
        {pipeline.map((status) => (
          <PipelineStep key={status} status={status} count={counts[status] ?? 0} />
        ))}
      </CardContent>
    </Card>
  );
}

function KnowledgeQueueCard({ sources }: { sources: KnowledgeSource[] }) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle>Active queue</CardTitle>
            <CardDescription className='mt-1'>
              See each source, its stage, and its next action.
            </CardDescription>
          </div>
          <Badge variant='outline' className='tabular-nums'>
            {sources.length} sources
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='max-h-[38rem] overflow-y-auto pr-2'>
        {sources.length === 0 ? (
          <Empty className='border py-10'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Icons.inbox aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>Queue is empty</EmptyTitle>
              <EmptyDescription>
                Capture a URL or raw text to start the first knowledge lifecycle.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className='flex flex-col gap-2'>
            {sources.map((source) => {
              const meta = statusMeta(source.status);
              return (
                <article key={source.id} className='rounded-lg border bg-background/40 p-3'>
                  <div className='grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_auto_minmax(8rem,0.6fr)_7.5rem] lg:items-center'>
                    <div className='min-w-0'>
                      <div className='flex min-w-0 flex-wrap items-center gap-2'>
                        <Link
                          href={`/dashboard/knowledge?view=review&source=${encodeURIComponent(source.id)}`}
                          className='hover:text-primary focus-visible:ring-ring min-w-0 truncate rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
                        >
                          {source.title}
                        </Link>
                        <Badge variant='secondary'>{source.kind}</Badge>
                      </div>
                      <p className='text-muted-foreground mt-1 line-clamp-1 text-sm'>
                        {source.summary || 'No summary yet.'}
                      </p>
                      <div className='text-muted-foreground mt-1 truncate font-mono text-[11px]'>
                        {source.wikiPath ?? source.rawPath}
                      </div>
                    </div>
                    <Badge className={meta.tone} variant='outline'>
                      {meta.short}
                    </Badge>
                    <ProgressRail status={source.status} />
                    <SourceActions source={source} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueueView({
  pipeline,
  counts,
  archivedCount,
  sources,
  dbOnline
}: {
  pipeline: ActiveLifecycleStatus[];
  counts: Record<string, number>;
  archivedCount: number;
  sources: KnowledgeSource[];
  dbOnline: boolean;
}) {
  return (
    <div className='flex flex-col gap-4'>
      <KnowledgePipelineCard pipeline={pipeline} counts={counts} archivedCount={archivedCount} />
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]'>
        <KnowledgeQueueCard sources={sources} />
        <CaptureSourceCard dbOnline={dbOnline} />
      </div>
    </div>
  );
}

function VaultViewPanel({ vault, mode }: { vault: KnowledgeSnapshot['vault']; mode: VaultView }) {
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle>Obsidian vault</CardTitle>
            <CardDescription className='mt-1'>
              Markdown structure for agents and Obsidian: raw, wiki, index, log, and agents.md.
            </CardDescription>
          </div>
          <Button asChild variant='outline' size='sm'>
            <Link href='/api/knowledge/vault/export'>
              <Icons.fileZip data-icon='inline-start' />
              Download vault.zip
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='grid grid-cols-1 gap-3 lg:grid-cols-[12rem_minmax(0,1fr)]'>
          <div className='rounded-lg border bg-background/40 p-3'>
            <div className='text-muted-foreground text-xs'>Vault files</div>
            <div className='mt-1 text-2xl font-semibold tabular-nums'>{vault.files.length}</div>
            <div className='text-muted-foreground mt-1 text-xs'>Root docs + active sources</div>
          </div>
          <details className='rounded-lg border bg-muted/20 p-3'>
            <summary className='focus-visible:ring-ring cursor-pointer rounded-sm text-sm font-medium focus-visible:ring-2 focus-visible:outline-none'>
              View generated index.md
            </summary>
            <pre className='text-muted-foreground mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-relaxed'>
              {vault.indexMd}
            </pre>
          </details>
        </div>

        <nav
          aria-label='Vault views'
          className='flex flex-wrap gap-1 rounded-lg border bg-muted/20 p-1'
        >
          <Button asChild variant={mode === 'files' ? 'secondary' : 'ghost'} size='sm'>
            <Link
              href='/dashboard/knowledge?view=vault&vault=files'
              aria-current={mode === 'files' ? 'page' : undefined}
            >
              <Icons.page data-icon='inline-start' />
              Files
            </Link>
          </Button>
          <Button asChild variant={mode === 'graph' ? 'secondary' : 'ghost'} size='sm'>
            <Link
              href='/dashboard/knowledge?view=vault&vault=graph'
              aria-current={mode === 'graph' ? 'page' : undefined}
            >
              <Icons.network data-icon='inline-start' />
              Graph
            </Link>
          </Button>
        </nav>

        {mode === 'graph' ? (
          <VaultGraph files={vault.files} />
        ) : (
          <VaultExplorer files={vault.files} />
        )}
      </CardContent>
    </Card>
  );
}

function AutomationView({ dbOnline }: { dbOnline: boolean }) {
  return (
    <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
      <SessionHarvesterCard dbOnline={dbOnline} />
      <MemoryHarvesterCard dbOnline={dbOnline} />
    </div>
  );
}

function KnowledgeViewContent({
  view,
  pipeline,
  counts,
  activeSources,
  archivedCount,
  allSources,
  selectedSourceId,
  dbOnline,
  vault,
  vaultView
}: {
  view: KnowledgeView;
  pipeline: ActiveLifecycleStatus[];
  counts: Record<string, number>;
  activeSources: KnowledgeSource[];
  archivedCount: number;
  allSources: KnowledgeSource[];
  selectedSourceId?: string;
  dbOnline: boolean;
  vault: KnowledgeSnapshot['vault'];
  vaultView: VaultView;
}) {
  if (view === 'review') {
    return <ReviewQueue sources={allSources} selectedSourceId={selectedSourceId} />;
  }
  if (view === 'vault') return <VaultViewPanel vault={vault} mode={vaultView} />;
  if (view === 'automation') return <AutomationView dbOnline={dbOnline} />;
  return (
    <QueueView
      pipeline={pipeline}
      counts={counts}
      archivedCount={archivedCount}
      sources={activeSources}
      dbOnline={dbOnline}
    />
  );
}

export default async function KnowledgePage({
  searchParams
}: {
  searchParams: Promise<KnowledgeSearchParams>;
}) {
  const [snapshot, params] = await Promise.all([getKnowledgeSnapshot(), searchParams]);
  const view = resolveKnowledgeView(params);
  const vaultView = resolveVaultView(params.vault);
  const pipeline = (snapshot.lifecycle ?? lifecycleOrder).filter(isActiveLifecycleStatus);
  const counts = snapshot.lifecycleCounts ?? {};
  const activeSources = snapshot.sources.filter((source) => !isArchived(source));
  const archivedCount = snapshot.sources.filter(isArchived).length;
  const reviewableSources = snapshot.sources.filter(isReviewableSource);
  const requestedSource = params.source
    ? snapshot.sources.find((source) => source.id === params.source)
    : undefined;
  const focusedSource =
    requestedSource ??
    (view === 'review'
      ? (reviewableSources.find((source) => nextAction(source)) ??
        reviewableSources[0] ??
        activeSources[0])
      : (activeSources.find((source) => nextAction(source)) ?? activeSources[0]));
  const feedback = feedbackFor(params);
  const viewMeta = knowledgeViews.find((item) => item.id === view) ?? knowledgeViews[0];
  const viewCounts: Record<KnowledgeView, number> = {
    queue: activeSources.length,
    review: reviewableSources.length,
    vault: snapshot.vault.files.length,
    automation: 2
  };

  return (
    <PageContainer
      pageTitle='Knowledge Studio'
      pageDescription='Capture sources, review exceptions, inspect the vault, and run guarded knowledge automation.'
      pageHeaderAction={
        <Button asChild variant='outline' size='sm'>
          <Link href='/dashboard/knowledge?view=queue#capture'>
            <Icons.add data-icon='inline-start' />
            Capture source
          </Link>
        </Button>
      }
      rightRailTitle={viewMeta.label + ' context'}
      rightRailDescription={viewMeta.description}
      rightRail={
        <KnowledgeRightRail
          view={view}
          focusedSource={focusedSource}
          dbOnline={snapshot.dbOnline}
          activeCount={activeSources.length}
          reviewCount={reviewableSources.length}
          vaultFileCount={snapshot.vault.files.length}
        />
      }
    >
      <div className='flex flex-1 flex-col gap-4'>
        {feedback ? (
          <Alert variant={feedback.variant}>
            {feedback.variant === 'destructive' ? (
              <Icons.warning aria-hidden='true' />
            ) : (
              <Icons.circleCheck aria-hidden='true' />
            )}
            <AlertTitle>{feedback.title}</AlertTitle>
            <AlertDescription>{feedback.description}</AlertDescription>
          </Alert>
        ) : null}

        <KnowledgeStatusStrip snapshot={snapshot} />
        <KnowledgeViewNavigation view={view} counts={viewCounts} />
        <KnowledgeViewContent
          view={view}
          pipeline={pipeline}
          counts={counts}
          activeSources={activeSources}
          archivedCount={archivedCount}
          allSources={snapshot.sources}
          selectedSourceId={params.source}
          dbOnline={snapshot.dbOnline}
          vault={snapshot.vault}
          vaultView={vaultView}
        />
      </div>
    </PageContainer>
  );
}
