import { cn } from '@/lib/utils';
import { SignUp as ClerkSignUpForm } from '@clerk/nextjs';
import { Metadata } from 'next';
import { InteractiveGridPattern } from './interactive-grid';

export const metadata: Metadata = {
  title: 'Authentication',
  description: 'Agent OS sign-up.'
};

export default function SignUpViewPage() {
  return (
    <div className='relative h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0'>
      <div className='relative hidden h-full flex-col p-10 lg:flex dark:border-r'>
        <div className='absolute inset-0 bg-sidebar' />
        <div className='text-sidebar-foreground relative z-20 flex items-center text-lg font-medium'>
          <span className='mr-2'>⚛️</span>
          Agent OS
        </div>
        <InteractiveGridPattern
          className={cn(
            'mask-[radial-gradient(400px_circle_at_center,white,transparent)]',
            'inset-x-0 inset-y-[0%] h-full skew-y-12'
          )}
        />
        <div className='text-sidebar-foreground relative z-20 mt-auto'>
          <blockquote className='space-y-2'>
            <p className='text-lg'>
              Private cockpit surfaces first. Integrations later, with guardrails.
            </p>
            <footer className='text-sidebar-foreground/70 text-sm'>Felipe × Cai</footer>
          </blockquote>
        </div>
      </div>
      <div className='flex h-full items-center justify-center p-4 lg:p-8'>
        <div className='flex w-full max-w-md flex-col items-center justify-center space-y-6'>
          <ClerkSignUpForm />
        </div>
      </div>
    </div>
  );
}
