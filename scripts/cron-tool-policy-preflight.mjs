#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const TOOL_FAMILIES = {
  file_access: {
    hints: [
      /\bread\b[^.\n]*(?:file|\/root\/|workspace|repo)/i,
      /\binspect\b[^.\n]*(?:repo|files|worktree|workspace)/i,
      /\brun\b[^.\n]*(?:npm|git|rg|command|script)/i,
      /\bverify\b[^.\n]*(?:with|using)\b[^.\n]*(?:npm|git|command)/i
    ],
    aliases: ['file_access', 'shell', 'exec', 'exec_command', 'functions.exec_command']
  },
  message: {
    hints: [/\bTelegram\b/i, /\bmessage\s*\(/i, /\bchannel=["']telegram["']/i],
    aliases: ['message']
  }
};

function promptText(payload) {
  return [
    payload.prompt,
    payload.message,
    payload.currentUserRequest,
    payload.current_user_request,
    payload.description
  ]
    .filter(Boolean)
    .join('\n');
}

function allowedTools(payload) {
  const value = payload.toolsAllow ?? payload.tools_allow ?? payload.allowedTools;
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return new Set(value.map((tool) => String(tool)));
}

export function requiredToolFamilies(payload) {
  const text = promptText(payload);
  return Object.entries(TOOL_FAMILIES)
    .filter(([, family]) => family.hints.some((hint) => hint.test(text)))
    .map(([id]) => id);
}

export function missingRequiredToolFamilies(payload) {
  const allow = allowedTools(payload);
  if (!allow) return [];

  return requiredToolFamilies(payload).filter((id) => {
    const family = TOOL_FAMILIES[id];
    return !family.aliases.some((alias) => allow.has(alias));
  });
}

export function assertFixtures() {
  const fixtures = [
    {
      id: 'proactive-cron-with-message-only-is-missing-file-access',
      payload: {
        prompt: 'Read /root/.openclaw/workspace/PROACTIVE.md, inspect repo state, run npm checks, then send a Telegram update.',
        toolsAllow: ['message']
      },
      expectedMissing: ['file_access']
    },
    {
      id: 'unrestricted-payload-is-ok',
      payload: {
        prompt: 'Read /root/.openclaw/workspace/HEARTBEAT.md and send Telegram only if useful.'
      },
      expectedMissing: []
    },
    {
      id: 'file-and-message-tools-are-ok',
      payload: {
        prompt: 'Read workspace docs and call message(action="send", channel="telegram").',
        toolsAllow: ['file_access', 'message']
      },
      expectedMissing: []
    }
  ];

  const results = fixtures.map((fixture) => {
    const actual = missingRequiredToolFamilies(fixture.payload);
    const passed =
      actual.length === fixture.expectedMissing.length &&
      fixture.expectedMissing.every((item) => actual.includes(item));
    return { id: fixture.id, passed, expectedMissing: fixture.expectedMissing, actualMissing: actual };
  });

  return {
    suite: 'cron-tool-policy-preflight-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    fixtures: assertFixtures()
  };

  console.log(JSON.stringify(report, null, 2));
  if (report.fixtures.failed.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
