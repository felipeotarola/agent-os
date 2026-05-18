import { desc } from 'drizzle-orm';
import { db } from './client';
import { knowledgeSources } from './schema';

export type JournalEntry = {
  id: string;
  title: string;
  rawContent: string;
  summary: string;
  rawPath: string;
  createdAt: Date;
};

export type JournalSnapshot = {
  dbOnline: boolean;
  entries: JournalEntry[];
  stats: Array<{ label: string; value: string; detail: string }>;
};

const fallbackSnapshot: JournalSnapshot = {
  dbOnline: false,
  entries: [],
  stats: [
    { label: 'Entries', value: '—', detail: 'DB saknas i den här miljön' },
    { label: 'Source', value: 'local', detail: 'Journal sparas i Postgres/Knowledge raw' },
    { label: 'Status', value: 'read-only', detail: 'Koppla DATABASE_URL för persistens' }
  ]
};

export async function getJournalSnapshot(): Promise<JournalSnapshot> {
  if (!process.env.DATABASE_URL) return fallbackSnapshot;

  try {
    const entries = await db
      .select()
      .from(knowledgeSources)
      .orderBy(desc(knowledgeSources.createdAt))
      .limit(30);

    const journalEntries = entries
      .filter((entry) => entry.kind === 'journal')
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        rawContent: entry.rawContent,
        summary: entry.summary,
        rawPath: entry.rawPath,
        createdAt: entry.createdAt
      }));

    return {
      dbOnline: true,
      entries: journalEntries,
      stats: [
        {
          label: 'Entries',
          value: String(journalEntries.length),
          detail: 'Senaste journalnoteringar'
        },
        { label: 'Source', value: 'Postgres', detail: 'Sparas som knowledge kind=journal' },
        { label: 'Pipeline', value: 'raw', detail: 'Kan senare wikifieras till knowledge' }
      ]
    };
  } catch (error) {
    console.error('Journal snapshot failed', error);
    return fallbackSnapshot;
  }
}
