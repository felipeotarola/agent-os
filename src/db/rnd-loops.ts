import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { z } from 'zod';

export const RND_LOOP_COLUMNS = [
  'backlog',
  'investigating',
  'experimenting',
  'convert_to_tasks',
  'shipped',
  'parked'
] as const;

export const RND_LOOP_COLUMN_TITLES: Record<string, string> = {
  backlog: 'Backlog',
  investigating: 'Investigating',
  experimenting: 'Experimenting',
  convert_to_tasks: 'Convert to Tasks',
  shipped: 'Shipped / Learned',
  parked: 'Parked'
};

const rndLoopSchema = z.object({
  id: z.string(),
  theme: z.string(),
  question: z.string().optional(),
  hypothesis: z.string().optional(),
  notes: z.string().optional(),
  experiment: z.string().optional(),
  result: z.string().optional(),
  nextTask: z.string().optional(),
  status: z.string(),
  priority: z.number(),
  ownerAgentId: z.string().optional(),
  cadence: z.string().optional(),
  source: z.string().optional(),
  position: z.number().optional(),
  updatedAt: z.string().optional()
});

export type RndLoop = z.infer<typeof rndLoopSchema>;

const rndLoopBoardSchema = z.object({
  columns: z.record(z.string(), z.array(rndLoopSchema)),
  columnOrder: z.array(z.string()),
  source: z.string()
});

export type RndLoopBoard = z.infer<typeof rndLoopBoardSchema>;

export const emptyRndLoopBoard: RndLoopBoard = {
  columns: Object.fromEntries(RND_LOOP_COLUMNS.map((column) => [column, []])),
  columnOrder: [...RND_LOOP_COLUMNS],
  source: 'empty'
};

export async function getRndLoopBoard(): Promise<RndLoopBoard> {
  if (!hasBridge()) return emptyRndLoopBoard;
  try {
    return rndLoopBoardSchema.parse(await bridgeRequest('/rnd-loops'));
  } catch (error) {
    console.error('R&D loop board bridge request failed', error);
    return { ...emptyRndLoopBoard, source: 'bridge-error' };
  }
}
