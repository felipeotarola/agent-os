import 'dotenv/config';
import { sql as dsql } from 'drizzle-orm';
import { sql as pgSql } from '../src/db/client';
import { agents, artifacts, projects, taskEvents, tasks } from '../src/db/schema';
import { db } from '../src/db/client';

async function main() {
  await db.insert(agents).values([
    {
      id: 'cai',
      name: 'Cai',
      emoji: '⚛️',
      role: 'Orchestrator',
      runtime: 'openclaw',
      status: 'online',
      detail: 'Main session, Telegram, workspace, subagent orchestration'
    },
    {
      id: 'charles',
      name: 'Charles',
      emoji: '🧭',
      role: 'Product/research',
      runtime: 'openclaw',
      status: 'online',
      detail: 'Lysande roadmap, PRDs, research, GTM context'
    },
    {
      id: 'linda',
      name: 'Linda',
      emoji: '📈',
      role: 'Paper trading research',
      runtime: 'openclaw',
      status: 'online',
      detail: 'BTC-first paper trading, market research, backtests, and trading journal briefs'
    },
    {
      id: 'worker-pool',
      name: 'Worker pool',
      emoji: '🛠️',
      role: 'Implementation',
      runtime: 'openclaw-subagents',
      status: 'online',
      detail: 'Ephemeral coding workers for implementation, tests, review'
    }
  ]).onConflictDoUpdate({
    target: agents.id,
    set: {
      status: dsql`excluded.status`,
      detail: dsql`excluded.detail`,
      updatedAt: dsql`now()`
    }
  });

  await db.insert(projects).values([
    {
      id: 'agent-os',
      name: 'Agent OS',
      slug: 'agent-os',
      status: 'active',
      summary: 'Local-first cockpit for agents, tasks, memory, wiki, artifacts, and permissions.',
      ownerAgentId: 'cai',
      priority: 100
    },
    {
      id: 'life-os',
      name: 'Life OS',
      slug: 'life-os',
      status: 'active',
      summary: 'Lightweight local context layer for goals, finances, blockers, projects, and useful questions.',
      ownerAgentId: 'cai',
      priority: 80
    },
    {
      id: 'lysande',
      name: 'Lysande',
      slug: 'lysande',
      status: 'active',
      summary: 'Product, coding, GTM, and research work with Charles preserving product intent.',
      ownerAgentId: 'charles',
      priority: 70
    },
    {
      id: 'health',
      name: 'Health + system hygiene',
      slug: 'health-system-hygiene',
      status: 'active',
      summary: 'Keep OpenClaw, nodes, memory, and local services stable.',
      ownerAgentId: 'cai',
      priority: 30
    }
  ]).onConflictDoUpdate({
    target: projects.id,
    set: {
      summary: dsql`excluded.summary`,
      priority: dsql`excluded.priority`,
      updatedAt: dsql`now()`
    }
  });

  await db.insert(tasks).values([
    {
      id: 'agent-os-db-foundation',
      projectId: 'agent-os',
      title: 'Agent OS database foundation',
      description: 'Local Postgres, Drizzle schema, migration, seed data, and dashboard read path.',
      status: 'done',
      priority: 100,
      ownerAgentId: 'cai',
      source: 'telegram'
    },
    {
      id: 'agent-os-bridge',
      projectId: 'agent-os',
      title: 'OpenClaw bridge',
      description: 'Small local adapter that syncs sessions/tasks/events into Postgres and exposes safe actions.',
      status: 'todo',
      priority: 90,
      ownerAgentId: 'worker-pool',
      source: 'architecture'
    },
    {
      id: 'agent-os-wiki-vault',
      projectId: 'agent-os',
      title: 'Knowledge vault structure',
      description: 'Create raw/wiki/journal/index/log folders and mirror metadata to DB.',
      status: 'todo',
      priority: 80,
      ownerAgentId: 'cai',
      source: 'architecture'
    },
    {
      id: 'life-os-runway',
      projectId: 'life-os',
      title: 'Income/runway picture',
      description: 'Turn finance/project context into concrete runway view and next actions without storing secrets.',
      status: 'waiting',
      priority: 70,
      ownerAgentId: 'cai',
      source: 'life-os'
    },
    {
      id: 'lysande-product-intent',
      projectId: 'lysande',
      title: 'Preserve Lysande product intent',
      description: 'Charles owns roadmap, PRDs, acceptance criteria, research, and GTM context.',
      status: 'active',
      priority: 60,
      ownerAgentId: 'charles',
      source: 'memory'
    }
  ]).onConflictDoUpdate({
    target: tasks.id,
    set: {
      projectId: dsql`excluded.project_id`,
      title: dsql`excluded.title`,
      description: dsql`excluded.description`,
      status: dsql`excluded.status`,
      priority: dsql`excluded.priority`,
      ownerAgentId: dsql`excluded.owner_agent_id`,
      source: dsql`excluded.source`,
      updatedAt: dsql`now()`
    }
  });

  await db.insert(taskEvents).values([
    {
      id: 'event-agent-os-db-created',
      taskId: 'agent-os-db-foundation',
      actorAgentId: 'cai',
      kind: 'status',
      message: 'Created local Postgres + Drizzle foundation for Agent OS cockpit.',
      metadata: { source: 'seed' }
    }
  ]).onConflictDoNothing();

  await db.insert(artifacts).values([
    {
      id: 'artifact-architecture-v0',
      projectId: 'agent-os',
      kind: 'markdown',
      title: 'Agent OS Architecture v0',
      path: 'AGENT_OS_ARCHITECTURE.md',
      summary: 'Hybrid architecture: OpenClaw runtime, Postgres read model, markdown durable knowledge.'
    }
  ]).onConflictDoUpdate({
    target: artifacts.id,
    set: {
      summary: dsql`excluded.summary`
    }
  });

  console.log('Seeded Agent OS local database.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgSql.end();
  });
