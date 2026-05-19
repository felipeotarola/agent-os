import PageContainer from '@/components/layout/page-container';
import { ActionCenterBoard } from './action-center-board';
import { getActionCenterSnapshot } from '@/lib/action-center';

export const metadata = {
  title: 'Agent OS: Action Center'
};

export default async function ActionCenterPage() {
  const snapshot = await getActionCenterSnapshot();

  return (
    <PageContainer>
      <ActionCenterBoard snapshot={snapshot} />
    </PageContainer>
  );
}
