#!/usr/bin/env node
import 'dotenv/config';

const bridgeUrl = process.env.AGENT_OS_BRIDGE_URL?.replace(/\/$/, '');
const token = process.env.AGENT_OS_BRIDGE_TOKEN;

if (!bridgeUrl || !token) {
  console.error('Agent OS bridge is not configured. Set AGENT_OS_BRIDGE_URL and AGENT_OS_BRIDGE_TOKEN.');
  process.exit(2);
}

const response = await fetch(`${bridgeUrl}/tasks/dispatch-summary`, {
  headers: { authorization: `Bearer ${token}` }
});

if (!response.ok) {
  console.error(`Bridge request failed ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const summary = await response.json();
const time = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  dateStyle: 'short',
  timeStyle: 'short'
}).format(new Date(summary.generatedAt));

console.log(`Agent OS dispatcher · ${time}`);
console.log(summary.suggestedMessage);

if (summary.actionableCount > 0) {
  console.log('');
  console.log('Fråga Felipe kort om han vill starta något. Föreslå kommandon som: "kör Charles 1", "kör alla high", "skippa idag". Starta inget utan ja.');
}
