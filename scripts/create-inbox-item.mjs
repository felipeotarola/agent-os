#!/usr/bin/env node
import 'dotenv/config';
import { randomUUID } from 'node:crypto';

const bridgeUrl = process.env.AGENT_OS_BRIDGE_URL?.replace(/\/$/, '');
const token = process.env.AGENT_OS_BRIDGE_TOKEN;

const HELP = `Create or update a persistent Inbox Radar item via the Agent OS bridge.

Usage:
  node scripts/create-inbox-item.mjs --source <source> --title <title> [options]

Required:
  --source <source>          Producer namespace, e.g. cai.proactive, charles.handoff
  --title <title>            Short human-readable title

Options:
  --id <id>                  Stable id for idempotent updates (default: random UUID)
  --source-id <id>           Producer-local id for tracing/dedupe
  --kind <kind>              signal|review|approval|draft|handoff|task (default: signal)
  --status <status>          active|snoozed|handled|dismissed (default: active)
  --priority <0-100>         Higher sorts first (default: 50)
  --detail <text>            Longer context
  --href <path-or-url>       Target link (default: /dashboard/radar)
  --action-label <label>     CTA label (default: Open)
  --owner-agent-id <id>      Owning agent, e.g. cai
  --metadata <json>          JSON object merged into item metadata

Example:
  node scripts/create-inbox-item.mjs \\
    --id cai-learning-loop-review \\
    --source cai.proactive \\
    --source-id daily-learning \\
    --kind review \\
    --priority 70 \\
    --title "Review daily agent learning output" \\
    --detail "Daily learning loop created a reviewable result." \\
    --owner-agent-id cai
`;

const aliases = new Map([
  ['source-id', 'sourceId'],
  ['action-label', 'actionLabel'],
  ['owner-agent-id', 'ownerAgentId']
]);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);

    const rawKey = arg.slice(2);
    const key = aliases.get(rawKey) ?? rawKey;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${rawKey}`);
    values[key] = value;
    index += 1;
  }
  return values;
}

function parseMetadata(value) {
  if (!value) return undefined;
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--metadata must be a JSON object');
  }
  return parsed;
}

function parsePriority(value) {
  if (!value) return 50;

  const priority = Number(value);
  if (!Number.isFinite(priority) || priority < 0 || priority > 100) {
    throw new Error('--priority must be a number from 0 to 100');
  }
  return priority;
}

function buildPayload(values) {
  const source = values.source?.trim();
  const title = values.title?.trim();
  if (!source || !title) throw new Error('--source and --title are required');

  return {
    id: values.id?.trim() || randomUUID(),
    source,
    sourceId: values.sourceId?.trim() || '',
    kind: values.kind?.trim() || 'signal',
    status: values.status?.trim() || 'active',
    priority: parsePriority(values.priority),
    title,
    detail: values.detail?.trim() || '',
    href: values.href?.trim() || '/dashboard/radar',
    actionLabel: values.actionLabel?.trim() || 'Open',
    ownerAgentId: values.ownerAgentId?.trim() || undefined,
    metadata: parseMetadata(values.metadata)
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  const payload = buildPayload(args);
  if (!bridgeUrl || !token) {
    console.error('Agent OS bridge is not configured. Set AGENT_OS_BRIDGE_URL and AGENT_OS_BRIDGE_TOKEN.');
    process.exit(2);
  }

  const response = await fetch(`${bridgeUrl}/inbox/items`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    console.error(`Bridge request failed ${response.status}: ${await response.text()}`);
    process.exit(1);
  }

  const item = await response.json();
  console.log(`Inbox item upserted: ${item.id}`);
  console.log(`${item.priority} · ${item.kind} · ${item.title}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
