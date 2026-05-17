import { db } from '@/db/client';
import { knowledgeSources } from '@/db/schema';
import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { wikifySource } from '@/lib/wikify';
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
    return NextResponse.redirect(new URL('/dashboard/knowledge?wikified=1', request.url), 303);
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=no-db', request.url), 303);
  }

  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, id))
    .limit(1);
  if (!source) {
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=missing', request.url), 303);
  }

  const wiki = wikifySource(source);
  await db
    .update(knowledgeSources)
    .set({
      status: 'wikified',
      summary: wiki.summary,
      wikiPath: wiki.wikiPath,
      wikiContent: wiki.wikiContent,
      updatedAt: new Date(),
      metadata: { wikifiedFrom: 'cockpit', wikifiedAt: new Date().toISOString() }
    })
    .where(eq(knowledgeSources.id, id));

  return NextResponse.redirect(new URL('/dashboard/knowledge?wikified=1', request.url), 303);
}
