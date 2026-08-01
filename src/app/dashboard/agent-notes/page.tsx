import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
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
import { getKnowledgeSnapshot, type KnowledgeSnapshot } from '@/db/knowledge';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export const metadata = {
  title: 'Agent OS: Agent Notes'
};

type KnowledgeSource = KnowledgeSnapshot['sources'][number];

interface AgentNote {
  id: string;
  agent: string;
  source: string;
  type: string;
  title: string;
  summary: string;
  body: string;
  project?: string;
  related?: string;
  createdAt: Date;
  tags: string[];
}

interface AgentNotesSearchParams {
  agent?: string | string[];
  note?: string | string[];
}

const noteDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function metadataText(
  metadata: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function metadataTags(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.tags;
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()));
}

function isAgentNote(source: KnowledgeSource) {
  const normalizedKind = source.kind.toLowerCase().replaceAll('_', '-');
  return (
    normalizedKind.includes('agent-note') ||
    Boolean(metadataText(source.metadata, 'agent', 'agentName'))
  );
}

function toAgentNote(source: KnowledgeSource): AgentNote {
  const metadata = source.metadata;
  const body = source.wikiContent.trim() || source.summary;

  return {
    id: source.id,
    agent: metadataText(metadata, 'agent', 'agentName') ?? 'Agent',
    source: metadataText(metadata, 'source') ?? source.kind,
    type: metadataText(metadata, 'type', 'noteType') ?? 'field-note',
    title: source.title,
    summary: source.summary,
    body,
    project: metadataText(metadata, 'project', 'projectName'),
    related: metadataText(metadata, 'related', 'relatedId'),
    createdAt: new Date(source.createdAt),
    tags: metadataTags(metadata)
  };
}

function notesHref({ agent, note }: { agent?: string; note?: string }) {
  const params = new URLSearchParams();
  if (agent) params.set('agent', agent);
  if (note) params.set('note', note);
  const query = params.toString();
  return query ? `/dashboard/agent-notes?${query}` : '/dashboard/agent-notes';
}

