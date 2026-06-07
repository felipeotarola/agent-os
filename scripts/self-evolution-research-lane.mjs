#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.split('=');
  return [key, value];
}));

const workspaceRoot = resolve(args.get('--workspace-root') || process.env.OPENCLAW_WORKSPACE_ROOT || resolve(repoRoot, '..'));
const format = args.get('--format') || 'markdown';
const write = args.get('--write') === 'true';
const outputPath = resolve(args.get('--output') || join(repoRoot, 'reports', 'self-evolution-next.md'));

const SIGNALS = [
  {
    id: 'felipe-correction',
    label: 'Felipe correction',
    patterns: [/Felipe .*?(said|pointed out|corrected|clarified)/i, /\bDu har rätt\b/i, /\bcorrection\b/i],
    priority: 5,
    tieBreak: 2
  },
  {
    id: 'push-or-credential-failure',
    label: 'Push or credential failure',
    patterns: [/\b403\b/i, /\bgit push\b/i, /\bGITHUB_TOKEN\b/i, /\bcredential\b/i, /\bpermission\b/i],
    priority: 4,
    tieBreak: 3
  },
  {
    id: 'cron-or-heartbeat-friction',
    label: 'Cron or heartbeat friction',
    patterns: [/\bcron\b/i, /\bheartbeat\b/i, /\bscheduler\b/i, /\bNO_ACTION\b/i, /\bHEARTBEAT_OK\b/i],
    priority: 3,
    tieBreak: 1
  },
  {
    id: 'self-evolution-mandate',
    label: 'Self-evolution mandate',
    patterns: [/\bself[- ]?evol/i, /\bself[- ]?learning/i, /\bsjälv\b.*\bta tag\b/i, /\bmandat\b/i],
    priority: 5,
    tieBreak: 5
  },
  {
    id: 'agent-eval-or-readiness',
    label: 'Eval or readiness gap',
    patterns: [/\beval\b/i, /\breadiness\b/i, /\bverify\b/i, /\bharness\b/i, /\bregression\b/i],
    priority: 3,
    tieBreak: 4
  }
];

