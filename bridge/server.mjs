import http from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { promisify } from 'node:util';
import postgres from 'postgres';

const port = Number(process.env.BRIDGE_PORT ?? 8787);
const token = process.env.AGENT_OS_BRIDGE_TOKEN;
const databaseUrl = process.env.BRIDGE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!token) throw new Error('AGENT_OS_BRIDGE_TOKEN is required');
if (!databaseUrl) throw new Error('BRIDGE_DATABASE_URL or DATABASE_URL is required');

const sql = postgres(databaseUrl, { max: 5, prepare: false });
const execFileAsync = promisify(execFile);
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const bridgeVersion = String(packageJson.version ?? 'unknown');
const OPENCLAW_CLI = '/usr/lib/node_modules/openclaw/dist/entry.js';
const GOG_CLI = process.env.GOG_CLI ?? 'gog';
const GMAIL_ACCOUNT = process.env.AGENT_OS_GMAIL_ACCOUNT ?? 'feot1000@gmail.com';
const KNOWLEDGE_STATUSES = ['raw', 'queued', 'wikified'];
const FUTURE_KNOWLEDGE_STATUSES = ['reviewed', 'archived'];
const SESSION_HARVEST_AGENTS = ['main', 'charles', 'sladdis'];
const SESSION_HARVEST_DIRS = ['qmd/sessions', 'sessions'];

function configuredAgents() {
  try {
    return JSON.parse(process.env.AGENT_OS_AGENTS_JSON ?? '[]');
  } catch (error) {
    console.error('Failed to parse AGENT_OS_AGENTS_JSON', error);
    return [];
  }
}

async function openclawJson(args, options = {}) {
  const { stdout } = await execFileAsync('node', [OPENCLAW_CLI, ...args], {
    timeout: options.timeout ?? 20000,
    maxBuffer: 1024 * 1024 * 4,
    env: { ...process.env, NO_COLOR: '1', PATH: `/app/bridge/bin:${process.env.PATH ?? ''}` }
  });
  return JSON.parse(stdout);
}

async function openclawText(args, options = {}) {
  const { stdout } = await execFileAsync('node', [OPENCLAW_CLI, ...args], {
    timeout: options.timeout ?? 8000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', PATH: `/app/bridge/bin:${process.env.PATH ?? ''}` }
  });
  return stdout.trim();
}
async function gogJson(args, options = {}) {
  const keyringPasswordPath = '/root/.config/gogcli/keyring-password';
  const keyringPassword = existsSync(keyringPasswordPath)
    ? readFileSync(keyringPasswordPath, 'utf8').trim()
    : process.env.GOG_KEYRING_PASSWORD;
  const { stdout } = await execFileAsync(GOG_CLI, [...args, '--json'], {
    timeout: options.timeout ?? 30000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
    env: {
      ...process.env,
      NO_COLOR: '1',
      GOG_KEYRING_PASSWORD: keyringPassword,
      PATH: `/usr/local/bin:/root/.openclaw/bin:/app/bridge/bin:${process.env.PATH ?? ''}`
    }
  });
  return JSON.parse(stdout || '{}');
}


function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeRunStatus(status) {
  const value = String(status ?? 'unknown');
  if (['queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled', 'lost'].includes(value)) return value;
  return 'unknown';
}

function compactTaskTitle(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

function readTextSlice(path, maxChars = 80000) {
  const buffer = readFileSync(path);
  return buffer.toString('utf8', 0, Math.min(buffer.length, maxChars));
}

function sessionAgentRoot(agentId) {
  return `/root/.openclaw/agents/${agentId}`;
}

function sessionCandidateFiles() {
  const files = [];
  for (const agentId of SESSION_HARVEST_AGENTS) {
    for (const dir of SESSION_HARVEST_DIRS) {
      const root = `${sessionAgentRoot(agentId)}/${dir}`;
      if (!existsSync(root)) continue;
      for (const name of readdirSync(root)) {
        if (name.includes('trajectory') || name.includes('checkpoint')) continue;
        if (!name.endsWith('.md') && !name.endsWith('.jsonl')) continue;
        const path = `${root}/${name}`;
        try {
          const stat = statSync(path);
          if (!stat.isFile() || stat.size < 2500) continue;
          files.push({ agentId, path, name, size: stat.size, mtimeMs: stat.mtimeMs });
        } catch {
          // Ignore files that disappear during inventory.
        }
      }
    }
  }
  return files;
}

function sessionSignalScore(text) {
  const value = text.toLowerCase();
  const keywords = [
    'remember',
    'kom ihåg',
    'beslut',
    'decision',
    'todo',
    'nästa steg',
    'next step',
    'felipe asked',
    'felipe said',
    'ska',
    'bör',
    'memory',
    'agent os',
    'lysande',
    'sladdis',
    'charles'
  ];
  const keywordScore = keywords.reduce((sum, keyword) => sum + (value.includes(keyword) ? 1 : 0), 0);
  const userTurns = (text.match(/(^|\n)(User|Human|Felipe):/g) ?? []).length;
  const assistantTurns = (text.match(/(^|\n)Assistant:/g) ?? []).length;
  return keywordScore * 10 + Math.min(40, userTurns + assistantTurns) + Math.min(40, Math.floor(text.length / 5000));
}

function sessionTitle(agentId, path, text) {
  const firstHumanLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^(User|Human|Felipe):\s+/.test(line));
  const label = firstHumanLine?.replace(/^(User|Human|Felipe):\s+/, '').slice(0, 90);
  const base = path.split('/').pop()?.replace(/\.(md|jsonl).*$/, '') ?? 'session';
  return `${agentId} session: ${label || base}`;
}

function extractSessionSummary(agentId, path, text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const signalLines = lines
    .filter((line) => /remember|kom ihåg|beslut|decision|todo|nästa steg|next step|Felipe asked|Felipe said|ska|bör|implemented|created|fixed|deployed/i.test(line))
    .slice(0, 8)
    .map((line) => line.replace(/\s+/g, ' ').slice(0, 220));
  return [
    `Harvested ${agentId} session for review.`,
    `Source: ${path}`,
    `Signals: ${signalLines.length ? signalLines.join(' · ') : 'long/high-signal session; needs review.'}`
  ].join('\n');
}

