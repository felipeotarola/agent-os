import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classifyMemorySignal, isCandidateFresh, isCompleteMemorySummary, isEligibleSessionArtifactName, isExplicitTaskIntent, isSemanticallyCovered, isTransportEnvelopeLine, materializeMemoryFileRoute, previewMemoryRoute, routedKnowledgeStatus } from '../bridge/memory-control-plane.mjs';

const fixtures = [
  [{ type: 'todo', summary: 'Next step: implement the documented bridge contract tomorrow.' }, 'task', false, 'promoted'],
  [{ type: 'technical-lesson', summary: 'Lesson learned: add a regression guard after every adapter change.' }, 'lesson-candidate', false, 'promoted'],
  [{ type: 'product-context', summary: 'Research source documents the product architecture and wiki model.' }, 'knowledge-wiki', false, 'extracted'],
  [{ type: 'preference', summary: 'Felipe prefers this strategy and never wants manual promotion.' }, 'long-term-memory', true, 'reviewed'],
  [{ type: 'session-signal', summary: 'HEARTBEAT_OK' }, 'discard', false, 'archived'],
  [{ type: 'decision', summary: 'Use API token secret abc for this decision.' }, 'long-term-memory', true, 'reviewed']
];

for (const [input, route, reviewRequired, status] of fixtures) {
  const result = classifyMemorySignal(input);
  assert.equal(result.route, route);
  assert.equal(result.reviewRequired, reviewRequired);
  assert.equal(routedKnowledgeStatus(result), status);
}

console.log(`memory-control-plane contract: ${fixtures.length}/${fixtures.length}`);

const previewTask = previewMemoryRoute({ type: 'todo', summary: 'Next step: create the bounded local runner with evidence.' });
assert.equal(previewTask.route, 'task');
assert.deepEqual(previewTask.materialization, { outcome: 'dry-run', target: 'agent-os-task' });
const previewException = previewMemoryRoute({ type: 'preference', summary: 'Felipe always prefers this strategy everywhere.' });
assert.equal(previewException.materialization.outcome, 'blocked-exception');
console.log('memory routing preview contract: 2/2');

const envelope = '{"type":"response_item","todo":"next step: create a fake task","session_id":"c4fd701b"}';
assert.equal(isTransportEnvelopeLine(envelope), true);
assert.equal(isTransportEnvelopeLine('User: Next step: document the valid markdown workflow.'), false);
assert.equal(
  [envelope, 'User: Next step: document the valid markdown workflow.']
    .filter((line) => !isTransportEnvelopeLine(line))
    .some((line) => line.includes('fake task')),
  false
);
assert.equal(classifyMemorySignal({ type: 'todo', summary: 'Next step: document the valid markdown workflow.' }).route, 'task');
assert.equal(isEligibleSessionArtifactName('c4fd701b.jsonl'), false);
assert.equal(isEligibleSessionArtifactName('80688438-app-server.md'), false);
assert.equal(isEligibleSessionArtifactName('valid-session.md'), true);
console.log('transport-envelope regression: 7/7');

const directiveFixtures = [
  'TODO: ship the guarded runner.',
  'Next step: verify the live bridge.',
  'Nästa steg: kör kontraktstestet.',
  '- [ ] Add the missing regression.',
  'Action item: document the activation boundary.',
  'Kan du implementera den säkra kontrollen?',
  'Implementera den godkända P1-ändringen.'
];
for (const summary of directiveFixtures) {
  assert.equal(isExplicitTaskIntent(summary), true);
  assert.equal(classifyMemorySignal({ type: 'todo', summary }).route, 'task');
}
const incidentalFixtures = [
  'The pricing card says next step is revenue growth for the customer story.',
  'Our product narrative mentions a todo list as a useful dashboard pattern.',
  'Revenue projections describe the next step in the funnel without requesting work.',
  'This mid-sentence TODO reference belongs to copied documentation, not an action.'
];
for (const summary of incidentalFixtures) {
  assert.equal(isExplicitTaskIntent(summary), false);
  assert.notEqual(classifyMemorySignal({ type: 'todo', summary }).route, 'task');
}
assert.equal(isCandidateFresh({ mtimeMs: Date.parse('2026-07-15T08:00:01Z') }, { since: '2026-07-15T08:00:00Z' }), true);
assert.equal(isCandidateFresh({ mtimeMs: Date.parse('2026-07-15T08:00:00Z') }, { since: '2026-07-15T08:00:00Z' }), false);
assert.equal(isCandidateFresh({ mtimeMs: 1 }, { backfill: true }), true);
assert.equal(isCandidateFresh({ mtimeMs: 1 }, { dryRun: true }), true);
console.log('task-intent and freshness regression: 26/26');

