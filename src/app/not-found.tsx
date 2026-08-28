import Link from 'next/link';

export default function NotFound() {
  return (
    <main className='vault-auth'>
      <section className='vault-auth-card'>
        <p className='vault-eyebrow'>404</p>
        <h1>Sidan finns inte</h1>
        <p className='vault-auth-copy'>AgentOS innehåller bara credential-valvet.</p>
        <Link className='vault-button vault-button-primary' href='/dashboard/credentials'>
          Öppna valvet
        </Link>
      </section>
    </main>
  );
}
