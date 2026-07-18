const SENSITIVE = /\b(password|token|secret|api[_ -]?key|authorization|bearer|cookie|card number|account number|personnummer|bank|otp|2fa|private key|health|diagnos)/i;
const CONTRADICTION = /\b(but actually|correction|ignore previous|instead of|contradict|rättelse|nej,?\s|inte längre|ersätt)/i;
const PREFERENCE = /\b(prefer|preference|vill ha|jag vill|always|never|alltid|aldrig|strategy|strategi|policy|regel)/i;
const CLIPPED_ENDING = /(?:\b(?:and|or|but|because|that|which|to|with|for|och|eller|men|att|som|med|för|eftersom)|[,;:–—-])$/i;

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MEMORY_ROUTES = [
  'daily-memory',
  'long-term-memory',
  'lesson-candidate',
  'task',
  'knowledge-wiki',
  'discard'
];

export function isCompleteMemorySummary(text) {
  const value = String(text ?? '').trim();
  if (value.length < 24) return false;
  if (/\.{3}$|…$/.test(value)) return false;
  // Harvested transcript chunks are capped at a few hundred characters. A long
  // chunk without terminal punctuation is therefore much more likely to be a
  // sliced response than a standalone memory summary.
  if (value.length >= 300 && !/[.!?…][\])}"'’”`*_]*$/.test(value)) return false;
  return !CLIPPED_ENDING.test(value);
}

function semanticTokens(text) {
  return new Set(
    String(text ?? '')
      .toLocaleLowerCase('sv')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4)
  );
}

export function isSemanticallyCovered(summary, existingText, threshold = 0.72) {
  const candidate = semanticTokens(summary);
  if (candidate.size < 4) return false;
  const existing = semanticTokens(existingText);
  let overlap = 0;
  for (const token of candidate) if (existing.has(token)) overlap += 1;
  return overlap / candidate.size >= threshold;
}

export function isExplicitTaskIntent(text) {
  const value = String(text ?? '').trim();
  return (
    /^(?:[-*]\s*)?(?:TODO|Next step|Nästa steg)\s*:/i.test(value) ||
    /^(?:[-*]\s*)?\[[ xX]\]\s+\S/.test(value) ||
    /^(?:[-*]\s*)?(?:Action item|Åtgärdspunkt)\s*:/i.test(value) ||
    /^(?:please|kan du|could you|would you)\b/i.test(value) ||
    /^(?:implement|implementera|fix|fixa|create|skapa|update|uppdatera|run|kör)\b/i.test(value) ||
    /^(?:User|Human|Felipe)\s*:\s*(?:please|kan du|could you|would you|implementera|skapa|fixa|uppdatera|kör|gör)\b/i.test(value) ||
    /^(?:Felipe asked|User requested)\s+(?:to\s+)?\S/i.test(value)
  );
}

export function isCandidateFresh({ mtimeMs }, { since, backfill = false, dryRun = false } = {}) {
  if (backfill || dryRun) return true;
  const sinceMs = Date.parse(String(since ?? ''));
  return Number.isFinite(sinceMs) && Number(mtimeMs) > sinceMs;
}

export function isTransportEnvelopeLine(line) {
  const value = String(line ?? '').trim();
  if (!value) return false;
  if (value.startsWith('{') || value.startsWith('[')) return true;
  if (/^(data|event):/i.test(value)) {
    const payload = value.replace(/^(data|event):\s*/i, '');
    if (payload.startsWith('{') || payload.startsWith('[')) return true;
  }
  if (/\b(app[-_ ]server|transport envelope|trajectory|checkpoint)\b/i.test(value)) return true;
  return false;
}

export function isEligibleSessionArtifactName(name) {
  const value = String(name ?? '');
  return (
    /\.(md|markdown)$/i.test(value) &&
    !/trajectory|checkpoint|backup|app[-_]?server|transport|envelope/i.test(value)
  );
}

