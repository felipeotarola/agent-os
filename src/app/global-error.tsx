'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang='sv'>
      <body>
        <main className='vault-auth'>
          <section className='vault-auth-card'>
            <p className='vault-eyebrow'>AgentOS Vault</p>
            <h1>Något gick fel</h1>
            <p className='vault-auth-copy'>Ingen credential har ändrats.</p>
            <button className='vault-button vault-button-primary' type='button' onClick={reset}>
              Försök igen
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