async function sessionKnowledgeInventory({ limit = 25, minScore = 35 } = {}) {
  const existing = await sql`
    select source_url as "sourceUrl"
    from knowledge_sources
    where kind in ('agent-session', 'chat-session')
  `;
  const seen = new Set(existing.map((row) => row.sourceUrl));
  const candidates = sessionCandidateFiles()
    .map((file) => {
      const text = readTextSlice(file.path, 90000);
      const score = sessionSignalScore(text);
      return {
        ...file,
        score,
        title: sessionTitle(file.agentId, file.path, text),
        sourceUrl: `session://${file.agentId}/${file.name}`,
        alreadyImported: seen.has(`session://${file.agentId}/${file.name}`)
      };
    })
    .filter((file) => file.score >= minScore)
    .toSorted((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs)
    .slice(0, limit);

  return {
    contract: 'agent-os.session-knowledge-inventory.v1',
    generatedAt: new Date().toISOString(),
    source: 'openclaw:agent-session-files',
    minScore,
    candidates
  };
}

async function harvestSessionKnowledge(input = {}) {
  const limit = Math.min(Number(input.limit ?? 5), 20);
  const minScore = Number(input.minScore ?? 35);
  const dryRun = Boolean(input.dryRun);
  const inventory = await sessionKnowledgeInventory({ limit: limit * 2, minScore });
  const selected = inventory.candidates.filter((candidate) => !candidate.alreadyImported).slice(0, limit);
  const imported = [];

  if (!dryRun) {
    for (const candidate of selected) {
      const text = readTextSlice(candidate.path, 90000);
      const summary = extractSessionSummary(candidate.agentId, candidate.path, text);
      const rawContent = [
        `# ${candidate.title}`,
        '',
        `Agent: ${candidate.agentId}`,
        `Source file: ${candidate.path}`,
        `Signal score: ${candidate.score}`,
        '',
        '## Extracted signals',
        summary,
        '',
        '## Raw transcript excerpt',
        text.slice(0, 60000)
      ].join('\n');
      const slug = slugify(candidate.title) || crypto.randomUUID();
      const rawPath = `knowledge/sessions/${new Date().toISOString().slice(0, 10)}-${slug}.md`;
      const id = crypto.randomUUID();
      await sql`
        insert into knowledge_sources (id, title, kind, status, source_url, raw_content, raw_path, summary, metadata)
        values (${id}, ${candidate.title}, 'agent-session', 'extracted', ${candidate.sourceUrl}, ${rawContent}, ${rawPath}, ${summary.slice(0, 1000)}, ${sql.json({ createdFrom: 'session-harvester', agentId: candidate.agentId, sessionPath: candidate.path, score: candidate.score, harvestedAt: new Date().toISOString() })})
      `;
      imported.push({ id, title: candidate.title, agentId: candidate.agentId, score: candidate.score, rawPath });
    }
  }

  await auditEvent('session_harvest', `Session harvester ${dryRun ? 'previewed' : 'imported'} ${dryRun ? selected.length : imported.length} session sources`, { dryRun, minScore, limit, imported }, 5);
  return {
    contract: 'agent-os.session-knowledge-harvest.v1',
    generatedAt: new Date().toISOString(),
    dryRun,
    selected,
    imported
  };
}

async function auditEvent(kind, message, metadata = {}, throttleMinutes = 30) {
  try {
    const recent = await sql`
      select id from task_events
      where kind = ${kind}
        and message = ${message}
        and created_at > now() - (${throttleMinutes}::text || ' minutes')::interval
      limit 1
    `;
    if (recent.length) return false;
    await sql`
      insert into task_events (id, task_id, actor_agent_id, kind, message, metadata)
      values (${crypto.randomUUID()}, null, null, ${kind}, ${message}, ${sql.json(metadata)})
    `;
    return true;
  } catch (error) {
    console.error('Failed to write audit event', error);
    return false;
  }
}

async function openclawStatus() {
  try {
    const versionText = await openclawText(['--version'], { timeout: 5000 });
    return { available: true, status: 'available', version: versionText || null, source: 'openclaw-cli:version', error: null };
  } catch (error) {
    return { available: false, status: 'unavailable', version: null, source: 'openclaw-cli:version', error: error.message };
  }
}

async function subagentRunsSnapshot() {
  const source = 'openclaw-cli:tasks-list+sessions-active';
  try {
    const [taskPayload, sessionPayload] = await Promise.all([
      openclawJson(['tasks', 'list', '--json'], { timeout: 12000 }),
      openclawJson(['sessions', '--all-agents', '--active', '30', '--json', '--limit', '25'], { timeout: 12000 })
    ]);
    const rows = Array.isArray(taskPayload.tasks) ? taskPayload.tasks : [];
    const runs = rows.slice(0, 12).map((task) => {
      const status = normalizeRunStatus(task.status);
      return {
        id: String(task.runId ?? task.taskId ?? task.childSessionKey ?? crypto.randomUUID()),
        taskId: task.taskId ? String(task.taskId) : null,
        runId: task.runId ? String(task.runId) : null,
        sessionKey: task.childSessionKey ? String(task.childSessionKey) : null,
        label: String(task.label ?? task.title ?? task.runtime ?? 'subagent'),
        title: compactTaskTitle(task.title ?? task.task ?? task.label) ?? 'subagent run',
        status,
        runtime: String(task.runtime ?? 'subagent'),
        ownerKey: task.ownerKey ? String(task.ownerKey) : null,
        startedAt: isoOrNull(task.startedAt ?? task.createdAt ?? task.enqueuedAt),
        updatedAt: isoOrNull(task.updatedAt ?? task.lastHeartbeatAt ?? task.finishedAt ?? task.startedAt ?? task.createdAt),
        finishedAt: isoOrNull(task.finishedAt)
      };
    });
    const activeTaskRuns = runs.filter((run) => ['queued', 'running'].includes(run.status));
    const sessionRows = Array.isArray(sessionPayload.sessions) ? sessionPayload.sessions : [];
    const activeSessions = sessionRows
      .filter((session) => Number(session.ageMs ?? Infinity) <= 30 * 60 * 1000)
      .slice(0, 8)
      .map((session) => ({
        id: String(session.key ?? session.sessionId ?? crypto.randomUUID()),
        taskId: null,
        runId: session.sessionId ? String(session.sessionId) : null,
        sessionKey: session.key ? String(session.key) : null,
        label: `${session.agentId ?? 'agent'} ${session.kind ?? 'session'}`,
        title: `${session.agentId ?? 'agent'} ${session.kind ?? 'session'} activity`,
        status: 'active',
        runtime: 'session',
        ownerKey: session.key ? String(session.key) : null,
        startedAt: null,
        updatedAt: isoOrNull(session.updatedAt),
        finishedAt: null,
        agentId: session.agentId ? String(session.agentId) : null,
        ageMs: Number(session.ageMs ?? 0),
        totalTokens: typeof session.totalTokens === 'number' ? session.totalTokens : null
      }));
    const recent = [...activeTaskRuns, ...runs.filter((run) => !['queued', 'running'].includes(run.status)).slice(0, 8), ...activeSessions].slice(0, 16);
    return {
      ok: true,
      source,
      available: true,
      runningCount: activeTaskRuns.length + activeSessions.length,
      activeTaskRunCount: activeTaskRuns.length,
      activeSessionCount: activeSessions.length,
      recent,
      activeSessions,
      error: null,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    await auditEvent('subagent_snapshot_failed', 'Subagent/background run snapshot failed', { source, error: error.message }, 30);
    return { ok: false, source, available: false, runningCount: 0, activeTaskRunCount: 0, activeSessionCount: 0, recent: [], activeSessions: [], error: error.message, checkedAt: new Date().toISOString() };
  }
}

function knowledgeLifecycle(counts) {
  return {
    statuses: Object.fromEntries(KNOWLEDGE_STATUSES.map((status) => [status, counts[status] ?? 0])),
    active: KNOWLEDGE_STATUSES,
    planned: FUTURE_KNOWLEDGE_STATUSES,
    flow: 'raw -> queued -> wikified',
    futureFlow: 'reviewed/archived planned, not active yet'
  };
}

async function memorySearch(url) {
  const query = String(url.searchParams.get('query') ?? '').trim();
  const corpus = String(url.searchParams.get('corpus') ?? 'all');
  const maxResults = Math.min(Number(url.searchParams.get('maxResults') ?? 8), 20);

  if (!query) return { query, corpus, results: [], source: 'openclaw-memory:qmd' };

  const payload = await openclawJson(['memory', 'search', query, '--json', '--max-results', String(maxResults)]);
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const results = corpus === 'all' ? rawResults : rawResults.filter((result) => result.source === corpus);
  return { query, corpus, results, source: 'openclaw-memory:qmd' };
}

async function memoryStatus() {
  try {
    return { status: await openclawJson(['memory', 'status', '--json']), source: 'openclaw-memory:qmd' };
  } catch (error) {
    return { status: null, source: 'openclaw-memory:qmd', error: error.message };
  }
}

async function systemStatus() {
  const checkedAt = new Date().toISOString();
  const [dbResult, knowledgeResult, memory, openclaw, subagents] = await Promise.allSettled([
    sql`select 1 as ok, now() as now`,
    sql`select status, count(*)::int as count from knowledge_sources group by status`,
    memoryStatus(),
    openclawStatus(),
    subagentRunsSnapshot()
  ]);

  const dbRows = dbResult.status === 'fulfilled' ? dbResult.value : [];
  const knowledgeRows = knowledgeResult.status === 'fulfilled' ? knowledgeResult.value : [];
  const memoryValue = memory.status === 'fulfilled' ? memory.value : { status: null, source: 'openclaw-memory:qmd', error: memory.reason?.message ?? 'memory status failed' };
  const openclawValue = openclaw.status === 'fulfilled' ? openclaw.value : { available: false, status: 'unavailable', version: null, source: 'openclaw-cli:version', error: openclaw.reason?.message ?? 'openclaw status failed' };
  const subagentValue = subagents.status === 'fulfilled' ? subagents.value : { ok: false, source: 'openclaw-cli:tasks-list:subagent', available: false, runningCount: 0, recent: [], error: subagents.reason?.message ?? 'subagent snapshot failed', checkedAt };

  if (dbResult.status === 'rejected') {
    console.error('System status DB check failed', dbResult.reason);
  }
  if (knowledgeResult.status === 'rejected') {
    await auditEvent('bridge_health_failed', 'Bridge health knowledge count failed', { error: knowledgeResult.reason?.message }, 30);
  }

  const knowledgeCounts = Object.fromEntries(knowledgeRows.map((row) => [row.status, Number(row.count)]));
  const memoryAgents = Array.isArray(memoryValue.status) ? memoryValue.status : [];
  const dbOnline = dbRows[0]?.ok === 1;
  return {
    ok: Boolean(dbOnline && openclawValue.available && !memoryValue.error && subagentValue.ok),
    contract: 'agent-os.bridge.status.v1',
    bridge: {
      status: 'online',
      version: bridgeVersion,
      uptimeSeconds: Math.round(process.uptime()),
      now: dbRows[0]?.now ?? new Date().toISOString()
    },
    db: { status: dbOnline ? 'online' : 'unknown', checkedAt, error: dbResult.status === 'rejected' ? dbResult.reason?.message : null },
    openclaw: openclawValue,
    agents: { count: configuredAgents().length, source: 'bridge:AGENT_OS_AGENTS_JSON' },
    knowledge: {
      raw: knowledgeCounts.raw ?? 0,
      queued: knowledgeCounts.queued ?? 0,
      wikified: knowledgeCounts.wikified ?? 0,
      lifecycle: knowledgeLifecycle(knowledgeCounts)
    },
    memory: {
      source: memoryValue.source,
      ok: !memoryValue.error,
      summary: {
        agentCount: memoryAgents.length,
        chunks: memoryAgents.reduce((sum, entry) => sum + Number(entry.status?.chunks ?? 0), 0),
        dirtyCount: memoryAgents.filter((entry) => entry.status?.dirty).length
      },
      agents: memoryAgents.map((entry) => ({
        agentId: entry.agentId,
        backend: entry.status?.backend,
        files: entry.status?.files,
        chunks: entry.status?.chunks,
        dirty: entry.status?.dirty,
        sources: entry.status?.sources ?? []
      })),
      error: memoryValue.error
    },
    subagents: subagentValue,
    lastSync: {
      bridgeCheckedAt: checkedAt,
      openclawCheckedAt: checkedAt,
      subagentsCheckedAt: subagentValue.checkedAt ?? null,
      knowledgeUpdatedAt: null,
      memoryCheckedAt: checkedAt
    }
  };
}

async function ensureTaskBoardColumns() {
  await sql`alter table tasks add column if not exists position integer not null default 0`;
}

function normalizeTaskStatus(status) {
  if (status === 'active') return 'in_progress';
  if (status === 'todo') return 'backlog';
  if (['backlog', 'in_progress', 'review', 'waiting', 'done', 'cancelled'].includes(status)) return status;
  return 'backlog';
}

function taskPriorityLabel(priority) {
  const value = Number(priority ?? 0);
  if (value >= 80) return 'high';
  if (value >= 40) return 'medium';
  return 'low';
}

function taskPriorityValue(priority) {
  if (priority === 'high') return 90;
  if (priority === 'low') return 20;
  return 50;
}

function mapTask(row) {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    title: row.title,
    description: row.description ?? '',
    status: normalizeTaskStatus(row.status),
    priority: taskPriorityLabel(row.priority),
    priorityValue: Number(row.priority ?? 0),
    assignee: row.ownerAgentId ?? undefined,
    source: row.source,
    dueDate: row.dueAt ? new Date(row.dueAt).toISOString().slice(0, 10) : undefined,
    position: Number(row.position ?? 0),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined
  };
}

async function tasksSnapshot() {
  await ensureTaskBoardColumns();
  const rows = await sql`
    select t.id, t.project_id as "projectId", p.name as "projectName", t.title, t.description, t.status, t.priority, t.owner_agent_id as "ownerAgentId", t.source, t.due_at as "dueAt", t.position, t.updated_at as "updatedAt"
    from tasks t
    left join projects p on p.id = t.project_id
    order by t.position asc, t.priority desc, t.updated_at desc
  `;
  const columns = { backlog: [], in_progress: [], review: [], waiting: [], done: [] };
  for (const row of rows) {
    const task = mapTask(row);
    const status = task.status in columns ? task.status : 'backlog';
    columns[status].push(task);
  }
  return {
    columns,
    columnOrder: ['backlog', 'in_progress', 'review', 'waiting', 'done'],
    source: 'bridge:postgres'
  };
}

async function taskDispatchSummary() {
  await ensureTaskBoardColumns();
  const actionableStatuses = ['backlog', 'waiting', 'review'];
  const rows = await sql`
    select t.id, t.project_id as "projectId", p.name as "projectName", t.title, t.description, t.status, t.priority, t.owner_agent_id as "ownerAgentId", t.source, t.due_at as "dueAt", t.position, t.updated_at as "updatedAt"
    from tasks t
    left join projects p on p.id = t.project_id
    where t.status in ('backlog', 'waiting', 'review', 'todo')
      and t.owner_agent_id is not null
      and t.owner_agent_id <> ''
    order by t.priority desc, t.updated_at asc, t.position asc
    limit 50
  `;
  const agentsById = new Map(configuredAgents().map((agent) => [agent.id, agent]));
  const tasks = rows
    .map(mapTask)
    .filter((task) => actionableStatuses.includes(task.status));
  const grouped = new Map();

  for (const task of tasks) {
    const agentId = task.assignee;
    if (!agentId) continue;
    const group = grouped.get(agentId) ?? {
      agentId,
      agentName: agentsById.get(agentId)?.identityName ?? agentsById.get(agentId)?.name ?? agentId,
      emoji: agentsById.get(agentId)?.identityEmoji ?? '',
      count: 0,
      highPriorityCount: 0,
      tasks: []
    };
    group.count += 1;
    if (task.priority === 'high') group.highPriorityCount += 1;
    if (group.tasks.length < 5) group.tasks.push(task);
    grouped.set(agentId, group);
  }

  const byAgent = [...grouped.values()].toSorted((a, b) => {
    if (b.highPriorityCount !== a.highPriorityCount) return b.highPriorityCount - a.highPriorityCount;
    return b.count - a.count;
  });
  const actionableCount = tasks.length;
  const lines = [];
  if (!actionableCount) {
    lines.push('Inga agentkopplade tasks i backlog/waiting/review just nu.');
  } else {
    lines.push(`Det finns ${actionableCount} agentkopplade tasks att ta ställning till:`);
    for (const group of byAgent) {
      lines.push(`- ${group.emoji ? `${group.emoji} ` : ''}${group.agentName} (${group.agentId}): ${group.count} task${group.count === 1 ? '' : 's'}${group.highPriorityCount ? ` · ${group.highPriorityCount} high` : ''}`);
      for (const [index, task] of group.tasks.entries()) {
        lines.push(`  ${index + 1}. [${task.priority}/${task.status}] ${task.title} (${task.id})`);
      }
      if (group.count > group.tasks.length) lines.push(`  … +${group.count - group.tasks.length} fler`);
    }
  }

  return {
    contract: 'agent-os.task-dispatch-summary.v1',
    generatedAt: new Date().toISOString(),
    source: 'bridge:postgres',
    actionableStatuses,
    actionableCount,
    byAgent,
    suggestedMessage: lines.join('\n')
  };
}

const CAI_BRIEF_JOB_IDS = [
  { id: '8a1af0f0-8ea8-40b3-97ba-c5658ed7c306', label: 'Morgonbrief', slot: 'morning' },
  { id: 'f907cdef-03ca-4710-aee2-e673c0c52363', label: 'Kvällsbrief', slot: 'evening' },
  { id: '52e0ff6b-8753-4c92-a478-ff3c99f9ed43', label: 'Agent OS morgondispatch', slot: 'morning-dispatch' },
  { id: '585c20ef-09b0-47b2-ab95-19e746fa526e', label: 'Agent OS kvällsdispatch', slot: 'evening-dispatch' }
];

async function cronRuns(jobId) {
  const path = `/root/.openclaw/cron/runs/${jobId}.jsonl`;
  if (existsSync(path)) {
    try {
      return readFileSync(path, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .toReversed()
        .slice(0, 3);
    } catch (error) {
      await auditEvent('cai_brief_cron_file_read_failed', 'Failed to read Cai briefing cron JSONL', { jobId, error: error.message }, 60);
    }
  }

  try {
    const result = await openclawJson(['cron', 'runs', '--id', jobId, '--limit', '3', '--timeout', '20000'], { timeout: 30000 });
    return Array.isArray(result.entries) ? result.entries : [];
  } catch (error) {
    await auditEvent('cai_brief_cron_read_failed', 'Failed to read Cai briefing cron runs', { jobId, error: error.message }, 60);
    return [];
  }
}

async function latestCaiBriefMessage() {
  const runGroups = await Promise.all(CAI_BRIEF_JOB_IDS.map(async (job) => ({ job, runs: await cronRuns(job.id) })));
  const entries = runGroups
    .flatMap(({ job, runs }) =>
      runs.map((run) => ({
        jobId: job.id,
        label: job.label,
        slot: job.slot,
        status: run.status,
        summary: typeof run.summary === 'string' ? run.summary.trim() : '',
        delivered: Boolean(run.delivered),
        deliveryStatus: run.deliveryStatus ?? null,
        runAtMs: Number(run.runAtMs ?? run.ts ?? 0),
        ts: Number(run.ts ?? run.runAtMs ?? 0)
      }))
    )
    .filter((entry) => entry.status === 'ok' && entry.summary)
    .toSorted((a, b) => b.runAtMs - a.runAtMs);

  const latest = entries[0] ?? null;
  return {
    contract: 'agent-os.cai-latest-brief-message.v1',
    generatedAt: new Date().toISOString(),
    source: 'openclaw:cron-runs',
    latest,
    runs: entries.slice(0, 6)
  };
}

async function overviewSnapshot() {
  await ensureTaskBoardColumns();
  const [agentRows, projectRows, taskRows, taskCounts, knowledgeCounts, events, memory, subagents] = await Promise.all([
    sql`select id, name, role, detail, status from agents order by name`,
    sql`select id, name, status, summary, priority from projects order by priority desc, name`,
    sql`
      select t.id, t.title, t.description, t.status, t.priority, t.owner_agent_id as "ownerAgentId", p.name as "projectName", t.updated_at as "updatedAt"
      from tasks t
      left join projects p on p.id = t.project_id
      order by t.position asc, t.priority desc, t.updated_at desc
      limit 8
    `,
    sql`select status, count(*)::int as count from tasks group by status`,
    sql`select status, count(*)::int as count from knowledge_sources group by status`,
    sql`
      select kind, message, created_at as "createdAt"
      from task_events
      order by created_at desc
      limit 6
    `,
    memoryStatus(),
    subagentRunsSnapshot()
  ]);

  const taskByStatus = new Map(taskCounts.map((row) => [normalizeTaskStatus(row.status), Number(row.count)]));
  const knowledgeByStatus = new Map(knowledgeCounts.map((row) => [row.status, Number(row.count)]));
  const openTasks = [...taskByStatus.entries()]
    .filter(([status]) => !['done', 'cancelled'].includes(status))
    .reduce((sum, [, count]) => sum + count, 0);
  const activeProjects = projectRows.filter((project) => project.status === 'active').length;
  const onlineAgents = agentRows.filter((agent) => agent.status === 'online').length;
  const memoryAgents = Array.isArray(memory.status) ? memory.status : [];
  const memoryChunks = memoryAgents.reduce((sum, entry) => sum + Number(entry.status?.chunks ?? 0), 0);
  const raw = knowledgeByStatus.get('raw') ?? 0;
  const extracted = knowledgeByStatus.get('extracted') ?? knowledgeByStatus.get('queued') ?? 0;
  const wikified = knowledgeByStatus.get('wikified') ?? 0;
  const reviewed = knowledgeByStatus.get('reviewed') ?? 0;
  const promoted = knowledgeByStatus.get('promoted') ?? 0;
  const archived = knowledgeByStatus.get('archived') ?? 0;
  const knowledgeTotal = raw + extracted + wikified + reviewed + promoted + archived;
  const processedKnowledge = wikified + reviewed + promoted + archived;
  const knowledgeProgress = knowledgeTotal ? Math.round((processedKnowledge / knowledgeTotal) * 100) : 0;

  return {
    dbOnline: true,
    generatedAt: new Date().toISOString(),
    stats: [
      { label: 'Aktiva projekt', value: String(activeProjects), detail: projectRows.slice(0, 3).map((project) => project.name).join(', '), tone: 'Postgres' },
      { label: 'Öppna tasks', value: String(openTasks), detail: `${taskByStatus.get('in_progress') ?? 0} in progress · ${taskByStatus.get('review') ?? 0} review · ${taskByStatus.get('waiting') ?? 0} waiting`, tone: 'Live board' },
      { label: 'Agenter online', value: `${onlineAgents}/${agentRows.length}`, detail: agentRows.map((agent) => agent.name).join(', '), tone: 'OpenClaw' },
      { label: 'Memory chunks', value: String(memoryChunks), detail: memory.error ? memory.error : `${memoryAgents.length} indexed agents`, tone: 'QMD' },
      { label: 'Subagents', value: String(subagents.runningCount ?? 0), detail: subagents.ok ? `${subagents.recent.length} recent runs · ${subagents.source}` : `source unavailable: ${subagents.error}`, tone: 'OpenClaw tasks' }
    ],
    tasks: taskRows.map((task) => ({
      title: task.title,
      detail: task.description,
      status: normalizeTaskStatus(task.status),
      owner: task.ownerAgentId,
      project: task.projectName,
      priority: taskPriorityLabel(task.priority)
    })),
    agents: agentRows.map((agent) => ({ name: agent.name, role: agent.role, detail: agent.detail, status: agent.status })),
    knowledge: {
      raw,
      queued: extracted,
      extracted,
      wikified,
      reviewed,
      promoted,
      archived,
      progress: knowledgeProgress
    },
    taskStatus: Object.fromEntries(taskByStatus),
    subagents,
    events: events.map((event) => ({ kind: event.kind, message: event.message, createdAt: new Date(event.createdAt).toISOString() }))
  };
}

function notificationAction(id, label, href) {
  return { id, label, type: 'redirect', style: 'primary', href };
}

async function notificationsSnapshot() {
  const [waitingTasks, rawKnowledge, recentEvents, memory] = await Promise.all([
    sql`
      select t.id, t.title, t.description, t.status, t.updated_at as "updatedAt", p.name as "projectName"
      from tasks t
      left join projects p on p.id = t.project_id
      where t.status in ('waiting', 'review')
      order by t.updated_at desc
      limit 8
    `,
    sql`
      select id, title, status, created_at as "createdAt"
      from knowledge_sources
      where status in ('raw', 'queued')
      order by created_at desc
      limit 8
    `,
    sql`
      select id, kind, message, created_at as "createdAt"
      from task_events
      order by created_at desc
      limit 8
    `,
    memoryStatus()
  ]);

  const notifications = [];

  for (const task of waitingTasks) {
    notifications.push({
      id: `task:${task.id}:${task.status}`,
      title: task.status === 'review' ? 'Task redo för review' : 'Task väntar på input',
      body: `${task.title}${task.projectName ? ` · ${task.projectName}` : ''}`,
      status: 'unread',
      kind: 'task',
      createdAt: new Date(task.updatedAt).toISOString(),
      actions: [notificationAction('open-tasks', 'Open tasks', '/dashboard/kanban')]
    });
  }

  for (const source of rawKnowledge) {
    notifications.push({
      id: `knowledge:${source.id}:${source.status}`,
      title: source.status === 'queued' ? 'Knowledge källa köad' : 'Ny raw knowledge väntar',
      body: source.title,
      status: 'unread',
      kind: 'knowledge',
      createdAt: new Date(source.createdAt).toISOString(),
      actions: [notificationAction('open-knowledge', 'Open inbox', '/dashboard/knowledge')]
    });
  }

  const memoryAgents = Array.isArray(memory.status) ? memory.status : [];
  for (const entry of memoryAgents.filter((entry) => entry.status?.dirty)) {
    notifications.push({
      id: `memory:${entry.agentId}:dirty`,
      title: 'Memory index är dirty',
      body: `${entry.agentId} har ändringar som behöver indexeras.`,
      status: 'unread',
      kind: 'memory',
      createdAt: new Date().toISOString(),
      actions: [notificationAction('open-command', 'Open command', '/dashboard/command?run=memory-status')]
    });
  }

  if (memory.error) {
    notifications.push({
      id: 'memory:error',
      title: 'Memory status error',
      body: memory.error,
      status: 'unread',
      kind: 'system',
      createdAt: new Date().toISOString(),
      actions: [notificationAction('open-command', 'Open command', '/dashboard/command?run=memory-status')]
    });
  }

  for (const event of recentEvents.slice(0, 5)) {
    notifications.push({
      id: `event:${event.id}`,
      title: `Task event: ${event.kind}`,
      body: event.message,
      status: 'read',
      kind: 'event',
      createdAt: new Date(event.createdAt).toISOString(),
      actions: [notificationAction('open-overview', 'Open overview', '/dashboard/overview')]
    });
  }

  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    notifications,
    unreadCount: notifications.filter((notification) => notification.status === 'unread').length,
    generatedAt: new Date().toISOString(),
    source: 'bridge:postgres+openclaw'
  };
}

async function ensureAffiliateTables() {
  await sql`
    create table if not exists affiliate_accounts (
      id text primary key,
      provider text not null,
      name text not null,
      tracking_id text not null default '',
      marketplace text not null default '',
      status text not null default 'planned',
      source text not null default 'manual',
      notes text not null default '',
      metadata jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists affiliate_daily_stats (
      id text primary key,
      account_id text references affiliate_accounts(id),
      date date not null,
      clicks integer not null default 0,
      ordered_items integer not null default 0,
      shipped_items integer not null default 0,
      revenue numeric not null default 0,
      commission numeric not null default 0,
      currency text not null default 'SEK',
      conversion_rate numeric not null default 0,
      top_products jsonb not null default '[]',
      source text not null default 'manual',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(account_id, date)
    )
  `;
}

async function affiliateSnapshot() {
  await ensureAffiliateTables();
  const [accounts, rows] = await Promise.all([
    sql`
      select id, provider, name, tracking_id as "trackingId", marketplace, status, source, notes, metadata, updated_at as "updatedAt"
      from affiliate_accounts
      order by provider, name
    `,
    sql`
      select s.id, s.account_id as "accountId", a.name as "accountName", s.date, s.clicks, s.ordered_items as "orderedItems", s.shipped_items as "shippedItems", s.revenue, s.commission, s.currency, s.conversion_rate as "conversionRate", s.top_products as "topProducts", s.source
      from affiliate_daily_stats s
      left join affiliate_accounts a on a.id = s.account_id
      order by s.date desc
      limit 60
    `
  ]);

  const totals = rows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + Number(row.clicks ?? 0),
      orderedItems: acc.orderedItems + Number(row.orderedItems ?? 0),
      shippedItems: acc.shippedItems + Number(row.shippedItems ?? 0),
      revenue: acc.revenue + Number(row.revenue ?? 0),
      commission: acc.commission + Number(row.commission ?? 0)
    }),
    { clicks: 0, orderedItems: 0, shippedItems: 0, revenue: 0, commission: 0 }
  );
  const conversionRate = totals.clicks ? Number(((totals.orderedItems / totals.clicks) * 100).toFixed(2)) : 0;

  return {
    source: 'bridge:postgres',
    generatedAt: new Date().toISOString(),
    configured: accounts.length > 0,
    connected: rows.length > 0,
    accounts,
    totals: { ...totals, conversionRate, currency: rows[0]?.currency ?? 'SEK' },
    rows,
    nextSteps: [
      'Confirm which Amazon Associates/Creator reporting source Sladdis can access.',
      'Prefer official read-only API/export over browser scraping or manual OAuth loops.',
      'Store scoped credentials only in bridge/VPS environment, never in Vercel UI.',
      'Map daily report rows into affiliate_daily_stats and trigger notifications on meaningful changes.'
    ]
  };
}

