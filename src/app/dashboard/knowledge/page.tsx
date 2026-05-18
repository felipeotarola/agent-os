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

const lifecycleSteps: Array<{
  id: LifecycleStatus;
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
    tone: 'border-slate-400/40 bg-slate-500/10 text-slate-300'
  },
  {
    id: 'extracted',
    label: 'Extraherad',
    short: 'Extracted',
    detail: 'Läsbar text finns',
    tone: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-300'
  },
  {
    id: 'wikified',
    label: 'Wikifierad',
    short: 'Wiki',
    detail: 'Syntetiserad note',
    tone: 'border-violet-400/40 bg-violet-500/10 text-violet-300'
  },
  {
    id: 'reviewed',
    label: 'Granskad',
    short: 'Reviewed',
    detail: 'Godkänd av människa/agent',
    tone: 'border-amber-400/40 bg-amber-500/10 text-amber-300'
  },
  {
    id: 'promoted',
    label: 'Promoterad',
    short: 'Context',
    detail: 'OpenClaw-context kandidat',
    tone: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
  },
  {
    id: 'archived',
    label: 'Arkiverad',
    short: 'Archived',
    detail: 'Inte i aktiv vault',
    tone: 'border-zinc-400/40 bg-zinc-500/10 text-zinc-300'
  }
];

const lifecycleOrder = lifecycleSteps.map((step) => step.id);

function normalizeStatus(status: string): LifecycleStatus {
  if (lifecycleOrder.includes(status as LifecycleStatus)) return status as LifecycleStatus;
  if (status === 'queued') return 'extracted';
  return 'raw';
}

function statusMeta(status: string) {
  return lifecycleSteps.find((step) => step.id === normalizeStatus(status)) ?? lifecycleSteps[0];
}

function statusIndex(status: string) {
  return lifecycleOrder.indexOf(normalizeStatus(status));
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
      <ActionForm
        source={source}
        action='/api/knowledge/sources/delete'
        label='Ta bort'
        variant='destructive'
      />
    </div>
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
    <Card className='xl:sticky xl:top-4'>
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

        <div className='space-y-2'>
          <div className='text-xs font-medium'>Metadata</div>
          <div className='text-muted-foreground font-mono text-[11px]'>
            {source.wikiPath ?? source.rawPath}
          </div>
          {source.sourceUrl && (
            <a
              className='text-primary block truncate text-xs underline'
              href={source.sourceUrl}
              target='_blank'
            >
              {source.sourceUrl}
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
    error?: string;
  }>;
}) {
  const [snapshot, params] = await Promise.all([getKnowledgeSnapshot(), searchParams]);
  const pipeline = snapshot.lifecycle ?? lifecycleOrder;
  const counts = snapshot.lifecycleCounts ?? {};
  const activeSources = snapshot.sources.filter(
    (source) => normalizeStatus(source.status) !== 'archived'
  );
  const nextSource = activeSources.find((source) => nextAction(source)) ?? activeSources[0];

  return (
    <PageContainer>
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
              {params.error === 'no-db' &&
                'Ingen DATABASE_URL i den här miljön. Kör lokalt eller koppla hosted DB.'}
              {params.error === 'missing' && 'Titel och antingen URL eller råtext krävs.'}
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
              raw → extracted → wikified → reviewed → promoted → used as context in OpenClaw →
              archived
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6'>
              {pipeline.map((status) => (
                <PipelineStep key={status} status={status} count={counts[status] ?? 0} />
              ))}
            </div>
          </CardContent>
        </Card>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
          <Card className='xl:col-span-8'>
            <CardHeader>
              <CardTitle>Kunskapskö</CardTitle>
              <CardDescription>
                Se exakt var varje dokument är och vad nästa steg är.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {snapshot.sources.length === 0 ? (
                <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
                  Inga källor ännu. Lägg in första råtexten eller URL:en.
                </div>
              ) : (
                <div className='space-y-2'>
                  {snapshot.sources.map((source) => {
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

          <div className='space-y-4 xl:col-span-4'>
            <SourceInspector source={nextSource} />
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
                  <SubmitButton
                    className='w-full'
                    disabled={!snapshot.dbOnline}
                    pendingText='Sparar…'
                  >
                    Spara till raw inbox
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>
          </div>
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
