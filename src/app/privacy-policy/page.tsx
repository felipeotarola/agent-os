import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy'
};

export default function PrivacyPolicyPage() {
  return (
    <main className='min-h-screen px-4 py-12 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-3xl rounded-2xl border bg-card p-8 shadow-sm'>
        <h1 className='text-3xl font-bold tracking-tight'>Privacy</h1>
        <p className='text-muted-foreground mt-4 leading-relaxed'>
          This local cockpit should only show data from configured Agent OS sources: OpenClaw,
          bridge/Postgres, local knowledge files, and explicit user input. Do not add demo datasets,
          tracking widgets, or third-party sample links back into the product surface.
        </p>
      </div>
    </main>
  );
}
