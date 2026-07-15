#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

const bridgePath = new URL('../bridge/server.mjs', import.meta.url);
const source = readFileSync(bridgePath, 'utf8');
const runtimeMode = process.argv.includes('--runtime');
const candidates = process.env.OPENCLAW_CLI_PATH
  ? [process.env.OPENCLAW_CLI_PATH]
  : [
      '/usr/lib/node_modules/openclaw/dist/index.js',
      '/usr/lib/node_modules/openclaw/dist/entry.js'
    ];

if (!source.includes("openclawJson(['agents', 'list', '--json']")) {
  throw new Error('Bridge agent inventory must come from the live OpenClaw CLI');
}

if (!source.includes("source: 'openclaw-cli:agents-list'")) {
  throw new Error('Bridge must label the live OpenClaw agent inventory source');
}

const registryRequirements = [
  "contract: 'agent-os.openclaw-agent-registry.v1'",
  "openclawJson(['config', 'get', 'bindings', '--json']",
  'async function runtimeAgentIds()',
  'sessionCandidateFiles(agentIds)',
  'memoryCandidateFiles(agentIds)',
  'sessions: agentIds.map(assistantSessionStatus)'
];
for (const requirement of registryRequirements) {
  if (!source.includes(requirement)) {
    throw new Error(`P1 shared agent registry contract missing: ${requirement}`);
  }
}

for (const staleList of [
  'SESSION_HARVEST_AGENTS',
  'MEMORY_HARVEST_AGENTS',
  'ASSISTANT_READINESS_AGENTS'
]) {
  if (source.includes(staleList)) throw new Error(`Static P1 agent list remains: ${staleList}`);
}

if (!source.includes('for (let attempt = 0; attempt < 2; attempt += 1)')) {
  throw new Error('Bridge OpenClaw JSON reads must retry one transient CLI/state failure');
}

for (const discoveryRequirement of [
  'const OPENCLAW_CLI_CANDIDATES = process.env.OPENCLAW_CLI_PATH',
  "'/usr/lib/node_modules/openclaw/dist/index.js'",
  "'/usr/lib/node_modules/openclaw/dist/entry.js'",
  'const OPENCLAW_CLI = OPENCLAW_CLI_CANDIDATES.find((candidate) => existsSync(candidate))',
  'OpenClaw CLI not found. Checked:'
]) {
  if (!source.includes(discoveryRequirement)) {
    throw new Error(`Bridge OpenClaw CLI discovery contract missing: ${discoveryRequirement}`);
  }
}

if (runtimeMode && !candidates.some((candidate) => existsSync(candidate))) {
  throw new Error(`No OpenClaw CLI candidate exists: ${candidates.join(', ')}`);
}

console.log(
  `OpenClaw runtime contract guard passed (${runtimeMode ? 'runtime' : 'static'} mode).`
);
