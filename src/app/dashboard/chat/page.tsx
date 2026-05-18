import PageContainer from '@/components/layout/page-container';
import ChatViewPage from '@/features/chat/components/chat-view-page';

export const metadata = {
  title: 'Agent OS: Chat'
};

export default function ChatPage() {
  return (
    <PageContainer>
      <ChatViewPage />
    </PageContainer>
  );
}
