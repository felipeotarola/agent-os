import { db } from '@/db/client';
import { knowledgeSources } from '@/db/schema';
import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const id = String(formData.get('id') ?? '');
  if (!id) {
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=missing', request.url), 303);
  }

  if (hasBridge()) {
    await bridgeRequest('/knowledge/sources/queue', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    return NextResponse.redirect(new URL('/dashboard/knowledge?queued=1', request.url), 303);
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=no-db', request.url), 303);
  }

  await db
    .update(knowledgeSources)
    .set({
      status: 'queued',
      updatedAt: new Date(),
      metadata: { queuedFrom: 'cockpit', queuedAt: new Date().toISOString() }
    })
    .where(eq(knowledgeSources.id, id));

  return NextResponse.redirect(new URL('/dashboard/knowledge?queued=1', request.url), 303);
}
