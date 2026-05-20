import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { z } from 'zod';

const prioritySchema = z.enum(['low', 'medium', 'high']);

export type Priority = z.infer<typeof prioritySchema>;

const boardTaskSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  priority: prioritySchema,
  priorityValue: z.number().optional(),
  assignee: z.string().optional(),
  source: z.string().optional(),
  dueDate: z.string().optional(),
  position: z.number().optional(),
  updatedAt: z.string().optional()
});

export type BoardTask = z.infer<typeof boardTaskSchema>;

const taskBoardSchema = z.object({
  columns: z.record(z.string(), z.array(boardTaskSchema)),
  columnOrder: z.array(z.string()),
  source: z.string()
});

export type TaskBoard = z.infer<typeof taskBoardSchema>;

export const emptyTaskBoard: TaskBoard = {
  columns: { backlog: [], in_progress: [], review: [], waiting: [], done: [] },
  columnOrder: ['backlog', 'in_progress', 'review', 'waiting', 'done'],
  source: 'empty'
};

export async function getTaskBoard(): Promise<TaskBoard> {
  if (!hasBridge()) return emptyTaskBoard;
  try {
    return taskBoardSchema.parse(await bridgeRequest('/tasks'));
  } catch (error) {
    console.error('Task board bridge request failed', error);
    return { ...emptyTaskBoard, source: 'bridge-error' };
  }
}
