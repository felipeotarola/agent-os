import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubmitButton } from '@/app/dashboard/knowledge/submit-button';
import { bridgeRequest } from '@/lib/bridge';

export const metadata = {
  title: 'Agent OS: Mail Radar'
};

type MailCandidate = {
  id: string;
  threadId: string;
  title: string;
  from: string;
  date: string | null;
  labels: string[];
  snippet: string;
  score: number;
  reasons: string[];
  gmailUrl: string;
  saved: boolean;
};

type MailRadarSnapshot = {
  generatedAt: string;
  account: string;
  query: string;
  source: string;
  counts: { total: number; highSignal: number; saved: number };
  candidates: MailCandidate[];
};

async function getMailRadar(): Promise<MailRadarSnapshot> {
  return bridgeRequest<MailRadarSnapshot>('/mail/radar?max=12');
}

function scoreTone(score: number) {
  if (score >= 55) return 'border-primary/40 bg-primary/10 text-primary';
  if (score >= 35) return 'border-border bg-muted/40 text-card-foreground';
  return 'border-border bg-muted/30 text-muted-foreground';
}

function MailCard({ candidate, account }: { candidate: MailCandidate; account: string }) {
  return (
    <Card className='overflow-hidden'>
      <CardContent className='p-4'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div className='min-w-0 flex-1 space-y-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline' className={scoreTone(candidate.score)}>
                score {candidate.score}
              </Badge>
              {candidate.saved && <Badge variant='outline'>saved</Badge>}
              {candidate.labels.slice(0, 3).map((label) => (
                <Badge key={label} variant='secondary' className='font-mono text-[10px]'>
                  {label}
                </Badge>
              ))}
            </div>
            <div>
              <h3 className='line-clamp-2 text-base font-semibold text-foreground'>
                {candidate.title}
              </h3>
              <p className='text-muted-foreground mt-1 line-clamp-1 text-xs'>{candidate.from}</p>
              <p className='text-muted-foreground mt-3 line-clamp-3 text-sm leading-6'>
                {candidate.snippet}
              </p>
            </div>
            {candidate.reasons.length > 0 && (
              <div className='flex flex-wrap gap-2'>
                {candidate.reasons.map((reason) => (
                  <span
                    key={reason}
                    className='rounded-full border bg-muted px-2 py-1 text-xs text-muted-foreground'
                  >
                    {reason}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className='flex shrink-0 flex-wrap gap-2 lg:flex-col'>
            <Button asChild size='sm' variant='outline'>
              <a href={candidate.gmailUrl} target='_blank' rel='noreferrer'>
                Öppna Gmail
              </a>
            </Button>
            <form action='/api/mail/save-to-knowledge' method='post'>
              <input type='hidden' name='threadId' value={candidate.threadId} />
              <input type='hidden' name='account' value={account} />
              <SubmitButton size='sm' pendingText='Sparar…' disabled={candidate.saved}>
                {candidate.saved ? 'Sparad' : 'Spara till Knowledge'}
              </SubmitButton>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function MailRadarPage() {
  let snapshot: MailRadarSnapshot | null = null;
  let error: string | null = null;
  try {
    snapshot = await getMailRadar();
  } catch (err) {
    error = err instanceof Error ? err.message : 'Mail Radar kunde inte läsa Gmail.';
  }

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              gmail readonly · review before memory
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Mail Radar</h1>
            <p className='max-w-3xl text-sm leading-6 text-muted-foreground md:text-base'>
              Mail är signal, inte permanent minne. Radarn letar efter mail som kan bli tasks eller
              Knowledge-källor, men inget hamnar i wikin utan manuell review.
            </p>
          </div>
          {snapshot && (
            <div className='rounded-xl border bg-card p-4 text-sm'>
              <div className='text-muted-foreground'>Account</div>
              <div className='font-mono'>{snapshot.account}</div>
            </div>
          )}
        </div>

        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Mail Radar offline</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : snapshot ? (
          <>
            <div className='grid gap-3 md:grid-cols-3'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardDescription>Candidates</CardDescription>
                  <CardTitle>{snapshot.counts.total}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardDescription>High signal</CardDescription>
                  <CardTitle>{snapshot.counts.highSignal}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardDescription>Saved</CardDescription>
                  <CardTitle>{snapshot.counts.saved}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
              <div className='space-y-3'>
                {snapshot.candidates.length === 0 ? (
                  <Card>
                    <CardContent className='p-8 text-sm text-muted-foreground'>
                      Inga mail-signaler just nu.
                    </CardContent>
                  </Card>
                ) : (
                  snapshot.candidates.map((candidate) => (
                    <MailCard key={candidate.id} candidate={candidate} account={snapshot.account} />
                  ))
                )}
              </div>
              <Card className='h-fit'>
                <CardHeader>
                  <CardTitle>Policy</CardTitle>
                  <CardDescription>Hård gräns mot mail-slask i wikin.</CardDescription>
                </CardHeader>
                <CardContent className='space-y-3 text-sm leading-6 text-muted-foreground'>
                  <p>Radarn använder Gmail readonly och visar sanitiserade snippets.</p>
                  <p>
                    “Spara till Knowledge” skapar en raw email-källa som sedan måste extraheras,
                    wikifieras och reviewas.
                  </p>
                  <p>
                    Sensitiva mail ska sammanfattas försiktigt eller ignoreras, inte dumpas
                    permanent.
                  </p>
                  <div className='h-px bg-border' />
                  <div className='font-mono text-xs'>source: {snapshot.source}</div>
                  <div className='font-mono text-xs'>query: {snapshot.query}</div>
                  <div className='font-mono text-xs'>
                    generated: {new Date(snapshot.generatedAt).toLocaleString('sv-SE')}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
