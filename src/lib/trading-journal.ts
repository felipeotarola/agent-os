import 'server-only';

import {
  backtestStrategy,
  type BacktestResult,
  type MarketSnapshot,
  type PaperBotDecision,
  type PaperJournalEntry,
  type TradingStrategy
} from '@/lib/trading';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'agent-os', 'data', 'private')
  : path.join(process.cwd(), 'data', 'private');
const JOURNAL_PATH = path.join(DATA_DIR, 'trading-lab-journal.json');
const MAX_BACKTEST_RUNS = 40;
const MAX_DECISIONS = 120;

type TradingJournal = {
  version: 1;
  backtestRuns: BacktestRunRecord[];
  decisions: PaperJournalEntry[];
};

export type BacktestRunRecord = {
  id: string;
  createdAt: string;
  symbol: string;
  candleCount: number;
  updatedAt: string;
  strategies: Array<
    Pick<
      BacktestResult,
      'strategy' | 'finalEquity' | 'returnPct' | 'maxDrawdownPct' | 'winRatePct' | 'exposurePct'
    >
  >;
};

function emptyJournal(): TradingJournal {
  return { version: 1, backtestRuns: [], decisions: [] };
}

async function readJournal(): Promise<TradingJournal> {
  try {
    const raw = await readFile(JOURNAL_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<TradingJournal>;
    return {
      version: 1,
      backtestRuns: Array.isArray(parsed.backtestRuns) ? parsed.backtestRuns : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyJournal();
    throw error;
  }
}

async function writeJournal(journal: TradingJournal) {
  await mkdir(DATA_DIR, { recursive: true });
  const temporaryPath = `${JOURNAL_PATH}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, JOURNAL_PATH);
}

export async function getTradingJournal() {
  const journal = await readJournal();
  return {
    backtestRuns: journal.backtestRuns.slice(-MAX_BACKTEST_RUNS),
    decisions: journal.decisions.slice(-MAX_DECISIONS)
  };
}

export async function persistBacktestRun(snapshot: MarketSnapshot, backtests: BacktestResult[]) {
  const journal = await readJournal();
  const record: BacktestRunRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    symbol: snapshot.symbol,
    candleCount: snapshot.candles.length,
    updatedAt: snapshot.updatedAt,
    strategies: backtests.map(
      ({ strategy, finalEquity, returnPct, maxDrawdownPct, winRatePct, exposurePct }) => ({
        strategy,
        finalEquity,
        returnPct,
        maxDrawdownPct,
        winRatePct,
        exposurePct
      })
    )
  };

  journal.backtestRuns = [...journal.backtestRuns, record].slice(-MAX_BACKTEST_RUNS);
  await writeJournal(journal);
  return record;
}

function scoreBacktest(backtest: BacktestResult, snapshot: MarketSnapshot) {
  const trendBonus =
    snapshot.volumeTrend.verdict === 'rising'
      ? 8
      : snapshot.volumeTrend.verdict === 'falling'
        ? -8
        : 0;
  const returnComponent = Math.max(-25, Math.min(25, backtest.returnPct));
  const winComponent = Math.max(-15, Math.min(15, backtest.winRatePct - 50));
  const drawdownPenalty = Math.min(25, backtest.maxDrawdownPct);
  return returnComponent + winComponent + trendBonus - drawdownPenalty;
}

function latestCompleteCandleTime(snapshot: MarketSnapshot) {
  return snapshot.candles.slice(0, -1).at(-1)?.time;
}

export function buildPaperBotDecision(
  snapshot: MarketSnapshot,
  backtest: BacktestResult,
  selectedStrategy: TradingStrategy
): PaperBotDecision {
  const lastTrade = backtest.trades.at(-1);
  const latestTime = latestCompleteCandleTime(snapshot);
  const score = scoreBacktest(backtest, snapshot);
  const latestSignalIsFresh =
    lastTrade !== undefined && latestTime !== undefined && lastTrade.time === latestTime;
  const action = latestSignalIsFresh ? lastTrade.side : 'hold';
  const confidence = Math.max(5, Math.min(95, 50 + score));
  const reason = latestSignalIsFresh
    ? `${lastTrade.side.toUpperCase()} signal from ${selectedStrategy}: ${lastTrade.reason}`
    : `No fresh ${selectedStrategy} signal on the latest completed candle; observe only.`;
  const risk =
    action === 'hold'
      ? 'No fresh edge. Main risk is overtrading stale signals or acting on incomplete candles.'
      : `Signal can fail if BTC rejects the current move, volume dries up, or the ${selectedStrategy} backtest regime stops matching current market structure.`;

  return {
    id: randomUUID(),
    kind: 'bot',
    agent: 'Linda',
    createdAt: new Date().toISOString(),
    symbol: snapshot.symbol,
    strategy: selectedStrategy,
    action,
    price: snapshot.price,
    confidence,
    reason,
    risk,
    nextCheck: 'Re-evaluate after the next completed daily candle or a major volume regime change.',
    evidence: {
      returnPct: backtest.returnPct,
      maxDrawdownPct: backtest.maxDrawdownPct,
      winRatePct: backtest.winRatePct,
      exposurePct: backtest.exposurePct,
      volumeVerdict: snapshot.volumeTrend.verdict,
      volumeVsSevenDayPct: snapshot.volumeTrend.changeVsSevenDayPct,
      lastSignal: lastTrade
        ? { side: lastTrade.side, time: lastTrade.time, reason: lastTrade.reason }
        : undefined
    },
    disclaimer: 'Paper-only decision. No exchange keys, no real orders, no execution.'
  };
}

export async function appendPaperDecision(entry: PaperJournalEntry) {
  const journal = await readJournal();
  journal.decisions = [...journal.decisions, entry].slice(-MAX_DECISIONS);
  await writeJournal(journal);
  return entry;
}

export async function runPaperBotDecision(selectedStrategy: TradingStrategy) {
  const snapshot = await import('@/lib/trading').then((mod) => mod.getMarketSnapshot('BTCUSDT'));
  const backtest = backtestStrategy(snapshot.candles, selectedStrategy);
  const decision = buildPaperBotDecision(snapshot, backtest, selectedStrategy);
  await appendPaperDecision(decision);
  return decision;
}