function readOptional(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function cleanLine(line) {
  return line
    .replace(/^[-*]\s*/, '')
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, '[redacted-secret]')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function recentWorkspaceMemoryFiles() {
  const memoryDir = join(workspaceRoot, 'memory');
  if (!existsSync(memoryDir)) return [];
  return readdirSync(memoryDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .slice(-10)
    .map((name) => join(memoryDir, name));
}

function sourceFiles() {
  return [
    join(repoRoot, 'docs', 'AUTONOMOUS_SELF_EVOLUTION.md'),
    join(repoRoot, 'docs', 'CAI_EVOLUTION.md'),
    join(repoRoot, 'docs', 'DAILY_AGENT_LEARNING_LOOP.md'),
    join(repoRoot, 'docs', 'AGENT_IMPROVEMENT_LOOP.md'),
    join(repoRoot, 'docs', 'AGENT_OS_RESEARCH_RADAR.md'),
    ...recentWorkspaceMemoryFiles()
  ];
}

function collectSignals(files) {
  const buckets = new Map(SIGNALS.map((signal) => [signal.id, { ...signal, hits: [] }]));

  for (const path of files) {
    const text = readOptional(path);
    if (!text) continue;

    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const cleaned = cleanLine(line);
      if (!cleaned || cleaned.startsWith('#')) continue;

      for (const signal of SIGNALS) {
        if (!signal.patterns.some((pattern) => pattern.test(cleaned))) continue;
        const bucket = buckets.get(signal.id);
        if (bucket.hits.length < 6) {
          bucket.hits.push({
            path: path.replace(`${workspaceRoot}/`, '').replace(`${repoRoot}/`, ''),
            line: index + 1,
            text: cleaned
          });
        }
      }
    }
  }

  return [...buckets.values()];
}

function chooseCandidate(signals) {
  const scored = signals
    .map((signal) => ({ ...signal, score: signal.priority * signal.hits.length }))
    .filter((signal) => signal.hits.length > 0)
    .sort((a, b) => b.score - a.score || b.tieBreak - a.tieBreak);

  const top = scored[0];
  if (!top) {
    return {
      title: 'No self-evolution candidate',
      state: 'no-action',
      payoff: 'Avoids inventing work without evidence.',
      risk: 'none',
      verification: 'Run this lane again after new memory, docs, cron or workflow signals exist.',
      nextAction: 'Stay silent.'
    };
  }

  if (top.id === 'self-evolution-mandate') {
    return {
      title: 'Autonomous self-evolution lane hardening',
      state: 'ready-small',
      payoff: 'Turns Felipe mandate into a repeatable research-prioritize-implement loop with checks.',
      risk: 'low; docs/scripts/evals only unless the implementation lane later chooses a bounded code change',
      verification: 'npm run self-evolution:research && npm run check:self-improvement-readiness',
      nextAction: 'Keep the research lane separate from implementation and require readiness coverage.'
    };
  }

  if (top.id === 'push-or-credential-failure') {
    return {
      title: 'Credential-aware publish recovery eval',
      state: 'ready-small',
      payoff: 'Prevents future learning-loop runs from misclassifying verified local work as failed when only push is blocked.',
      risk: 'low; deterministic readiness/eval fixtures',
      verification: 'npm run check:self-improvement-readiness && npm run evals:agent',
      nextAction: 'Add or extend fixtures for Agent OS token sourcing and push-blocked reporting.'
    };
  }

  if (top.id === 'cron-or-heartbeat-friction') {
    return {
      title: 'Cron lane visibility preflight',
      state: 'ready-large',
      payoff: 'Makes autonomous work auditable across heartbeat, daily learning, research and implementation lanes.',
      risk: 'medium; may touch scheduler configuration and reporting conventions',
      verification: 'Cron dry run plus readiness report and no-noise Telegram behavior.',
      nextAction: 'Create a small spec before changing live cron jobs.'
    };
  }

  return {
    title: `${top.label} follow-up`,
    state: 'research',
    payoff: 'Captures a recurring signal before it disappears into chat.',
    risk: 'unknown until scoped',
    verification: 'Define a deterministic check before implementation.',
    nextAction: 'Write one candidate task with acceptance criteria.'
  };
}

function buildReport(signals, candidate) {
  return {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    repoRoot,
    lane: 'research-only',
    candidate,
    signals: signals.map((signal) => ({
      id: signal.id,
      label: signal.label,
      hits: signal.hits.length,
      evidence: signal.hits.slice(0, 2)
    }))
  };
}

function toMarkdown(report) {
  const lines = [
    '# Self-Evolution Research Lane',
    '',
    `Generated: ${report.generatedAt}`,
    `Lane: ${report.lane}`,
    '',
    '## Candidate',
    '',
    `- Title: ${report.candidate.title}`,
    `- State: ${report.candidate.state}`,
    `- Payoff: ${report.candidate.payoff}`,
    `- Risk: ${report.candidate.risk}`,
    `- Verification: ${report.candidate.verification}`,
    `- Next action: ${report.candidate.nextAction}`,
    '',
    '## Signals',
    ''
  ];

  for (const signal of report.signals) {
    lines.push(`- ${signal.label}: ${signal.hits}`);
    for (const hit of signal.evidence) {
      lines.push(`  - ${hit.text} (${hit.path}:${hit.line})`);
    }
  }

  return `${lines.join('\n')}\n`;
}

const report = buildReport(collectSignals(sourceFiles()), undefined);
report.candidate = chooseCandidate(report.signals.map((signal) => ({
  ...SIGNALS.find((candidate) => candidate.id === signal.id),
  hits: signal.evidence
})));

const output = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : toMarkdown(report);

if (write) {
  writeFileSync(outputPath, output);
}

process.stdout.write(output);
