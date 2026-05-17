import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { desc, sql as drizzleSql } from 'drizzle-orm';
import { db } from './client';
import { knowledgeSources } from './schema';

export type KnowledgeSnapshot = {
  dbOnline: boolean;
  sources: Array<{
    id: string;
    title: string;
    kind: string;
    status: string;
    sourceUrl: string | null;
    summary: string;
    rawPath: string;
    wikiPath: string | null;
    createdAt: Date;
  }>;
  stats: Array<{ label: string; value: string; detail: string }>;
};

const fallbackSnapshot: KnowledgeSnapshot = {
  dbOnline: false,
  sources: [],
  stats: [
    { label: 'Raw inbox', value: '—', detail: 'DB saknas i den här miljön' },
    { label: 'Wikifierade', value: '—', detail: 'Kör lokalt med Postgres för persistens' },
    { label: 'Pipeline', value: 'v0', detail: 'Text/URL först, fil-upload senare' }
  ]
};

export async function getKnowledgeSnapshot(): Promise<KnowledgeSnapshot> {
  if (!process.env.DATABASE_URL) {
    if (hasBridge()) {
      try {
        return await bridgeRequest<KnowledgeSnapshot>('/knowledge/snapshot');
      } catch (error) {
        console.error('Knowledge bridge snapshot failed', error);
      }
    }
    return fallbackSnapshot;
  }

  try {
    const [sources, counts] = await Promise.all([
      db.select().from(knowledgeSources).orderBy(desc(knowledgeSources.createdAt)).limit(20),
      db
        .select({ status: knowledgeSources.status, count: drizzleSql<number>`count(*)::int` })
        .from(knowledgeSources)
        .groupBy(knowledgeSources.status)
    ]);

    const byStatus = new Map(counts.map((row) => [row.status, Number(row.count)]));
    const rawCount = byStatus.get('raw') ?? 0;
    const queuedCount = byStatus.get('queued') ?? 0;
    const wikiCount = byStatus.get('wikified') ?? 0;

    return {
      dbOnline: true,
      sources: sources.map((source) => ({
        id: source.id,
        title: source.title,
        kind: source.kind,
        status: source.status,
        sourceUrl: source.sourceUrl,
        summary: source.summary,
        rawPath: source.rawPath,
        wikiPath: source.wikiPath,
        createdAt: source.createdAt
      })),
      stats: [
        { label: 'Raw inbox', value: String(rawCount), detail: 'Nya källor som väntar på syntes' },
        { label: 'Köade', value: String(queuedCount), detail: 'Markerade för wikifiering' },
        { label: 'Wikifierade', value: String(wikiCount), detail: 'Syntetiserade knowledge pages' }
      ]
    };
  } catch (error) {
    console.error('Knowledge snapshot failed', error);
    return fallbackSnapshot;
  }
}
