import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import postgres from 'postgres';

const port = Number(process.env.BRIDGE_PORT ?? 8787);
const token = process.env.AGENT_OS_BRIDGE_TOKEN;
const databaseUrl = process.env.BRIDGE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!token) throw new Error('AGENT_OS_BRIDGE_TOKEN is required');
if (!databaseUrl) throw new Error('BRIDGE_DATABASE_URL or DATABASE_URL is required');

const sql = postgres(databaseUrl, { max: 5, prepare: false });
const execFileAsync = promisify(execFile);

function configuredAgents() {
  try {
    return JSON.parse(process.env.AGENT_OS_AGENTS_JSON ?? '[]');
  } catch (error) {
    console.error('Failed to parse AGENT_OS_AGENTS_JSON', error);
    return [];
  }
}

async function openclawJson(args) {
  const { stdout } = await execFileAsync('node', ['/usr/lib/node_modules/openclaw/dist/entry.js', ...args], {
    timeout: 20000,
    maxBuffer: 1024 * 1024 * 4,
    env: { ...process.env, NO_COLOR: '1', PATH: `/app/bridge/bin:${process.env.PATH ?? ''}` }
  });
  return JSON.parse(stdout);
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
  const [db, knowledge, memory] = await Promise.all([
    sql`select 1 as ok, now() as now`,
    sql`select status, count(*)::int as count from knowledge_sources group by status`,
    memoryStatus()
  ]);
  const knowledgeCounts = Object.fromEntries(knowledge.map((row) => [row.status, Number(row.count)]));
  const memoryAgents = Array.isArray(memory.status) ? memory.status : [];
  return {
    ok: true,
    bridge: {
      status: 'online',
      uptimeSeconds: Math.round(process.uptime()),
      now: db[0]?.now ?? new Date().toISOString()
    },
    db: { status: db[0]?.ok === 1 ? 'online' : 'unknown' },
    agents: { count: configuredAgents().length, source: 'bridge:AGENT_OS_AGENTS_JSON' },
    knowledge: {
      raw: knowledgeCounts.raw ?? 0,
      queued: knowledgeCounts.queued ?? 0,
      wikified: knowledgeCounts.wikified ?? 0
    },
    memory: {
      source: memory.source,
      ok: !memory.error,
      agents: memoryAgents.map((entry) => ({
        agentId: entry.agentId,
        backend: entry.status?.backend,
        files: entry.status?.files,
        chunks: entry.status?.chunks,
        dirty: entry.status?.dirty,
        sources: entry.status?.sources ?? []
      })),
      error: memory.error
    }
  };
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
  const wikified = sources.filter((source) => source.status === 'wikified' && source.wikiPath);
  const raw = sources.filter((source) => source.status !== 'wikified');
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
  for (const source of sources) {
    files.push({ path: uniquePath(source.rawPath), content: rawMarkdown(source) });
    if (source.status === 'wikified' && source.wikiPath && source.wikiContent) {
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

  const byStatus = new Map(counts.map((row) => [row.status, Number(row.count)]));
  const vault = buildVaultSnapshot(sources);
  return {
    dbOnline: true,
    sources,
    stats: [
      { label: 'Raw inbox', value: String(byStatus.get('raw') ?? 0), detail: 'Nya källor som väntar på syntes' },
      { label: 'Köade', value: String(byStatus.get('queued') ?? 0), detail: 'Markerade för wikifiering' },
      { label: 'Wikifierade', value: String(byStatus.get('wikified') ?? 0), detail: 'Syntetiserade knowledge pages' }
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
    set status = 'wikified', summary = ${wiki.summary}, wiki_path = ${wiki.wikiPath}, wiki_content = ${wiki.wikiContent}, updated_at = now(), metadata = ${sql.json({ wikifiedFrom: 'bridge', wikifiedAt: new Date().toISOString() })}
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

    if (req.method === 'GET' && url.pathname === '/commands/run') {
      return send(res, 200, await runCommand(url));
    }

    if (req.method === 'GET' && url.pathname === '/memory/search') {
      return send(res, 200, await memorySearch(url));
    }

    if (req.method === 'GET' && url.pathname === '/memory/status') {
      return send(res, 200, await memoryStatus());
    }

    if (req.method === 'POST' && url.pathname === '/knowledge/sources') {
      return send(res, 201, await createKnowledgeSource(await readJson(req)));
    }

    if (req.method === 'POST' && url.pathname === '/knowledge/sources/queue') {
      return send(res, 200, await queueKnowledgeSource(await readJson(req)));
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
