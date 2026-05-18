import { db } from '@/db/client';
import { knowledgeSources } from '@/db/schema';
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

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const title = String(formData.get('title') ?? '').trim();
  const rawContent = String(formData.get('rawContent') ?? '').trim();

  if (!title || !rawContent) {
    return NextResponse.redirect(new URL('/dashboard/journal?error=missing', request.url), 303);
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.redirect(new URL('/dashboard/journal?error=no-db', request.url), 303);
  }

  const id = crypto.randomUUID();
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(title) || id;

  await db.insert(knowledgeSources).values({
    id,
    title,
    kind: 'journal',
    status: 'raw',
    rawContent,
    rawPath: `journal/${date}-${slug}.md`,
    summary: rawContent.slice(0, 240),
    metadata: { createdFrom: 'journal' }
  });

  return NextResponse.redirect(new URL('/dashboard/journal?created=1', request.url), 303);
}
