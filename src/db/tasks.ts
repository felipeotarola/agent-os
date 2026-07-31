import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { sql } from './client';
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

function normalizeStatus(status: string) {
  if (status === 'active') return 'in_progress';
  if (status === 'todo') return 'backlog';
  return ['backlog', 'in_progress', 'review', 'waiting', 'done'].includes(status)
    ? status
    : 'backlog';
}

function priorityLabel(priority: number): Priority {
  if (priority >= 80) return 'high';
  if (priority >= 40) return 'medium';
  return 'low';
}

async function getDirectDatabaseTaskBoard(): Promise<TaskBoard> {
  const rows = await sql<
    Array<{
      id: string;
      projectId: string | null;
      projectName: string | null;
      title: string;
      description: string;
      status: string;
      priority: number;
      assignee: string | null;
      source: string;
      dueDate: Date | null;
      position: number;
      updatedAt: Date | null;
    }>
  >`
    select t.id, t.project_id as "projectId", p.name as "projectName", t.title,
      t.description, t.status, t.priority, t.owner_agent_id as assignee, t.source,
      t.due_at as "dueDate", coalesce(t.position, 0) as position,
      t.updated_at as "updatedAt"
    from tasks t
    left join projects p on p.id = t.project_id
    order by coalesce(t.position, 0) asc, t.priority desc, t.updated_at desc
  `;

  const columns: TaskBoard['columns'] = {
    backlog: [],
    in_progress: [],
    review: [],
    waiting: [],
    done: []
  };

  for (const row of rows) {
    const status = normalizeStatus(row.status);
    columns[status].push({
      id: row.id,
      projectId: row.projectId ?? undefined,
      projectName: row.projectName ?? undefined,
      title: row.title,
      description: row.description,
      status,
      priority: priorityLabel(Number(row.priority ?? 0)),
      priorityValue: Number(row.priority ?? 0),
      assignee: row.assignee ?? undefined,
      source: row.source,
      dueDate: row.dueDate?.toISOString().slice(0, 10),
      position: Number(row.position ?? 0),
      updatedAt: row.updatedAt?.toISOString()
    });
  }

  return taskBoardSchema.parse({
    columns,
    columnOrder: emptyTaskBoard.columnOrder,
    source: 'direct-db:postgres'
  });
}

export async function getTaskBoard(): Promise<TaskBoard> {
  if (hasBridge()) {
    try {
      return taskBoardSchema.parse(await bridgeRequest('/tasks'));
    } catch (error) {
      console.error('Task board bridge request failed; trying direct database fallback', error);
    }
  }

  if (process.env.DATABASE_URL) {
    try {
      return await getDirectDatabaseTaskBoard();
    } catch (error) {
      console.error('Task board direct database fallback failed', error);
    }
  }

  return { ...emptyTaskBoard, source: hasBridge() ? 'bridge-error' : 'empty' };
}
