import KanbanViewPage from '@/features/kanban/components/kanban-view-page';

export const metadata = {
  title: 'Agent OS: Tasks'
};

export default function Page({
  searchParams
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  return <KanbanViewPage searchParams={searchParams} />;
}