async function upsertAffiliateAccount(input) {
  await ensureAffiliateTables();
  const id = String(input.id ?? crypto.randomUUID()).trim();
  const provider = String(input.provider ?? 'amazon-associates').trim();
  const name = String(input.name ?? 'Amazon Associates').trim();
  const trackingId = String(input.trackingId ?? '').trim();
  const marketplace = String(input.marketplace ?? '').trim();
  const status = String(input.status ?? 'planned').trim();
  const source = String(input.source ?? 'manual').trim();
  const notes = String(input.notes ?? '').trim();
  const metadata = typeof input.metadata === 'object' && input.metadata ? input.metadata : {};
  const rows = await sql`
    insert into affiliate_accounts (id, provider, name, tracking_id, marketplace, status, source, notes, metadata, updated_at)
    values (${id}, ${provider}, ${name}, ${trackingId}, ${marketplace}, ${status}, ${source}, ${notes}, ${sql.json(metadata)}, now())
    on conflict (id) do update set provider = excluded.provider, name = excluded.name, tracking_id = excluded.tracking_id, marketplace = excluded.marketplace, status = excluded.status, source = excluded.source, notes = excluded.notes, metadata = excluded.metadata, updated_at = now()
    returning id, provider, name, tracking_id as "trackingId", marketplace, status, source, notes, metadata, updated_at as "updatedAt"
  `;
  return rows[0];
}

