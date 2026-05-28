import { contentPlatforms } from '@/db/content';
import { bridgeRequest } from '@/lib/bridge';
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

  if (!id) {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=missing-media-id', request.url),
      303
    );
  }

  if (action !== 'mark-used' && action !== 'clear-used') {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=unsupported-media-action', request.url),
      303
    );
  }

  const platforms = selectedPlatforms(formData);
  if (action === 'mark-used' && !platforms.length) {
    return NextResponse.redirect(
      new URL('/dashboard/content-studio?error=platform-required', request.url),
      303
    );
  }

  await bridgeRequest('/content/media-assets', {
    method: 'PATCH',
    body: JSON.stringify({
      id,
      action,
      usedPlatforms: action === 'mark-used' ? platforms : []
    })
  });

  return NextResponse.redirect(
    new URL(`/dashboard/content-studio?action=${encodeURIComponent(action)}`, request.url),
    303
  );
}
