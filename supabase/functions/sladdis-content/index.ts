import { createClient } from 'npm:@supabase/supabase-js@2';
import { put } from 'npm:@vercel/blob@0.27.3';

const CONTENT_PLATFORMS = [
  'instagram',
  'tiktok',
  'youtube_shorts',
  'youtube_longform',
  'x',
  'facebook'
] as const;

const DEFAULT_PLATFORMS = ['instagram', 'tiktok', 'youtube_shorts'];
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_MEDIA_FILES = 20;
const ALLOWED_MEDIA_PREFIXES = ['image/', 'video/'];

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
      'access-control-allow-methods': 'POST, OPTIONS',
      ...init.headers
    }
  });
}

function normalizePlatforms(values: FormDataEntryValue[]) {
  const requested = values.map((value) => String(value).trim());
  const platforms = requested.filter((platform) =>
    CONTENT_PLATFORMS.includes(platform as (typeof CONTENT_PLATFORMS)[number])
  );
  return platforms.length ? [...new Set(platforms)] : DEFAULT_PLATFORMS;
}

function safeFileName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'upload'
  );
}

function extensionFor(file: File) {
  const fromName = safeFileName(file.name).split('.').pop();
  if (fromName && fromName !== safeFileName(file.name)) return fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  if (file.type === 'video/mp4') return 'mp4';
  if (file.type === 'video/quicktime') return 'mov';
  if (file.type === 'video/webm') return 'webm';
  if (file.type === 'video/x-m4v') return 'm4v';
  return 'jpg';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ingestToken = Deno.env.get('SLADDIS_CONTENT_INGEST_TOKEN');
  const blobToken =
    Deno.env.get('BLOB_READ_WRITE_TOKEN') || Deno.env.get('VERCEL_BLOB_READ_WRITE_TOKEN');
  if (!ingestToken) {
    return json({ error: 'Sladdis content ingest token is not configured' }, { status: 500 });
  }
  if (bearerToken(request) !== ingestToken) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Supabase service environment is not configured' }, { status: 500 });
  }
  if (!blobToken) {
    return json({ error: 'Vercel Blob token is not configured' }, { status: 500 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return json({ error: 'multipart/form-data required' }, { status: 400 });
  }

  const formData = await request.formData();
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return json({ error: 'title is required' }, { status: 400 });

  const brief = String(formData.get('brief') ?? '').trim();
  const pillar = String(formData.get('pillar') ?? '').trim();
  const campaign = String(formData.get('campaign') ?? 'sladdis').trim() || 'sladdis';
  const requestedOwnerAgentId =
    String(formData.get('ownerAgentId') ?? 'sladdis').trim() || 'sladdis';
  const contentKind =
    String(formData.get('contentKind') ?? formData.get('intent') ?? '').trim() === 'image-library'
      ? 'image-library'
      : 'draft';
  const platforms = normalizePlatforms(formData.getAll('platforms'));
  const mediaFiles = formData
    .getAll('media')
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (mediaFiles.length > MAX_MEDIA_FILES) {
    return json({ error: `too many media files: max ${MAX_MEDIA_FILES}` }, { status: 413 });
  }

  for (const file of mediaFiles) {
    if (file.size > MAX_FILE_BYTES) {
      return json({ error: `file too large: ${file.name}` }, { status: 413 });
    }
    if (!ALLOWED_MEDIA_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
      return json({ error: `unsupported media type: ${file.type || file.name}` }, { status: 415 });
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const itemId = crypto.randomUUID();
  const { data: owner } = await supabase
    .from('agents')
    .select('id')
    .eq('id', requestedOwnerAgentId)
    .maybeSingle();
  const ownerAgentId = owner?.id ?? null;

  const { error: itemError } = await supabase.from('content_items').insert({
    id: itemId,
    title,
    brief,
    status: 'draft',
    pillar,
    campaign,
    owner_agent_id: ownerAgentId,
    source: 'supabase-edge',
    metadata: {
      autopublish: false,
      contentKind,
      reusableByAgents: contentKind === 'image-library',
      createdBy: 'sladdis-content-edge',
      mediaCount: mediaFiles.length
    }
  });
  if (itemError) return json({ error: itemError.message }, { status: 500 });

  const variants = platforms.map((platform) => ({
    id: crypto.randomUUID(),
    content_item_id: itemId,
    platform,
    status: 'draft',
    title,
    caption: '',
    hashtags: [],
    metadata: { autopublish: false, createdBy: 'sladdis-content-edge' }
  }));

  const { error: variantError } = await supabase.from('content_variants').insert(variants);
  if (variantError) return json({ error: variantError.message }, { status: 500 });

  const assets = [];
  for (const file of mediaFiles) {
    const assetId = crypto.randomUUID();
    const cleanName = safeFileName(file.name);
    const blobKey = `${campaign}/${itemId}/${assetId}.${extensionFor(file)}`;
    const blob = await put(blobKey, file, {
      access: 'public',
      addRandomSuffix: false,
      contentType: file.type || 'application/octet-stream',
      token: blobToken
    });

    const row = {
      id: assetId,
      content_item_id: itemId,
      variant_id: null,
      kind: 'source',
      status: 'uploaded',
      blob_key: blobKey,
      blob_url: blob.url,
      file_name: cleanName,
      content_type: file.type || null,
      bytes: file.size,
      metadata: {
        storage: 'vercel-blob',
        originalName: file.name,
        createdBy: 'sladdis-content-edge'
      }
    };
    assets.push(row);
  }

  if (assets.length) {
    const { error: assetError } = await supabase.from('content_media_assets').insert(assets);
    if (assetError) return json({ error: assetError.message }, { status: 500 });
  }

  return json({
    ok: true,
    item: {
      id: itemId,
      title,
      brief,
      status: 'draft',
      pillar,
      campaign,
      ownerAgentId,
      source: 'supabase-edge',
      platforms,
      mediaAssets: assets.map((asset) => ({
        id: asset.id,
        blobKey: asset.blob_key,
        fileName: asset.file_name,
        contentType: asset.content_type,
        bytes: asset.bytes
      }))
    }
  });
});
