import PageContainer from '@/components/layout/page-container';
import { MermaidDiagram } from '@/components/mermaid-diagram';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'Agent OS: System Architecture'
};

const runtimeDiagram = `flowchart LR
  Felipe[Felipe / Telegram / Web UI] --> AgentOS[Agent OS Dashboard<br/>Next.js App]
  AgentOS --> API[Next.js API Routes<br/>/api/*]
  AgentOS --> ServerHelpers[Server Helpers<br/>src/db + src/lib]
  API --> Bridge[Agent OS Bridge<br/>bridge/server.mjs]
  ServerHelpers --> Bridge
  Bridge --> Postgres[(Postgres<br/>Tasks · Knowledge · Events · Radar state)]
  Bridge --> OpenClaw[OpenClaw Gateway<br/>WebSocket RPC + CLI fallback]
  Bridge --> Gog[gog CLI<br/>Gmail + Calendar readonly]
  Bridge --> GitHub[GitHub REST API<br/>readonly token]
  Bridge --> Vercel[Vercel API<br/>readonly token]
  Bridge --> Supabase[Supabase API<br/>readonly token]
  OpenClaw --> Agents[Cai · Charles · Sladdis<br/>Subagents / sessions]
  Agents --> Memory[OpenClaw Memory / QMD<br/>Long-term + session chunks]`;

const signalDiagram = `flowchart TD
  Gmail[Gmail Radar] --> Radar[Inbox Radar<br/>src/lib/radar.ts]
  Calendar[Calendar Snapshot] --> Radar
  GitHub[GitHub Signals] --> Radar
  Vercel[Vercel Observability] --> Radar
  Supabase[Supabase Observability] --> Radar
  Tasks[Task Board + Dispatch] --> Radar
  Knowledge[Knowledge Inbox] --> Radar
  Runway[Life OS Runway] --> Radar
  Notifications[Notifications] --> Radar
  Radar --> Overview[Overview Cockpit]
  Radar --> ActionCenter[Action Center]
  Radar --> UserDecision{Felipe decides}
  UserDecision --> CreateTask[Create internal task]
  UserDecision --> Snooze[Snooze / handled]
  UserDecision --> OpenSource[Open source page]`;

const knowledgeDiagram = `stateDiagram-v2
  [*] --> raw: capture note / email / session / source
  raw --> extracted: extract signals
  extracted --> wikified: synthesize markdown
  wikified --> reviewed: human review
  reviewed --> promoted: approved context candidate
  raw --> archived: not useful / noisy
  extracted --> archived
  wikified --> archived
  promoted --> OpenClawContext: used as trusted context
  OpenClawContext --> Memory: durable memory / wiki`;

const agentDiagram = `sequenceDiagram
  participant Felipe
  participant Cai as Cai / Main Agent
  participant AgentOS as Agent OS UI
  participant Bridge
  participant Worker as Subagent Worker
  participant OpenClaw
  Felipe->>Cai: asks for work
  Cai->>Worker: sessions_spawn(task)
  Worker->>Bridge: inspect repo / runtime snapshots
  Worker->>AgentOS: modify code / docs
  Worker-->>Cai: completion event
  Cai->>AgentOS: merge / validate / push
  AgentOS->>Bridge: build + runtime checks
  Bridge->>OpenClaw: chat/events/status when needed
  Cai-->>Felipe: concise result + evidence`;

const guardrailDiagram = `flowchart TD
  External[External systems<br/>Gmail · Calendar · GitHub · Vercel · Supabase] --> ReadOnly[Read-only connectors]
  ReadOnly --> Redaction[Redaction / summarization<br/>no tokens, no raw secrets]
  Redaction --> Radar[Inbox Radar]
  Radar --> Guarded[Guarded internal actions]
  Guarded --> InternalWrites[Internal writes only<br/>Tasks · Knowledge · Radar state]
  InternalWrites --> Audit[Task events / DB audit trail]
  Guarded -.blocked.-> ExternalWrites[No external writes in V1<br/>no send / RSVP / PR comments / shell]
  Secrets[Secrets] --> Env[Server env only]
  Env -.never render.-> UI[Dashboard UI]`;

