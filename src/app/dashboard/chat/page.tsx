import PageContainer from '@/components/layout/page-container';
import ChatViewPage from '@/features/chat/components/chat-view-page';
import { getOpenClawAgents } from '@/db/agents';

export const metadata = {
  title: 'Agent OS: Chat'
};

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default async function ChatPage() {
  const registry = await getOpenClawAgents();
  const agents = registry.agents.map((agent) => {
    const name = agent.identityName ?? agent.name ?? agent.id;
    return {
      id: agent.id,
      name,
      role: agent.isDefault ? 'Default OpenClaw agent' : 'OpenClaw runtime agent',
      initials: agent.identityEmoji ?? initials(name),
      tone: `${agent.model ?? 'runtime model'} · ${agent.routes?.length ?? agent.bindings ?? 0} route bindings`
    };
  });
  return (
    <PageContainer>
      <ChatViewPage agents={agents} />
    </PageContainer>
  );
}