export function classifyMemorySignal(signal) {
  const text = String(signal?.summary ?? '').trim();
  const type = String(signal?.type ?? 'session-signal');
  const reasons = [];
  let route = 'daily-memory';
  let confidence = 0.82;

  if (text.length < 24 || /\b(heartbeat_ok|no change|status only|maybe later)\b/i.test(text)) {
    route = 'discard';
    confidence = 0.96;
    reasons.push('empty-or-transient');
  } else if (type === 'todo' && isExplicitTaskIntent(text)) {
    route = 'task';
    confidence = 0.9;
    reasons.push('explicit-action');
  } else if (type === 'technical-lesson' || /\b(lesson|learned|must|guardrail|regression)\b/i.test(text)) {
    route = 'lesson-candidate';
    confidence = 0.86;
    reasons.push('reusable-behaviour');
  } else if (type === 'preference' || type === 'decision') {
    route = 'long-term-memory';
    confidence = type === 'decision' ? 0.84 : 0.78;
    reasons.push('durable-context');
  } else if (type === 'product-context' || /\b(research|source|document|paper|wiki)\b/i.test(text)) {
    route = 'knowledge-wiki';
    confidence = 0.84;
    reasons.push('domain-knowledge');
  } else {
    reasons.push('episodic-context');
  }

  const exceptionReasons = [];
  if (SENSITIVE.test(text)) exceptionReasons.push('sensitive');
  if (CONTRADICTION.test(text)) exceptionReasons.push('contradictory');
  if (PREFERENCE.test(text) && ['preference', 'decision'].includes(type))
    exceptionReasons.push('strategy-or-preference-change');
  if (route !== 'discard' && !isCompleteMemorySummary(text)) exceptionReasons.push('possibly-clipped-summary');
  if (confidence < 0.8) exceptionReasons.push('low-confidence');

  return {
    route,
    confidence,
    reasons,
    reviewRequired: exceptionReasons.length > 0,
    exceptionReasons
  };
}

export function routedKnowledgeStatus(classification) {
  if (classification.reviewRequired) return 'reviewed';
  if (classification.route === 'knowledge-wiki') return 'extracted';
  if (classification.route === 'discard') return 'archived';
  return 'promoted';
}

export function previewMemoryRoute(signal) {
  const classification = classifyMemorySignal(signal);
  const fileRoutes = new Set(['daily-memory', 'long-term-memory', 'lesson-candidate']);
  return {
    ...classification,
    status: routedKnowledgeStatus(classification),
    materialization: classification.reviewRequired
      ? { outcome: 'blocked-exception', target: 'human-review' }
      : fileRoutes.has(classification.route)
        ? { outcome: 'dry-run', target: classification.route }
        : classification.route === 'task'
          ? { outcome: 'dry-run', target: 'agent-os-task' }
          : { outcome: 'no-write', target: classification.route }
  };
}

function destinationFor(route, workspace, date) {
  if (route === 'daily-memory') return path.join(workspace, 'memory', `${date}.md`);
  if (route === 'long-term-memory') return path.join(workspace, 'MEMORY.md');
  if (route === 'lesson-candidate') return path.join(workspace, 'LESSONS_CANDIDATES.md');
  return null;
}

function lessonCoverageText(workspace, date) {
  const candidates = [
    path.join(workspace, 'MEMORY.md'),
    path.join(workspace, 'LESSONS.md'),
    path.join(workspace, 'LESSONS_CANDIDATES.md'),
    path.join(workspace, 'memory', `${date}.md`)
  ];
  return candidates
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

export function materializeMemoryFileRoute({
  workspace,
  signal,
  classification,
  provenanceId,
  date = new Date().toISOString().slice(0, 10),
  dryRun = false
}) {
  if (classification.reviewRequired) {
    return { outcome: 'blocked-exception', path: null, written: false };
  }
  if (classification.route === 'long-term-memory' && classification.confidence < 0.8) {
    return { outcome: 'blocked-confidence', path: null, written: false };
  }
  if (
    classification.route === 'lesson-candidate' &&
    isSemanticallyCovered(signal.summary, lessonCoverageText(workspace, date))
  ) {
    return { outcome: 'duplicate-semantic', path: null, written: false };
  }
  const destination = destinationFor(classification.route, workspace, date);
  if (!destination) return { outcome: 'not-file-route', path: null, written: false };

  const marker = `<!-- agent-os-memory-route:${provenanceId} -->`;
  if (existsSync(destination) && readFileSync(destination, 'utf8').includes(marker)) {
    return { outcome: 'duplicate', path: destination, written: false };
  }
  if (dryRun) return { outcome: 'dry-run', path: destination, written: false };

  mkdirSync(path.dirname(destination), { recursive: true });
  const heading = classification.route === 'lesson-candidate' ? 'Lesson candidate' : 'Memory';
  appendFileSync(
    destination,
    `${existsSync(destination) ? '\n' : `# ${path.basename(destination, '.md')}\n\n`}${marker}\n## ${heading} · ${date}\n\n- ${String(signal.summary).trim()}\n- Source: Agent OS memory control plane (${provenanceId})\n`,
    'utf8'
  );
  return { outcome: 'written', path: destination, written: true };
}
