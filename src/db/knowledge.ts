import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { buildVaultSnapshot, type VaultSnapshot } from '@/lib/vault';
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
    wikiContent: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }>;
  stats: Array<{ label: string; value: string; detail: string }>;
  lifecycle?: string[];
  lifecycleCounts?: Record<string, number>;
  vault: VaultSnapshot;
};

const fallbackSnapshot: KnowledgeSnapshot = {
  dbOnline: false,
  sources: [],
  stats: [
    { label: 'Raw inbox', value: '—', detail: 'DB saknas i den här miljön' },
    { label: 'Wikifierade', value: '—', detail: 'Kör lokalt med Postgres för persistens' },
    { label: 'Pipeline', value: 'v0', detail: 'Text/URL först, fil-upload senare' }
  ],
  vault: buildVaultSnapshot([])
};

export async function getKnowledgeSnapshot(): Promise<KnowledgeSnapshot> {
  if (hasBridge()) {
    try {
      return await bridgeRequest<KnowledgeSnapshot>('/knowledge/snapshot', {
        cacheMs: 8000,
        timeoutMs: 2500
      });
    } catch (error) {
      console.error('Knowledge bridge snapshot failed', error);
    }
  }

  if (!process.env.DATABASE_URL) return fallbackSnapshot;

  try {
    const [sources, counts] = await Promise.all([
      db.select().from(knowledgeSources).orderBy(desc(knowledgeSources.createdAt)).limit(80),
      db
        .select({ status: knowledgeSources.status, count: drizzleSql<number>`count(*)::int` })
        .from(knowledgeSources)
        .groupBy(knowledgeSources.status)
    ]);

    const byStatus = new Map(counts.map((row) => [row.status, Number(row.count)]));
    const lifecycle = ['raw', 'extracted', 'wikified', 'reviewed', 'promoted', 'archived'];
    const lifecycleCounts = Object.fromEntries(
      lifecycle.map((status) => [status, byStatus.get(status) ?? 0])
    );

    const mappedSources = sources.map((source) => ({
      id: source.id,
      title: source.title,
      kind: source.kind,
      status: source.status,
      sourceUrl: source.sourceUrl,
      summary: source.summary,
      rawPath: source.rawPath,
      wikiPath: source.wikiPath,
      wikiContent: source.wikiContent,
      metadata: (source.metadata ?? {}) as Record<string, unknown>,
      createdAt: source.createdAt
    }));

    return {
      dbOnline: true,
      sources: mappedSources,
      lifecycle,
      lifecycleCounts,
      stats: [
        { label: 'Raw', value: String(lifecycleCounts.raw), detail: 'Untrusted captured sources' },
        {
          label: 'Extracted',
          value: String(lifecycleCounts.extracted),
          detail: 'Readable content extracted'
        },
        {
          label: 'Context-ready',
          value: String(lifecycleCounts.promoted),
          detail: 'Auto-routed or legacy context-ready sources'
        }
      ],
      vault: buildVaultSnapshot(mappedSources)
    };
  } catch (error) {
    console.error('Knowledge snapshot failed', error);
    return fallbackSnapshot;
  }
}

export const KNOWLEDGE_LIFECYCLE_STATUSES = [
  'raw',
  'extracted',
  'wikified',
  'reviewed',
  'promoted',
  'archived'
] as const;
export const PLANNED_KNOWLEDGE_LIFECYCLE_STATUSES = [] as const;

export type KnowledgeLifecycleStatus = (typeof KNOWLEDGE_LIFECYCLE_STATUSES)[number];
