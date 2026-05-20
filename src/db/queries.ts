import { desc, sql as drizzleSql } from 'drizzle-orm';
import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { db } from './client';
import { agents, projects, tasks } from './schema';

export type SubagentRun = {
  id: string;
  taskId: string | null;
  runId: string | null;
  sessionKey: string | null;
  label: string;
  title: string;
  status: string;
  runtime: string;
  ownerKey: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  agentId?: string | null;
  ageMs?: number;
  totalTokens?: number | null;
};

export type SubagentRunsSnapshot = {
  ok: boolean;
  source: string;
  available: boolean;
  runningCount: number;
  activeTaskRunCount?: number;
  activeSessionCount?: number;
  recent: SubagentRun[];
  activeSessions?: SubagentRun[];
  error: string | null;
  checkedAt: string;
};

export type CockpitSnapshot = {
  stats: Array<{ label: string; value: string; detail: string; tone: string }>;
  tasks: Array<{
    id?: string;
    title: string;
    detail: string;
    status: string;
    owner?: string | null;
    project?: string | null;
    priority?: string;
    updatedAt?: string | null;
  }>;
  agents: Array<{ name: string; role: string; detail: string; status: string }>;
  knowledge?: {
    raw: number;
    queued: number;
    extracted?: number;
    wikified: number;
    reviewed?: number;
    promoted?: number;
    archived?: number;
    progress: number;
  };
  subagents?: SubagentRunsSnapshot;
  taskStatus?: Record<string, number>;
  events?: Array<{ kind: string; message: string; createdAt: string }>;
  generatedAt?: string;
  dbOnline: boolean;
};

const fallbackSnapshot: CockpitSnapshot = {
  dbOnline: false,
  stats: [
    {
      label: 'Aktiva projekt',
      value: '—',
      detail: 'Bridge/DB saknas; inga runtime-värden visas',
      tone: 'Offline'
    },
    {
      label: 'Öppna tasks',
      value: '—',
      detail: 'Starta lokal Postgres med npm run db:up',
      tone: 'Väntar'
    },
    { label: 'Agenter online', value: '—', detail: 'DB-lagret är inte anslutet', tone: 'Fallback' },
    {
      label: 'Subagents',
      value: '—',
      detail: 'Bridge saknas; OpenClaw task-källa kan inte läsas',
      tone: 'Unavailable'
    }
  ],
  tasks: [],
  agents: [],
  subagents: {
    ok: false,
    source: 'fallback:no-bridge-or-db',
    available: false,
    runningCount: 0,
    activeTaskRunCount: 0,
    activeSessionCount: 0,
    recent: [],
    activeSessions: [],
    error: 'Bridge/DB saknas',
    checkedAt: new Date().toISOString()
  }
};

export async function getCockpitSnapshot(): Promise<CockpitSnapshot> {
  if (hasBridge()) {
    try {
      return await bridgeRequest<CockpitSnapshot>('/overview', {
        cacheMs: 8000,
        timeoutMs: 2500
      });
    } catch (error) {
      console.error('Overview bridge snapshot failed', error);
    }
  }

  if (!process.env.DATABASE_URL) {
    return fallbackSnapshot;
  }

  try {
    const [agentRows, taskRows, projectRows, taskCounts] = await Promise.all([
      db.select().from(agents).orderBy(agents.name),
      db.select().from(tasks).orderBy(desc(tasks.priority), desc(tasks.updatedAt)).limit(6),
      db.select().from(projects).orderBy(desc(projects.priority), projects.name),
      db
        .select({ status: tasks.status, count: drizzleSql<number>`count(*)::int` })
        .from(tasks)
        .groupBy(tasks.status)
    ]);

    const openTasks = taskCounts
      .filter((row) => !['done', 'cancelled'].includes(row.status))
      .reduce((sum, row) => sum + Number(row.count), 0);
    const activeProjects = projectRows.filter((project) => project.status === 'active').length;
    const onlineAgents = agentRows.filter((agent) => agent.status === 'online').length;
    const waitingTasks = taskCounts.find((row) => row.status === 'waiting')?.count ?? 0;
    const runningTasks = taskCounts.find((row) => row.status === 'in_progress')?.count ?? 0;

    return {
      dbOnline: true,
      stats: [
        {
          label: 'Aktiva mål',
          value: String(activeProjects),
          detail: projectRows
            .slice(0, 3)
            .map((project) => project.name)
            .join(', '),
          tone: 'DB live'
        },
        {
          label: 'Öppna tasks',
          value: String(openTasks),
          detail: `${waitingTasks} väntar, ${runningTasks} körs`,
          tone: 'Levande'
        },
        {
          label: 'Agenter online',
          value: String(onlineAgents),
          detail: agentRows.map((agent) => agent.name).join(', '),
          tone: 'Redo'
        },
        {
          label: 'Subagents',
          value: '—',
          detail: 'Bridge saknas; OpenClaw task-källa kan inte läsas via direkt DB-fallback',
          tone: 'Unavailable'
        }
      ],
      tasks: taskRows.map((task) => ({
        id: task.id,
        title: task.title,
        detail: task.description,
        status: task.status,
        owner: task.ownerAgentId,
        project: task.projectId,
        priority: String(task.priority ?? ''),
        updatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : null
      })),
      agents: agentRows.map((agent) => ({
        name: agent.name,
        role: agent.role,
        detail: agent.detail,
        status: agent.status
      })),
      subagents: {
        ok: false,
        source: 'fallback:direct-db',
        available: false,
        runningCount: 0,
        activeTaskRunCount: 0,
        activeSessionCount: 0,
        recent: [],
        activeSessions: [],
        error: 'Subagent runs require the bridge OpenClaw CLI source',
        checkedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Agent OS DB snapshot failed', error);
    return fallbackSnapshot;
  }
}