async function createTask(input) {
  await ensureTaskBoardColumns();
  const title = String(input.title ?? '').trim();
  if (!title) {
    const error = new Error('title is required');
    error.status = 400;
    throw error;
  }
  const description = String(input.description ?? '').trim();
  const status = normalizeTaskStatus(String(input.status ?? 'backlog'));
  const projectId = String(input.projectId ?? 'agent-os').trim() || 'agent-os';
  const ownerAgentId = String(input.ownerAgentId ?? 'cai').trim() || 'cai';
  const priority = taskPriorityValue(String(input.priority ?? 'medium'));
  const [{ position }] = await sql`
    select coalesce(max(position), 0) + 1000 as position
    from tasks
    where status = ${status}
  `;
  const id = crypto.randomUUID();
  const rows = await sql`
    insert into tasks (id, project_id, title, description, status, priority, owner_agent_id, source, position, updated_at)
    values (${id}, ${projectId}, ${title}, ${description}, ${status}, ${priority}, ${ownerAgentId}, 'cockpit', ${Number(position)}, now())
    returning id, project_id as "projectId", title, description, status, priority, owner_agent_id as "ownerAgentId", source, due_at as "dueAt", position, updated_at as "updatedAt"
  `;
  await sql`
    insert into task_events (id, task_id, actor_agent_id, kind, message, metadata)
    values (${crypto.randomUUID()}, ${id}, ${ownerAgentId}, 'created', ${`Task created from cockpit: ${title}`}, ${sql.json({ source: 'cockpit' })})
  `;
  return mapTask(rows[0]);
}

