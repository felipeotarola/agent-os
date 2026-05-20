import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getMemoryStatus } from '@/db/memory';
import { getSystemStatus } from '@/db/system';

const workspaceDir = process.env.AGENT_OS_OPENCLAW_WORKSPACE ?? '/root/.openclaw/workspace';
const openClawHome = process.env.OPENCLAW_HOME ?? '/root/.openclaw';
const logDir = process.env.OPENCLAW_LOG_DIR ?? '/tmp/openclaw';
const agentIds = ['main', 'charles', 'sladdis'];

function todayLogPath() {
  return path.join(logDir, `openclaw-${new Date().toISOString().slice(0, 10)}.log`);
}

function fileStatus(filePath: string) {
  try {
    const stat = statSync(filePath);
    return {
      exists: true,
      bytes: stat.size,
      updatedAt: stat.mtime.toISOString()
    };
  } catch {
    return { exists: false, bytes: 0, updatedAt: null };
  }
}

function isMeaningfulMarkdown(filePath: string) {
  try {
    const content = readdirSafe(path.dirname(filePath)) ? readFileSync(filePath, 'utf8') : '';
    return content
      .split('\n')
      .map((line: string) => line.trim())
      .some((line: string) => line && !line.startsWith('#') && !line.startsWith('<!--'));
  } catch {
    return false;
  }
}

function readdirSafe(dir: string) {
  try {
    readdirSync(dir);
    return true;
  } catch {
    return false;
  }
}

function directoryFileCount(dir: string, extension?: string) {
  try {
    return readdirSync(dir).filter((entry) => !extension || entry.endsWith(extension)).length;
  } catch {
    return 0;
  }
}

function sessionStatus(agentId: string) {
  const sessionsDir = path.join(openClawHome, 'agents', agentId, 'sessions');
  const metadataPath = path.join(sessionsDir, 'sessions.json');
  return {
    agentId,
    sessionsDir,
    sessionFiles: directoryFileCount(sessionsDir, '.jsonl'),
    metadata: fileStatus(metadataPath),
    exists: existsSync(sessionsDir)
  };
}

function workspaceFile(name: string, required: boolean) {
  const filePath = path.join(workspaceDir, name);
  const status = fileStatus(filePath);
  return {
    name,
    path: filePath,
    required,
    ...status,
    meaningful:
      name === 'HEARTBEAT.md' ? isMeaningfulMarkdown(filePath) : status.exists && status.bytes > 0
  };
}

function scoreChecks(checks: Array<{ ok: boolean }>) {
  const total = checks.length;
  const ok = checks.filter((check) => check.ok).length;
  return { ok, total, percent: total ? Math.round((ok / total) * 100) : 0 };
}

export async function getAssistantReadiness() {
  const [system, memory] = await Promise.all([getSystemStatus(), getMemoryStatus()]);
  const workspaceFiles = [
    workspaceFile('AGENTS.md', true),
    workspaceFile('SOUL.md', true),
    workspaceFile('USER.md', true),
    workspaceFile('TOOLS.md', true),
    workspaceFile('HEARTBEAT.md', true),
    workspaceFile('MEMORY.md', false),
    workspaceFile('DREAMS.md', false)
  ];
  const sessions = agentIds.map(sessionStatus);
  const logPath = todayLogPath();
  const logStatus = fileStatus(logPath);
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
      ok: workspaceFiles.filter((file) => file.required).every((file) => file.exists),
      detail: `${workspaceFiles.filter((file) => file.exists).length}/${workspaceFiles.length} files present`
    },
    {
      group: 'Workspace',
      label: 'Heartbeat has real instructions',
      ok: Boolean(workspaceFiles.find((file) => file.name === 'HEARTBEAT.md')?.meaningful),
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
      ok: sessions.some((session) => session.metadata.exists),
      detail: `${sessions.reduce((sum, session) => sum + session.sessionFiles, 0)} session files`
    },
    {
      group: 'Ops',
      label: 'Today log path readable',
      ok: logStatus.exists,
      detail: logPath
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
    workspaceDir,
    openClawHome,
    logDir,
    todayLog: { path: logPath, ...logStatus },
    system,
    memory,
    workspaceFiles,
    sessions,
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
