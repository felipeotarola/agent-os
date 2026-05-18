import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms'
};

export default function TermsOfServicePage() {
  return (
    <main className='min-h-screen px-4 py-12 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-3xl rounded-2xl border bg-card p-8 shadow-sm'>
        <h1 className='text-3xl font-bold tracking-tight'>Terms</h1>
        <p className='text-muted-foreground mt-4 leading-relaxed'>
          Internal Agent OS workspace. Treat all actions as local-first and reversible unless a
          future guarded integration explicitly says otherwise.
        </p>
      </div>
    </main>
  );
}
