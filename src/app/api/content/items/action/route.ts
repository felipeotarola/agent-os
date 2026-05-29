import { bridgeRequest } from '@/lib/bridge';
import { contentPlatforms } from '@/db/content';
import { NextRequest, NextResponse } from 'next/server';

function selectedPlatforms(formData: FormData) {
  return formData
    .getAll('platforms')
    .map((value) => String(value).trim())
    .filter((platform) => contentPlatforms.includes(platform as (typeof contentPlatforms)[number]));
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const id = String(formData.get('id') ?? '').trim();
  const action = String(formData.get('action') ?? '').trim();
  const scheduleAt = String(formData.get('scheduleAt') ?? '').trim();

  if (!id) {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=missing-id', request.url),
      303
    );
  }

  if (action === 'manual-launch') {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?launch=blocked', request.url),
      303
    );
  }

  if (action === 'edit') {
    const title = String(formData.get('title') ?? '').trim();
    if (!title) {
      return NextResponse.redirect(
        new URL('/dashboard/content-studio?error=missing-title', request.url),
        303
      );
    }
    const platforms = selectedPlatforms(formData);
    if (!platforms.length) {
      return NextResponse.redirect(
        new URL('/dashboard/content-studio?error=platform-required', request.url),
        303
      );
    }

    await bridgeRequest('/content/items', {
      method: 'PATCH',
      body: JSON.stringify({
        id,
        action,
        title,
        brief: String(formData.get('brief') ?? '').trim(),
        pillar: String(formData.get('pillar') ?? '').trim(),
        campaign: String(formData.get('campaign') ?? 'sladdis').trim() || 'sladdis',
        platforms
      })
    });

    return NextResponse.redirect(
      new URL('/dashboard/content-studio?action=edit', request.url),
      303
    );
  }

  const statusByAction: Record<string, string> = {
    'mark-ready': 'ready',
    schedule: 'scheduled',
    archive: 'archived',
    draft: 'draft'
  };
  const status = statusByAction[action];
  if (!status) {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=unsupported-action', request.url),
      303
    );
  }

  await bridgeRequest('/content/items', {
    method: 'PATCH',
    body: JSON.stringify({
      id,
      action,
      status,
      scheduleAt: action === 'schedule' ? scheduleAt : undefined
    })
  });

  return NextResponse.redirect(
    new URL(`/dashboard/content-studio?action=${encodeURIComponent(action)}`, request.url),
    303
  );
}
