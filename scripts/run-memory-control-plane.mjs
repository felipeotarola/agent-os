#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseControlPlaneArgs(argv) {
  const values = { limit: 5, minScore: 35, signalsPerSession: 8, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    const key = { '--limit': 'limit', '--min-score': 'minScore', '--signals': 'signalsPerSession' }[arg];
    if (!key) throw new Error(`Unknown argument: ${arg}`);
    const value = Number(argv[++index]);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${arg} requires a positive integer`);
    values[key] = value;
  }
  if (values.limit > 10) throw new Error('--limit must be <= 10');
  if (values.signalsPerSession > 12) throw new Error('--signals must be <= 12');
  return values;
}

export function resolveBridgeToken(env = process.env) {
  if (env.AGENT_OS_BRIDGE_TOKEN) return env.AGENT_OS_BRIDGE_TOKEN.trim();
  const tokenFile = env.AGENT_OS_BRIDGE_TOKEN_FILE;
  if (tokenFile && existsSync(tokenFile)) return readFileSync(tokenFile, 'utf8').trim();
  return '';
}

export async function runMemoryControlPlane({ argv = process.argv.slice(2), env = process.env, fetchImpl = fetch } = {}) {
  const payload = parseControlPlaneArgs(argv);
  const token = resolveBridgeToken(env);
  if (!token) throw new Error('Agent OS bridge token is not configured');
  const bridgeUrl = (env.AGENT_OS_BRIDGE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
  const response = await fetchImpl(`${bridgeUrl}/knowledge/sessions/harvest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Memory control plane failed (${response.status})`);
  const result = await response.json();
  const plannedSessions = payload.dryRun ? (result.preview ?? []) : (result.imported ?? []);
  const signals = plannedSessions.flatMap((entry) => entry.signals ?? []);
  return {
    ok: true,
    dryRun: payload.dryRun,
    selectedSessions: result.selected?.length ?? 0,
    importedSessions: result.imported?.length ?? 0,
    previewedSessions: result.preview?.length ?? 0,
    routedSignals: signals.length,
    exceptions: signals.filter((signal) => signal.reviewRequired).length,
    routes: Object.fromEntries(
      [...new Set(signals.map((signal) => signal.route))].sort().map((route) => [route, signals.filter((signal) => signal.route === route).length])
    )
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runMemoryControlPlane(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Memory control plane failed');
    process.exitCode = 1;
  }
}