async function updateTask(input) {
  await ensureTaskBoardColumns();
  const id = String(input.id ?? '').trim();
  if (!id) {
    const error = new Error('id is required');
    error.status = 400;
    throw error;
  }
  const hasTitle = Object.prototype.hasOwnProperty.call(input, 'title');
  const title = hasTitle ? String(input.title ?? '').trim() : null;
  if (hasTitle && !title) {
    const error = new Error('title is required');
    error.status = 400;
    throw error;
  }
  const hasDescription = Object.prototype.hasOwnProperty.call(input, 'description');
  const description = hasDescription ? String(input.description ?? '').trim() : null;
  const hasStatus = Object.prototype.hasOwnProperty.call(input, 'status');
  const status = hasStatus ? normalizeTaskStatus(String(input.status ?? 'backlog')) : null;
  const hasPriority = Object.prototype.hasOwnProperty.call(input, 'priority');
  const priority = hasPriority ? taskPriorityValue(String(input.priority ?? 'medium')) : null;
  const hasOwnerAgentId = Object.prototype.hasOwnProperty.call(input, 'ownerAgentId');
  const ownerAgentId = hasOwnerAgentId ? String(input.ownerAgentId ?? '').trim() || null : null;
  const hasProjectId = Object.prototype.hasOwnProperty.call(input, 'projectId');
  const projectId = hasProjectId ? String(input.projectId ?? '').trim() || null : null;
  const hasDueDate = Object.prototype.hasOwnProperty.call(input, 'dueDate');
  const dueAt = hasDueDate && input.dueDate ? new Date(String(input.dueDate)).toISOString() : null;
  const hasPosition = Object.prototype.hasOwnProperty.call(input, 'position');
  const position = hasPosition ? Number(input.position ?? 0) : null;
  const rows = await sql`
    update tasks
    set
      title = case when ${hasTitle} then ${title} else title end,
      description = case when ${hasDescription} then ${description} else description end,
      status = case when ${hasStatus} then ${status} else status end,
      priority = case when ${hasPriority} then ${priority} else priority end,
      owner_agent_id = case when ${hasOwnerAgentId} then ${ownerAgentId} else owner_agent_id end,
      project_id = case when ${hasProjectId} then ${projectId} else project_id end,
      due_at = case when ${hasDueDate} then ${dueAt}::timestamptz else due_at end,
      position = case when ${hasPosition} then ${position} else position end,
      updated_at = now()
    where id = ${id}
    returning id, project_id as "projectId", title, description, status, priority, owner_agent_id as "ownerAgentId", source, due_at as "dueAt", position, updated_at as "updatedAt"
  `;
  if (!rows.length) {
    const error = new Error('task not found');
    error.status = 404;
    throw error;
  }
  const eventKind = hasStatus && Object.keys(input).every((key) => ['id', 'status', 'position'].includes(key)) ? 'moved' : 'updated';
  await sql`
    insert into task_events (id, task_id, actor_agent_id, kind, message, metadata)
    values (${crypto.randomUUID()}, ${id}, 'cai', ${eventKind}, ${eventKind === 'moved' ? `Task moved to ${status}` : `Task updated: ${rows[0].title}`}, ${sql.json({ status, position, source: 'cockpit', fields: Object.keys(input).filter((key) => key !== 'id') })})
  `;
  return mapTask(rows[0]);
}

