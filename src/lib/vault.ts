export type VaultSource = {
  id: string;
  title: string;
  kind: string;
  status: string;
  sourceUrl: string | null;
  summary: string;
  rawPath: string;
  wikiPath: string | null;
  wikiContent: string;
  createdAt: Date | string;
};

export type VaultFile = {
  path: string;
  content: string;
};

export type VaultSnapshot = {
  files: VaultFile[];
  indexMd: string;
  logMd: string;
  agentsMd: string;
};

function uniquePath(path: string, seen: Set<string>) {
  if (!seen.has(path)) {
    seen.add(path);
    return path;
  }

  const dot = path.lastIndexOf('.');
  const base = dot > -1 ? path.slice(0, dot) : path;
  const ext = dot > -1 ? path.slice(dot) : '';
  let index = 2;
  while (seen.has(`${base}-${index}${ext}`)) index++;
  const next = `${base}-${index}${ext}`;
  seen.add(next);
  return next;
}

function isoDate(value: Date | string) {
  return new Date(value).toISOString();
}

function rawMarkdown(source: VaultSource) {
  return [
    '---',
    `title: ${JSON.stringify(source.title)}`,
    `kind: ${JSON.stringify(source.kind)}`,
    `status: ${JSON.stringify(source.status)}`,
    `source_url: ${JSON.stringify(source.sourceUrl)}`,
    `created_at: ${JSON.stringify(isoDate(source.createdAt))}`,
    '---',
    '',
    `# ${source.title}`,
    '',
    source.rawPath ? `Raw path: \`${source.rawPath}\`` : '',
    source.sourceUrl ? `Source: ${source.sourceUrl}` : '',
    '',
    '## Summary',
    '',
    source.summary || 'No summary yet.',
    ''
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function buildIndex(sources: VaultSource[]) {
  const wikiStatuses = new Set(['wikified', 'reviewed', 'promoted']);
  const activeSources = sources.filter((source) => source.status !== 'archived');
  const wikified = activeSources.filter(
    (source) => wikiStatuses.has(source.status) && source.wikiPath
  );
  const raw = activeSources.filter((source) => !wikiStatuses.has(source.status));

  return [
    '# Agent OS Vault Index',
    '',
    'This is an Obsidian-compatible export generated from Agent OS.',
    '',
    '## Wiki pages',
    '',
    ...(wikified.length
      ? wikified.map((source) => `- [[${source.wikiPath}]] — ${source.title}`)
      : ['- No wiki pages yet.']),
    '',
    '## Raw sources',
    '',
    ...(raw.length
      ? raw.map((source) => `- [[${source.rawPath}]] — ${source.title}`)
      : ['- No raw sources waiting.']),
    '',
    '## Root files',
    '',
    '- [[agents.md]]',
    '- [[log.md]]',
    ''
  ].join('\n');
}

function buildLog(sources: VaultSource[]) {
  return [
    '# Agent OS Vault Log',
    '',
    ...sources.map((source) => {
      const target = source.wikiPath ?? source.rawPath;
      return `- ${isoDate(source.createdAt)} — ${source.status} — [[${target}]] — ${source.title}`;
    }),
    ''
  ].join('\n');
}

function buildAgentsMd() {
  return [
    '# agents.md',
    '',
    'You are operating inside the Agent OS vault.',
    '',
    'Rules:',
    '- Treat `/raw` as source material, not final truth.',
    '- Treat `/wiki` as synthesized working knowledge.',
    '- Preserve source links and paths when updating wiki pages.',
    '- Prefer small, durable pages about people, projects, agents, decisions, concepts, and systems.',
    '- Do not create one wiki page per chat message; extract stable entities and decisions instead.',
    '- Update `index.md` and `log.md` after processing sources.',
    '',
    'Suggested folders:',
    '- `/raw/chats` for conversations',
    '- `/raw/docs` for pasted documents',
    '- `/raw/urls` for web sources',
    '- `/wiki/agents` for agent pages',
    '- `/wiki/projects` for project pages',
    '- `/wiki/decisions` for durable decisions',
    '- `/journal` for dated reflections and operational logs',
    ''
  ].join('\n');
}

export function buildVaultSnapshot(sources: VaultSource[]): VaultSnapshot {
  const seen = new Set<string>();
  const files: VaultFile[] = [
    { path: uniquePath('agents.md', seen), content: buildAgentsMd() },
    { path: uniquePath('index.md', seen), content: buildIndex(sources) },
    { path: uniquePath('log.md', seen), content: buildLog(sources) }
  ];

  const wikiStatuses = new Set(['wikified', 'reviewed', 'promoted']);
  const activeSources = sources.filter((source) => source.status !== 'archived');

  for (const source of activeSources) {
    files.push({ path: uniquePath(source.rawPath, seen), content: rawMarkdown(source) });
    if (wikiStatuses.has(source.status) && source.wikiPath && source.wikiContent) {
      files.push({ path: uniquePath(source.wikiPath, seen), content: source.wikiContent });
    }
  }

  return {
    files,
    indexMd: files.find((file) => file.path === 'index.md')?.content ?? '',
    logMd: files.find((file) => file.path === 'log.md')?.content ?? '',
    agentsMd: files.find((file) => file.path === 'agents.md')?.content ?? ''
  };
}
