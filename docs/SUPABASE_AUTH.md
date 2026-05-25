# Supabase Auth

Agent OS uses Supabase email/password as the login authority.

## Runtime model

- Login form posts to `/api/auth/sign-in`.
- The API route verifies email/password against Supabase Auth using:
  - `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- After Supabase verifies the user, Agent OS still issues its own short app session cookie (`agent_os_session`) for middleware compatibility.
- Signup remains disabled in the Agent OS UI.
- `ADMIN_EMAIL`, when configured, acts as an allowlist so only Felipe's configured email can enter the cockpit.

## Current bootstrap

The initial Supabase Auth user was created/updated from the existing Agent OS admin credentials. Do not commit Supabase service/secret keys.

## Later cleanup

- Remove stale Clerk UI/dependencies once no pages import Clerk components.
- Consider storing the Supabase access/refresh token server-side if Agent OS needs per-user Supabase RLS later.
- Rotate setup keys that were pasted/used during migration.
