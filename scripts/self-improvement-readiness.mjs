#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFixtures as assertCronToolPolicyFixtures } from './cron-tool-policy-preflight.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.split('=');
  return [key, value];
}));

const repo = resolve(args.get('--repo') || repoRoot);
const runFixtures = args.get('--fixtures') !== 'false';
const pushExitCode = args.has('--push-exit-code') ? Number(args.get('--push-exit-code')) : undefined;
const pushStderr = args.get('--push-stderr');

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function readOptional(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function parseBranchStatus(statusLine = '') {
  const ahead = Number(statusLine.match(/\[ahead (\d+)/)?.[1] || 0);
  const behind = Number(statusLine.match(/behind (\d+)/)?.[1] || 0);
  const diverged = ahead > 0 && behind > 0;
  return { ahead, behind, diverged };
}

export function classifyReadiness(input) {
  const dirty = input.dirtyFiles > 0;
  const branch = parseBranchStatus(input.branchStatus);
  const pushBlocked = input.pushExitCode !== undefined && input.pushExitCode !== 0;

  if (dirty) {
    return {
      status: 'needs-local-work',
      localReady: false,
      publishReady: false,
      blocker: null,
      reason: 'worktree has uncommitted changes'
    };
  }

  if (branch.diverged || branch.behind > 0) {
    return {
      status: 'needs-sync',
      localReady: false,
      publishReady: false,
      blocker: 'upstream-sync',
      reason: 'branch is behind or diverged from upstream'
    };
  }

  if (pushBlocked) {
    return {
      status: 'local-ready-push-blocked',
      localReady: true,
      publishReady: false,
      blocker: 'git-push',
      reason: 'local commit is ready, but publish failed externally'
    };
  }

  if (branch.ahead > 0) {
    return {
      status: 'local-ready-needs-push',
      localReady: true,
      publishReady: true,
      blocker: null,
      reason: 'local commit is ahead of upstream and ready to publish'
    };
  }

  return {
    status: 'synced',
    localReady: true,
    publishReady: false,
    blocker: null,
    reason: 'branch is already synced with upstream'
  };
}

export function classifyMemoryPromotionCandidate(text) {
  const normalized = String(text ?? '').replace(/[ \t]+/g, ' ').trim();
  const lower = normalized.toLowerCase();

  const rawOperationalLog = [
    /^> agent-os@/m,
    /\bbrief:heartbeat\b/,
    /\bheartbeat route\b/i,
    /\bstate file:\s*\/root\//i,
    /\bnpm run (check|self-evolution|brief):/i,
    /\bprocess exited with code \d+\b/i,
    /\boriginal token count:\s*\d+\b/i,
    /\bwall time:\s*\d/i
  ].some((pattern) => pattern.test(normalized));

  const transientStatus = [
    /\bgit status\b/i,
    /\bworktree has .*changes\b/i,
    /\blocal worktree changes\b/i,
    /\bstale push-blocker snapshot\b/i,
    /\broutine (heartbeat|cron|validation)\b/i,
    /\bHEARTBEAT_OK\b/
  ].some((pattern) => pattern.test(normalized));

  const durableSignal = [
    /\bFelipe (corrected|clarified|decided|prefers|wants)\b/i,
    /\bdurable (decision|preference|lesson|rule)\b/i,
    /\bdo not mention Agent OS in QAA\b/i,
    /\bQAA is the platform\b/i,
    /\bSladdis is the agent\b/i
  ].some((pattern) => pattern.test(normalized));

  if (!normalized) {
    return {
      status: 'reject',
      promote: false,
      reason: 'empty memory candidate'
    };
  }

  if (rawOperationalLog || transientStatus) {
    return {
      status: 'reject',
      promote: false,
      reason: rawOperationalLog
        ? 'raw operational log belongs in daily notes or task evidence'
        : 'transient status belongs in daily notes, not long-term memory'
    };
  }

  if (durableSignal && lower.length <= 900) {
    return {
      status: 'accept',
      promote: true,
      reason: 'distilled durable preference, decision, or lesson'
    };
  }

  return {
    status: 'review',
    promote: false,
    reason: 'candidate needs human/agent distillation before MEMORY.md'
  };
}

export function classifyResearchTaskCoverage(markdown, taskId) {
  const text = String(markdown ?? '');
  const marker = `### \`${taskId}\``;
  const start = text.indexOf(marker);
  const bodyStart = start >= 0 ? start + marker.length : -1;
  const nextTask = bodyStart >= 0 ? text.indexOf('\n### `', bodyStart) : -1;
  const end = nextTask >= 0 ? nextTask : text.length;
  const section = bodyStart >= 0 ? text.slice(bodyStart, end) : '';
  const checks = {
    hasTask: section.length > 0,
    hasAcceptanceCriteria: /## Acceptance criteria\b/.test(section),
    hasGuardrails: /## Guardrails\b/.test(section),
    hasEvidence: /## Evidence\b/.test(section),
    namesStandaloneCommand: /\bnpm run [\w:-]+/.test(section),
    mentionsVerifyWiring: /\bnpm run verify\b/.test(section)
  };
  const missing = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);

  if (missing.length > 0) {
    return {
      status: 'reject',
      covered: false,
      missing
    };
  }

  return {
    status: 'accept',
    covered: true,
    missing: []
  };
}

export function classifyGitPushCredentialPolicy(scriptText) {
  const text = String(scriptText ?? '');
  const checks = {
    hasAgentOsSecretsDir: /AGENT_OS_SECRETS_DIR/.test(text) && /secrets['"], ['"]agent-os/.test(text),
    acceptsAgentOsTokenEnv: /AGENT_OS_GITHUB_TOKEN/.test(text),
    acceptsFallbackGitHubTokenEnv: /GITHUB_TOKEN/.test(text) && /GH_TOKEN/.test(text),
    usesAskpass: /GIT_ASKPASS/.test(text) && /askpass\.sh/.test(text),
    disablesCredentialHelper: /credential\.helper=/.test(text),
    disablesTerminalPrompt: /GIT_TERMINAL_PROMPT:\s*['"]0['"]/.test(text),
    avoidsShellCredentialHelperOnly: !/credential-cache|cache --timeout|store --file|git-credential-store/.test(text)
  };
  const missing = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);

  if (missing.length > 0) {
    return {
      status: 'reject',
      credentialAware: false,
      missing
    };
  }

  return {
    status: 'accept',
    credentialAware: true,
    missing: []
  };
}

export function classifyToolCallApprovalReceipt(receipt) {
  const value = receipt && typeof receipt === 'object' ? receipt : {};
  const freshnessContext = {
    now: new Date('2026-07-06T10:00:00.000Z'),
    policyVersion: 'tool-call-policy.v0',
    agentGraphVersion: 'agent-os-local.v0',
    toolSchemaVersion: 'message-tool.v0'
  };
  const hasSourceContext = Boolean(value.sourceRunId || value.sourceSessionKey);
  const parameters =
    value.parameters && typeof value.parameters === 'object' && !Array.isArray(value.parameters)
      ? value.parameters
      : null;
  const parameterCount = parameters ? Object.keys(parameters).length : 0;
  const executableDecision = ['approved', 'edited'].includes(value.reviewerDecision);
  const editedParameters =
    value.editedParameters && typeof value.editedParameters === 'object' && !Array.isArray(value.editedParameters)
      ? value.editedParameters
      : null;
  const freshnessEnvelope =
    value.freshnessEnvelope && typeof value.freshnessEnvelope === 'object' && !Array.isArray(value.freshnessEnvelope)
      ? value.freshnessEnvelope
      : null;
  const expiresAt = freshnessEnvelope ? new Date(String(freshnessEnvelope.expiresAt ?? '')) : null;
  const lastRevalidatedAt =
    freshnessEnvelope?.lastRevalidatedAt === null
      ? null
      : freshnessEnvelope?.lastRevalidatedAt
        ? new Date(String(freshnessEnvelope.lastRevalidatedAt))
        : undefined;
  const freshnessChecks = {
    hasFreshnessEnvelope: Boolean(freshnessEnvelope),
    hasFutureExpiry: Boolean(expiresAt && !Number.isNaN(expiresAt.valueOf()) && expiresAt > freshnessContext.now),
    matchesPolicyVersion: freshnessEnvelope?.policyVersion === freshnessContext.policyVersion,
    matchesAgentGraphVersion: freshnessEnvelope?.agentGraphVersion === freshnessContext.agentGraphVersion,
    matchesToolSchemaVersion: freshnessEnvelope?.toolSchemaVersion === freshnessContext.toolSchemaVersion,
    preApprovalGuardrailPassed: freshnessEnvelope?.preApprovalGuardrailStatus === 'passed',
    hasValidLastRevalidatedAt:
      freshnessEnvelope?.lastRevalidatedAt === null ||
      Boolean(lastRevalidatedAt && !Number.isNaN(lastRevalidatedAt.valueOf()))
  };
  const freshnessMissing = executableDecision
    ? Object.entries(freshnessChecks)
        .filter(([, passed]) => !passed)
        .map(([key]) => key)
    : [];
  const checks = {
    hasContract: value.contract === 'agent-os.tool-call-approval-receipt.v0',
    hasToolName: typeof value.toolName === 'string' && value.toolName.includes('.'),
    hasRiskClass: typeof value.riskClass === 'string' && value.riskClass.length > 0,
    hasRequestedAction: typeof value.requestedAction === 'string' && value.requestedAction.length > 0,
    hasParameters: parameterCount > 0,
    hasParameterHash: /^sha256-[a-z0-9-]+/i.test(String(value.parameterHash ?? '')),
    hasReviewerDecision: ['pending', 'approved', 'denied', 'edited'].includes(value.reviewerDecision),
    hasExecutionStatus: ['not-executed', 'executed', 'cancelled', 'failed', 'superseded'].includes(
      value.executionStatus
    ),
    hasSourceContext,
    editedDecisionHasEditedParameters: value.reviewerDecision !== 'edited' || Boolean(editedParameters)
  };
  const missing = [
    ...Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([key]) => key),
    ...freshnessMissing
  ];

  if (missing.length > 0) {
    return {
      status: 'reject',
      executable: false,
      missing
    };
  }

  return {
    status: 'accept',
    executable: executableDecision,
    missing: []
  };
}

function currentRepoInput() {
  const status = git(['status', '--branch', '--short']);
  const [branchStatus = '', ...files] = status.split(/\r?\n/).filter(Boolean);
  return {
    repo,
    branchStatus,
    dirtyFiles: files.length,
    pushExitCode,
    pushStderr
  };
}

function assertGitPushCredentialPolicy() {
  const goodScript = `
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/root/.openclaw';
const secretsDir = process.env.AGENT_OS_SECRETS_DIR || join(OPENCLAW_HOME, 'secrets', 'agent-os');
const tokenNames = ['AGENT_OS_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'];
await writeFile('askpass.sh', '#!/bin/sh');
spawn('git', ['-c', 'credential.helper=', 'push'], {
  env: { ...process.env, GIT_ASKPASS: 'askpass.sh', GIT_TERMINAL_PROMPT: '0' }
});
`;
  const staleShellCredentialScript = `
const tokenNames = ['GITHUB_TOKEN'];
spawn('git', ['push'], {
  env: { ...process.env, GIT_TERMINAL_PROMPT: '1' }
});
// Relies on credential-cache instead of an Agent OS askpass/token file path.
`;
  const wrapper = readOptional(resolve(repo, 'scripts', 'git-push-agent-os-token.mjs'));
  const fixtures = [
    {
      id: 'accept-agent-os-token-askpass-wrapper',
      input: goodScript,
      expected: { status: 'accept', credentialAware: true }
    },
    {
      id: 'reject-stale-shell-credential-helper',
      input: staleShellCredentialScript,
      expected: { status: 'reject', credentialAware: false }
    },
    {
      id: 'repo-git-push-wrapper-is-credential-aware',
      input: wrapper,
      expected: { status: 'accept', credentialAware: true }
    }
  ];

  const results = fixtures.map((fixture) => {
    const actual = classifyGitPushCredentialPolicy(fixture.input);
    const passed = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value);
    return { id: fixture.id, passed, expected: fixture.expected, actual };
  });

  return {
    suite: 'git-push-credential-policy-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function assertToolCallApprovalReceipts() {
  const freshEnvelope = {
    expiresAt: '2026-07-06T10:15:00.000Z',
    policyVersion: 'tool-call-policy.v0',
    agentGraphVersion: 'agent-os-local.v0',
    toolSchemaVersion: 'message-tool.v0',
    preApprovalGuardrailStatus: 'passed',
    lastRevalidatedAt: '2026-07-06T10:01:00.000Z'
  };
  const exactPendingReceipt = {
    contract: 'agent-os.tool-call-approval-receipt.v0',
    sourceRunId: 'run_123',
    toolName: 'message.send',
    riskClass: 'external-message',
    requestedAction: 'Send one Telegram update to Felipe',
    parameters: {
      channel: 'telegram',
      target: '343551190',
      accountId: 'default',
      message: 'Kort svensk uppdatering.'
    },
    parameterHash: 'sha256-demo-hash',
    reviewerDecision: 'pending',
    freshnessEnvelope: freshEnvelope,
    executionStatus: 'not-executed'
  };
  const approvedReceipt = {
    ...exactPendingReceipt,
    reviewerDecision: 'approved'
  };
  const vagueChatApproval = {
    contract: 'agent-os.tool-call-approval-receipt.v0',
    sourceRunId: 'run_123',
    requestedAction: 'Felipe said ok, send it',
    reviewerDecision: 'approved',
    executionStatus: 'not-executed'
  };
  const editedWithoutParameters = {
    ...exactPendingReceipt,
    reviewerDecision: 'edited',
    editedParameters: null
  };
  const approvedWithoutFreshness = {
    ...approvedReceipt,
    freshnessEnvelope: null
  };
  const approvedExpired = {
    ...approvedReceipt,
    freshnessEnvelope: {
      ...freshEnvelope,
      expiresAt: '2026-07-06T09:59:00.000Z'
    }
  };
  const approvedPolicyDrift = {
    ...approvedReceipt,
    freshnessEnvelope: {
      ...freshEnvelope,
      policyVersion: 'tool-call-policy.old'
    }
  };
  const docs = readOptional(resolve(repo, 'docs', 'TOOL_CALL_APPROVAL_RECEIPTS.md'));

  const fixtures = [
    {
      id: 'accept-exact-pending-tool-call-receipt',
      input: exactPendingReceipt,
      expected: { status: 'accept', executable: false }
    },
    {
      id: 'accept-exact-approved-tool-call-receipt',
      input: approvedReceipt,
      expected: { status: 'accept', executable: true }
    },
    {
      id: 'reject-vague-chat-approval',
      input: vagueChatApproval,
      expected: { status: 'reject', executable: false }
    },
    {
      id: 'reject-edited-decision-without-edited-parameters',
      input: editedWithoutParameters,
      expected: { status: 'reject', executable: false }
    },
    {
      id: 'reject-approved-receipt-without-freshness-envelope',
      input: approvedWithoutFreshness,
      expected: { status: 'reject', executable: false }
    },
    {
      id: 'reject-expired-approved-receipt',
      input: approvedExpired,
      expected: { status: 'reject', executable: false }
    },
    {
      id: 'reject-policy-drift-approved-receipt',
      input: approvedPolicyDrift,
      expected: { status: 'reject', executable: false }
    }
  ];

  const results = fixtures.map((fixture) => {
    const actual = classifyToolCallApprovalReceipt(fixture.input);
    const passed = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value);
    return { id: fixture.id, passed, expected: fixture.expected, actual };
  });
  const docPatterns = [
    /agent-os\.tool-call-approval-receipt\.v0/,
    /metadata\.approvalReceipt/,
    /toolName/,
    /parameters/,
    /parameterHash/,
    /reviewerDecision/,
    /executionStatus/,
    /freshnessEnvelope/,
    /policyVersion/,
    /toolSchemaVersion/,
    /preApprovalGuardrailStatus/,
    /superseded/,
    /Vague approvals/
  ];
  const docPassed = docs.length > 0 && docPatterns.every((pattern) => pattern.test(docs));
  results.push({
    id: 'docs-define-tool-call-approval-receipts-v0',
    passed: docPassed,
    expected: { documented: true },
    actual: {
      documented: docPassed,
      missingPatterns: docPatterns.filter((pattern) => !pattern.test(docs)).map((pattern) => pattern.source)
    }
  });

  return {
    suite: 'tool-call-approval-receipts-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function assertResearchTaskCoverage() {
  const goodTask = `### \`eval-readiness-gap-coverage\`

## Acceptance criteria

- Name the command: \`npm run check:self-improvement-readiness\`.
- Add the guard to \`npm run verify\` after standalone pass.

## Guardrails

- Local deterministic checks only.

## Evidence

- Research lane selected an eval/readiness gap.
`;
  const badTask = `### \`eval-readiness-gap-coverage\`

Loose idea without acceptance criteria or verification.
`;
  const tasks = readOptional(resolve(repo, 'docs', 'TASKS.md'));
  const fixtures = [
    {
      id: 'accept-scoped-eval-readiness-task',
      input: goodTask,
      expected: { status: 'accept', covered: true }
    },
    {
      id: 'reject-unscoped-eval-readiness-task',
      input: badTask,
      expected: { status: 'reject', covered: false }
    },
    {
      id: 'repo-eval-readiness-task-is-covered',
      input: tasks,
      expected: { status: 'accept', covered: true }
    }
  ];

  const results = fixtures.map((fixture) => {
    const actual = classifyResearchTaskCoverage(fixture.input, 'eval-readiness-gap-coverage');
    const passed = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value);
    return { id: fixture.id, passed, expected: fixture.expected, actual };
  });

  return {
    suite: 'research-task-coverage-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function assertFelipeCorrectionRegressionGuardCoverage() {
  const tasks = readOptional(resolve(repo, 'docs', 'TASKS.md'));
  const packageJson = readOptional(resolve(repo, 'package.json'));
  const qaaGuard = readOptional(resolve(repo, 'scripts', 'qaa-positioning-guard.mjs'));
  const radar = readOptional(resolve(repo, 'docs', 'AGENT_OS_RESEARCH_RADAR.md'));
  const taskCoverage = classifyResearchTaskCoverage(tasks, 'felipe-correction-regression-guard');
  const checks = {
    taskIsScoped: taskCoverage.covered,
    qaaGuardDefinesForbiddenFrames:
      /agent-os-routing/.test(qaaGuard) &&
      /qaa-as-agent-memory/.test(qaaGuard) &&
      /generic-product-frame/.test(qaaGuard) &&
      /old-ai-testing-enemy/.test(qaaGuard),
    qaaGuardHasAllowedContrastFixtures:
      /accept-coworker-workbench-positioning/.test(qaaGuard) &&
      /accept-chatbot-as-contrast/.test(qaaGuard),
    packageHasStandaloneCommand: /"check:qaa-positioning": "node scripts\/qaa-positioning-guard\.mjs"/.test(packageJson),
    packageVerifyRunsGuard: /"verify": ".*npm run check:qaa-positioning/.test(packageJson),
    radarRecordsImplementation:
      /QAA\/Testbench positioning regression guard/.test(radar) &&
      /State: `implemented-local`/.test(radar)
  };
  const missing = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);
  const result = {
    id: 'repo-felipe-correction-regression-guard-is-covered',
    passed: missing.length === 0,
    taskCoverage,
    missing
  };

  return {
    suite: 'felipe-correction-regression-guard-v0',
    cases: 1,
    failed: result.passed ? [] : [result.id],
    results: [result]
  };
}