const completenessFixtures = [
  ['A complete standalone memory summary with enough context.', true],
  ['The worker should preserve the trace and', false],
  ['A summary copied from a bounded response...', false],
  ['This is a long transcript chunk that contains useful-looking context but is not a standalone memory. '.repeat(4) + 'The extractor sliced the response in the middle of a wor', false],
  ['This is a long but complete standalone summary with enough context to exceed the transcript guard. '.repeat(4) + 'The verified outcome is preserved.', true],
  ['A summary that ends with punctuation and a clear outcome.', true]
];
for (const [summary, expected] of completenessFixtures) {
  assert.equal(isCompleteMemorySummary(summary), expected);
}
assert.equal(
  classifyMemorySignal({ type: 'technical-lesson', summary: 'The worker should preserve the trace and' }).exceptionReasons.includes('possibly-clipped-summary'),
  true
);
assert.equal(
  isSemanticallyCovered(
    'Sladdis must verify Slack direct messages with a real delivery check.',
    'Lesson: Sladdis must verify Slack direct messages through a real delivery check before reporting success.'
  ),
  true
);
assert.equal(
  isSemanticallyCovered(
    'Playwright artifacts should retain traces after failed automation runs.',
    'Lesson: Slack direct messages require a real delivery check.'
  ),
  false
);
console.log('summary completeness and semantic coverage regression: 9/9');

const root = mkdtempSync(path.join(tmpdir(), 'agent-os-memory-'));
try {
  const dailySignal = { type: 'agent-note', summary: 'Completed a useful bounded implementation with verified evidence.' };
  const dailyClass = classifyMemorySignal(dailySignal);
  const first = materializeMemoryFileRoute({ workspace: root, signal: dailySignal, classification: dailyClass, provenanceId: 'daily-1', date: '2026-07-15' });
  assert.equal(first.written, true);
  const second = materializeMemoryFileRoute({ workspace: root, signal: dailySignal, classification: dailyClass, provenanceId: 'daily-1', date: '2026-07-15' });
  assert.equal(second.outcome, 'duplicate');
  assert.equal((readFileSync(first.path, 'utf8').match(/agent-os-memory-route:daily-1/g) ?? []).length, 1);

  const durable = { type: 'decision', summary: 'Decision: keep the stable architecture boundary for future work.' };
  const durableClass = classifyMemorySignal(durable);
  assert.equal(materializeMemoryFileRoute({ workspace: root, signal: durable, classification: durableClass, provenanceId: 'memory-1' }).written, true);

  const exception = { type: 'preference', summary: 'Felipe always prefers this strategy for every future project.' };
  const exceptionClass = classifyMemorySignal(exception);
  assert.equal(materializeMemoryFileRoute({ workspace: root, signal: exception, classification: exceptionClass, provenanceId: 'blocked-1' }).outcome, 'blocked-exception');

  const coveredLesson = { type: 'technical-lesson', summary: 'Regression guards must verify every adapter change with contract evidence.' };
  const coveredClass = classifyMemorySignal(coveredLesson);
  const lessonsPath = path.join(root, 'LESSONS.md');
  writeFileSync(lessonsPath, '# Lessons\n\nRegression guards must verify every adapter change with contract evidence.\n');
  assert.equal(
    materializeMemoryFileRoute({ workspace: root, signal: coveredLesson, classification: coveredClass, provenanceId: 'covered-1' }).outcome,
    'duplicate-semantic'
  );

  const dryWorkspace = path.join(root, 'dry');
  const dry = materializeMemoryFileRoute({ workspace: dryWorkspace, signal: dailySignal, classification: dailyClass, provenanceId: 'dry-1', dryRun: true });
  assert.equal(dry.outcome, 'dry-run');
  assert.equal(existsSync(dryWorkspace), false);
  console.log('memory materialization contract: write/idempotency/exception/semantic-dedup/dry-run 5/5');
} finally {
  rmSync(root, { recursive: true, force: true });
}
