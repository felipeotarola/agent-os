import 'server-only';

import {
  backtestStrategy,
  getTradeDecisionKey,
  type BacktestResult,
  type MarketSnapshot,
  type PaperBotDecision,
  type PaperJournalEntry,
  type Trade,
  type TradingSignal,
  type TradingStrategy
} from '@/lib/trading';
import { db } from '@/db/client';
import { tradingBacktestRuns, tradingDecisions } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
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

function decisionSignalId(decision: PaperJournalEntry) {
  if (decision.kind === 'bot' && decision.evidence.trade?.key) return decision.evidence.trade.key;
  return `decision:${decision.id}`;
}

function buildTradingSignals(decisions: PaperJournalEntry[]): TradingSignal[] {
  return decisions.map((decision) => ({
    id: decisionSignalId(decision),
    source: 'journal-decision',
    decisionId: decision.id,
    symbol: decision.symbol,
    strategy: decision.kind === 'bot' ? decision.strategy : undefined,
    action: decision.action,
    time: decision.createdAt,
    price: decision.price,
    reason: decision.reason,
    trade: decision.kind === 'bot' ? decision.evidence.trade : undefined,
    decision
  }));
}

function databaseEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

function fileJournalEnabled() {
  return process.env.TRADING_JOURNAL_FILE_FALLBACK === '1';
}

function toDate(value: string) {
  return new Date(value);
}

function fromDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function decisionToRow(entry: PaperJournalEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    agent: entry.kind === 'bot' ? entry.agent : null,
    symbol: entry.symbol,
    strategy: entry.kind === 'bot' ? entry.strategy : null,
    action: entry.action,
    price: entry.price,
    confidence: entry.kind === 'bot' ? entry.confidence : null,
    reason: entry.reason,
    risk: entry.kind === 'bot' ? entry.risk : '',
    nextCheck: entry.kind === 'bot' ? entry.nextCheck : '',
    evidence: entry.kind === 'bot' ? entry.evidence : {},
    research: entry.kind === 'bot' ? (entry.research ?? null) : null,
    portfolio: entry.kind === 'manual' ? entry.portfolio : null,
    disclaimer: entry.disclaimer,
    createdAt: toDate(entry.createdAt)
  };
}

function rowToDecision(row: typeof tradingDecisions.$inferSelect): PaperJournalEntry {
  const base = {
    id: row.id,
    createdAt: fromDate(row.createdAt),
    symbol: row.symbol,
    action: row.action as 'buy' | 'sell' | 'hold' | 'reset',
    price: row.price,
    reason: row.reason,
    disclaimer: row.disclaimer
  };

  if (row.kind === 'bot') {
    return {
      ...base,
      kind: 'bot',
      agent: (row.agent ?? 'Linda') as 'Linda',
      strategy: (row.strategy ?? 'volume-breakout') as TradingStrategy,
      action: base.action as 'buy' | 'sell' | 'hold',
      confidence: row.confidence ?? 0,
      risk: row.risk,
      nextCheck: row.nextCheck,
      evidence: row.evidence as Extract<PaperJournalEntry, { kind: 'bot' }>['evidence'],
      research: (row.research ?? undefined) as Extract<
        PaperJournalEntry,
        { kind: 'bot' }
      >['research']
    };
  }

  return {
    ...base,
    kind: 'manual',
    action: base.action as 'buy' | 'sell' | 'reset',
    portfolio: (row.portfolio ?? { cash: 0, btc: 0, equity: 0 }) as Extract<
      PaperJournalEntry,
      { kind: 'manual' }
    >['portfolio']
  };
}

function backtestRunToRow(record: BacktestRunRecord) {
  return {
    id: record.id,
    symbol: record.symbol,
    candleCount: record.candleCount,
    snapshotUpdatedAt: toDate(record.updatedAt),
    strategies: record.strategies,
    createdAt: toDate(record.createdAt)
  };
}

function rowToBacktestRun(row: typeof tradingBacktestRuns.$inferSelect): BacktestRunRecord {
  return {
    id: row.id,
    createdAt: fromDate(row.createdAt),
    symbol: row.symbol,
    candleCount: row.candleCount,
    updatedAt: fromDate(row.snapshotUpdatedAt),
    strategies: row.strategies as BacktestRunRecord['strategies']
  };
}

