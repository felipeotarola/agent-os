#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseControlPlaneArgs(argv) {
  const values = { limit: 5, minScore: 35, signalsPerSession: 8, dryRun: false, backfill: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    if (arg === '--backfill') {
      values.backfill = true;
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
  if (values.dryRun && values.backfill) throw new Error('--dry-run and --backfill cannot be combined');
  return values;
}

export function watermarkPath(env = process.env) {
  return env.AGENT_OS_MEMORY_CONTROL_PLANE_STATE_FILE || '/root/.openclaw/state/memory-control-plane-watermark.json';
}

export function readWatermark(file) {
  if (!existsSync(file)) return null;
  const value = JSON.parse(readFileSync(file, 'utf8'))?.since;
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error('Invalid memory control-plane watermark');
  return value;
}

export function writeWatermark(file, since) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ since }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

export function resolveBridgeToken(env = process.env) {
  if (env.AGENT_OS_BRIDGE_TOKEN) return env.AGENT_OS_BRIDGE_TOKEN.trim();
  const tokenFile = env.AGENT_OS_BRIDGE_TOKEN_FILE;
  if (tokenFile && existsSync(tokenFile)) return readFileSync(tokenFile, 'utf8').trim();
  return '';
}

export async function runMemoryControlPlane({ argv = process.argv.slice(2), env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  const payload = parseControlPlaneArgs(argv);
  const token = resolveBridgeToken(env);
  if (!token) throw new Error('Agent OS bridge token is not configured');
  const bridgeUrl = (env.AGENT_OS_BRIDGE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
  const stateFile = watermarkPath(env);
  const startedAt = now().toISOString();
  const previousWatermark = readWatermark(stateFile);
  if (!payload.dryRun && !payload.backfill && !previousWatermark) {
    writeWatermark(stateFile, startedAt);
    return {
      ok: true,
      dryRun: false,
      initializedWatermark: true,
      selectedSessions: 0,
      importedSessions: 0,
      previewedSessions: 0,
      routedSignals: 0,
      exceptions: 0,
      routes: {}
    };
  }
  const bridgePayload = {
    ...payload,
    ...(previousWatermark && !payload.backfill ? { since: previousWatermark } : {})
  };
  const response = await fetchImpl(`${bridgeUrl}/knowledge/sessions/harvest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(bridgePayload)
  });
  if (!response.ok) throw new Error(`Memory control plane failed (${response.status})`);
  const result = await response.json();
  if (!payload.dryRun) writeWatermark(stateFile, startedAt);
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
