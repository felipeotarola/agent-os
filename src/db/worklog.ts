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
  }),
  financials: z.union([
    z.object({ revealed: z.literal(false) }),
    z.object({
      revealed: z.literal(true),
      rateMinor: z.number().nullable(),
      currency: z.string(),
      estimatedRevenueMinor: z.number().nullable()
    })
  ])
});

export type WorklogSnapshot = z.infer<typeof worklogSnapshotSchema>;

export type WorklogWeekSnapshot = {
  startDate: string;
  endDate: string;
  snapshots: WorklogSnapshot[];
  grossMinutes: number;
  incompleteSessions: number;
  estimatedRevenueMinor: number | null;
  currency: string;
};

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
  },
  financials: { revealed: false }
};

export async function getWorklogSnapshot(
  date?: string,
  includeFinancials = false
): Promise<WorklogSnapshot> {
  if (!hasBridge()) return { ...emptyWorklogSnapshot, businessDate: date ?? '' };
  try {
    return worklogSnapshotSchema.parse(
      await bridgeRequest(
        `/worklog/snapshot?${new URLSearchParams({
          ...(date ? { date } : {}),
          ...(includeFinancials ? { includeFinancials: '1' } : {})
        })}`,
        {
          cacheMs: 3000
        }
      )
    );
  } catch (error) {
    console.error('Worklog bridge request failed', error);
    return { ...emptyWorklogSnapshot, source: 'bridge-error', businessDate: date ?? '' };
  }
}

function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const weekday = value.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return value;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function getWorklogWeekSnapshot(
  date: string,
  includeFinancials = false
): Promise<WorklogWeekSnapshot> {
  const monday = mondayFor(date);
  const dates = Array.from({ length: 5 }, (_, index) => {
    const value = new Date(monday);
    value.setUTCDate(monday.getUTCDate() + index);
    return isoDate(value);
  });
  const snapshots = await Promise.all(
    dates.map((businessDate) => getWorklogSnapshot(businessDate, includeFinancials))
  );
  const grossMinutes = snapshots.reduce(
    (total, snapshot) => total + snapshot.totals.grossMinutes,
    0
  );
  const incompleteSessions = snapshots.reduce(
    (total, snapshot) => total + snapshot.totals.incompleteSessions,
    0
  );
  const financialSnapshots = snapshots.filter(
    (
      snapshot
    ): snapshot is WorklogSnapshot & {
      financials: Extract<WorklogSnapshot['financials'], { revealed: true }>;
    } => snapshot.financials.revealed
  );
  const estimatedRevenueMinor =
    financialSnapshots.length === snapshots.length
      ? financialSnapshots.reduce(
          (total, snapshot) => total + (snapshot.financials.estimatedRevenueMinor ?? 0),
          0
        )
      : null;

  return {
    startDate: dates[0],
    endDate: dates[4],
    snapshots,
    grossMinutes,
    incompleteSessions,
    estimatedRevenueMinor,
    currency: snapshots[0]?.totals.currency ?? 'SEK'
  };
}