async function reorderTasks(input) {
  await ensureTaskBoardColumns();
  const updates = Array.isArray(input.updates) ? input.updates : [];
  if (!updates.length) return { updated: 0 };

  const normalized = updates
    .map((update) => ({
      id: String(update.id ?? '').trim(),
      status: normalizeTaskStatus(String(update.status ?? 'backlog')),
      position: Number(update.position ?? 0)
    }))
    .filter((update) => update.id);

  await sql.begin(async (tx) => {
    for (const update of normalized) {
      await tx`
        update tasks
        set status = ${update.status}, position = ${update.position}, updated_at = now()
        where id = ${update.id}
      `;
    }
    await tx`
      insert into task_events (id, task_id, actor_agent_id, kind, message, metadata)
      values (${crypto.randomUUID()}, null, 'cai', 'board_reordered', ${`Kanban board reordered (${normalized.length} updates)`}, ${sql.json({ updates: normalized, source: 'cockpit' })})
    `;
  });

  return { updated: normalized.length };
}

async function runCommand(url) {
  const command = String(url.searchParams.get('command') ?? '').trim();
  const startedAt = new Date().toISOString();

  if (command === 'bridge-health') {
    return { command, startedAt, finishedAt: new Date().toISOString(), result: await systemStatus() };
  }
  if (command === 'agents-list') {
    return { command, startedAt, finishedAt: new Date().toISOString(), result: { agents: configuredAgents() } };
  }
  if (command === 'memory-status') {
    return { command, startedAt, finishedAt: new Date().toISOString(), result: await memoryStatus() };
  }
  if (command === 'knowledge-snapshot') {
    const snapshot = await knowledgeSnapshot();
    return {
      command,
      startedAt,
      finishedAt: new Date().toISOString(),
      result: {
        stats: snapshot.stats,
        sourceCount: snapshot.sources.length,
        vaultFileCount: snapshot.vault.files.length
      }
    };
  }

  const error = new Error('unsupported command');
  error.status = 400;
  throw error;
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(payload);
}

function unauthorized(res) {
  send(res, 401, { error: 'unauthorized' });
}

function checkAuth(req) {
  const auth = req.headers.authorization ?? '';
  return auth === `Bearer ${token}`;
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  return JSON.parse(body);
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function inferKind(sourceUrl, rawContent) {
  if (sourceUrl) return 'url';
  if ((rawContent ?? '').length > 2000) return 'note-long';
  return 'note';
}

function firstSentence(value) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.{40,260}?[.!?])\s/);
  return (match?.[1] ?? normalized.slice(0, 220)).trim();
}

function keyPoints(rawContent, sourceUrl) {
  const lines = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = lines.length ? lines : rawContent.split(/(?<=[.!?])\s+/).map((line) => line.trim());
  const points = candidates
    .filter((line) => line.length > 20)
    .slice(0, 6)
    .map((line) => line.replace(/^[-*•]\s*/, '').slice(0, 260));

  if (!points.length && sourceUrl) return [`Source URL captured for later reading: ${sourceUrl}`];
  if (!points.length) return ['No substantial raw text was provided yet.'];
  return points;
}

