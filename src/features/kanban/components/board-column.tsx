'use client';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KanbanColumn, KanbanColumnHandle } from '@/components/ui/kanban';
import { COLUMN_TITLES, type Task } from '../utils/store';
import { TaskCard } from './task-card';

interface TaskColumnProps extends Omit<React.ComponentProps<typeof KanbanColumn>, 'children'> {
  tasks: Task[];
  onTaskOpen?: (task: Task) => void;
}

export function TaskColumn({ value, tasks, onTaskOpen, ...props }: TaskColumnProps) {
  const title = COLUMN_TITLES[value] ?? value;

  return (
    <KanbanColumn
      value={value}
      className='h-full w-[min(85vw,20rem)] shrink-0 snap-start md:w-[320px]'
      {...props}
    >
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-semibold'>{title}</span>
          <Badge variant='secondary' className='pointer-events-none rounded-sm'>
            {tasks.length}
          </Badge>
        </div>
        <KanbanColumnHandle asChild>
          <Button variant='ghost' size='icon' aria-label={`Move ${title} column`}>
            <Icons.gripVertical className='h-4 w-4' />
          </Button>
        </KanbanColumnHandle>
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-0.5'>
        {tasks.length ? (
          tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={onTaskOpen} />)
        ) : (
          <div className='text-muted-foreground flex min-h-24 items-center justify-center rounded-md border border-dashed px-3 text-center text-xs'>
            Drop a task here
          </div>
        )}
      </div>
    </KanbanColumn>
  );
}
