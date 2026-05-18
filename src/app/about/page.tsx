import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Agent OS'
};

export default function AboutPage() {
  return (
    <main className='min-h-screen px-4 py-12 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-3xl space-y-8'>
        <header className='text-center'>
          <h1 className='text-foreground text-3xl font-bold tracking-tight sm:text-4xl'>
            Agent OS
          </h1>
          <p className='text-muted-foreground mt-4 text-lg'>
            Local-first cockpit for Felipe × Cai.
          </p>
        </header>
        <section className='bg-card rounded-2xl border p-8 shadow-sm'>
          <h2 className='text-foreground mb-4 text-xl font-semibold'>Purpose</h2>
          <p className='text-muted-foreground text-lg leading-relaxed'>
            Agent OS is being stripped back to real surfaces only: cockpit, tasks, agents,
            knowledge, wiki, memory, permissions and read-only command diagnostics.
          </p>
        </section>
        <section className='bg-card rounded-2xl border p-8 shadow-sm'>
          <h2 className='text-foreground mb-4 text-xl font-semibold'>Data stance</h2>
          <p className='text-muted-foreground text-lg leading-relaxed'>
            Mock SaaS/sample data is disabled. New data paths should come from OpenClaw, the bridge,
            Postgres or explicit user input.
          </p>
        </section>
      </div>
    </main>
  );
}
