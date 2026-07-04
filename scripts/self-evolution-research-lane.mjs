#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    id: 'memory-promotion-hygiene',
    label: 'Memory promotion hygiene',
    patterns: [/\bMEMORY\.md\b.*\b(noisy|raw|stale|cleanup|promot)/i, /\blong[- ]term memory\b.*\b(distill|raw|routine|validation|promotion|promoted)/i, /\bmemory promotions?\b/i],
    priority: 6,
    tieBreak: 7
  },
  {
    id: 'push-or-credential-failure',
    label: 'Push or credential failure',
    patterns: [/\b403\b/i, /\bgit push\b/i, /\bGITHUB_TOKEN\b/i, /\bcredential\b/i, /\bpermission\b/i],
    priority: 4,
    tieBreak: 3
  },
  {
    id: 'isolated-cron-tooling-failure',
    label: 'Isolated cron tooling failure',
    patterns: [/\bisolated cron\b/i, /\btoolsAllow\b/i, /\bfile_access\b/i, /\bstale .*tools/i],
    priority: 6,
    tieBreak: 6
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

function relativePath(path) {
  return path.replace(`${workspaceRoot}/`, '').replace(`${repoRoot}/`, '');
}

function dateFromMemoryPath(path) {
  const match = /memory\/(\d{4})-(\d{2})-(\d{2})\.md$/.exec(relativePath(path));
  if (!match) return undefined;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function hitWeight(path, signalId) {
  const relPath = relativePath(path);
  let weight = relPath.startsWith('memory/') ? 2.5 : 1;

  const memoryTime = dateFromMemoryPath(path);
  if (memoryTime) {
    const ageDays = Math.max(0, (Date.now() - memoryTime) / 86_400_000);
    if (ageDays <= 2) weight += 2;
    else if (ageDays <= 7) weight += 1;
  }

  if (relPath.includes('AGENT_OS_RESEARCH_RADAR.md')) weight += 0.5;
  if (signalId === 'self-evolution-mandate' && relPath.startsWith('docs/')) weight *= 0.25;

  return weight;
}

function selfEvolutionReadinessIsCovered() {
  const required = [
    join(repoRoot, 'docs', 'AUTONOMOUS_SELF_EVOLUTION.md'),
    join(repoRoot, 'scripts', 'self-evolution-research-lane.mjs'),
    join(repoRoot, 'evals', 'agent-behavior-v0.json')
  ];
  if (!required.every((path) => existsSync(path))) return false;

  const packageJson = readOptional(join(repoRoot, 'package.json'));
  const evals = readOptional(join(repoRoot, 'evals', 'agent-behavior-v0.json'));
  return packageJson.includes('"self-evolution:research"') && /\bself[- ]?evolution\b/i.test(evals);
}

function cronToolPolicyPreflightIsCovered() {
  const script = join(repoRoot, 'scripts', 'cron-tool-policy-preflight.mjs');
  const packageJson = readOptional(join(repoRoot, 'package.json'));
  return existsSync(script) && packageJson.includes('"check:cron-tool-policy"');
}

function memoryPromotionHygieneIsCovered() {
  const script = join(repoRoot, 'scripts', 'self-improvement-readiness.mjs');
  const text = readOptional(script);
  return (
    /\bclassifyMemoryPromotionCandidate\b/.test(text) &&
    /\bmemory-promotion-hygiene-v0\b/.test(text) &&
    /\breject-raw-heartbeat-output\b/.test(text) &&
    /\breject-stale-worktree-status\b/.test(text)
  );
}

function felipeCorrectionFollowUpIsCovered() {
  const packageJson = readOptional(join(repoRoot, 'package.json'));
  const tasks = readOptional(join(repoRoot, 'docs', 'TASKS.md'));
  const radar = readOptional(join(repoRoot, 'docs', 'AGENT_OS_RESEARCH_RADAR.md'));
  return (
    existsSync(join(repoRoot, 'scripts', 'qaa-positioning-guard.mjs')) &&
    packageJson.includes('"check:qaa-positioning"') &&
    /\bfelipe-correction-regression-guard\b/.test(tasks) &&
    /\bQAA\/Testbench positioning regression guard\b/.test(radar) &&
    /\bimplemented-local\b/.test(radar)
  );
}

function researchTaskCoverageIsCovered() {
  const tasks = readOptional(join(repoRoot, 'docs', 'TASKS.md'));
  const readiness = readOptional(join(repoRoot, 'scripts', 'self-improvement-readiness.mjs'));
  const radar = readOptional(join(repoRoot, 'docs', 'AGENT_OS_RESEARCH_RADAR.md'));
  return (
    /\beval-readiness-gap-coverage\b/.test(tasks) &&
    /\bAcceptance criteria\b/.test(tasks) &&
    /\bGuardrails\b/.test(tasks) &&
    /\bEvidence\b/.test(tasks) &&
    /\bresearch-task-coverage-v0\b/.test(readiness) &&
    /\brepo-eval-readiness-task-is-covered\b/.test(readiness) &&
    /\bresearch-task-coverage-v0\b/.test(radar) &&
    /\bimplemented locally\b|\bimplemented-local\b/i.test(radar)
  );
}

function cronLaneVisibilityPreflightIsCovered() {
  const packageJson = readOptional(join(repoRoot, 'package.json'));
  const tasks = readOptional(join(repoRoot, 'docs', 'TASKS.md'));
  const radar = readOptional(join(repoRoot, 'docs', 'AGENT_OS_RESEARCH_RADAR.md'));
  const spec = readOptional(join(repoRoot, 'docs', 'CRON_LANE_VISIBILITY_PREFLIGHT.md'));
  return (
    existsSync(join(repoRoot, 'scripts', 'cron-lane-visibility-preflight.mjs')) &&
    packageJson.includes('"check:cron-lane-visibility"') &&
    /\bcron-lane-visibility-preflight-v0\b/.test(tasks) &&
    /\bCron lane visibility preflight V0 spec\b/.test(radar) &&
    /\bnpm run check:cron-lane-visibility\b/.test(radar) &&
    /\bnoiseOutcome\b/.test(spec) &&
    /\bdecision-needed\b/.test(spec)
  );
}

function credentialAwarePublishRecoveryIsCovered() {
  const tasks = readOptional(join(repoRoot, 'docs', 'TASKS.md'));
  const readiness = readOptional(join(repoRoot, 'scripts', 'self-improvement-readiness.mjs'));
  const radar = readOptional(join(repoRoot, 'docs', 'AGENT_OS_RESEARCH_RADAR.md'));
  return (
    /\bcredential-aware-publish-recovery-eval\b/.test(tasks) &&
    /\bgit-push-credential-policy-v0\b/.test(readiness) &&
    /\brepo-git-push-wrapper-is-credential-aware\b/.test(readiness) &&
    /\bclean-ahead-push-blocked\b/.test(readiness) &&
    /\bCredential-aware publish recovery eval\b/.test(radar) &&
    /\bimplemented-local\b/.test(radar) &&
    /\bnpm run check:self-improvement-readiness\b/.test(radar) &&
    /\bnpm run evals:agent\b/.test(radar)
  );
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
        if (bucket.hits.length < 10) {
          bucket.hits.push({
            path: relativePath(path),
            line: index + 1,
            text: cleaned,
            weight: hitWeight(path, signal.id)
          });
        }
      }
    }
  }

  return [...buckets.values()];
}

