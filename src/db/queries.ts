import { desc, sql as drizzleSql } from 'drizzle-orm';
import { db } from './client';
import { agents, projects, tasks } from './schema';

export type CockpitSnapshot = {
  stats: Array<{ label: string; value: string; detail: string; tone: string }>;
  tasks: Array<{ title: string; detail: string; status: string }>;
  agents: Array<{ name: string; role: string; detail: string; status: string }>;
  dbOnline: boolean;
};

const fallbackSnapshot: CockpitSnapshot = {
  dbOnline: false,
  stats: [
    {
      label: 'Aktiva mål',
      value: '4',
      detail: 'Fallback från UI när DB inte svarar',
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
      label: 'Knowledge health',
      value: '—',
      detail: 'Wiki/index/log pipeline skissad',
      tone: 'Byggs'
    }
  ],
  tasks: [
    {
      title: 'Starta lokal databas',
      detail: 'npm run db:up && npm run db:migrate && npm run db:seed',
      status: 'next'
    }
  ],
  agents: [
    {
      name: 'Cai',
      role: 'Orchestrator',
      detail: 'Main session, Telegram, workspace',
      status: 'fallback'
    }
  ]
};

export async function getCockpitSnapshot(): Promise<CockpitSnapshot> {
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
          label: 'Knowledge health',
          value: '72%',
          detail: 'Wiki/index/log pipeline skissad; metadata ska speglas hit',
          tone: 'Byggs'
        }
      ],
      tasks: taskRows.map((task) => ({
        title: task.title,
        detail: task.description,
        status: task.status
      })),
      agents: agentRows.map((agent) => ({
        name: agent.name,
        role: agent.role,
        detail: agent.detail,
        status: agent.status
      }))
    };
  } catch (error) {
    console.error('Agent OS DB snapshot failed', error);
    return fallbackSnapshot;
  }
}
