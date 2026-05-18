import { db } from '@/db/client';
import { knowledgeSources } from '@/db/schema';
import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.{40,260}?[.!?])\s/);
  return (match?.[1] ?? normalized.slice(0, 220)).trim();
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const id = String(formData.get('id') ?? '').trim();
  if (!id)
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=missing', request.url), 303);

  if (hasBridge()) {
    await bridgeRequest('/knowledge/sources/extract', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    return NextResponse.redirect(new URL('/dashboard/knowledge?extracted=1', request.url), 303);
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=no-db', request.url), 303);
  }

  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, id))
    .limit(1);
  if (!source)
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=missing', request.url), 303);

  let rawContent = source.rawContent;
  if (source.sourceUrl && rawContent.length < 500) {
    const response = await fetch(source.sourceUrl);
    rawContent = stripHtml(await response.text()).slice(0, 60000);
  }

  await db
    .update(knowledgeSources)
    .set({
      status: 'extracted',
      rawContent,
      summary: rawContent
        ? firstSentence(rawContent)
        : (source.sourceUrl ?? 'No readable text extracted yet.'),
      updatedAt: new Date(),
      metadata: { extractedFrom: 'cockpit', extractedAt: new Date().toISOString() }
    })
    .where(eq(knowledgeSources.id, id));

  return NextResponse.redirect(new URL('/dashboard/knowledge?extracted=1', request.url), 303);
}
