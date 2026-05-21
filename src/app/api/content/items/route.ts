import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

function selectedPlatforms(formData: FormData) {
  const values = formData.getAll('platforms').map((value) => String(value));
  return values.length ? values : ['instagram', 'tiktok', 'youtube_shorts'];
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
