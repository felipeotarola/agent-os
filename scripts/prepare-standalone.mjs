import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const standaloneRoot = path.join(repoRoot, '.next', 'standalone');

for (const entry of await fs.readdir(standaloneRoot)) {
  if (entry === '.env' || entry.startsWith('.env.')) {
    await fs.rm(path.join(standaloneRoot, entry), { force: true });
  }
}

await fs.cp(path.join(repoRoot, '.next', 'static'), path.join(standaloneRoot, '.next', 'static'), {
  recursive: true,
  force: true
});

await fs.cp(path.join(repoRoot, 'public'), path.join(standaloneRoot, 'public'), {
  recursive: true,
  force: true
});

const leakedEnvFiles = (await fs.readdir(standaloneRoot)).filter(
  (entry) => entry === '.env' || entry.startsWith('.env.')
);
if (leakedEnvFiles.length > 0) {
  throw new Error(`Standalone output still contains env files: ${leakedEnvFiles.join(', ')}`);
}