function assertMemoryPromotionHygiene() {
  const fixtures = [
    {
      id: 'accept-distilled-qaa-positioning',
      input:
        'Felipe clarified a durable product rule: do not mention Agent OS in QAA materials. QAA is the platform/workspace; Sladdis is the agent using QAA directly.',
      expected: { status: 'accept', promote: true }
    },
    {
      id: 'reject-raw-heartbeat-output',
      input:
        '> agent-os@1.0.0 brief:heartbeat\n## Heartbeat Route\n- State file: /root/.openclaw/workspace/memory/heartbeat-state.json\n- HEARTBEAT_OK',
      expected: { status: 'reject', promote: false }
    },
    {
      id: 'reject-stale-worktree-status',
      input:
        'Active Signals: Agent OS has 3 local worktree changes: M .gitignore; M docs/AGENT_OS_RESEARCH_RADAR.md; ?? remotion/',
      expected: { status: 'reject', promote: false }
    },
    {
      id: 'review-undistilled-idea',
      input: 'Maybe build a smarter memory harvester later if the dashboard feels noisy.',
      expected: { status: 'review', promote: false }
    }
  ];

  const results = fixtures.map((fixture) => {
    const actual = classifyMemoryPromotionCandidate(fixture.input);
    const passed = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value);
    return { id: fixture.id, passed, expected: fixture.expected, actual };
  });

  return {
    suite: 'memory-promotion-hygiene-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function assertFixtures() {
  const fixtures = [
    {
      id: 'clean-ahead-push-blocked',
      input: { branchStatus: '## main...origin/main [ahead 1]', dirtyFiles: 0, pushExitCode: 128 },
      expected: { status: 'local-ready-push-blocked', localReady: true, publishReady: false, blocker: 'git-push' }
    },
    {
      id: 'dirty-worktree',
      input: { branchStatus: '## main...origin/main', dirtyFiles: 2 },
      expected: { status: 'needs-local-work', localReady: false, publishReady: false, blocker: null }
    },
    {
      id: 'clean-ahead',
      input: { branchStatus: '## main...origin/main [ahead 1]', dirtyFiles: 0 },
      expected: { status: 'local-ready-needs-push', localReady: true, publishReady: true, blocker: null }
    },
    {
      id: 'synced',
      input: { branchStatus: '## main...origin/main', dirtyFiles: 0 },
      expected: { status: 'synced', localReady: true, publishReady: false, blocker: null }
    },
    {
      id: 'behind',
      input: { branchStatus: '## main...origin/main [behind 1]', dirtyFiles: 0 },
      expected: { status: 'needs-sync', localReady: false, publishReady: false, blocker: 'upstream-sync' }
    }
  ];

  const results = fixtures.map((fixture) => {
    const actual = classifyReadiness(fixture.input);
    const passed = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value);
    return { id: fixture.id, passed, expected: fixture.expected, actual };
  });

  return {
    suite: 'self-improvement-readiness-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function assertAutonomyLanes() {
  const required = [
    {
      id: 'operating-model-doc',
      path: resolve(repo, 'docs', 'AUTONOMOUS_SELF_EVOLUTION.md'),
      patterns: [/Lane 1: Research-only/, /Lane 2: Prioritize/, /Lane 3: Implement/]
    },
    {
      id: 'research-lane-script',
      path: resolve(repo, 'scripts', 'self-evolution-research-lane.mjs'),
      patterns: [/lane: 'research-only'/, /chooseCandidate/, /ready-small/]
    },
    {
      id: 'research-lane-correction-dedup',
      path: resolve(repo, 'scripts', 'self-evolution-research-lane.mjs'),
      patterns: [/felipeCorrectionFollowUpIsCovered/, /coveredBySignal/, /\['felipe-correction', felipeCorrectionFollowUpIsCovered\(\)\]/]
    },
    {
      id: 'package-research-command',
      path: resolve(repo, 'package.json'),
      patterns: [/"self-evolution:research": "node scripts\/self-evolution-research-lane\.mjs"/]
    },
    {
      id: 'agent-eval-mandate-case',
      path: resolve(repo, 'evals', 'agent-behavior-v0.json'),
      patterns: [/"autonomous-self-evolution-mandate"/, /"research lane"/, /"implementation lane"/]
    },
    {
      id: 'cron-tool-policy-preflight',
      path: resolve(repo, 'scripts', 'cron-tool-policy-preflight.mjs'),
      patterns: [/cron-tool-policy-preflight-v0/, /toolsAllow/, /missingRequiredToolFamilies/]
    }
  ];

  const results = required.map((item) => {
    const text = existsSync(item.path) ? readFileSync(item.path, 'utf8') : '';
    const passed = text.length > 0 && item.patterns.every((pattern) => pattern.test(text));
    return {
      id: item.id,
      passed,
      path: item.path,
      missingPatterns: item.patterns.filter((pattern) => !pattern.test(text)).map((pattern) => pattern.source)
    };
  });

  return {
    suite: 'autonomous-self-evolution-lanes-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function assertCronToolPolicy() {
  return assertCronToolPolicyFixtures();
}

const report = {
  generatedAt: new Date().toISOString(),
  repo,
  current: classifyReadiness(currentRepoInput()),
  fixtures: runFixtures ? assertFixtures() : undefined,
  gitPushCredentialPolicy: runFixtures ? assertGitPushCredentialPolicy() : undefined,
  toolCallApprovalReceipts: runFixtures ? assertToolCallApprovalReceipts() : undefined,
  memoryPromotionHygiene: runFixtures ? assertMemoryPromotionHygiene() : undefined,
  researchTaskCoverage: runFixtures ? assertResearchTaskCoverage() : undefined,
  felipeCorrectionRegressionGuardCoverage: runFixtures ? assertFelipeCorrectionRegressionGuardCoverage() : undefined,
  autonomyLanes: runFixtures ? assertAutonomyLanes() : undefined,
  cronToolPolicy: runFixtures ? assertCronToolPolicy() : undefined
};

console.log(JSON.stringify(report, null, 2));

if (
  report.fixtures?.failed.length > 0 ||
  report.gitPushCredentialPolicy?.failed.length > 0 ||
  report.toolCallApprovalReceipts?.failed.length > 0 ||
  report.memoryPromotionHygiene?.failed.length > 0 ||
  report.researchTaskCoverage?.failed.length > 0 ||
  report.felipeCorrectionRegressionGuardCoverage?.failed.length > 0 ||
  report.autonomyLanes?.failed.length > 0 ||
  report.cronToolPolicy?.failed.length > 0
) process.exit(1);
