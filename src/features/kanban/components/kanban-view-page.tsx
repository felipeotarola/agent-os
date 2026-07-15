import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { getTaskOwnerAgents } from '@/db/agents';
import type { TaskOwnerAgent } from '@/db/agents';
import { getTaskBoard } from '@/db/tasks';
import { sessionCookieName, verifySessionToken } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { KanbanBoard } from './kanban-board';
import NewTaskDialog from './new-task-dialog';

function titleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function userOwnerFromEmail(email: string): TaskOwnerAgent {
  const localPart = email.split('@')[0]?.trim().toLowerCase() || 'user';
  const slug = localPart.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'user';
  return {
    id: slug === 'felipe' || slug.startsWith('felipe-') ? 'felipe' : `user-${slug}`,
    name: titleCase(slug) || email,
    role: 'Logged-in user',
    status: 'online'
  };
}

function mergeOwnerAgents(currentUser: TaskOwnerAgent | null, agents: TaskOwnerAgent[]) {
  const merged = currentUser ? [currentUser, ...agents] : agents;
  return merged.filter(
    (agent, index, allAgents) =>
      allAgents.findIndex((candidate) => candidate.id === agent.id) === index
  );
}

async function getCurrentUserOwner() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(sessionCookieName)?.value);
  return session?.email ? userOwnerFromEmail(session.email) : null;
}

export default async function KanbanViewPage({
  searchParams
}: {
  searchParams?: Promise<{ created?: string; error?: string }>;
}) {
  const [board, agentSnapshot, currentUserOwner, params] = await Promise.all([
    getTaskBoard(),
    getTaskOwnerAgents(),
    getCurrentUserOwner(),
    searchParams ?? Promise.resolve({} as { created?: string; error?: string })
  ]);
  const taskCount = Object.values(board.columns).flat().length;
  const agents = mergeOwnerAgents(
    currentUserOwner,
    agentSnapshot.agents.length ? agentSnapshot.agents : [{ id: 'cai', name: 'Cai' }]
  );

  return (
    <PageContainer
      pageTitle='Agent OS Tasks'
      pageDescription='Product work stored in Agent OS/Postgres. OpenClaw runtime runs are shown separately in Cockpit and Topology.'
      pageHeaderAction={<NewTaskDialog agents={agents} />}
    >
      <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
            {board.source}
          </Badge>
          <Badge variant='secondary'>{taskCount} tasks</Badge>
          <Badge variant='secondary'>{board.columnOrder.length} columns</Badge>
        </div>
        {(params.created || params.error) && (
          <div
            className={params.error ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}
          >
            {params.created && 'Task skapad i Supabase.'}
            {params.error === 'missing' && 'Titel krävs.'}
          </div>
        )}
      </div>
      <KanbanBoard initialColumns={board.columns} columnOrder={board.columnOrder} agents={agents} />
    </PageContainer>
  );
}
