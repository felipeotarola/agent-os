import { getMemoryStatus } from '@/db/memory';
import { getSystemStatus } from '@/db/system';
import { bridgeRequest, hasBridge } from '@/lib/bridge';

type FileReadiness = {
  name: string;
  path: string;
  required: boolean;
  exists: boolean;
  bytes: number;
  updatedAt: string | null;
  meaningful: boolean;
};

type SessionReadiness = {
  agentId: string;
  sessionsDir: string;
  sessionFiles: number;
  metadata: {
    exists: boolean;
    bytes: number;
    updatedAt: string | null;
  };
  exists: boolean;
};

type AssistantReadinessFiles = {
  source: string;
  workspaceDir: string;
  openClawHome: string;
  logDir: string;
  todayLog: {
    path: string;
    exists: boolean;
    bytes: number;
    updatedAt: string | null;
  };
  workspaceFiles: FileReadiness[];
  sessions: SessionReadiness[];
};

const fallbackFiles: AssistantReadinessFiles = {
  source: 'fallback:no-bridge',
  workspaceDir: '/root/.openclaw/workspace',
  openClawHome: '/root/.openclaw',
  logDir: '/tmp/openclaw',
  todayLog: {
    path: `/tmp/openclaw/openclaw-${new Date().toISOString().slice(0, 10)}.log`,
    exists: false,
    bytes: 0,
    updatedAt: null
  },
  workspaceFiles: [],
  sessions: []
};

async function getAssistantReadinessFiles() {
  if (!hasBridge()) return fallbackFiles;

  try {
    return await bridgeRequest<AssistantReadinessFiles>('/assistant/readiness-files', {
      cacheMs: 15000,
      timeoutMs: 3000
    });
  } catch (error) {
    console.error('Assistant readiness files request failed', error);
    return fallbackFiles;
  }
}

function scoreChecks(checks: Array<{ ok: boolean }>) {
  const total = checks.length;
  const ok = checks.filter((check) => check.ok).length;
  return { ok, total, percent: total ? Math.round((ok / total) * 100) : 0 };
}

export async function getAssistantReadiness() {
  const [system, memory, files] = await Promise.all([
    getSystemStatus(),
    getMemoryStatus(),
    getAssistantReadinessFiles()
  ]);
  const memoryIssues = memory.status.reduce(
    (sum, agent) =>
      sum +
      (agent.scan?.issues?.length ?? 0) +
      (agent.audit?.issues?.length ?? 0) +
      (agent.dreamingAudit?.issues?.length ?? 0),
    0
  );

  const checks = [
    {
      group: 'Gateway',
      label: 'Bridge online',
      ok: system.bridge.status === 'online',
      detail: `Bridge ${system.bridge.status}`
    },
    {
      group: 'Gateway',
      label: 'OpenClaw available',
      ok: Boolean(system.openclaw?.available),
      detail: system.openclaw?.version ?? system.openclaw?.error ?? 'No OpenClaw status'
    },
    {
      group: 'Workspace',
      label: 'Core workspace files exist',
      ok: files.workspaceFiles.filter((file) => file.required).every((file) => file.exists),
      detail: `${files.workspaceFiles.filter((file) => file.exists).length}/${files.workspaceFiles.length} files present`
    },
    {
      group: 'Workspace',
      label: 'Heartbeat has real instructions',
      ok: Boolean(files.workspaceFiles.find((file) => file.name === 'HEARTBEAT.md')?.meaningful),
      detail: 'Prevents noisy autonomous heartbeats'
    },
    {
      group: 'Memory',
      label: 'QMD memory clean',
      ok:
        memory.status.length > 0 &&
        memory.status.every((agent) => !agent.status.dirty) &&
        memoryIssues === 0,
      detail: `${memory.status.reduce((sum, agent) => sum + (agent.status.chunks ?? 0), 0)} chunks · ${memoryIssues} issues`
    },
    {
      group: 'Sessions',
      label: 'Session metadata present',
      ok: files.sessions.some((session) => session.metadata.exists),
      detail: `${files.sessions.reduce((sum, session) => sum + session.sessionFiles, 0)} session files`
    },
    {
      group: 'Ops',
      label: 'Today log path readable',
      ok: files.todayLog.exists,
      detail: files.todayLog.path
    },
    {
      group: 'Subagents',
      label: 'Subagent source available',
      ok: Boolean(system.subagents?.available),
      detail: system.subagents?.source ?? system.subagents?.error ?? 'No subagent source'
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    workspaceDir: files.workspaceDir,
    openClawHome: files.openClawHome,
    logDir: files.logDir,
    todayLog: files.todayLog,
    system,
    memory,
    workspaceFiles: files.workspaceFiles,
    sessions: files.sessions,
    checks,
    score: scoreChecks(checks),
    docs: [
      { title: 'Personal assistant setup', href: 'https://docs.openclaw.ai/start/openclaw' },
      { title: 'Gateway runbook', href: 'https://docs.openclaw.ai/gateway' },
      { title: 'Cron jobs', href: 'https://docs.openclaw.ai/automation/cron-jobs' },
      { title: 'Security', href: 'https://docs.openclaw.ai/gateway/security' },
      { title: 'Channels overview', href: 'https://docs.openclaw.ai/channels' }
    ]
  };
}
