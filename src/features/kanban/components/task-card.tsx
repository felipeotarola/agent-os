'use client';

import { Badge } from '@/components/ui/badge';
import { KanbanItem } from '@/components/ui/kanban';
import type { Task } from '../utils/store';

interface TaskCardProps extends Omit<React.ComponentProps<typeof KanbanItem>, 'value'> {
  task: Task;
}

export function TaskCard({ task, ...props }: TaskCardProps) {
  return (
    <KanbanItem key={task.id} value={task.id} asChild {...props}>
      <div className='bg-card rounded-md border p-3 shadow-xs'>
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between gap-2'>
            <span className='line-clamp-1 text-sm font-medium'>{task.title}</span>
            <Badge
              variant={
                task.priority === 'high'
                  ? 'destructive'
                  : task.priority === 'medium'
                    ? 'default'
                    : 'secondary'
              }
              className='pointer-events-none h-5 rounded-sm px-1.5 text-[11px] capitalize'
            >
              {task.priority}
            </Badge>
          </div>
          <div className='text-muted-foreground flex items-center justify-between text-xs'>
            {task.assignee && (
              <div className='flex items-center gap-1'>
                <div className='bg-primary/20 size-2 rounded-full' />
                <span className='line-clamp-1'>{task.assignee}</span>
              </div>
            )}
            {task.dueDate && <time className='text-[10px] tabular-nums'>{task.dueDate}</time>}
          </div>
          {(task.projectName || task.source) && (
            <div className='text-muted-foreground flex items-center justify-between gap-2 text-[10px]'>
              <span className='line-clamp-1'>{task.projectName}</span>
              <span className='rounded-sm bg-muted px-1.5 py-0.5'>{task.source}</span>
            </div>
          )}
          {task.description && (
            <p className='text-muted-foreground line-clamp-2 text-xs'>{task.description}</p>
          )}
        </div>
      </div>
    </KanbanItem>
  );
}
