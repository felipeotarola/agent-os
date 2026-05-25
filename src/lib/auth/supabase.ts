import { readAuthEnv } from './env';

type SupabasePasswordResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: {
    id?: string;
    email?: string;
  };
  error?: string;
  error_description?: string;
  msg?: string;
};

function supabaseUrl() {
  return readAuthEnv('SUPABASE_URL') ?? readAuthEnv('NEXT_PUBLIC_SUPABASE_URL');
}

function supabasePublishableKey() {
  return (
    readAuthEnv('SUPABASE_PUBLISHABLE_KEY') ??
    readAuthEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
    readAuthEnv('SUPABASE_ANON_KEY') ??
    readAuthEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  );
}

export function hasSupabaseEmailAuthConfig() {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export async function verifySupabaseEmailPassword(email: string, password: string) {
  const baseUrl = supabaseUrl();
  const key = supabasePublishableKey();
  if (!baseUrl || !key) return null;

  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ email, password }),
    cache: 'no-store'
  });

  const payload = (await response.json().catch(() => ({}))) as SupabasePasswordResponse;
  if (!response.ok || !payload.access_token || !payload.user?.email) return null;

  return {
    provider: 'supabase' as const,
    id: payload.user.id ?? payload.user.email,
    email: payload.user.email.toLowerCase(),
    expiresIn: payload.expires_in ?? null
  };
}
