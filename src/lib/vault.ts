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
  const raw = activeSources.filter(
    (source) => !wikiStatuses.has(source.status) && !memoryAgentFromPath(source.rawPath)
  );
  const memoryAgents = [
    ...new Set(
      activeSources
        .map((source) => memoryAgentFromPath(source.rawPath))
        .filter((agent): agent is string => Boolean(agent))
    )
  ].toSorted((a, b) => a.localeCompare(b));

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
    '## Agent memory islands',
    '',
    ...(memoryAgents.length
      ? memoryAgents.map((agent) => `- [[knowledge/memory/${agent}/index.md]] — ${agent}`)
      : ['- No agent memory imports yet.']),
    '',
    '## Root files',
    '',
    '- [[agents.md]]',
    '- [[log.md]]',
    '- [[knowledge/index.md]]',
    '- [[knowledge/raw/index.md]]',
    '- [[knowledge/wiki/index.md]]',
    '- [[journal/index.md]]',
    ''
  ].join('\n');
}

function buildKnowledgeIndex(sources: VaultSource[]) {
  const activeSources = sources.filter((source) => source.status !== 'archived');
  const byKind = new Map<string, number>();
  const byStatus = new Map<string, number>();

  for (const source of activeSources) {
    byKind.set(source.kind, (byKind.get(source.kind) ?? 0) + 1);
    byStatus.set(source.status, (byStatus.get(source.status) ?? 0) + 1);
  }

  return [
    '# Knowledge',
    '',
    'Generated Agent OS knowledge vault root.',
    '',
    '## Folders',
    '',
    '- [[knowledge/raw/index.md]] — source material and evidence',
    '- [[knowledge/wiki/index.md]] — synthesized working knowledge',
    '- [[knowledge/memory]] — imported memory islands by agent',
    '- [[journal/index.md]] — operational notes and dated reflections',
    '',
    '## Active source counts',
    '',
    ...[...byStatus.entries()]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([status, count]) => `- ${status}: ${count}`),
    '',
    '## Source kinds',
    '',
    ...[...byKind.entries()]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([kind, count]) => `- ${kind}: ${count}`),
    ''
  ].join('\n');
}

function buildRawIndex(sources: VaultSource[]) {
  const wikiStatuses = new Set(['wikified', 'reviewed', 'promoted']);
  const raw = sources.filter(
    (source) =>
      source.status !== 'archived' &&
      !wikiStatuses.has(source.status) &&
      !memoryAgentFromPath(source.rawPath)
  );

  return [
    '# Raw Sources',
    '',
    'Raw sources are evidence, not interpreted context.',
    '',
    ...(raw.length
      ? raw.map((source) => `- [[${source.rawPath}]] — ${source.title}`)
      : ['- No active raw sources.']),
    ''
  ].join('\n');
}

function buildWikiIndex(sources: VaultSource[]) {
  const wikiStatuses = new Set(['wikified', 'reviewed', 'promoted']);
  const wiki = sources.filter(
    (source) => source.status !== 'archived' && wikiStatuses.has(source.status) && source.wikiPath
  );

  return [
    '# Wiki',
    '',
    'Wiki pages are synthesized working knowledge derived from cited sources.',
    '',
    ...(wiki.length
      ? wiki.map((source) => `- [[${source.wikiPath}]] — ${source.title}`)
      : ['- No wiki pages yet.']),
    ''
  ].join('\n');
}

function buildJournalIndex(sources: VaultSource[]) {
  const journal = sources.filter(
    (source) => source.status !== 'archived' && source.rawPath.startsWith('journal/')
  );

  return [
    '# Journal',
    '',
    'Operational notes and dated reflections captured through Agent OS.',
    '',
    ...(journal.length
      ? journal.map((source) => `- [[${source.rawPath}]] — ${source.title}`)
      : ['- No journal entries in the vault yet.']),
    ''
  ].join('\n');
}

function memoryAgentFromPath(path: string | null | undefined) {
  const match = String(path ?? '').match(/^knowledge\/memory\/([^/]+)\//);
  return match?.[1] ?? null;
}

function buildMemoryIsland(agent: string, sources: VaultSource[]) {
  const agentSources = sources.filter((source) => memoryAgentFromPath(source.rawPath) === agent);
  return [
    `# ${agent} memory island`,
    '',
    `Memory and dreaming sources imported from ${agent}.`,
    '',
    'These are reviewable sources, not automatically promoted context.',
    '',
    '## Sources',
    '',
    ...agentSources.map((source) => `- [[${source.rawPath}]] — ${source.title}`),
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
  const activeSources = sources.filter((source) => source.status !== 'archived');
  const memoryAgents = [
    ...new Set(
      activeSources
        .map((source) => memoryAgentFromPath(source.rawPath))
        .filter((agent): agent is string => Boolean(agent))
    )
  ].toSorted((a, b) => a.localeCompare(b));
  const files: VaultFile[] = [
    { path: uniquePath('agents.md', seen), content: buildAgentsMd() },
    { path: uniquePath('index.md', seen), content: buildIndex(sources) },
    { path: uniquePath('log.md', seen), content: buildLog(sources) },
    { path: uniquePath('knowledge/index.md', seen), content: buildKnowledgeIndex(activeSources) },
    { path: uniquePath('knowledge/raw/index.md', seen), content: buildRawIndex(activeSources) },
    { path: uniquePath('knowledge/wiki/index.md', seen), content: buildWikiIndex(activeSources) },
    { path: uniquePath('journal/index.md', seen), content: buildJournalIndex(activeSources) },
    ...memoryAgents.map((agent) => ({
      path: uniquePath(`knowledge/memory/${agent}/index.md`, seen),
      content: buildMemoryIsland(agent, activeSources)
    }))
  ];

  const wikiStatuses = new Set(['wikified', 'reviewed', 'promoted']);

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