async function readDbJournal(): Promise<TradingJournal> {
  const [backtestRows, decisionRows] = await Promise.all([
    db
      .select()
      .from(tradingBacktestRuns)
      .orderBy(desc(tradingBacktestRuns.createdAt))
      .limit(MAX_BACKTEST_RUNS),
    db
      .select()
      .from(tradingDecisions)
      .orderBy(desc(tradingDecisions.createdAt))
      .limit(MAX_DECISIONS)
  ]);

  if (fileJournalEnabled() && backtestRows.length === 0 && decisionRows.length === 0) {
    const fileJournal = await readFileJournal();
    if (fileJournal.backtestRuns.length > 0 || fileJournal.decisions.length > 0) {
      await writeDbJournal(fileJournal);
      return fileJournal;
    }
  }

  return {
    version: 1,
    backtestRuns: backtestRows.map(rowToBacktestRun).toReversed(),
    decisions: decisionRows.map(rowToDecision).toReversed()
  };
}

async function writeDbJournal(journal: TradingJournal) {
  if (journal.backtestRuns.length > 0) {
    await db
      .insert(tradingBacktestRuns)
      .values(journal.backtestRuns.map(backtestRunToRow))
      .onConflictDoNothing();
  }

  if (journal.decisions.length > 0) {
    await db
      .insert(tradingDecisions)
      .values(journal.decisions.map(decisionToRow))
      .onConflictDoNothing();
  }
}

async function readJournal(): Promise<TradingJournal> {
  if (databaseEnabled()) {
    try {
      return await readDbJournal();
    } catch (error) {
      if (!fileJournalEnabled()) {
        console.error('Trading DB journal read failed; returning empty journal', error);
        return emptyJournal();
      }
      console.error('Trading DB journal read failed; falling back to file', error);
    }
  }

  if (!fileJournalEnabled()) return emptyJournal();

  return readFileJournal();
}

async function readFileJournal(): Promise<TradingJournal> {
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
  if (databaseEnabled()) {
    try {
      await writeDbJournal(journal);
      return;
    } catch (error) {
      if (!fileJournalEnabled()) {
        console.error('Trading DB journal write failed; skipping file fallback', error);
        return;
      }
      console.error('Trading DB journal write failed; falling back to file', error);
    }
  }

  if (!fileJournalEnabled()) return;

  await mkdir(DATA_DIR, { recursive: true });
  const temporaryPath = `${JOURNAL_PATH}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, JOURNAL_PATH);
}

export async function getTradingJournal() {
  const journal = await readJournal();
  const decisions = journal.decisions.slice(-MAX_DECISIONS);
  return {
    backtestRuns: journal.backtestRuns.slice(-MAX_BACKTEST_RUNS),
    decisions,
    signals: buildTradingSignals(decisions)
  };
}

export async function clearTradingJournal() {
  const empty = emptyJournal();

  if (databaseEnabled()) {
    try {
      await Promise.all([db.delete(tradingDecisions), db.delete(tradingBacktestRuns)]);
    } catch (error) {
      console.error('Trading DB journal clear failed', error);
    }
  }

  if (fileJournalEnabled()) {
    await mkdir(DATA_DIR, { recursive: true });
    const temporaryPath = `${JOURNAL_PATH}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(empty, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, JOURNAL_PATH);
  }

  return empty;
}

