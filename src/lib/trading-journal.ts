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
  risk: string
): Promise<PaperBotDecision['research']> {
  const performanceLabel = `${backtest.returnPct.toFixed(2)}% return, ${backtest.maxDrawdownPct.toFixed(2)}% max drawdown, ${backtest.winRatePct.toFixed(2)}% win rate`;
  const volumeLabel = `${snapshot.volumeTrend.verdict} volume, ${snapshot.volumeTrend.changeVsSevenDayPct.toFixed(2)}% vs 7D average`;
  const liveLinks = await fetchLiveResearchLinks();
  const thesis =
    action === 'hold'
      ? `Stand down: ${reason} Backtest quality is ${performanceLabel}; volume context is ${volumeLabel}. Live research is logged as context, not as permission to override the signal.`
      : `${action.toUpperCase()} is paper-only and conditional: ${reason} Backtest quality is ${performanceLabel}; volume context is ${volumeLabel}. Live research is logged as context, not confirmation by itself.`;

  return {
    summary: `Linda decision research pack for ${snapshot.symbol}: strategy=${selectedStrategy}, action=${action}, price=${snapshot.price.toFixed(2)}.`,
    thesis,
    invalidation: risk,
    fetchedAt: new Date().toISOString(),
    factors: [
      `Strategy: ${selectedStrategy}`,
      `Backtest: ${performanceLabel}`,
      `Exposure: ${backtest.exposurePct.toFixed(2)}% of completed daily candles`,
      `Volume regime: ${volumeLabel}`,
      `Live research links captured: ${liveLinks.length}`,
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
  selectedStrategy: TradingStrategy
): Promise<PaperBotDecision> {
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
  const research = await buildResearchBrief(
    snapshot,
    backtest,
    selectedStrategy,
    action,
    reason,
    risk
  );

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

export async function runPaperBotDecision(selectedStrategy: TradingStrategy) {
  const snapshot = await import('@/lib/trading').then((mod) => mod.getMarketSnapshot('BTCUSDT'));
  const backtest = backtestStrategy(snapshot.candles, selectedStrategy);
  const decision = await buildPaperBotDecision(snapshot, backtest, selectedStrategy);
  await appendPaperDecision(decision);
  return decision;
}
