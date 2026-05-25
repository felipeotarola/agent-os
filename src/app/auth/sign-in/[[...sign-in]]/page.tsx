import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in | Cai OS',
  description: 'Sign in to the Agent OS cockpit.'
};

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ error?: string; signup?: string; next?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === 'invalid';
  const signupDisabled = params.signup === 'disabled';
  const nextPath = params.next?.startsWith('/') ? params.next : '/dashboard/overview';

  return (
    <main className='bg-background flex min-h-screen items-center justify-center p-6 text-foreground'>
      <div className='w-full max-w-md rounded-2xl border bg-card p-8 shadow-xl'>
        <div className='mb-8 space-y-2'>
          <div className='text-primary text-sm font-medium'>⚛️ Cai OS</div>
          <h1 className='text-3xl font-semibold tracking-tight'>Logga in</h1>
          <p className='text-muted-foreground text-sm'>
            Agent OS cockpit är privat. Logga in med Supabase email/password.
          </p>
        </div>

        {hasError && (
          <div className='border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border p-3 text-sm'>
            Fel email eller lösenord.
          </div>
        )}
        {signupDisabled && (
          <div className='border-primary/40 bg-primary/10 text-primary mb-4 rounded-lg border p-3 text-sm'>
            Signup är avstängt. Bara den förkonfigurerade användaren kan logga in.
          </div>
        )}

        <form action='/api/auth/sign-in' method='post' className='space-y-4'>
          <input type='hidden' name='next' value={nextPath} />
          <div className='space-y-2'>
            <label htmlFor='email' className='text-sm font-medium'>
              Email
            </label>
            <input
              id='email'
              name='email'
              type='email'
              autoComplete='email'
              required
              defaultValue='feot1000@gmail.com'
              className='border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
            />
          </div>
          <div className='space-y-2'>
            <label htmlFor='password' className='text-sm font-medium'>
              Lösenord
            </label>
            <input
              id='password'
              name='password'
              type='password'
              autoComplete='current-password'
              required
              className='border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
            />
          </div>
          <button
            type='submit'
            className='bg-primary text-primary-foreground hover:bg-primary/90 h-11 w-full rounded-md px-4 text-sm font-medium transition-colors'
          >
            Logga in
          </button>
        </form>
      </div>
    </main>
  );
}
