import { bridgeRequest, hasBridge } from '@/lib/bridge';

export type Priority = 'low' | 'medium' | 'high';

export type BoardTask = {
  id: string;
  projectId?: string;
  projectName?: string;
  title: string;
  description?: string;
  status: string;
  priority: Priority;
  priorityValue?: number;
  assignee?: string;
  source?: string;
  dueDate?: string;
  position?: number;
  updatedAt?: string;
};

export type TaskBoard = {
  columns: Record<string, BoardTask[]>;
  columnOrder: string[];
  source: string;
};

export const emptyTaskBoard: TaskBoard = {
  columns: { backlog: [], in_progress: [], review: [], waiting: [], done: [] },
  columnOrder: ['backlog', 'in_progress', 'review', 'waiting', 'done'],
  source: 'empty'
};

export async function getTaskBoard(): Promise<TaskBoard> {
  if (!hasBridge()) return emptyTaskBoard;
  try {
    return await bridgeRequest<TaskBoard>('/tasks');
  } catch (error) {
    console.error('Task board bridge request failed', error);
    return { ...emptyTaskBoard, source: 'bridge-error' };
  }
}