const surfaces = [
  [
    'Cockpit',
    'Overview page: live status, briefing, calendar, Action Center priority, runtime cards.'
  ],
  [
    'Inbox Radar',
    'Unified attention layer across tasks, knowledge, Gmail, Calendar, GitHub, Vercel, Supabase and runway.'
  ],
  ['Action Center', 'Operational queue for tasks and knowledge transitions.'],
  ['Command Center', 'Allowlisted commands and guarded knowledge/session actions.'],
  ['Knowledge', 'Reviewable pipeline from raw capture to trusted context.'],
  ['Runway', 'Safe Life OS income/runway picture without raw banking data.'],
  ['Observability', 'Vercel, Supabase and GitHub snapshots with degraded-state visibility.'],
  ['Global Cai', 'Dashboard copilot using dedicated session continuity.']
];

const runtimeContracts = [
  ['Bridge', 'Single local server boundary for DB, OpenClaw, gog and external API reads.'],
  [
    'Postgres',
    'Tasks, knowledge sources, task events, Radar state and connector-backed app state.'
  ],
  ['OpenClaw Gateway', 'Agent sessions, chat events, subagent runs, memory/QMD status.'],
  ['gog', 'Google API bridge for Gmail and Calendar read-only signals.'],
  ['External APIs', 'GitHub/Vercel/Supabase read-only snapshots; tokens stay server-side.']
];

export default function ArchitecturePage() {
  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              system map
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
              Agent OS Architecture
            </h1>
            <p className='text-muted-foreground max-w-3xl text-sm md:text-base'>
              En levande karta över hur Agent OS är byggt: UI, bridge, OpenClaw runtime, externa
              signaler, knowledge pipeline, subagents och säkerhetsgränser.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Principle</div>
            <div className='font-mono'>read · reason · guard · act</div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-4'>
          {surfaces.map(([title, detail]) => (
            <Card key={title}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>{title}</CardTitle>
              </CardHeader>
              <CardContent className='text-muted-foreground text-sm'>{detail}</CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Runtime architecture</CardTitle>
            <CardDescription>
              Huvudflödet från UI till bridge, DB, OpenClaw och externa system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MermaidDiagram title='Runtime architecture' chart={runtimeDiagram} />
          </CardContent>
        </Card>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Signal flow</CardTitle>
              <CardDescription>Hur data blir prioriterade Radar-signaler.</CardDescription>
            </CardHeader>
            <CardContent>
              <MermaidDiagram title='Signal flow' chart={signalDiagram} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Knowledge lifecycle</CardTitle>
              <CardDescription>Inget autopromotas. Allt viktigt går via review.</CardDescription>
            </CardHeader>
            <CardContent>
              <MermaidDiagram title='Knowledge lifecycle' chart={knowledgeDiagram} />
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Agent orchestration</CardTitle>
              <CardDescription>
                Hur Cai leder workers/subagents och validerar resultat.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MermaidDiagram title='Agent orchestration' chart={agentDiagram} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Safety boundary</CardTitle>
              <CardDescription>Read-only externa signaler, guarded interna writes.</CardDescription>
            </CardHeader>
            <CardContent>
              <MermaidDiagram title='Safety boundary' chart={guardrailDiagram} />
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-5'>
          <Card className='xl:col-span-3'>
            <CardHeader>
              <CardTitle>Runtime contracts</CardTitle>
              <CardDescription>
                De viktigaste gränssnitten som håller systemet begripligt.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {runtimeContracts.map(([title, detail]) => (
                <div key={title} className='rounded-xl border bg-background/40 p-4'>
                  <div className='font-medium'>{title}</div>
                  <div className='text-muted-foreground mt-1 text-sm'>{detail}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Design rules</CardTitle>
              <CardDescription>Så Agent OS fortsätter vara cockpit, inte template.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              {[
                'External systems are read-only until narrow guarded actions exist.',
                'Secrets live in server env/config, never UI or markdown.',
                'Knowledge is reviewable before it becomes trusted context.',
                'Radar should reduce attention cost, not increase dashboard chores.',
                'Subagents do bounded work; Cai orchestrates, validates and reports.'
              ].map((rule) => (
                <div key={rule} className='rounded-xl border bg-background/40 p-3'>
                  {rule}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