function wikifySource(source) {
  const title = String(source.title ?? '').trim();
  const sourceUrl = String(source.sourceUrl ?? source.source_url ?? '').trim();
  const rawContent = String(source.rawContent ?? source.raw_content ?? '').trim();
  const date = new Date().toISOString().slice(0, 10);
  const wikiPath = `knowledge/wiki/${date}-${slugify(title) || crypto.randomUUID()}.md`;
  const summary = rawContent ? firstSentence(rawContent) : sourceUrl || 'Knowledge source captured.';
  const now = new Date().toISOString();
  const points = keyPoints(rawContent, sourceUrl);
  const wikiContent = [
    '---',
    `title: ${JSON.stringify(title)}`,
    'status: wikified',
    `source_url: ${JSON.stringify(sourceUrl || null)}`,
    `updated_at: ${JSON.stringify(now)}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## Summary',
    '',
    summary,
    '',
    '## Key points',
    '',
    ...points.map((point) => `- ${point}`),
    '',
    '## Source',
    '',
    sourceUrl ? `- ${sourceUrl}` : '- Inline/raw note',
    '',
    '## Next questions',
    '',
    '- What decision or project should this knowledge inform?',
    '- Does this source need deeper synthesis with related notes?',
    ''
  ].join('\n');

  return { summary, wikiPath, wikiContent };
}


function stripHtml(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function metadataPatch(patch) {
  return sql`coalesce(metadata, '{}'::jsonb) || ${sql.json(patch)}`;
}

function rawMarkdown(source) {
  return [
    '---',
    `title: ${JSON.stringify(source.title)}`,
    `kind: ${JSON.stringify(source.kind)}`,
    `status: ${JSON.stringify(source.status)}`,
    `source_url: ${JSON.stringify(source.sourceUrl)}`,
    `created_at: ${JSON.stringify(new Date(source.createdAt).toISOString())}`,
    '---',
    '',
    `# ${source.title}`,
    '',
    source.rawPath ? `Raw path: \`${source.rawPath}\`` : '',
    source.sourceUrl ? `Source: ${source.sourceUrl}` : '',
    '',
    '## Summary',
    '',
    source.summary || 'No summary yet.',
    ''
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function buildVaultSnapshot(sources) {
  const seen = new Set();
  const uniquePath = (path) => {
    if (!seen.has(path)) {
      seen.add(path);
      return path;
    }
    const dot = path.lastIndexOf('.');
    const base = dot > -1 ? path.slice(0, dot) : path;
    const ext = dot > -1 ? path.slice(dot) : '';
    let index = 2;
    while (seen.has(`${base}-${index}${ext}`)) index++;
    const next = `${base}-${index}${ext}`;
    seen.add(next);
    return next;
  };
  const wikiStatuses = new Set(['wikified', 'reviewed', 'promoted']);
  const activeSources = sources.filter((source) => source.status !== 'archived');
  const wikified = activeSources.filter((source) => wikiStatuses.has(source.status) && source.wikiPath);
  const raw = activeSources.filter((source) => !wikiStatuses.has(source.status));
  const agentsMd = [
    '# agents.md',
    '',
    'You are operating inside the Agent OS vault.',
    '',
    'Rules:',
    '- Treat `/raw` as source material, not final truth.',
    '- Treat `/wiki` as synthesized working knowledge.',
    '- Preserve source links and paths when updating wiki pages.',
    '- Prefer small, durable pages about people, projects, agents, decisions, concepts, and systems.',
    '- Do not create one wiki page per chat message; extract stable entities and decisions instead.',
    '- Update `index.md` and `log.md` after processing sources.',
    ''
  ].join('\n');
  const indexMd = [
    '# Agent OS Vault Index',
    '',
    'This is an Obsidian-compatible export generated from Agent OS.',
    '',
    '## Wiki pages',
    '',
    ...(wikified.length ? wikified.map((source) => `- [[${source.wikiPath}]] — ${source.title}`) : ['- No wiki pages yet.']),
    '',
    '## Raw sources',
    '',
    ...(raw.length ? raw.map((source) => `- [[${source.rawPath}]] — ${source.title}`) : ['- No raw sources waiting.']),
    '',
    '## Root files',
    '',
    '- [[agents.md]]',
    '- [[log.md]]',
    ''
  ].join('\n');
  const logMd = [
    '# Agent OS Vault Log',
    '',
    ...sources.map((source) => {
      const target = source.wikiPath ?? source.rawPath;
      return `- ${new Date(source.createdAt).toISOString()} — ${source.status} — [[${target}]] — ${source.title}`;
    }),
    ''
  ].join('\n');
  const files = [
    { path: uniquePath('agents.md'), content: agentsMd },
    { path: uniquePath('index.md'), content: indexMd },
    { path: uniquePath('log.md'), content: logMd }
  ];
  for (const source of activeSources) {
    files.push({ path: uniquePath(source.rawPath), content: rawMarkdown(source) });
    if (wikiStatuses.has(source.status) && source.wikiPath && source.wikiContent) {
      files.push({ path: uniquePath(source.wikiPath), content: source.wikiContent });
    }
  }
  return { files, indexMd, logMd, agentsMd };
}

async function knowledgeSnapshot() {
  const [sources, counts] = await Promise.all([
    sql`
      select id, title, kind, status, source_url as "sourceUrl", summary, raw_path as "rawPath", wiki_path as "wikiPath", wiki_content as "wikiContent", created_at as "createdAt"
      from knowledge_sources
      order by created_at desc
      limit 20
    `,
    sql`select status, count(*)::int as count from knowledge_sources group by status`
  ]);

  const lifecycle = ['raw', 'extracted', 'wikified', 'reviewed', 'promoted', 'archived'];
  const byStatus = new Map(counts.map((row) => [row.status, Number(row.count)]));
  const lifecycleCounts = Object.fromEntries(lifecycle.map((status) => [status, byStatus.get(status) ?? 0]));
  const vault = buildVaultSnapshot(sources);
  return {
    dbOnline: true,
    sources,
    lifecycle,
    lifecycleCounts,
    stats: [
      { label: 'Raw', value: String(lifecycleCounts.raw), detail: 'Untrusted captured sources' },
      { label: 'Extracted', value: String(lifecycleCounts.extracted), detail: 'Readable content extracted' },
      { label: 'Context-ready', value: String(lifecycleCounts.promoted), detail: 'Reviewed and approved for OpenClaw context' }
    ],
    vault
  };
}

async function createKnowledgeSource(input) {
  const title = String(input.title ?? '').trim();
  const sourceUrl = String(input.sourceUrl ?? '').trim();
  const rawContent = String(input.rawContent ?? '').trim();
  if (!title || (!sourceUrl && !rawContent)) {
    const error = new Error('title and sourceUrl or rawContent are required');
    error.status = 400;
    throw error;
  }

  const id = crypto.randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(title) || id;
  const rawPath = `knowledge/raw/${date}-${slug}.md`;

  await sql`
    insert into knowledge_sources (id, title, kind, status, source_url, raw_content, raw_path, summary, metadata)
    values (
      ${id}, ${title}, ${inferKind(sourceUrl, rawContent)}, 'raw', ${sourceUrl || null}, ${rawContent}, ${rawPath},
      ${rawContent ? rawContent.slice(0, 240) : sourceUrl}, ${sql.json({ createdFrom: 'bridge' })}
    )
  `;

  return { id, title, kind: inferKind(sourceUrl, rawContent), status: 'raw', rawPath };
}

async function queueKnowledgeSource(input) {
  const id = String(input.id ?? '').trim();
  if (!id) {
    const error = new Error('id is required');
    error.status = 400;
    throw error;
  }
  const source = await sql`
    select id, title, source_url as "sourceUrl", raw_content as "rawContent"
    from knowledge_sources
    where id = ${id}
    limit 1
  `;
  if (!source.length) {
    const error = new Error('source not found');
    error.status = 404;
    throw error;
  }

  const wiki = wikifySource(source[0]);
  const result = await sql`
    update knowledge_sources
    set status = 'wikified', summary = ${wiki.summary}, wiki_path = ${wiki.wikiPath}, wiki_content = ${wiki.wikiContent}, updated_at = now(), metadata = ${metadataPatch({ wikifiedFrom: 'bridge', wikifiedAt: new Date().toISOString() })}
    where id = ${id}
    returning id, title, status
  `;
  if (!result.length) {
    const error = new Error('source not found');
    error.status = 404;
    throw error;
  }
  return result[0];
}


async function extractKnowledgeSource(input) {
  const id = String(input.id ?? '').trim();
  if (!id) {
    const error = new Error('id is required');
    error.status = 400;
    throw error;
  }

  const rows = await sql`
    select id, title, source_url as "sourceUrl", raw_content as "rawContent", metadata
    from knowledge_sources
    where id = ${id}
    limit 1
  `;
  if (!rows.length) {
    const error = new Error('source not found');
    error.status = 404;
    throw error;
  }

  const source = rows[0];
  let extractedText = String(source.rawContent ?? '').trim();
  let fetchStatus = 'not-needed';
  let fetchError = null;

  if (source.sourceUrl && extractedText.length < 500) {
    try {
      const response = await fetch(source.sourceUrl, {
        headers: { 'user-agent': 'AgentOSKnowledgeExtractor/1.0 (+https://www.felipeotarola.com)' }
      });
      fetchStatus = `${response.status}`;
      const html = await response.text();
      extractedText = stripHtml(html).slice(0, 60000);
    } catch (error) {
      fetchStatus = 'error';
      fetchError = error.message ?? 'fetch_failed';
    }
  }

  const summary = extractedText ? firstSentence(extractedText) : source.sourceUrl || 'No readable text extracted yet.';
  const result = await sql`
    update knowledge_sources
    set status = 'extracted', raw_content = ${extractedText}, summary = ${summary}, updated_at = now(), metadata = ${metadataPatch({ extractedFrom: 'bridge', extractedAt: new Date().toISOString(), fetchStatus, fetchError })}
    where id = ${id}
    returning id, title, status, summary
  `;

  await sql`
    insert into task_events (id, task_id, actor_agent_id, kind, message, metadata)
    values (${crypto.randomUUID()}, null, 'cai', 'knowledge_extracted', ${`Knowledge source extracted: ${source.title}`}, ${sql.json({ sourceId: id, fetchStatus, fetchError })})
  `;

  return result[0];
}

async function transitionKnowledgeSource(input) {
  const id = String(input.id ?? '').trim();
  const status = String(input.status ?? '').trim();
  const allowed = new Set(['reviewed', 'promoted', 'archived']);
  if (!id || !allowed.has(status)) {
    const error = new Error('id and valid status are required');
    error.status = 400;
    throw error;
  }

  const patch = { transitionedFrom: 'bridge', transitionedAt: new Date().toISOString() };
  if (status === 'promoted') {
    patch.promotedTo = 'openclaw-context-candidate';
    patch.promotedAt = new Date().toISOString();
  }

  const rows = await sql`
    update knowledge_sources
    set status = ${status}, updated_at = now(), metadata = ${metadataPatch(patch)}
    where id = ${id}
    returning id, title, status, raw_path as "rawPath", wiki_path as "wikiPath"
  `;
  if (!rows.length) {
    const error = new Error('source not found');
    error.status = 404;
    throw error;
  }

  await sql`
    insert into task_events (id, task_id, actor_agent_id, kind, message, metadata)
    values (${crypto.randomUUID()}, null, 'cai', ${`knowledge_${status}`}, ${`Knowledge source marked ${status}: ${rows[0].title}`}, ${sql.json({ sourceId: rows[0].id, status, rawPath: rows[0].rawPath, wikiPath: rows[0].wikiPath })})
  `;

  return rows[0];
}


function gmailWebUrl(threadId) {
  return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}`;
}

function normalizeEmailText(value, max = 1800) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function scoreMailCandidate(thread, detail) {
  const haystack = `${thread.subject ?? ''} ${thread.from ?? ''} ${thread.labels?.join(' ') ?? ''} ${detail?.body ?? ''}`.toLowerCase();
  let score = 20;
  const reasons = [];
  if (thread.labels?.includes('IMPORTANT')) {
    score += 20;
    reasons.push('Gmail markerad som viktig');
  }
  if (thread.labels?.includes('UNREAD')) {
    score += 10;
    reasons.push('Oläst');
  }
  if (/lysande|kund|customer|lead|invoice|faktura|avtal|contract|deadline|intervju|meeting|linkedin|github|vercel|stripe/.test(haystack)) {
    score += 25;
    reasons.push('Matchar projekt/lead/admin-signal');
  }
  if (/unsubscribe|avregistrera|digest|newsletter|noreply|no-reply|promotion|rea|sale/.test(haystack)) {
    score -= 15;
    reasons.push('Ser ut som digest/marknadsmail');
  }
  if (/bank|skatteverket|försäkringskassan|vård|1177|password|lösenord|verification code|kod/.test(haystack)) {
    score -= 35;
    reasons.push('Potentiellt känsligt — bör inte sparas rått');
  }
  return { score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 4) };
}

async function mailRadarSnapshot(url) {
  const account = url.searchParams.get('account') || GMAIL_ACCOUNT;
  const query = url.searchParams.get('query') || 'newer_than:7d (in:inbox OR is:important OR is:unread)';
  const max = Math.min(Number(url.searchParams.get('max') ?? 12), 20);

  const search = await gogJson(['gmail', 'search', query, '--account', account, '--max', String(max)], { timeout: 45000 });
  const threads = Array.isArray(search.threads) ? search.threads : [];
  const candidates = [];

  for (const thread of threads.slice(0, max)) {
    let detail = null;
    try {
      const full = await gogJson(['gmail', 'thread', 'get', String(thread.id), '--account', account, '--sanitize-content'], { timeout: 45000 });
      const message = full?.thread?.messages?.[0] ?? null;
      detail = {
        body: normalizeEmailText(message?.body, 2200),
        messageId: message?.id,
        date: message?.headers?.date ?? thread.date,
        to: message?.headers?.to ?? null
      };
    } catch (error) {
      detail = { body: normalizeEmailText(thread.snippet, 1000), error: error.message };
    }
    const { score, reasons } = scoreMailCandidate(thread, detail);
    candidates.push({
      id: String(thread.id),
      threadId: String(thread.id),
      messageId: detail?.messageId ?? String(thread.id),
      title: String(thread.subject ?? '(no subject)'),
      from: String(thread.from ?? ''),
      date: detail?.date ?? thread.date ?? null,
      labels: thread.labels ?? [],
      snippet: normalizeEmailText(detail?.body || thread.snippet, 520),
      score,
      reasons,
      gmailUrl: gmailWebUrl(String(thread.id))
    });
  }

  const saved = await sql`
    select source_url as "sourceUrl"
    from knowledge_sources
    where kind = 'email' and source_url = any(${candidates.map((candidate) => `gmail://thread/${candidate.threadId}`)})
  `;
  const savedUrls = new Set(saved.map((row) => row.sourceUrl));

  return {
    generatedAt: new Date().toISOString(),
    account,
    query,
    source: 'gog:gmail:readonly',
    counts: {
      total: candidates.length,
      highSignal: candidates.filter((candidate) => candidate.score >= 55).length,
      saved: candidates.filter((candidate) => savedUrls.has(`gmail://thread/${candidate.threadId}`)).length
    },
    candidates: candidates.map((candidate) => ({
      ...candidate,
      saved: savedUrls.has(`gmail://thread/${candidate.threadId}`)
    }))
  };
}

