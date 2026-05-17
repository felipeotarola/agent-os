import type { BoardTask, Priority } from '@/db/tasks';

export type { Priority };
export type Task = BoardTask;
export type KanbanColumns = Record<string, Task[]>;

export const TASK_COLUMNS = ['backlog', 'in_progress', 'review', 'waiting', 'done'] as const;

export const COLUMN_TITLES: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'In Progress',
  review: 'Review',
  waiting: 'Waiting',
  done: 'Done'
};
