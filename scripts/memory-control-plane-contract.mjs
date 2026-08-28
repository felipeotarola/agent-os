import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classifyMemorySignal, isCandidateFresh, isCompleteMemorySummary, isConversationalTaskRequest, isEligibleSessionArtifactName, isExplicitTaskIntent, isSemanticallyCovered, isTransportEnvelopeLine, materializeMemoryFileRoute, previewMemoryRoute, routedKnowledgeStatus } from '../bridge/memory-control-plane.mjs';

const fixtures = [
  [{ type: 'todo', summary: 'Next step: implement the documented bridge contract tomorrow.' }, 'task', false, 'promoted'],
  [{ type: 'technical-lesson', summary: 'Lesson learned: add a regression guard after every adapter change.' }, 'lesson-candidate', false, 'promoted'],
  [{ type: 'product-context', summary: 'Research source documents the product architecture and wiki model.' }, 'knowledge-wiki', false, 'extracted'],
  [{ type: 'preference', summary: 'Felipe prefers this strategy and never wants manual promotion.' }, 'long-term-memory', true, 'reviewed'],
  [{ type: 'session-signal', summary: 'HEARTBEAT_OK' }, 'discard', false, 'archived'],
  [{ type: 'session-signal', summary: 'Är det något vi bör implementera direkt' }, 'discard', false, 'archived'],
  [{ type: 'todo', summary: 'Kan du läsa mailet från Maria?' }, 'discard', false, 'archived'],
  [{ type: 'agent-note', summary: 'Öppna auth.openai.com/codex/device och skriv in koden ABCD-EFGH.' }, 'daily-memory', true, 'reviewed'],
  [{ type: 'decision', summary: 'Use API token secret abc for this decision.' }, 'long-term-memory', true, 'reviewed']
];

for (const [input, route, reviewRequired, status] of fixtures) {
  const result = classifyMemorySignal(input);
  assert.equal(result.route, route);
  assert.equal(result.reviewRequired, reviewRequired);
  assert.equal(routedKnowledgeStatus(result), status);
}

console.log(`memory-control-plane contract: ${fixtures.length}/${fixtures.length}`);

const durabilityBoundaryFixtures = [
  {
    name: 'prefixed conversational question',
    signal: { type: 'session-signal', summary: 'User: Ska vi försöka joina en Google Meet så att du kan presentera?' },
    route: 'daily-memory',
    reviewRequired: true,
    exceptionReason: 'conversational-question'
  },
  {
    name: 'prefixed conversational request',
    signal: { type: 'todo', summary: 'User: Kan du skapa en Google Meet och bjuda in mig?' },
    route: 'discard',
    reviewRequired: false,
    reason: 'stale-conversational-request'
  },
  {
    name: 'temporary operational status',
    signal: { type: 'agent-note', summary: 'Google scope check could not run yet; retry later.' },
    route: 'daily-memory',
    reviewRequired: true,
    exceptionReason: 'transient-operational-status'
  },
  {
    name: 'clipped summary',
    signal: { type: 'technical-lesson', summary: 'The worker should preserve the trace and' },
    route: 'lesson-candidate',
    reviewRequired: true,
    exceptionReason: 'possibly-clipped-summary'
  },
  {
    name: 'durable verified workflow outcome',
    signal: { type: 'technical-lesson', summary: 'Verified workflow lesson: use headed Chrome as the durable Meet fallback even when a tool says retry later.' },
    route: 'lesson-candidate',
    reviewRequired: false
  },
  {
    name: 'ordinary durable preference',
    signal: { type: 'preference', summary: 'Felipe prefers concise evidence summaries for future work.' },
    route: 'long-term-memory',
    reviewRequired: true,
    exceptionReason: 'strategy-or-preference-change'
  }
];
for (const fixture of durabilityBoundaryFixtures) {
  const classification = classifyMemorySignal(fixture.signal);
  assert.equal(classification.route, fixture.route, fixture.name);
  assert.equal(classification.reviewRequired, fixture.reviewRequired, fixture.name);
  if (fixture.reason) assert.equal(classification.reasons.includes(fixture.reason), true, fixture.name);
  if (fixture.exceptionReason)
    assert.equal(classification.exceptionReasons.includes(fixture.exceptionReason), true, fixture.name);
  if (fixture.name === 'temporary operational status') {
    assert.equal(previewMemoryRoute(fixture.signal).materialization.outcome, 'blocked-exception');
  }
}
console.log('conversational durability regression: 6/6');

const previewTask = previewMemoryRoute({ type: 'todo', summary: 'Next step: create the bounded local runner with evidence.' });
assert.equal(previewTask.route, 'task');
assert.deepEqual(previewTask.materialization, { outcome: 'dry-run', target: 'agent-os-task' });
const previewException = previewMemoryRoute({ type: 'preference', summary: 'Felipe always prefers this strategy everywhere.' });
assert.equal(previewException.materialization.outcome, 'blocked-exception');
const previewQuestion = previewMemoryRoute({ type: 'session-signal', summary: 'Jag använder nästan alltid Telegram för agenterna; behöver Cai en separat agent som granskar Cai?' });
assert.equal(previewQuestion.materialization.outcome, 'blocked-exception');
assert.equal(previewQuestion.exceptionReasons.includes('conversational-question'), true);
console.log('memory routing preview contract: 4/4');

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
const staleConversationalRequests = [
  'Kan du skapa en google meets och bjuda in mig?',
  'Kan du läsa mailet från Maria?',
  'Kan du hjälpa mig återauthentisera?',
  'Kan du se när temu är beräknad att komma?',
  'Kan du skapa upp tickets i QAA borden för det',
  'Kan du fixa detta fel i QAA efter den avslutade testkörningen',
  'Kan du spara storyboard-manuset i Google Docs här?',
  'Kan du hjälpa mig förklara vad Sladdis och QAA gör',
  'kan du fixa denna Sladdis-konfiguration från den gamla sessionen',
  'Could you update the dashboard from that completed chat?',
  'Please create the meeting we discussed yesterday.'
];
for (const summary of staleConversationalRequests) {
  assert.equal(isConversationalTaskRequest(summary), true);
  const classification = classifyMemorySignal({ type: 'todo', summary });
  assert.equal(classification.route, 'discard');
  assert.equal(classification.reasons.includes('stale-conversational-request'), true);
  assert.deepEqual(previewMemoryRoute({ type: 'todo', summary }).materialization, {
    outcome: 'no-write',
    target: 'discard'
  });
}
for (const summary of [
  'TODO: ship the guarded runner.',
  'Next step: verify the live bridge.',
  'Felipe asked to preserve the durable task contract.'
]) {
  assert.equal(isConversationalTaskRequest(summary), false);
  assert.equal(classifyMemorySignal({ type: 'todo', summary }).route, 'task');
}
assert.equal(isCandidateFresh({ mtimeMs: Date.parse('2026-07-15T08:00:01Z') }, { since: '2026-07-15T08:00:00Z' }), true);
assert.equal(isCandidateFresh({ mtimeMs: Date.parse('2026-07-15T08:00:00Z') }, { since: '2026-07-15T08:00:00Z' }), false);
assert.equal(isCandidateFresh({ mtimeMs: 1 }, { backfill: true }), true);
assert.equal(isCandidateFresh({ mtimeMs: 1 }, { dryRun: true }), true);
console.log('task-intent and freshness regression: stale conversational requests blocked; durable intents preserved');

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
