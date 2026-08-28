import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Logga in',
  description: 'Logga in till AgentOS Vault.'
};

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; signup?: string; next?: string }>;
}) {
  const params = await searchParams;
  const allowedNextPaths = new Set(['/', '/dashboard', '/dashboard/credentials']);
  const nextPath =
    params.next && allowedNextPaths.has(params.next) ? params.next : '/dashboard/credentials';

  return (
    <main className='vault-auth'>
      <section className='vault-auth-card' aria-labelledby='sign-in-title'>
        <div className='vault-auth-brand' aria-hidden='true'>
          A
        </div>
        <p className='vault-eyebrow'>AgentOS Vault</p>
        <h1 id='sign-in-title'>Logga in</h1>
        <p className='vault-auth-copy'>
          Ett privat, avskalat valv för agenternas credentials.
        </p>

        {params.error === 'invalid' ? (
          <p className='vault-form-error' role='alert'>
            Fel e-postadress eller lösenord.
          </p>
        ) : null}
        {params.signup === 'disabled' ? (
          <p className='vault-form-note' role='status'>
            Registrering är avstängd. Bara den konfigurerade användaren kan
            logga in.
          </p>
        ) : null}

        <form action='/api/auth/sign-in' method='post' className='vault-form'>
          <input type='hidden' name='next' value={nextPath} />
          <label className='vault-field'>
            <span>E-postadress</span>
            <input
              name='email'
              type='email'
              autoComplete='email'
              required
              autoFocus
            />
          </label>
          <label className='vault-field'>
            <span>Lösenord</span>
            <input
              name='password'
              type='password'
              autoComplete='current-password'
              required
            />
          </label>
          <button
            className='vault-button vault-button-primary vault-button-wide'
            type='submit'
          >
            Logga in
          </button>
        </form>
      </section>
    </main>
  );
}
