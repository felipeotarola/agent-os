import { readFile } from 'node:fs/promises';

const tokenPath = '/root/.openclaw/secrets/agent-os/VERCEL_ACCESS_TOKEN';

async function main() {
  let token;
  try {
    token = (await readFile(tokenPath, 'utf8')).trim();
  } catch {
    console.log('Vercel: ingen läsbehörighet konfigurerad.');
    return;
  }

  const response = await fetch('https://api.vercel.com/v6/deployments?limit=50', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    console.log(`Vercel: kontrollen misslyckades (HTTP ${response.status}).`);
    return;
  }

  const payload = await response.json();
  const deployments = Array.isArray(payload.deployments) ? payload.deployments : [];
  const latestByProject = new Map();
  for (const deployment of deployments) {
    if (!latestByProject.has(deployment.name)) latestByProject.set(deployment.name, deployment);
  }

  const latest = [...latestByProject.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)
    .map((deployment) => ({
      project: deployment.name,
      state: deployment.state ?? deployment.readyState ?? 'UNKNOWN',
      target: deployment.target ?? 'preview',
      createdAt: new Date(deployment.createdAt).toISOString(),
      branch: deployment.meta?.githubCommitRef ?? deployment.meta?.gitlabCommitRef ?? null,
      commit: (deployment.meta?.githubCommitSha ?? deployment.meta?.gitlabCommitSha ?? '').slice(0, 7) || null,
      message: deployment.meta?.githubCommitMessage ?? deployment.meta?.gitlabCommitMessage ?? null
    }));

  const failures = deployments
    .filter((deployment) => ['ERROR', 'CANCELED', 'BLOCKED'].includes(deployment.state ?? deployment.readyState))
    .filter((deployment) => Date.now() - deployment.createdAt < 24 * 60 * 60 * 1000)
    .map((deployment) => ({
      project: deployment.name,
      state: deployment.state ?? deployment.readyState,
      createdAt: new Date(deployment.createdAt).toISOString()
    }));

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), latest, failuresLast24h: failures }, null, 2));
}

main().catch(() => {
  console.log('Vercel: kontrollen kunde inte genomföras.');
  process.exitCode = 1;
});
