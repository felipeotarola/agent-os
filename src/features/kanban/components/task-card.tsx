'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { KanbanItem, KanbanItemHandle } from '@/components/ui/kanban';
import { Icons } from '@/components/icons';
import type { Task } from '../utils/store';

interface TaskCardProps extends Omit<React.ComponentProps<typeof KanbanItem>, 'value'> {
  task: Task;
  onOpen?: (task: Task) => void;
}

function shortTaskId(id: string) {
  return id.length > 12 ? id.slice(0, 8) : id;
}

export function TaskCard({ task, onOpen, ...props }: TaskCardProps) {
  const [copied, setCopied] = useState(false);

  async function copyTaskId(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    await navigator.clipboard.writeText(task.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <KanbanItem key={task.id} value={task.id} asChild {...props}>
      <div className='bg-card hover:border-primary/40 rounded-md border p-3 shadow-xs transition-colors'>
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between gap-2'>
            <button
              type='button'
              className='line-clamp-1 min-w-0 text-left text-sm font-medium underline-offset-2 hover:text-primary hover:underline'
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onOpen?.(task);
              }}
            >
              {task.title}
            </button>
            <div className='flex shrink-0 items-center gap-1.5'>
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
              <KanbanItemHandle className='text-muted-foreground hover:text-foreground rounded-sm p-1'>
                <Icons.gripVertical className='size-3.5' />
                <span className='sr-only'>Dra task</span>
              </KanbanItemHandle>
            </div>
          </div>
          <div className='text-muted-foreground flex items-center justify-between gap-2 text-xs'>
            <div className='flex min-w-0 items-center gap-2'>
              <button
                type='button'
                title={`Copy ticket ID: ${task.id}`}
                className='hover:bg-muted hover:text-foreground inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] transition-colors'
                onPointerDown={(event) => event.stopPropagation()}
                onClick={copyTaskId}
              >
                <Icons.copy className='size-3' />
                {copied ? 'copied' : shortTaskId(task.id)}
              </button>
              {task.assignee && (
                <div className='flex min-w-0 items-center gap-1'>
                  <div className='bg-primary/20 size-2 shrink-0 rounded-full' />
                  <span className='line-clamp-1'>{task.assignee}</span>
                </div>
              )}
            </div>
            {task.dueDate && (
              <time className='shrink-0 text-[10px] tabular-nums'>{task.dueDate}</time>
            )}
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
