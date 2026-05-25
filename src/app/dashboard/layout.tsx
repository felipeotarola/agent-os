import KBar from '@/components/kbar';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { InfoSidebar } from '@/components/layout/info-sidebar';
import {
  RightContextSidebar,
  RightContextSidebarProvider
} from '@/components/layout/right-context-sidebar';
import { InfobarProvider } from '@/components/ui/infobar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { GlobalCaiChat } from '@/features/chat/components/global-cai-chat';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'Cai OS',
  description: 'Agent OS cockpit',
  robots: {
    index: false,
    follow: false
  }
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Persisting the sidebar state in the cookie.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';
  return (
    <KBar>
      <SidebarProvider defaultOpen={defaultOpen}>
        <RightContextSidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <Header />
            <InfobarProvider defaultOpen={false}>
              {children}
              <GlobalCaiChat />
              <InfoSidebar side='right' />
            </InfobarProvider>
          </SidebarInset>
          <RightContextSidebar />
        </RightContextSidebarProvider>
      </SidebarProvider>
    </KBar>
  );
}