async function saveMailToKnowledge(input) {
  const threadId = String(input.threadId ?? '').trim();
  const account = String(input.account ?? GMAIL_ACCOUNT).trim();
  if (!threadId) {
    const error = new Error('threadId is required');
    error.status = 400;
    throw error;
  }

  const sourceUrl = `gmail://thread/${threadId}`;
  const existing = await sql`select id, title, status from knowledge_sources where kind = 'email' and source_url = ${sourceUrl} limit 1`;
  if (existing.length) return { ...existing[0], duplicate: true };

  const full = await gogJson(['gmail', 'thread', 'get', threadId, '--account', account, '--sanitize-content'], { timeout: 45000 });
  const messages = Array.isArray(full?.thread?.messages) ? full.thread.messages : [];
  const first = messages[0] ?? {};
  const headers = first.headers ?? {};
  const title = String(headers.subject || input.title || `Email thread ${threadId}`).slice(0, 180);
  const body = messages
    .map((message, index) => {
      const h = message.headers ?? {};
      return [
        `Message ${index + 1}`,
        `From: ${h.from ?? ''}`,
        `To: ${h.to ?? ''}`,
        `Date: ${h.date ?? ''}`,
        '',
        normalizeEmailText(message.body, 5000)
      ].join('\n');
    })
    .join('\n\n---\n\n')
    .slice(0, 20000);

  const id = crypto.randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const rawPath = `knowledge/mail/${date}-${slugify(title) || id}.md`;
  const summary = normalizeEmailText(first.snippet || body, 500);
  const metadata = {
    createdFrom: 'mail-radar',
    account,
    threadId,
    messageCount: messages.length,
    gmailUrl: gmailWebUrl(threadId),
    safety: 'sanitized-readonly-review-required'
  };

  await sql`
    insert into knowledge_sources (id, title, kind, status, source_url, raw_content, raw_path, summary, metadata)
    values (${id}, ${title}, 'email', 'raw', ${sourceUrl}, ${body}, ${rawPath}, ${summary}, ${sql.json(metadata)})
  `;

  await sql`
    insert into task_events (id, task_id, actor_agent_id, kind, message, metadata)
    values (${crypto.randomUUID()}, null, 'cai', 'mail_saved_to_knowledge', ${`Mail saved to Knowledge review: ${title}`}, ${sql.json({ sourceId: id, threadId, account })})
  `;

  return { id, title, kind: 'email', status: 'raw', rawPath, duplicate: false };
}

async function deleteKnowledgeSource(input) {
  const id = String(input.id ?? '').trim();
  if (!id) {
    const error = new Error('id is required');
    error.status = 400;
    throw error;
  }

  const rows = await sql`
    delete from knowledge_sources
    where id = ${id}
    returning id, title, status, raw_path as "rawPath", wiki_path as "wikiPath"
  `;
  if (!rows.length) {
    const error = new Error('source not found');
    error.status = 404;
    throw error;
  }

  await sql`
    insert into task_events (id, task_id, actor_agent_id, kind, message, metadata)
    values (${crypto.randomUUID()}, null, 'cai', 'knowledge_deleted', ${`Knowledge source deleted: ${rows[0].title}`}, ${sql.json({ sourceId: rows[0].id, status: rows[0].status, rawPath: rows[0].rawPath, wikiPath: rows[0].wikiPath })})
  `;

  return { deleted: true, source: rows[0] };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      const pong = await sql`select 1 as ok`;
      return send(res, 200, { ok: true, db: pong[0]?.ok === 1 });
    }

    if (!checkAuth(req)) return unauthorized(res);

    if (req.method === 'GET' && url.pathname === '/knowledge/snapshot') {
      return send(res, 200, await knowledgeSnapshot());
    }

    if (req.method === 'GET' && url.pathname === '/agents') {
      return send(res, 200, { agents: configuredAgents(), source: 'bridge:AGENT_OS_AGENTS_JSON' });
    }

    if (req.method === 'GET' && url.pathname === '/system/status') {
      return send(res, 200, await systemStatus());
    }

    if (req.method === 'GET' && url.pathname === '/system/subagents') {
      return send(res, 200, await subagentRunsSnapshot());
    }

    if (req.method === 'GET' && url.pathname === '/overview') {
      return send(res, 200, await overviewSnapshot());
    }

    if (req.method === 'GET' && url.pathname === '/notifications') {
      return send(res, 200, await notificationsSnapshot());
    }

    if (req.method === 'GET' && url.pathname === '/affiliate/snapshot') {
      return send(res, 200, await affiliateSnapshot());
    }

    if (req.method === 'POST' && url.pathname === '/affiliate/accounts') {
      return send(res, 201, await upsertAffiliateAccount(await readJson(req)));
    }

    if (req.method === 'GET' && url.pathname === '/commands/run') {
      return send(res, 200, await runCommand(url));
    }

    if (req.method === 'GET' && url.pathname === '/tasks') {
      return send(res, 200, await tasksSnapshot());
    }

    if (req.method === 'GET' && url.pathname === '/tasks/dispatch-summary') {
      return send(res, 200, await taskDispatchSummary());
    }

    if (req.method === 'GET' && url.pathname === '/cai/latest-brief-message') {
      return send(res, 200, await latestCaiBriefMessage());
    }

    if (req.method === 'POST' && url.pathname === '/tasks') {
      return send(res, 201, await createTask(await readJson(req)));
    }

    if (req.method === 'PATCH' && url.pathname === '/tasks') {
      return send(res, 200, await updateTask(await readJson(req)));
    }

    if (req.method === 'POST' && url.pathname === '/tasks/reorder') {
      return send(res, 200, await reorderTasks(await readJson(req)));
    }

    if (req.method === 'GET' && url.pathname === '/memory/search') {
      return send(res, 200, await memorySearch(url));
    }

    if (req.method === 'GET' && url.pathname === '/memory/status') {
      return send(res, 200, await memoryStatus());
    }

    if (req.method === 'GET' && url.pathname === '/mail/radar') {
      return send(res, 200, await mailRadarSnapshot(url));
    }

    if (req.method === 'POST' && url.pathname === '/mail/save-to-knowledge') {
      return send(res, 201, await saveMailToKnowledge(await readJson(req)));
    }

    if (req.method === 'POST' && url.pathname === '/knowledge/sources') {
      return send(res, 201, await createKnowledgeSource(await readJson(req)));
    }

    if (req.method === 'POST' && url.pathname === '/knowledge/sources/queue') {
      return send(res, 200, await queueKnowledgeSource(await readJson(req)));
    }

    if (req.method === 'POST' && url.pathname === '/knowledge/sources/extract') {
      return send(res, 200, await extractKnowledgeSource(await readJson(req)));
    }

    if (req.method === 'POST' && url.pathname === '/knowledge/sources/transition') {
      return send(res, 200, await transitionKnowledgeSource(await readJson(req)));
    }

    if (req.method === 'POST' && url.pathname === '/knowledge/sources/delete') {
      return send(res, 200, await deleteKnowledgeSource(await readJson(req)));
    }

    if (req.method === 'GET' && url.pathname === '/knowledge/sessions/inventory') {
      return send(res, 200, await sessionKnowledgeInventory({
        limit: Number(url.searchParams.get('limit') ?? 25),
        minScore: Number(url.searchParams.get('minScore') ?? 35)
      }));
    }

    if (req.method === 'POST' && url.pathname === '/knowledge/sessions/harvest') {
      return send(res, 200, await harvestSessionKnowledge(await readJson(req)));
    }

    send(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error(error);
    send(res, error.status ?? 500, { error: error.message ?? 'internal_error' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Agent OS bridge listening on ${port}`);
});
