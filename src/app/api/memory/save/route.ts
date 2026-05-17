import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const title = String(formData.get('title') ?? '').trim();
  const path = String(formData.get('path') ?? '').trim();
  const snippet = String(formData.get('snippet') ?? '').trim();
  const source = String(formData.get('source') ?? '').trim();

  if (!title || !snippet) {
    return NextResponse.redirect(new URL('/dashboard/memory?error=missing', request.url), 303);
  }

  const rawContent = [`Source: ${source || 'memory'}`, path ? `Path: ${path}` : '', '', snippet]
    .filter(Boolean)
    .join('\n');

  await bridgeRequest('/knowledge/sources', {
    method: 'POST',
    body: JSON.stringify({
      title,
      sourceUrl: '',
      rawContent
    })
  });

  return NextResponse.redirect(new URL('/dashboard/memory?saved=1', request.url), 303);
}
