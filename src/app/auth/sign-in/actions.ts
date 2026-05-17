'use server';

import { createSessionToken, sessionCookieName, sessionMaxAgeSeconds } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (
    !adminEmail ||
    email !== adminEmail ||
    !verifyPassword(password, process.env.ADMIN_PASSWORD_HASH)
  ) {
    redirect('/auth/sign-in?error=invalid');
  }

  const token = await createSessionToken(email);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionMaxAgeSeconds
  });

  redirect('/dashboard/overview');
}