function scoreSignals(signals) {
  const coveredBySignal = new Map([
    ['self-evolution-mandate', selfEvolutionReadinessIsCovered()],
    ['isolated-cron-tooling-failure', cronToolPolicyPreflightIsCovered()],
    ['memory-promotion-hygiene', memoryPromotionHygieneIsCovered()],
    ['felipe-correction', felipeCorrectionFollowUpIsCovered()],
    ['agent-eval-or-readiness', researchTaskCoverageIsCovered()],
    ['cron-or-heartbeat-friction', cronLaneVisibilityPreflightIsCovered()],
    ['push-or-credential-failure', credentialAwarePublishRecoveryIsCovered()]
  ]);

  return signals
    .map((signal) => {
      const rawScore = signal.priority * signal.hits.reduce((sum, hit) => sum + (hit.weight || 1), 0);
      const covered = coveredBySignal.get(signal.id) === true;
      let score = rawScore;
      if (covered) score *= 0.15;
      return {
        ...signal,
        covered,
        rawScore,
        score,
        hits: [...signal.hits].sort((a, b) => (b.weight || 1) - (a.weight || 1))
      };
    })
    .filter((signal) => signal.hits.length > 0)
    .sort((a, b) => b.score - a.score || b.tieBreak - a.tieBreak);
}

function chooseCandidate(signals) {
  const scored = scoreSignals(signals);
  const top = scored.find((signal) => !signal.covered);
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

  if (top.id === 'isolated-cron-tooling-failure') {
    return {
      title: 'Isolated cron tool-policy preflight',
      state: 'ready-small',
      payoff: 'Catches stale isolated-job tool allowlists before symptoms look like unrelated file or cron failures.',
      risk: 'low; deterministic fixture or preflight script only',
      verification: 'npm run self-evolution:research && npm run check:self-improvement-readiness',
      nextAction: 'Add a local fixture or preflight that flags isolated cron jobs missing required OpenClaw tools before they run.'
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

  if (top.id === 'memory-promotion-hygiene') {
    return {
      title: 'Long-term memory promotion hygiene check',
      state: 'ready-small',
      payoff: 'Prevents routine heartbeat, cron and validation logs from being promoted into durable memory when they should stay in daily notes.',
      risk: 'low; deterministic local check or fixture only',
      verification: 'npm run self-evolution:research && npm run check:self-improvement-readiness',
      nextAction: 'Add a small memory-promotion fixture or checklist that accepts distilled durable facts and rejects raw routine validation chunks.'
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
      score: Number((signal.score ?? signal.priority * signal.hits.reduce((sum, hit) => sum + (hit.weight || 1), 0)).toFixed(2)),
      rawScore: Number((signal.rawScore ?? signal.priority * signal.hits.reduce((sum, hit) => sum + (hit.weight || 1), 0)).toFixed(2)),
      covered: signal.covered === true,
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
    const scoreDetail = signal.rawScore === signal.score ? `score ${signal.score}` : `score ${signal.score}, raw ${signal.rawScore}`;
    lines.push(`- ${signal.label}: ${signal.hits} (${scoreDetail})`);
    for (const hit of signal.evidence) {
      lines.push(`  - ${hit.text} (${hit.path}:${hit.line})`);
    }
  }

  return `${lines.join('\n')}\n`;
}

const signals = scoreSignals(collectSignals(sourceFiles()));
const report = buildReport(signals, chooseCandidate(signals));

const output = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : toMarkdown(report);

if (write) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
}

process.stdout.write(output);
