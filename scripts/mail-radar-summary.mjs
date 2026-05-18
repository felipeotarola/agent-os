#!/usr/bin/env node

const bridgeUrl = process.env.AGENT_OS_BRIDGE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8787';
const token = process.env.AGENT_OS_BRIDGE_TOKEN;

if (!token) {
  console.error('AGENT_OS_BRIDGE_TOKEN is required');
  process.exit(1);
}

const response = await fetch(`${bridgeUrl}/mail/radar?max=8`, {
  headers: { authorization: `Bearer ${token}` }
});

if (!response.ok) {
  console.error(`Mail Radar failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const snapshot = await response.json();
const highSignal = snapshot.candidates.filter((candidate) => candidate.score >= 55 && !candidate.saved);

console.log(JSON.stringify({
  generatedAt: snapshot.generatedAt,
  account: snapshot.account,
  total: snapshot.counts.total,
  highSignal: highSignal.length,
  candidates: highSignal.slice(0, 5).map((candidate) => ({
    score: candidate.score,
    title: candidate.title,
    from: candidate.from,
    reasons: candidate.reasons,
    gmailUrl: candidate.gmailUrl
  }))
}, null, 2));
