import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Credential Vault'
};

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='vault-app'>
      <header className='vault-header'>
        <Link
          className='vault-brand'
          href='/dashboard/credentials'
          aria-label='AgentOS Vault'
        >
          <span className='vault-brand-mark' aria-hidden='true'>
            A
          </span>
          <span>
            AgentOS <strong>Vault</strong>
          </span>
        </Link>
        <div className='vault-header-actions'>
          <span className='vault-private-label'>Privat valv</span>
          <form action='/api/auth/sign-out' method='post'>
            <button className='vault-button vault-button-quiet' type='submit'>
              Logga ut
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
