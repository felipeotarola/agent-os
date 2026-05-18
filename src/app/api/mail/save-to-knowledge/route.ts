import { bridgeRequest } from '@/lib/bridge';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const form = await request.formData();
  const threadId = String(form.get('threadId') ?? '');
  const account = String(form.get('account') ?? '');

  if (!threadId) {
    return NextResponse.redirect(
      new URL('/dashboard/mail-radar?error=missing-thread', request.url),
      303
    );
  }

  try {
    await bridgeRequest('/mail/save-to-knowledge', {
      method: 'POST',
      body: JSON.stringify({ threadId, account })
    });
    return NextResponse.redirect(new URL('/dashboard/mail-radar?saved=1', request.url), 303);
  } catch (error) {
    const reason = encodeURIComponent(
      error instanceof Error ? error.message.slice(0, 120) : 'failed'
    );
    return NextResponse.redirect(
      new URL(`/dashboard/mail-radar?error=${reason}`, request.url),
      303
    );
  }
}
