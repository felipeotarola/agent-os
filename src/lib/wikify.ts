type WikiInput = {
  title: string;
  sourceUrl?: string | null;
  rawContent?: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function cleanLines(rawContent: string) {
  return rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function firstSentence(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.{40,260}?[.!?])\s/);
  return (match?.[1] ?? normalized.slice(0, 220)).trim();
}

function keyPoints(rawContent: string, sourceUrl?: string | null) {
  const lines = cleanLines(rawContent);
  const candidates = lines.length
    ? lines
    : rawContent.split(/(?<=[.!?])\s+/).map((line) => line.trim());
  const points = candidates
    .filter((line) => line.length > 20)
    .slice(0, 6)
    .map((line) => line.replace(/^[-*•]\s*/, '').slice(0, 260));

  if (!points.length && sourceUrl) return [`Source URL captured for later reading: ${sourceUrl}`];
  if (!points.length) return ['No substantial raw text was provided yet.'];
  return points;
}

export function buildWikiPath(title: string, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const slug = slugify(title) || crypto.randomUUID();
  return `knowledge/wiki/${day}-${slug}.md`;
}

export function wikifySource(input: WikiInput) {
  const title = input.title.trim();
  const sourceUrl = input.sourceUrl?.trim() || '';
  const rawContent = input.rawContent?.trim() || '';
  const points = keyPoints(rawContent, sourceUrl);
  const summary = rawContent
    ? firstSentence(rawContent)
    : sourceUrl || 'Knowledge source captured.';
  const wikiPath = buildWikiPath(title);
  const now = new Date().toISOString();

  const content = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `status: wikified`,
    `source_url: ${JSON.stringify(sourceUrl || null)}`,
    `updated_at: ${JSON.stringify(now)}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## Summary',
    '',
    summary,
    '',
    '## Key points',
    '',
    ...points.map((point) => `- ${point}`),
    '',
    '## Source',
    '',
    sourceUrl ? `- ${sourceUrl}` : '- Inline/raw note',
    '',
    '## Next questions',
    '',
    '- What decision or project should this knowledge inform?',
    '- Does this source need deeper synthesis with related notes?',
    ''
  ].join('\n');

  return { summary, wikiPath, wikiContent: content };
}