export async function deleteTradingSignal(signalId: string) {
  const journal = await readJournal();
  const decision = journal.decisions.find(
    (entry) => decisionSignalId(entry) === signalId || entry.id === signalId
  );

  if (!decision) {
    const decisions = journal.decisions.slice(-MAX_DECISIONS);
    return {
      backtestRuns: journal.backtestRuns.slice(-MAX_BACKTEST_RUNS),
      decisions,
      signals: buildTradingSignals(decisions)
    };
  }

  if (databaseEnabled()) {
    try {
      await db.delete(tradingDecisions).where(eq(tradingDecisions.id, decision.id));
    } catch (error) {
      console.error('Trading DB signal delete failed', error);
    }
  }

  const nextJournal = {
    ...journal,
    decisions: journal.decisions.filter((entry) => entry.id !== decision.id)
  };

  if (fileJournalEnabled()) await writeJournal(nextJournal);

  const decisions = nextJournal.decisions.slice(-MAX_DECISIONS);
  return {
    backtestRuns: nextJournal.backtestRuns.slice(-MAX_BACKTEST_RUNS),
    decisions,
    signals: buildTradingSignals(decisions)
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

type ResearchLink = NonNullable<PaperBotDecision['research']>['links'][number];

type ResearchFeed = {
  source: string;
  url: string;
};

const RESEARCH_FEEDS: ResearchFeed[] = [
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { source: 'Decrypt', url: 'https://decrypt.co/feed' }
];

function decodeXml(value: string) {
  return value
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function firstXmlTag(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : undefined;
}

async function fetchResearchFeed(feed: ResearchFeed): Promise<ResearchLink[]> {
  try {
    const response = await fetch(feed.url, {
      cache: 'no-store',
      headers: { accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) return [];

    const xml = await response.text();
    return xml
      .split(/<item\b/i)
      .slice(1)
      .map((rawItem) => `<item${rawItem}`)
      .map((item): ResearchLink | undefined => {
        const title = firstXmlTag(item, 'title');
        const link = firstXmlTag(item, 'link') ?? firstXmlTag(item, 'guid');
        const description = firstXmlTag(item, 'description');
        const publishedAt = firstXmlTag(item, 'pubDate');
        if (!title || !link) return undefined;
        const haystack = `${title} ${description ?? ''}`.toLowerCase();
        if (!/(bitcoin|btc|crypto|etf|macro|liquidity|binance|coinbase)/.test(haystack)) {
          return undefined;
        }
        const researchLink: ResearchLink = {
          label: title.slice(0, 120),
          url: link,
          note: description
            ? description.replace(/\s+/g, ' ').slice(0, 180)
            : `Fresh ${feed.source} RSS item considered for market context.`,
          source: feed.source
        };
        if (publishedAt) researchLink.publishedAt = new Date(publishedAt).toISOString();
        return researchLink;
      })
      .filter((item): item is ResearchLink => item !== undefined)
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function fetchLiveResearchLinks() {
  const settled = await Promise.allSettled(RESEARCH_FEEDS.map((feed) => fetchResearchFeed(feed)));
  const seen = new Set<string>();
  return settled
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    })
    .toSorted((left, right) => {
      const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
      const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;
      return rightTime - leftTime;
    })
    .slice(0, 6);
}

async function buildResearchBrief(
  snapshot: MarketSnapshot,
  backtest: BacktestResult,
  selectedStrategy: TradingStrategy,
  action: 'buy' | 'sell' | 'hold',
  reason: string,
  risk: string,
  targetTrade?: Trade
): Promise<PaperBotDecision['research']> {
  const performanceLabel = `${backtest.returnPct.toFixed(2)}% return, ${backtest.maxDrawdownPct.toFixed(2)}% max drawdown, ${backtest.winRatePct.toFixed(2)}% win rate`;
  const volumeLabel = `${snapshot.volumeTrend.verdict} volume, ${snapshot.volumeTrend.changeVsSevenDayPct.toFixed(2)}% vs 7D average`;
  const liveLinks = targetTrade ? [] : await fetchLiveResearchLinks();
  const tradeLabel = targetTrade
    ? `${new Date(targetTrade.time).toISOString().slice(0, 10)} ${targetTrade.side.toUpperCase()} at ${targetTrade.price.toFixed(2)}`
    : undefined;
  const thesis = targetTrade
    ? `Trade-level brief for ${tradeLabel}: ${reason} Backtest quality is ${performanceLabel}; volume context is ${volumeLabel}. This is a historical paper decision brief for the selected backtest trade.`
    : action === 'hold'
      ? `Stand down: ${reason} Backtest quality is ${performanceLabel}; volume context is ${volumeLabel}. Live research is logged as context, not as permission to override the signal.`
      : `${action.toUpperCase()} is paper-only and conditional: ${reason} Backtest quality is ${performanceLabel}; volume context is ${volumeLabel}. Live research is logged as context, not confirmation by itself.`;

  return {
    summary: targetTrade
      ? `Linda trade brief for ${snapshot.symbol}: strategy=${selectedStrategy}, action=${action}, trade=${tradeLabel}.`
      : `Linda decision research pack for ${snapshot.symbol}: strategy=${selectedStrategy}, action=${action}, price=${snapshot.price.toFixed(2)}.`,
    thesis,
    invalidation: risk,
    fetchedAt: new Date().toISOString(),
    factors: [
      `Strategy: ${selectedStrategy}`,
      `Backtest: ${performanceLabel}`,
      `Exposure: ${backtest.exposurePct.toFixed(2)}% of completed daily candles`,
      `Volume regime: ${volumeLabel}`,
      `Live research links captured: ${liveLinks.length}`,
      ...(targetTrade ? [`Selected trade: ${tradeLabel} — ${targetTrade.reason}`] : []),
      backtest.trades.at(-1)
        ? `Latest backtest signal: ${backtest.trades.at(-1)?.side} — ${backtest.trades.at(-1)?.reason}`
        : 'Latest backtest signal: none in this window'
    ],
    links: [
      ...liveLinks,
      {
        label: 'Binance BTCUSDT spot ticker',
        url: 'https://www.binance.com/en/trade/BTC_USDT',
        note: 'Spot price and spot volume reference used by the snapshot when available.',
        source: 'Binance'
      },
      {
        label: 'Binance BTCUSDT futures',
        url: 'https://www.binance.com/en/futures/BTCUSDT',
        note: 'Futures quote-volume context used by Trading Lab when available.',
        source: 'Binance'
      },
      {
        label: 'CoinGecko Bitcoin market data',
        url: 'https://www.coingecko.com/en/coins/bitcoin',
        note: 'Fallback/current market data and broad 24h market-volume context.',
        source: 'CoinGecko'
      },
      {
        label: 'TradingView BTCUSDT chart',
        url: 'https://www.tradingview.com/symbols/BTCUSDT/',
        note: 'Visual chart context shown in Trading Lab; strategy signals are still internal paper signals.',
        source: 'TradingView'
      }
    ]
  };
}

export async function buildPaperBotDecision(
  snapshot: MarketSnapshot,
  backtest: BacktestResult,
  selectedStrategy: TradingStrategy,
  targetTrade?: Trade
): Promise<PaperBotDecision> {
  const lastTrade = backtest.trades.at(-1);
  const latestTime = latestCompleteCandleTime(snapshot);
  const score = scoreBacktest(backtest, snapshot);
  const latestSignalIsFresh =
    lastTrade !== undefined && latestTime !== undefined && lastTrade.time === latestTime;
  const action = targetTrade ? targetTrade.side : latestSignalIsFresh ? lastTrade.side : 'hold';
  const confidence = Math.max(5, Math.min(95, 50 + score));
  const reason = targetTrade
    ? `${targetTrade.side.toUpperCase()} signal from ${selectedStrategy} on ${new Date(targetTrade.time).toISOString().slice(0, 10)}: ${targetTrade.reason}`
    : latestSignalIsFresh
      ? `${lastTrade.side.toUpperCase()} signal from ${selectedStrategy}: ${lastTrade.reason}`
      : `No fresh ${selectedStrategy} signal on the latest completed candle; observe only.`;
  const risk = targetTrade
    ? `Historical ${selectedStrategy} trade can fail if the next candles invalidate ${targetTrade.reason}, liquidity fades, or the strategy regime changes before exit.`
    : action === 'hold'
      ? 'No fresh edge. Main risk is overtrading stale signals or acting on incomplete candles.'
      : `Signal can fail if BTC rejects the current move, volume dries up, or the ${selectedStrategy} backtest regime stops matching current market structure.`;
  const research = await buildResearchBrief(
    snapshot,
    backtest,
    selectedStrategy,
    action,
    reason,
    risk,
    targetTrade
  );
  const evidenceTrade = targetTrade
    ? {
        key: getTradeDecisionKey(selectedStrategy, targetTrade),
        side: targetTrade.side,
        time: targetTrade.time,
        price: targetTrade.price,
        quantity: targetTrade.quantity,
        equity: targetTrade.equity,
        reason: targetTrade.reason
      }
    : undefined;

  return {
    id: randomUUID(),
    kind: 'bot',
    agent: 'Linda',
    createdAt: targetTrade ? new Date(targetTrade.time).toISOString() : new Date().toISOString(),
    symbol: snapshot.symbol,
    strategy: selectedStrategy,
    action,
    price: targetTrade ? targetTrade.price : snapshot.price,
    confidence,
    reason,
    risk,
    nextCheck: targetTrade
      ? 'Follow the next completed candle after this trade and compare the strategy exit rule before repeating the setup.'
      : 'Re-evaluate after the next completed daily candle or a major volume regime change.',
    evidence: {
      returnPct: backtest.returnPct,
      maxDrawdownPct: backtest.maxDrawdownPct,
      winRatePct: backtest.winRatePct,
      exposurePct: backtest.exposurePct,
      volumeVerdict: snapshot.volumeTrend.verdict,
      volumeVsSevenDayPct: snapshot.volumeTrend.changeVsSevenDayPct,
      lastSignal: targetTrade
        ? { side: targetTrade.side, time: targetTrade.time, reason: targetTrade.reason }
        : lastTrade
          ? { side: lastTrade.side, time: lastTrade.time, reason: lastTrade.reason }
          : undefined,
      trade: evidenceTrade
    },
    research,
    disclaimer: 'Paper-only decision. No exchange keys, no real orders, no execution.'
  };
}

export async function appendPaperDecision(entry: PaperJournalEntry) {
  const journal = await readJournal();
  journal.decisions = [...journal.decisions, entry].slice(-MAX_DECISIONS);
  await writeJournal(journal);
  return entry;
}

export async function ensurePaperBotDecisionBrief(
  snapshot: MarketSnapshot,
  backtests: BacktestResult[],
  selectedStrategy: TradingStrategy = 'volume-breakout'
) {
  const journal = await readJournal();
  const latestDecision = journal.decisions.at(-1);

  if (latestDecision?.kind === 'bot' && latestDecision.research) return undefined;

  const backtest =
    backtests.find((item) => item.strategy === selectedStrategy) ??
    backtests[0] ??
    backtestStrategy(snapshot.candles, selectedStrategy);
  const decision = await buildPaperBotDecision(snapshot, backtest, backtest.strategy);

  journal.decisions = [...journal.decisions, decision].slice(-MAX_DECISIONS);
  await writeJournal(journal);
  return decision;
}

export async function runPaperBotDecision(
  selectedStrategy: TradingStrategy,
  target?: { tradeTime?: number; tradeSide?: Trade['side'] }
) {
  const snapshot = await import('@/lib/trading').then((mod) => mod.getMarketSnapshot('BTCUSDT'));
  const backtest = backtestStrategy(snapshot.candles, selectedStrategy);
  const targetTrade =
    target?.tradeTime === undefined
      ? undefined
      : backtest.trades.find(
          (trade) =>
            trade.time === target.tradeTime &&
            (target.tradeSide === undefined || trade.side === target.tradeSide)
        );

  if (target?.tradeTime !== undefined && targetTrade === undefined) {
    throw new Error('Backtest trade was not found for this strategy');
  }

  if (targetTrade) {
    const journal = await readJournal();
    const tradeKey = getTradeDecisionKey(selectedStrategy, targetTrade);
    const existingDecision = journal.decisions.find(
      (decision) =>
        decision.kind === 'bot' &&
        decision.strategy === selectedStrategy &&
        decision.evidence.trade?.key === tradeKey
    );

    if (existingDecision?.kind === 'bot') return existingDecision;

    const decision = await buildPaperBotDecision(snapshot, backtest, selectedStrategy, targetTrade);
    journal.decisions = [...journal.decisions, decision].slice(-MAX_DECISIONS);
    await writeJournal(journal);
    return decision;
  }

  const decision = await buildPaperBotDecision(snapshot, backtest, selectedStrategy);
  await appendPaperDecision(decision);
  return decision;
}
