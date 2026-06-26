import { createClient } from 'npm:@supabase/supabase-js@2';

const STATUSES = [
  'backlog',
  'investigating',
  'experimenting',
  'convert_to_tasks',
  'shipped',
  'parked'
] as const;

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return request.headers.get('x-agent-os-token')?.trim() ?? '';
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
      ...init.headers
    }
  });
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? 'backlog');
  return STATUSES.includes(status as (typeof STATUSES)[number]) ? status : 'backlog';
}

function normalizePriority(value: unknown) {
  if (typeof value === 'number') return Math.max(0, Math.min(100, Math.round(value)));
  const label = String(value ?? 'medium');
  if (label === 'high') return 90;
  if (label === 'low') return 20;
  return 50;
}

function mapLoop(row: Record<string, unknown>) {
  return {
    id: row.id,
    theme: row.theme,
    question: row.question ?? '',
    hypothesis: row.hypothesis ?? '',
    notes: row.notes ?? '',
    experiment: row.experiment ?? '',
    result: row.result ?? '',
    nextTask: row.next_task ?? '',
    status: row.status,
    priority: row.priority,
    ownerAgentId: row.owner_agent_id ?? undefined,
    cadence: row.cadence ?? 'weekly',
    source: row.source ?? 'supabase-edge',
    position: row.position ?? 0,
    updatedAt: row.updated_at
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json({ ok: true });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = Deno.env.get('AGENT_OS_RND_LOOPS_TOKEN') || Deno.env.get('AGENT_OS_BRIDGE_TOKEN');
  if (!token) return json({ error: 'R&D loops token is not configured' }, { status: 500 });
  if (bearerToken(request) !== token) return json({ error: 'unauthorized' }, { status: 401 });
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Supabase service environment is not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  if (request.method === 'GET') {
    const { data, error } = await supabase
      .from('rnd_loops')
      .select('*')
      .order('position', { ascending: true })
      .order('priority', { ascending: false });
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ loops: (data ?? []).map(mapLoop) });
  }

  if (request.method === 'POST') {
    const input = await request.json();
    const theme = String(input.theme ?? '').trim();
    if (!theme) return json({ error: 'theme is required' }, { status: 400 });

    const status = normalizeStatus(input.status);
    const { data: lastRows } = await supabase
      .from('rnd_loops')
      .select('position')
      .eq('status', status)
      .order('position', { ascending: false })
      .limit(1);
    const position = Number(lastRows?.[0]?.position ?? 0) + 1000;

    const row = {
      id: crypto.randomUUID(),
      theme,
      question: String(input.question ?? '').trim(),
      hypothesis: String(input.hypothesis ?? '').trim(),
      notes: String(input.notes ?? '').trim(),
      experiment: String(input.experiment ?? '').trim(),
      result: String(input.result ?? '').trim(),
      next_task: String(input.nextTask ?? input.next_task ?? '').trim(),
      status,
      priority: normalizePriority(input.priority),
      owner_agent_id: String(input.ownerAgentId ?? 'cai').trim() || null,
      cadence: String(input.cadence ?? 'weekly').trim() || 'weekly',
      source: String(input.source ?? 'supabase-edge').trim() || 'supabase-edge',
      position,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
    };
    const { data, error } = await supabase.from('rnd_loops').insert(row).select('*').single();
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true, loop: mapLoop(data) }, { status: 201 });
  }

  if (request.method === 'PATCH') {
    const input = await request.json();
    const id = String(input.id ?? '').trim();
    if (!id) return json({ error: 'id is required' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of [
      'theme',
      'question',
      'hypothesis',
      'notes',
      'experiment',
      'result',
      'cadence',
      'source'
    ]) {
      if (Object.hasOwn(input, field)) patch[field] = String(input[field] ?? '').trim();
    }
    if (Object.hasOwn(input, 'nextTask')) patch.next_task = String(input.nextTask ?? '').trim();
    if (Object.hasOwn(input, 'next_task')) patch.next_task = String(input.next_task ?? '').trim();
    if (Object.hasOwn(input, 'status')) patch.status = normalizeStatus(input.status);
    if (Object.hasOwn(input, 'priority')) patch.priority = normalizePriority(input.priority);
    if (Object.hasOwn(input, 'ownerAgentId')) {
      patch.owner_agent_id = String(input.ownerAgentId ?? '').trim() || null;
    }
    if (Object.hasOwn(input, 'position')) patch.position = Number(input.position ?? 0);
    if (Object.hasOwn(input, 'metadata')) {
      patch.metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
    }

    const { data, error } = await supabase
      .from('rnd_loops')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true, loop: mapLoop(data) });
  }

  return json({ error: 'method not allowed' }, { status: 405 });
});