function NoteDetailRail({ note }: { note: AgentNote }) {
  return (
    <Card className='gap-4 py-4'>
      <CardHeader className='px-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge>{note.agent}</Badge>
          <Badge variant='secondary'>{note.type}</Badge>
        </div>
        <CardTitle className='pt-2 text-base leading-snug'>{note.title}</CardTitle>
        <CardDescription>
          <time dateTime={note.createdAt.toISOString()}>
            {noteDateFormatter.format(note.createdAt)}
          </time>
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4 px-4'>
        <p className='text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed'>
          {note.body}
        </p>

        <dl className='grid grid-cols-2 gap-2 text-xs'>
          <div className='rounded-lg border bg-background/40 p-3'>
            <dt className='text-muted-foreground'>Project</dt>
            <dd className='mt-1 font-medium'>{note.project ?? 'Not specified'}</dd>
          </div>
          <div className='rounded-lg border bg-background/40 p-3'>
            <dt className='text-muted-foreground'>Source</dt>
            <dd className='mt-1 font-medium'>{note.source}</dd>
          </div>
          {note.related && (
            <div className='col-span-2 rounded-lg border bg-background/40 p-3'>
              <dt className='text-muted-foreground'>Related</dt>
              <dd className='mt-1 break-all font-mono'>{note.related}</dd>
            </div>
          )}
        </dl>

        {note.tags.length > 0 && (
          <div className='flex flex-wrap gap-1.5'>
            {note.tags.map((tag) => (
              <Badge key={tag} variant='outline'>
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        <Button asChild variant='outline' className='w-full'>
          <Link href='/dashboard/knowledge'>Open Knowledge Inbox</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function NotesStatusStrip({
  dbOnline,
  noteCount,
  agentCount
}: {
  dbOnline: boolean;
  noteCount: number;
  agentCount: number;
}) {
  const metrics = [
    { label: 'Notes', value: dbOnline ? String(noteCount) : '—' },
    { label: 'Agents', value: dbOnline ? String(agentCount) : '—' },
    { label: 'Source', value: dbOnline ? 'Postgres' : 'Unavailable' }
  ];

  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <CardContent className='px-0'>
        <dl className='grid grid-cols-3 divide-x'>
          {metrics.map((metric) => (
            <div key={metric.label} className='flex min-w-0 flex-col gap-1 p-3 sm:p-4'>
              <dt className='text-muted-foreground text-xs'>{metric.label}</dt>
              <dd className='truncate text-base font-semibold tabular-nums sm:text-lg'>
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export default async function AgentNotesPage({
  searchParams
}: {
  searchParams: Promise<AgentNotesSearchParams>;
}) {
  const [snapshot, params] = await Promise.all([getKnowledgeSnapshot(), searchParams]);
  const notes = snapshot.sources.filter(isAgentNote).map(toAgentNote);
  const agents = [...new Set(notes.map((note) => note.agent))].toSorted((a, b) =>
    a.localeCompare(b)
  );
  const requestedAgent = firstParam(params.agent);
  const activeAgent = agents.includes(requestedAgent ?? '') ? requestedAgent : undefined;
  const visibleNotes = activeAgent ? notes.filter((note) => note.agent === activeAgent) : notes;
  const selectedNoteId = firstParam(params.note);
  const selectedNote = selectedNoteId
    ? notes.find((note) => note.id === selectedNoteId)
    : undefined;

  return (
    <PageContainer
      pageTitle='Agent Notes'
      pageDescription='Field notes captured by live agents before they become curated knowledge.'
      pageHeaderAction={
        <Button asChild variant='outline'>
          <Link href='/dashboard/knowledge'>
            <Icons.add data-icon='inline-start' />
            Capture in Knowledge
          </Link>
        </Button>
      }
      rightRail={selectedNote ? <NoteDetailRail note={selectedNote} /> : undefined}
      rightRailTitle={selectedNote ? 'Note context' : undefined}
      rightRailDescription={selectedNote ? 'Selected field note and source metadata.' : undefined}
      rightRailDefaultOpen={selectedNote ? true : undefined}
    >
      <div className='flex flex-1 flex-col gap-4'>
        <NotesStatusStrip
          dbOnline={snapshot.dbOnline}
          noteCount={notes.length}
          agentCount={agents.length}
        />

        {agents.length > 0 && (
          <nav aria-label='Filter notes by agent' className='flex gap-2 overflow-x-auto pb-1'>
            <Link
              href={notesHref({})}
              aria-current={!activeAgent ? 'page' : undefined}
              className={cn(
                buttonVariants({ variant: !activeAgent ? 'secondary' : 'outline', size: 'sm' }),
                'shrink-0'
              )}
            >
              All
            </Link>
            {agents.map((agent) => (
              <Link
                key={agent}
                href={notesHref({ agent })}
                aria-current={activeAgent === agent ? 'page' : undefined}
                className={cn(
                  buttonVariants({
                    variant: activeAgent === agent ? 'secondary' : 'outline',
                    size: 'sm'
                  }),
                  'shrink-0'
                )}
              >
                {agent}
              </Link>
            ))}
          </nav>
        )}

        <Card className='gap-0 overflow-hidden py-0'>
          <CardHeader className='border-b py-4'>
            <CardTitle>Field notes</CardTitle>
            <CardDescription>
              {activeAgent
                ? `Notes captured by ${activeAgent}.`
                : 'Latest real notes from connected agents.'}
            </CardDescription>
            <CardAction>
              <Badge variant='outline'>{visibleNotes.length} results</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className='px-0'>
            {!snapshot.dbOnline ? (
              <div className='flex min-h-64 flex-col items-center justify-center px-6 text-center'>
                <div className='bg-muted flex size-11 items-center justify-center rounded-xl'>
                  <Icons.database aria-hidden='true' className='text-muted-foreground size-5' />
                </div>
                <div className='mt-4 font-medium'>Agent notes are unavailable</div>
                <p className='text-muted-foreground mt-1 max-w-md text-sm'>
                  Connect Postgres or the Agent OS bridge to load real field notes. No sample notes
                  are shown in this state.
                </p>
              </div>
            ) : visibleNotes.length === 0 ? (
              <div className='flex min-h-64 flex-col items-center justify-center px-6 text-center'>
                <div className='bg-muted flex size-11 items-center justify-center rounded-xl'>
                  <Icons.forms aria-hidden='true' className='text-muted-foreground size-5' />
                </div>
                <div className='mt-4 font-medium'>No field notes yet</div>
                <p className='text-muted-foreground mt-1 max-w-md text-sm'>
                  Notes will appear here when a connected agent captures them in the knowledge
                  layer.
                </p>
              </div>
            ) : (
              <ul className='divide-y'>
                {visibleNotes.map((note) => {
                  const isSelected = note.id === selectedNote?.id;
                  return (
                    <li key={note.id}>
                      <Link
                        href={notesHref({ agent: activeAgent, note: note.id })}
                        aria-current={isSelected ? 'true' : undefined}
                        className={cn(
                          'focus-visible:ring-ring flex flex-col gap-2 p-4 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none sm:p-5',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/40'
                        )}
                      >
                        <div className='flex min-w-0 items-start justify-between gap-3'>
                          <div className='flex min-w-0 flex-wrap items-center gap-2'>
                            <Badge>{note.agent}</Badge>
                            <Badge variant='secondary'>{note.type}</Badge>
                          </div>
                          <time
                            className='text-muted-foreground shrink-0 text-xs tabular-nums'
                            dateTime={note.createdAt.toISOString()}
                          >
                            {noteDateFormatter.format(note.createdAt)}
                          </time>
                        </div>
                        <div className='font-medium'>{note.title}</div>
                        <p className='text-muted-foreground line-clamp-2 text-sm leading-relaxed'>
                          {note.summary}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
