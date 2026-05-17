import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { getTaskBoard } from '@/db/tasks';
import { KanbanBoard } from './kanban-board';
import NewTaskDialog from './new-task-dialog';

export default async function KanbanViewPage({
  searchParams
}: {
  searchParams?: Promise<{ created?: string; error?: string }>;
}) {
  const [board, params] = await Promise.all([
    getTaskBoard(),
    searchParams ?? Promise.resolve({} as { created?: string; error?: string })
  ]);
  const taskCount = Object.values(board.columns).flat().length;

  return (
    <PageContainer
      pageTitle='Tasks'
      pageDescription='Real Agent OS task board backed by private Postgres'
      pageHeaderAction={<NewTaskDialog />}
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
            {params.created && 'Task skapad i Postgres.'}
            {params.error === 'missing' && 'Titel krävs.'}
          </div>
        )}
      </div>
      <KanbanBoard initialColumns={board.columns} columnOrder={board.columnOrder} />
    </PageContainer>
  );
}
