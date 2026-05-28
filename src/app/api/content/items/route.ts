import { bridgeFetch, bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

const MAX_IMAGE_UPLOAD_FILES = 20;

type UploadedAsset = {
  url?: string;
  pathname?: string;
  originalName?: string;
  contentType?: string;
  size?: number;
};

function selectedPlatforms(formData: FormData) {
  const values = formData.getAll('platforms').map((value) => String(value));
  return values.length ? values : ['instagram', 'tiktok', 'youtube_shorts'];
}

function selectedMedia(formData: FormData) {
  return formData
    .getAll('media')
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function isImageUpload(file: File) {
  return file.type.startsWith('image/');
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isJsonRequest(request: NextRequest) {
  return request.headers.get('content-type')?.includes('application/json');
}

function uploadedAssetsFromBody(body: unknown): UploadedAsset[] {
  if (!body || typeof body !== 'object') return [];
  const assets = (body as { uploadedAssets?: unknown }).uploadedAssets;
  return Array.isArray(assets) ? (assets as UploadedAsset[]) : [];
}

function isUploadedImageAsset(asset: UploadedAsset) {
  return Boolean(asset.url) && String(asset.contentType ?? '').startsWith('image/');
}

function imageUploadTitle() {
  return `Image upload - ${new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date())}`;
}

function normalizeImageLibraryFormData(formData: FormData, media: File[]) {
  if (formData.get('intent') !== 'image-library') return;

  const existingTitle = String(formData.get('title') ?? '').trim();
  if (!existingTitle) formData.set('title', imageUploadTitle());
  if (!String(formData.get('brief') ?? '').trim()) {
    formData.set('brief', 'Image-only upload prepared for future agent reuse.');
  }
  if (!String(formData.get('pillar') ?? '').trim()) formData.set('pillar', 'asset-library');
  if (!String(formData.get('campaign') ?? '').trim()) formData.set('campaign', 'agent-assets');
  formData.set('contentKind', 'image-library');
  formData.set('mediaCount', String(media.length));
}

function edgeFunctionUrl() {
  const explicit = process.env.SLADDIS_CONTENT_EDGE_URL;
  if (explicit) return explicit;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/sladdis-content` : null;
}

function edgeFunctionToken() {
  return process.env.SLADDIS_CONTENT_EDGE_TOKEN || process.env.SLADDIS_CONTENT_INGEST_TOKEN || null;
}

async function createContentItemWithEdge(formData: FormData) {
  const url = edgeFunctionUrl();
  const token = edgeFunctionToken();
  if (!url || !token) {
    throw new Error('missing-edge-config');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: token
    },
    body: formData,
    cache: 'no-store'
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `edge-${response.status}`);
  }
}

async function createContentItemWithBridgeUpload(formData: FormData) {
  await bridgeFetch('/content/items', {
    method: 'POST',
    body: formData,
    timeoutMs: 120_000
  });
}

export async function GET() {
  const result = await bridgeRequest('/content/items');
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (isJsonRequest(request)) {
    const body = await request.json();
    const uploadedAssets = uploadedAssetsFromBody(body);
    const intent = String(body?.intent ?? '').trim();

    if (intent === 'image-library' && !uploadedAssets.length) {
      return jsonError('image-required');
    }
    if (intent === 'image-library' && uploadedAssets.length > MAX_IMAGE_UPLOAD_FILES) {
      return jsonError('too-many-images', 413);
    }
    if (uploadedAssets.some((asset) => !isUploadedImageAsset(asset))) {
      return jsonError('images-only');
    }

    const title = String(body?.title ?? '').trim() || imageUploadTitle();
    const result = await bridgeRequest('/content/items', {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        title,
        contentKind: intent === 'image-library' ? 'image-library' : body?.contentKind
      }),
      timeoutMs: 30_000
    });
    return NextResponse.json(result, { status: 201, headers: { 'cache-control': 'no-store' } });
  }

  const formData = await request.formData();
  const media = selectedMedia(formData);
  normalizeImageLibraryFormData(formData, media);

  const title = String(formData.get('title') ?? '').trim();
  const brief = String(formData.get('brief') ?? '').trim();
  const pillar = String(formData.get('pillar') ?? '').trim();
  const campaign = String(formData.get('campaign') ?? 'sladdis').trim() || 'sladdis';
  const ownerAgentId = String(formData.get('ownerAgentId') ?? 'sladdis').trim() || 'sladdis';
  const intent = String(formData.get('intent') ?? '').trim();

  if (!title) {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=missing', request.url),
      303
    );
  }

  if (intent === 'image-library' && !media.length) {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=image-required', request.url),
      303
    );
  }
  if (intent === 'image-library' && media.length > MAX_IMAGE_UPLOAD_FILES) {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=too-many-images', request.url),
      303
    );
  }
  const unsupportedMedia = media.find((file) => !isImageUpload(file));
  if (unsupportedMedia) {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=images-only', request.url),
      303
    );
  }

  if (media.length || (edgeFunctionUrl() && edgeFunctionToken())) {
    try {
      if (edgeFunctionUrl() && edgeFunctionToken()) {
        await createContentItemWithEdge(formData);
      } else {
        await createContentItemWithBridgeUpload(formData);
      }
      return NextResponse.redirect(
        new URL(
          `/dashboard/content-studio?${intent === 'image-library' ? 'uploaded=1&view=active' : 'created=1'}`,
          request.url
        ),
        303
      );
    } catch (error) {
      if (!media.length && error instanceof Error && error.message === 'missing-edge-config') {
        // Text-only drafts can still use the existing bridge when Edge Functions are not wired yet.
      } else {
        const message = error instanceof Error ? error.message : 'media-upload-failed';
        return NextResponse.redirect(
          new URL(`/dashboard/content-studio?error=${encodeURIComponent(message)}`, request.url),
          303
        );
      }
    }
  }

  await bridgeRequest('/content/items', {
    method: 'POST',
    body: JSON.stringify({
      title,
      brief,
      pillar,
      campaign,
      ownerAgentId,
      platforms: selectedPlatforms(formData)
    })
  });

  return NextResponse.redirect(new URL('/dashboard/content-studio?created=1', request.url), 303);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const result = await bridgeRequest('/content/items', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
