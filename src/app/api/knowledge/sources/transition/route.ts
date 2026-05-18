import { db } from '@/db/client';
import { knowledgeSources } from '@/db/schema';
import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

const allowed = new Set(['reviewed', 'promoted', 'archived']);

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (!id || !allowed.has(status)) {
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=missing', request.url), 303);
  }

  if (hasBridge()) {
    await bridgeRequest('/knowledge/sources/transition', {
      method: 'POST',
      body: JSON.stringify({ id, status })
    });
    return NextResponse.redirect(new URL(`/dashboard/knowledge?${status}=1`, request.url), 303);
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=no-db', request.url), 303);
  }

  await db
    .update(knowledgeSources)
    .set({
      status,
      updatedAt: new Date(),
      metadata: { transitionedFrom: 'cockpit', transitionedAt: new Date().toISOString() }
    })
    .where(eq(knowledgeSources.id, id));

  return NextResponse.redirect(new URL(`/dashboard/knowledge?${status}=1`, request.url), 303);
}
