import { readAuthEnv } from '@/lib/auth/env';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken, getSessionFromRequest } from '@/lib/auth/session';
import { hasSupabaseEmailAuthConfig, verifySupabaseEmailPassword } from '@/lib/auth/supabase';
import { NextRequest, NextResponse } from 'next/server';

const revealCookie = 'agent_os_worklog_finance_reveal';
const revealSeconds = 5 * 60;

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const date = String(form.get('date') ?? '').trim();
  const email = session?.email;
  let valid = false;

  if (email && password) {
    if (hasSupabaseEmailAuthConfig()) {
      const verified = await verifySupabaseEmailPassword(email, password);
      valid = verified?.email === email;
    } else {
      const adminPassword = readAuthEnv('ADMIN_PASSWORD');
      valid = adminPassword
        ? password === adminPassword
        : verifyPassword(password, readAuthEnv('ADMIN_PASSWORD_HASH'));
    }
  }

  const url = new URL('/dashboard/time', request.url);
  if (date) url.searchParams.set('date', date);
  if (!valid || !email) {
    url.searchParams.set('revealError', '1');
    return NextResponse.redirect(url, 303);
  }
  url.searchParams.set('finance', '1');
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(revealCookie, await createSessionToken(email, revealSeconds), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/dashboard/time',
    maxAge: revealSeconds
  });
  return response;
}
