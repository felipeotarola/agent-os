import PageContainer from '@/components/layout/page-container';
import { MermaidDiagram } from '@/components/mermaid-diagram';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getOpenClawAgents } from '@/db/agents';
import { getSystemStatus } from '@/db/system';

export const metadata = {
  title: 'Agent OS: Topology'
};

function agentLabel(agent: Awaited<ReturnType<typeof getOpenClawAgents>>['agents'][number]) {
  const name = agent.identityName ?? agent.name ?? agent.id;
  const emoji = agent.identityEmoji ? `${agent.identityEmoji} ` : '';
  const model = agent.model ? `<br/>${agent.model}` : '';
  return `${emoji}${name}<br/>${agent.id}${model}`;
}

function safeNodeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildTopologyDiagram({
  agents,
  bridgeStatus,
  dbStatus,
  memoryOk,
  subagentsOk
}: {
  agents: Awaited<ReturnType<typeof getOpenClawAgents>>['agents'];
  bridgeStatus: string;
  dbStatus: string;
  memoryOk: boolean;
  subagentsOk: boolean;
}) {
  const agentNodes = agents
    .map((agent) => {
      const nodeId = `agent_${safeNodeId(agent.id)}`;
      return `    ${nodeId}["${agentLabel(agent)}"]`;
    })
    .join('\n');

  const agentEdges = agents
    .map((agent) => {
      const nodeId = `agent_${safeNodeId(agent.id)}`;
      return `    Gateway --> ${nodeId}\n    ${nodeId} --> Memory`;
    })
    .join('\n');

  const channelNodes = [
    ...new Set(agents.flatMap((agent) => agent.routes ?? []).map((route) => route.channel))
  ]
    .map((channel) => `    channel_${safeNodeId(channel)}["${channel}"]`)
    .join('\n');
  const bindingEdges = agents
    .flatMap((agent) =>
      (agent.routes ?? []).map((route) => {
        const detail = route.accountId ? `|${route.accountId}|` : '';
        return `    channel_${safeNodeId(route.channel)} -->${detail} agent_${safeNodeId(agent.id)}`;
      })
    )
    .join('\n');
  const defaultAgent = agents.find((agent) => agent.isDefault) ?? agents[0];
  const orchestratorId = defaultAgent ? `agent_${safeNodeId(defaultAgent.id)}` : 'agent_main';

  return `flowchart LR
  Felipe --> WebUI["Web UI"]

  subgraph AgentOS["Agent OS Dashboard"]
    Cockpit["Cockpit"]
    Radar["Inbox Radar"]
    ActionCenter["Action Center"]
    Tasks["Tasks"]
    Knowledge["Knowledge"]
    Topology["Topology"]
  end

  WebUI --> Cockpit
  Cockpit --> Bridge
  Radar --> Bridge
  ActionCenter --> Bridge
  Tasks --> Bridge
  Knowledge --> Bridge
  Topology --> Bridge

  Bridge["Agent OS Bridge<br/>${bridgeStatus}"] --> Postgres[("Postgres<br/>${dbStatus}")]
  Bridge --> Gateway["OpenClaw Gateway"]
  Bridge --> Memory["Memory / QMD<br/>${memoryOk ? 'ok' : 'degraded'}"]
  Bridge --> Cron["Cron jobs<br/>schedules + reminders"]
  Bridge --> Subagents["Subagents<br/>${subagentsOk ? 'available' : 'degraded'}"]

  subgraph Agents["Agents"]
${agentNodes || '    agent_main["⚛️ Cai<br/>main"]'}
  end
${agentEdges || '    Gateway --> agent_main\n    agent_main --> Memory'}

  subgraph Channels["Runtime channel bindings"]
${channelNodes || '    channel_none["No bindings reported"]'}
  end
${bindingEdges}

  ${orchestratorId} -. orchestrates .-> Subagents
  Cron --> Gateway
  Gateway --> Channels

  Bridge --> GitHub["GitHub"]
  Bridge --> Vercel["Vercel"]
  Bridge --> Supabase["Supabase"]
  Bridge --> Mail["Gmail / Calendar"]`;
}

const topologyLayers = [
  ['Channels', 'Live OpenClaw bindings grouped by channel and account.'],
  ['OpenClaw runtime', 'Gateway, agents, sessions, subagents, cron and memory/QMD.'],
  ['Agent OS bridge', 'Safe server boundary for Postgres, OpenClaw and external signal reads.'],
  ['Cockpit surfaces', 'Radar, Action Center, Tasks, Knowledge and Topology views.'],
  ['External signals', 'GitHub, Vercel, Supabase, Gmail and Calendar remain read-only.']
];

export default async function TopologyPage() {
  const [system, agentsSnapshot] = await Promise.all([getSystemStatus(), getOpenClawAgents()]);
  const diagram = buildTopologyDiagram({
    agents: agentsSnapshot.agents,
    bridgeStatus: system.bridge.status,
    dbStatus: system.db.status,
    memoryOk: system.memory.ok,
    subagentsOk: Boolean(system.subagents?.ok)
  });

  const cards = [
    { label: 'Bridge', value: system.bridge.status, detail: system.bridge.version ?? 'unknown' },
    { label: 'Postgres', value: system.db.status, detail: system.db.checkedAt ?? 'not checked' },
    {
      label: 'Agents',
      value: String(agentsSnapshot.agents.length),
      detail: agentsSnapshot.source
    },
    {
      label: 'Memory/QMD',
      value: system.memory.ok ? 'ok' : 'degraded',
      detail: `${system.memory.summary?.chunks ?? 0} chunks`
    },
    {
      label: 'OpenClaw runtime runs',
      value: String(system.subagents?.runningCount ?? 0),
      detail: system.subagents?.source ?? 'no source'
    }
  ];

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              topology · bridge-driven v0
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>System Topology</h1>
            <p className='text-muted-foreground max-w-3xl text-sm md:text-base'>
              En operator-karta över Agent OS och det aktuella OpenClaw-registret. Agenter och
              kanalbindningar kommer från runtime; bridge, Postgres, Memory/QMD och cockpit-ytorna
              visas separat.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Generated</div>
            <div className='font-mono'>{new Date(system.bridge.now).toLocaleString('sv-SE')}</div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5'>
          {cards.map((card) => (
            <Card key={card.label}>
              <CardHeader className='pb-2'>
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className='text-2xl'>{card.value}</CardTitle>
              </CardHeader>
              <CardContent className='text-muted-foreground text-sm'>{card.detail}</CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Topology graph</CardTitle>
            <CardDescription>
              Current known runtime relationships. Drag/zoom the graph if it gets dense.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MermaidDiagram title='Agent OS topology' chart={diagram} />
          </CardContent>
        </Card>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-5'>
          {topologyLayers.map(([title, detail]) => (
            <Card key={title}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{title}</CardTitle>
              </CardHeader>
              <CardContent className='text-muted-foreground text-sm'>{detail}</CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
