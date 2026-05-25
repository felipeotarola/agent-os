import { readAuthEnv } from '@/lib/auth/env';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken, sessionCookieName, sessionMaxAgeSeconds } from '@/lib/auth/session';
import { hasSupabaseEmailAuthConfig, verifySupabaseEmailPassword } from '@/lib/auth/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const adminEmail = readAuthEnv('ADMIN_EMAIL')?.toLowerCase();
  const nextPath = String(formData.get('next') ?? '/dashboard/overview');

  let authenticatedEmail: string | null = null;

  if (hasSupabaseEmailAuthConfig()) {
    const supabaseUser = await verifySupabaseEmailPassword(email, password);
    if (supabaseUser && (!adminEmail || supabaseUser.email === adminEmail)) {
      authenticatedEmail = supabaseUser.email;
    }
  } else {
    const plainPassword = readAuthEnv('ADMIN_PASSWORD');
    const passwordMatches = plainPassword
      ? password === plainPassword
      : verifyPassword(password, readAuthEnv('ADMIN_PASSWORD_HASH'));

    if (adminEmail && email === adminEmail && passwordMatches) authenticatedEmail = email;
  }

  if (!authenticatedEmail) {
    return NextResponse.redirect(new URL('/auth/sign-in?error=invalid', request.url), 303);
  }

  const token = await createSessionToken(authenticatedEmail);
  const response = NextResponse.redirect(
    new URL(nextPath.startsWith('/') ? nextPath : '/dashboard/overview', request.url),
    303
  );
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionMaxAgeSeconds
  });

  return response;
}
