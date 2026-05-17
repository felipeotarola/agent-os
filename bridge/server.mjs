import http from 'node:http';
import postgres from 'postgres';

const port = Number(process.env.BRIDGE_PORT ?? 8787);
const token = process.env.AGENT_OS_BRIDGE_TOKEN;
const databaseUrl = process.env.BRIDGE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!token) throw new Error('AGENT_OS_BRIDGE_TOKEN is required');
if (!databaseUrl) throw new Error('BRIDGE_DATABASE_URL or DATABASE_URL is required');

const sql = postgres(databaseUrl, { max: 5, prepare: false });

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

async function knowledgeSnapshot() {
  const [sources, counts] = await Promise.all([
    sql`
      select id, title, kind, status, source_url as "sourceUrl", summary, raw_path as "rawPath", wiki_path as "wikiPath", created_at as "createdAt"
      from knowledge_sources
      order by created_at desc
      limit 20
    `,
    sql`select status, count(*)::int as count from knowledge_sources group by status`
  ]);

  const byStatus = new Map(counts.map((row) => [row.status, Number(row.count)]));
  return {
    dbOnline: true,
    sources,
    stats: [
      { label: 'Raw inbox', value: String(byStatus.get('raw') ?? 0), detail: 'Nya källor som väntar på syntes' },
      { label: 'Köade', value: String(byStatus.get('queued') ?? 0), detail: 'Markerade för wikifiering' },
      { label: 'Wikifierade', value: String(byStatus.get('wikified') ?? 0), detail: 'Syntetiserade knowledge pages' }
    ]
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
  const result = await sql`
    update knowledge_sources
    set status = 'queued', updated_at = now(), metadata = ${sql.json({ queuedFrom: 'bridge', queuedAt: new Date().toISOString() })}
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
