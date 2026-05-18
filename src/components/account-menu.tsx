'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { Icons } from '@/components/icons';
import Link from 'next/link';
import * as React from 'react';

const avatarStorageKey = 'agent-os:user-avatar';

function useLocalAvatar() {
  const [avatar, setAvatar] = React.useState<string | null>(null);

  React.useEffect(() => {
    const syncAvatar = () => setAvatar(window.localStorage.getItem(avatarStorageKey));
    syncAvatar();
    window.addEventListener('storage', syncAvatar);
    window.addEventListener('agent-os-avatar-updated', syncAvatar);
    return () => {
      window.removeEventListener('storage', syncAvatar);
      window.removeEventListener('agent-os-avatar-updated', syncAvatar);
    };
  }, []);

  return avatar;
}

function AccountAvatar({ avatar }: { avatar: string | null }) {
  return (
    <Avatar className='h-8 w-8 rounded-lg border border-primary/30 bg-primary/10'>
      {avatar && <AvatarImage src={avatar} alt='Felipe avatar' />}
      <AvatarFallback className='rounded-lg text-base'>⚛️</AvatarFallback>
    </Avatar>
  );
}

export function AccountMenu() {
  const { isMobile } = useSidebar();
  const avatar = useLocalAvatar();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size='lg'
          className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
        >
          <AccountAvatar avatar={avatar} />
          <div className='grid flex-1 text-left text-sm leading-tight'>
            <span className='truncate font-semibold'>Felipe × Cai</span>
            <span className='text-muted-foreground truncate text-xs'>Local-first / portable</span>
          </div>
          <Icons.chevronsDown className='ml-auto size-4' />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
        side={isMobile ? 'bottom' : 'right'}
        align='end'
        sideOffset={4}
      >
        <DropdownMenuLabel className='p-0 font-normal'>
          <div className='flex items-center gap-2 px-1 py-1.5 text-left text-sm'>
            <AccountAvatar avatar={avatar} />
            <div className='grid flex-1 text-left text-sm leading-tight'>
              <span className='truncate font-semibold'>Felipe × Cai</span>
              <span className='truncate text-xs'>Agent OS account</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href='/dashboard/settings'>
            <Icons.settings className='mr-2 h-4 w-4' />
            Settings & avatar
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action='/api/auth/sign-out' method='post'>
          <DropdownMenuItem asChild variant='destructive'>
            <button type='submit' className='w-full'>
              <Icons.logout className='mr-2 h-4 w-4' />
              Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { avatarStorageKey };
