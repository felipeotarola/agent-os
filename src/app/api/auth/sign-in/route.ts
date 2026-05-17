import { readAuthEnv } from '@/lib/auth/env';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken, sessionCookieName, sessionMaxAgeSeconds } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const adminEmail = readAuthEnv('ADMIN_EMAIL')?.toLowerCase();

  if (
    !adminEmail ||
    email !== adminEmail ||
    !verifyPassword(password, readAuthEnv('ADMIN_PASSWORD_HASH'))
  ) {
    return NextResponse.redirect(new URL('/auth/sign-in?error=invalid', request.url), 303);
  }

  const token = await createSessionToken(email);
  const response = NextResponse.redirect(new URL('/dashboard/overview', request.url), 303);
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionMaxAgeSeconds
  });

  return response;
}
