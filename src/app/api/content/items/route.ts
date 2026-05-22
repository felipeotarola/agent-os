import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

function selectedPlatforms(formData: FormData) {
  const values = formData.getAll('platforms').map((value) => String(value));
  return values.length ? values : ['instagram', 'tiktok', 'youtube_shorts'];
}

function selectedMedia(formData: FormData) {
  return formData
    .getAll('media')
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function edgeFunctionUrl() {
  const explicit = process.env.SLADDIS_CONTENT_EDGE_URL;
  if (explicit) return explicit;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/sladdis-content` : null;
}

function edgeFunctionToken() {
  return (
    process.env.SLADDIS_CONTENT_EDGE_TOKEN ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    null
  );
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

export async function GET() {
  const result = await bridgeRequest('/content/items');
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const title = String(formData.get('title') ?? '').trim();
  const brief = String(formData.get('brief') ?? '').trim();
  const pillar = String(formData.get('pillar') ?? '').trim();
  const campaign = String(formData.get('campaign') ?? 'sladdis').trim() || 'sladdis';
  const ownerAgentId = String(formData.get('ownerAgentId') ?? 'sladdis').trim() || 'sladdis';

  if (!title) {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=missing', request.url),
      303
    );
  }

  const media = selectedMedia(formData);
  if (media.length || (edgeFunctionUrl() && edgeFunctionToken())) {
    try {
      await createContentItemWithEdge(formData);
      return NextResponse.redirect(
        new URL('/dashboard/content-studio?created=1', request.url),
        303
      );
    } catch (error) {
      if (!media.length && error instanceof Error && error.message === 'missing-edge-config') {
        // Text-only drafts can still use the existing bridge when Edge Functions are not wired yet.
      } else {
        const message = error instanceof Error ? error.message : 'edge-upload-failed';
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
