import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { z } from 'zod';

const sessionSchema = z.object({
  id: z.string(),
  businessDate: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  locationType: z.string(),
  status: z.string(),
  note: z.string(),
  durationMinutes: z.number().nullable()
});

const noteSchema = z.object({
  id: z.string(),
  businessDate: z.string(),
  workSessionId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string()
});

const expenseSchema = z.object({
  id: z.string(),
  businessDate: z.string(),
  workSessionId: z.string().nullable(),
  category: z.string(),
  amountMinor: z.number(),
  currency: z.string(),
  merchant: z.string(),
  note: z.string(),
  receiptStatus: z.string()
});

export const worklogSnapshotSchema = z.object({
  contract: z.literal('agent-os.worklog.v1'),
  source: z.string(),
  businessDate: z.string(),
  sessions: z.array(sessionSchema),
  notes: z.array(noteSchema),
  expenses: z.array(expenseSchema),
  totals: z.object({
    grossMinutes: z.number(),
    netMinutes: z.number(),
    expenseMinor: z.number(),
    currency: z.string(),
    incompleteSessions: z.number()
  })
});

export type WorklogSnapshot = z.infer<typeof worklogSnapshotSchema>;

export const emptyWorklogSnapshot: WorklogSnapshot = {
  contract: 'agent-os.worklog.v1',
  source: 'unavailable',
  businessDate: '',
  sessions: [],
  notes: [],
  expenses: [],
  totals: {
    grossMinutes: 0,
    netMinutes: 0,
    expenseMinor: 0,
    currency: 'SEK',
    incompleteSessions: 0
  }
};

export async function getWorklogSnapshot(date?: string): Promise<WorklogSnapshot> {
  if (!hasBridge()) return { ...emptyWorklogSnapshot, businessDate: date ?? '' };
  try {
    return worklogSnapshotSchema.parse(
      await bridgeRequest(`/worklog/snapshot${date ? `?date=${encodeURIComponent(date)}` : ''}`, {
        cacheMs: 3000
      })
    );
  } catch (error) {
    console.error('Worklog bridge request failed', error);
    return { ...emptyWorklogSnapshot, source: 'bridge-error', businessDate: date ?? '' };
  }
}
