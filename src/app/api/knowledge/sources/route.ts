import { db } from '@/db/client';
import { knowledgeSources } from '@/db/schema';
import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function inferKind(sourceUrl: string, rawContent: string) {
  if (sourceUrl) return 'url';
  if (rawContent.length > 2000) return 'note-long';
  return 'note';
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const title = String(formData.get('title') ?? '').trim();
  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim();
  const rawContent = String(formData.get('rawContent') ?? '').trim();

  if (!title || (!sourceUrl && !rawContent)) {
    return NextResponse.redirect(new URL('/dashboard/knowledge?error=missing', request.url), 303);
  }

  if (!process.env.DATABASE_URL) {
    if (!hasBridge()) {
      return NextResponse.redirect(new URL('/dashboard/knowledge?error=no-db', request.url), 303);
    }

    await bridgeRequest('/knowledge/sources', {
      method: 'POST',
      body: JSON.stringify({ title, sourceUrl, rawContent })
    });
    return NextResponse.redirect(new URL('/dashboard/knowledge?created=1', request.url), 303);
  }

  const id = crypto.randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(title) || id;
  const rawPath = `knowledge/raw/${date}-${slug}.md`;

  await db.insert(knowledgeSources).values({
    id,
    title,
    kind: inferKind(sourceUrl, rawContent),
    status: 'raw',
    sourceUrl: sourceUrl || null,
    rawContent,
    rawPath,
    summary: rawContent ? rawContent.slice(0, 240) : sourceUrl,
    metadata: { createdFrom: 'cockpit' }
  });

  return NextResponse.redirect(new URL('/dashboard/knowledge?created=1', request.url), 303);
}
