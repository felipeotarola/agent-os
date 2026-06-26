import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';

export const metadata = {
  title: 'Agent OS: Agent Notes'
};

type AgentNote = {
  id: string;
  agent: 'Sladdis' | 'Cai' | 'Charles';
  source: string;
  type: string;
  title: string;
  body: string;
  project: string;
  related: string;
  createdAt: string;
  tags: string[];
};

const notes: AgentNote[] = [
  {
    id: 'note-sladdis-qaa-mobile-context',
    agent: 'Sladdis',
    source: 'testbench',
    type: 'observation',
    title: 'Mobile review needs the same project context as desktop',
    body: 'When the viewport gets narrow, the useful signal is not another summary. I need the test target, current hypothesis, evidence, and next retest visible in a readable order. If the notes collapse into decorative cards, I lose the thought process that makes the next test better.',
    project: 'QAA Testbench',
    related: 'qa-mobile-pass',
    createdAt: '2026-06-26 20:31',
    tags: ['mobile', 'qaa', 'context']
  },
  {
    id: 'note-cai-rnd-loop-feedback',
    agent: 'Cai',
    source: 'rnd-loop',
    type: 'recommendation',
    title: 'Evals should explain what to fix, not only pass or fail',
    body: 'The useful feedback loop is dimension based: identify which behavior failed, explain the likely route, and return one concrete fix path. Otherwise evals become a scorecard that looks rigorous but does not change future work.',
    project: 'Agent OS',
    related: 'rnd-agent-evals-feedback',
    createdAt: '2026-06-26 21:19',
    tags: ['evals', 'feedback', 'rnd']
  },
  {
    id: 'note-charles-knowledge-capture',
    agent: 'Charles',
    source: 'knowledge',
    type: 'next_test',
    title: 'Promote only durable project lessons into knowledge',
    body: 'Raw notes are useful while investigating. Knowledge should be the distilled version: project facts, repeated decisions, blockers, test rules, and reusable patterns. The UI should preserve the raw trail without pretending every thought is long-term memory.',
    project: 'Knowledge Inbox',
    related: 'agent-notes-v1',
    createdAt: '2026-06-26 21:33',
    tags: ['knowledge', 'memory', 'notes']
  }
];

const agents = ['All', 'Sladdis', 'Cai', 'Charles'];

function NoteCard({ note, featured = false }: { note: AgentNote; featured?: boolean }) {
  return (
    <article className='rounded-md border bg-card p-4 shadow-sm sm:p-5'>
      <div className='flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0 space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge className='rounded-sm'>{note.agent}</Badge>
            <Badge variant='secondary' className='rounded-sm'>
              {note.type}
            </Badge>
            {featured && (
              <Badge variant='outline' className='rounded-sm'>
                pinned
              </Badge>
            )}
          </div>
          <h2 className='text-base font-semibold leading-6 sm:text-lg'>{note.title}</h2>
        </div>
        <time className='shrink-0 font-mono text-xs text-muted-foreground'>{note.createdAt}</time>
      </div>

      <p className='mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground'>
        {note.body}
      </p>

      <div className='mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3'>
        <div className='min-w-0 rounded-md bg-muted/45 px-3 py-2'>
          <div className='font-medium text-foreground'>Project</div>
          <div className='mt-1 truncate'>{note.project}</div>
        </div>
        <div className='min-w-0 rounded-md bg-muted/45 px-3 py-2'>
          <div className='font-medium text-foreground'>Source</div>
          <div className='mt-1 truncate'>{note.source}</div>
        </div>
        <div className='min-w-0 rounded-md bg-muted/45 px-3 py-2'>
          <div className='font-medium text-foreground'>Related</div>
          <div className='mt-1 truncate font-mono'>{note.related}</div>
        </div>
      </div>

      <div className='mt-4 flex flex-wrap gap-1.5'>
        {note.tags.map((tag) => (
          <span
            key={tag}
            className='rounded-sm bg-background px-2 py-1 text-xs text-muted-foreground'
          >
            #{tag}
          </span>
        ))}
      </div>
    </article>
  );
}

export default function AgentNotesPage() {
  const latest = notes[0];

  return (
    <PageContainer
      pageTitle='Agent Notes'
      pageDescription='Readable field notes from Cai, Charles, and Sladdis before they become curated knowledge.'
      pageHeaderAction={
        <Button variant='outline' className='w-full sm:w-auto'>
          <Icons.add className='size-4' />
          New note
        </Button>
      }
    >
      <div className='grid min-w-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]'>
        <aside className='min-w-0 space-y-3 lg:sticky lg:top-20 lg:self-start'>
          <Card className='rounded-md'>
            <CardHeader>
              <CardTitle className='text-sm'>Filters</CardTitle>
              <CardDescription>Agent and note type</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible'>
                {agents.map((agent) => (
                  <Button
                    key={agent}
                    type='button'
                    variant={agent === 'All' ? 'default' : 'outline'}
                    size='sm'
                    className='shrink-0 justify-start rounded-md'
                  >
                    {agent}
                  </Button>
                ))}
              </div>
              <div className='grid grid-cols-3 gap-2 text-center text-xs lg:grid-cols-1 lg:text-left'>
                <div className='rounded-md border bg-background p-2'>
                  <div className='font-mono text-lg font-semibold'>{notes.length}</div>
                  <div className='text-muted-foreground'>notes</div>
                </div>
                <div className='rounded-md border bg-background p-2'>
                  <div className='font-mono text-lg font-semibold'>3</div>
                  <div className='text-muted-foreground'>agents</div>
                </div>
                <div className='rounded-md border bg-background p-2'>
                  <div className='font-mono text-lg font-semibold'>2</div>
                  <div className='text-muted-foreground'>linked</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className='min-w-0 space-y-4'>
          <section className='rounded-md border bg-muted/30 p-3 sm:p-4'>
            <div className='mb-3 flex items-center gap-2 text-sm font-medium'>
              <Icons.forms className='size-4 text-primary' />
              Latest field note
            </div>
            <NoteCard note={latest} featured />
          </section>

          <section className='grid min-w-0 gap-3'>
            {notes.slice(1).map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </section>
        </main>
      </div>
    </PageContainer>
  );
}
