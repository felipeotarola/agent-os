import { readAuthEnv } from '@/lib/auth/env';
import { verifyPassword, verifyPlainPassword } from '@/lib/auth/password';
import { createSessionToken, sessionCookieName, sessionMaxAgeSeconds } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';

const vaultPath = '/dashboard/credentials';

function safeNextPath(value: FormDataEntryValue | null) {
  const path = String(value ?? '');
  return path === '/' || path === '/dashboard' || path === vaultPath ? path : vaultPath;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const adminEmail = readAuthEnv('ADMIN_EMAIL')?.toLowerCase();
  const nextPath = safeNextPath(formData.get('next'));
  const passwordHash = readAuthEnv('ADMIN_PASSWORD_HASH');
  const passwordMatches = passwordHash
    ? verifyPassword(password, passwordHash)
    : verifyPlainPassword(password, readAuthEnv('ADMIN_PASSWORD'));
  const authenticatedEmail = adminEmail && email === adminEmail && passwordMatches ? email : null;

  if (!authenticatedEmail) {
    return NextResponse.redirect(new URL('/auth/sign-in?error=invalid', request.url), 303);
  }

  const token = await createSessionToken(authenticatedEmail);
  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionMaxAgeSeconds
  });

  return response;
}
