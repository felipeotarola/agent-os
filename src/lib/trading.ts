export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
};

export type Trade = {
  id?: string;
  decisionId?: string;
  side: 'buy' | 'sell';
  time: number;
  price: number;
  quantity: number;
  equity: number;
  reason: string;
};

export type TradeDecisionLink = Pick<
  Trade,
  'side' | 'time' | 'price' | 'quantity' | 'equity' | 'reason'
> & {
  key: string;
};

export type PaperRiskAssessment = {
  requestedAction: 'buy' | 'sell' | 'hold';
  executableAction: 'buy' | 'sell' | 'hold';
  allowed: boolean;
  blockedReasons: string[];
  positionCash: number;
  positionPct: number;
  maxPositionPct: number;
  confidenceThreshold: number;
  maxBacktestDrawdownPct: number;
  maxPaperLossPct: number;
  cooldownDays: number;
  cooldownActive: boolean;
  confidenceGuardActive: boolean;
  drawdownGuardActive: boolean;
  paperLossGuardActive: boolean;
};

export type MarketDataInputs = {
  fundingRatePct?: number;
  openInterestUsd?: number;
  atr14?: number;
  atr14Pct?: number;
  spreadPct?: number;
  topBookDepthUsd?: number;
  sources: string[];
  missing: string[];
};

export type BacktestResult = {
  strategy: TradingStrategy;
  symbol: string;
  startCapital: number;
  finalEquity: number;
  returnPct: number;
  maxDrawdownPct: number;
  trades: Trade[];
  winRatePct: number;
  exposurePct: number;
};

export type TradingStrategy = 'sma-cross' | 'rsi-reversion' | 'volume-breakout';

export type PaperBotDecision = {
  id: string;
  kind: 'bot';
  agent: 'Linda';
  createdAt: string;
  symbol: string;
  strategy: TradingStrategy;
  action: 'buy' | 'sell' | 'hold';
  price: number;
  confidence: number;
  reason: string;
  risk: string;
  nextCheck: string;
  evidence: {
    returnPct: number;
    maxDrawdownPct: number;
    winRatePct: number;
    exposurePct: number;
    volumeVerdict: 'rising' | 'flat' | 'falling';
    volumeVsSevenDayPct: number;
    lastSignal?: Pick<Trade, 'side' | 'time' | 'reason'>;
    trade?: TradeDecisionLink;
    risk?: PaperRiskAssessment;
    marketData?: MarketDataInputs;
  };
  research?: {
    summary: string;
    thesis: string;
    invalidation: string;
    factors: string[];
    fetchedAt: string;
    links: Array<{
      label: string;
      url: string;
      note: string;
      source?: string;
      publishedAt?: string;
    }>;
  };
  disclaimer: string;
};

export type ManualPaperDecision = {
  id: string;
  kind: 'manual';
  createdAt: string;
  symbol: string;
  action: 'buy' | 'sell' | 'reset';
  price: number;
  reason: string;
  portfolio: {
    cash: number;
    btc: number;
    equity: number;
  };
  disclaimer: string;
};

export type PaperJournalEntry = PaperBotDecision | ManualPaperDecision;

export type TradingSignal = {
  id: string;
  source: 'journal-decision';
  decisionId: string;
  symbol: string;
  strategy?: TradingStrategy;
  action: 'buy' | 'sell' | 'hold' | 'reset';
  time: string;
  price: number;
  reason: string;
  trade?: TradeDecisionLink;
  decision: PaperJournalEntry;
};

export type MarketSnapshot = {
  symbol: string;
  price: number;
  priceChangePct24h: number;
  spotQuoteVolume24h: number;
  futuresQuoteVolume24h: number;
  globalQuoteVolume24h?: number;
  volumeTrend: {
    latest: number;
    previous: number;
    sevenDayAverage: number;
    changeVsPreviousPct: number;
    changeVsSevenDayPct: number;
    verdict: 'rising' | 'flat' | 'falling';
  };
  marketData: MarketDataInputs;
  candles: Candle[];
  updatedAt: string;
};

export function getTradeDecisionKey(
  strategy: TradingStrategy,
  trade: Pick<Trade, 'side' | 'time' | 'price'>
) {
  return `${strategy}:${trade.time}:${trade.side}:${trade.price.toFixed(2)}`;
}

export function getFallbackMarketSnapshot(symbol = 'BTCUSDT'): MarketSnapshot {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const candles = Array.from({ length: 90 }, (_, index) => {
    const time = now - (89 - index) * dayMs;
    return {
      time,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
      quoteVolume: 0
    };
  });

  return {
    symbol,
    price: 0,
    priceChangePct24h: 0,
    spotQuoteVolume24h: 0,
    futuresQuoteVolume24h: 0,
    globalQuoteVolume24h: 0,
    volumeTrend: {
      latest: 0,
      previous: 0,
      sevenDayAverage: 0,
      changeVsPreviousPct: 0,
      changeVsSevenDayPct: 0,
      verdict: 'flat'
    },
    marketData: { sources: [], missing: ['fallback snapshot'] },
    candles,
    updatedAt: new Date().toISOString()
  };
}

export type TradingJournal = {
  backtestRuns: unknown[];
  decisions: PaperJournalEntry[];
  signals: TradingSignal[];
  wallet?: PaperWallet;
};

export type PaperWalletExecution = {
  id: string;
  walletId: string;
  decisionId: string;
  action: 'buy' | 'sell';
  price: number;
  quantity: number;
  cashDelta: number;
  assetDelta: number;
  fee: number;
  equityAfter: number;
  reason: string;
  createdAt: string;
};

export type PaperWallet = {
  id: string;
  agent: 'Linda';
  symbol: 'BTCUSDC';
  baseAsset: 'BTC';
  quoteAsset: 'USDC';
  startingCash: number;
  cashBalance: number;
  assetBalance: number;
  realizedPnl: number;
  updatedAt: string;
  executions: PaperWalletExecution[];
};

const BINANCE_REST = 'https://api.binance.com';
const BINANCE_US_REST = 'https://api.binance.us';
const BINANCE_FUTURES = 'https://fapi.binance.com';
const COINGECKO = 'https://api.coingecko.com/api/v3';
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD';
const DAILY_CANDLE_HISTORY_LIMIT = 4_000;
const BINANCE_KLINE_PAGE_LIMIT = 1_000;

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }

  return response.json() as Promise<T>;
}

async function getBinanceDailyCandles(
  baseUrl: string,
  symbol = 'BTCUSDT',
  limit = 120
): Promise<Candle[]> {
  let remaining = Math.max(1, limit);
  let endTime = Date.now();
  const candles: Candle[] = [];

  while (remaining > 0) {
    const pageLimit = Math.min(BINANCE_KLINE_PAGE_LIMIT, remaining);
    const rows = await fetchJson<unknown[][]>(
      `${baseUrl}/api/v3/klines?symbol=${encodeURIComponent(
        symbol
      )}&interval=1d&limit=${pageLimit}&endTime=${endTime}`
    );

    if (rows.length === 0) break;

    const pageCandles = rows.map((row) => ({
      time: toNumber(row[0]),
      open: toNumber(row[1]),
      high: toNumber(row[2]),
      low: toNumber(row[3]),
      close: toNumber(row[4]),
      volume: toNumber(row[5]),
      quoteVolume: toNumber(row[7])
    }));

    candles.unshift(...pageCandles);
    remaining -= pageCandles.length;
    endTime = pageCandles[0].time - 1;

    if (pageCandles.length < pageLimit) break;
  }

  const unique = new Map(candles.map((candle) => [candle.time, candle]));
  return Array.from(unique.values())
    .toSorted((left, right) => left.time - right.time)
    .slice(-limit);
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
};

async function getYahooDailyCandles(limit = 120): Promise<Candle[]> {
  const daySeconds = 24 * 60 * 60;
  const period2 = Math.floor(Date.now() / 1000) + daySeconds;
  const period1 = period2 - (limit + 30) * daySeconds;
  const chart = await fetchJson<YahooChartResponse>(
    `${YAHOO_CHART}?period1=${period1}&period2=${period2}&interval=1d`
  );
  const result = chart.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];
  const opens = quote?.open ?? [];
  const highs = quote?.high ?? [];
  const lows = quote?.low ?? [];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];

  return timestamps
    .map((timestamp, index) => {
      const close = toNumber(closes[index]);
      const volume = toNumber(volumes[index]);
      return {
        time: timestamp * 1000,
        open: toNumber(opens[index] ?? close),
        high: toNumber(highs[index] ?? close),
        low: toNumber(lows[index] ?? close),
        close,
        volume,
        quoteVolume: volume * close
      };
    })
    .filter((candle) => candle.close > 0)
    .toSorted((left, right) => left.time - right.time)
    .slice(-limit);
}

export async function getDailyCandles(symbol = 'BTCUSDT', limit = 120): Promise<Candle[]> {
  try {
    return await getBinanceDailyCandles(BINANCE_REST, symbol, limit);
  } catch {
    try {
      return await getBinanceDailyCandles(BINANCE_US_REST, symbol, limit);
    } catch {
      return getYahooDailyCandles(limit);
    }
  }
}

type BinanceTicker = {
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
};

type BinancePremiumIndex = {
  lastFundingRate?: string;
};

type BinanceOpenInterest = {
  openInterest?: string;
};

type BinanceDepth = {
  bids?: Array<[string, string]>;
  asks?: Array<[string, string]>;
};

type CoinGeckoSimple = {
  bitcoin?: {
    usd?: number;
    usd_24h_vol?: number;
    usd_24h_change?: number;
  };
};

async function getCoinGeckoSimple() {
  return fetchJson<CoinGeckoSimple>(
    `${COINGECKO}/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`
  );
}

function atr(candles: Candle[], period = 14) {
  const completed = candles.filter((candle) => candle.close > 0).slice(0, -1);
  if (completed.length < period + 1) return undefined;

  const trueRanges = completed.slice(1).map((candle, index) => {
    const previousClose = completed[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  const sample = trueRanges.slice(-period);
  return sample.reduce((sum, value) => sum + value, 0) / sample.length;
}

function depthMetrics(depth?: BinanceDepth) {
  const bestBid = depth?.bids?.[0];
  const bestAsk = depth?.asks?.[0];
  const bid = bestBid ? toNumber(bestBid[0]) : 0;
  const ask = bestAsk ? toNumber(bestAsk[0]) : 0;
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
  const topBookDepthUsd = [...(depth?.bids ?? []), ...(depth?.asks ?? [])]
    .slice(0, 10)
    .reduce((sum, [price, quantity]) => sum + toNumber(price) * toNumber(quantity), 0);

  return {
    spreadPct: mid > 0 ? ((ask - bid) / mid) * 100 : undefined,
    topBookDepthUsd: topBookDepthUsd > 0 ? topBookDepthUsd : undefined
  };
}

export async function getMarketSnapshot(symbol = 'BTCUSDT'): Promise<MarketSnapshot> {
  const [dailyCandles, spotTicker, futuresTicker, coinGecko, premiumIndex, openInterest, depth] =
    await Promise.allSettled([
      getDailyCandles(symbol, DAILY_CANDLE_HISTORY_LIMIT),
      fetchJson<BinanceTicker>(
        `${BINANCE_REST}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`
      ),
      fetchJson<BinanceTicker>(
        `${BINANCE_FUTURES}/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`
      ),
      getCoinGeckoSimple(),
      fetchJson<BinancePremiumIndex>(
        `${BINANCE_FUTURES}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`
      ),
      fetchJson<BinanceOpenInterest>(
        `${BINANCE_FUTURES}/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`
      ),
      fetchJson<BinanceDepth>(
        `${BINANCE_REST}/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=5`
      )
    ]);

  const candles =
    dailyCandles.status === 'fulfilled' && dailyCandles.value.length > 0 ? dailyCandles.value : [];
  const spot = spotTicker.status === 'fulfilled' ? spotTicker.value : undefined;
  const futures = futuresTicker.status === 'fulfilled' ? futuresTicker.value : undefined;
  const gecko = coinGecko.status === 'fulfilled' ? coinGecko.value.bitcoin : undefined;
  const premium = premiumIndex.status === 'fulfilled' ? premiumIndex.value : undefined;
  const interest = openInterest.status === 'fulfilled' ? openInterest.value : undefined;
  const book = depth.status === 'fulfilled' ? depth.value : undefined;

  const completeCandles = candles.slice(0, -1);
  const recent = completeCandles.slice(-8);
  const latest = recent.at(-1)?.quoteVolume ?? 0;
  const previous = recent.at(-2)?.quoteVolume ?? 0;
  const seven = recent.slice(0, -1);
  const sevenDayAverage =
    seven.reduce((sum, candle) => sum + candle.quoteVolume, 0) / Math.max(seven.length, 1);
  const changeVsPreviousPct = previous ? ((latest - previous) / previous) * 100 : 0;
  const changeVsSevenDayPct = sevenDayAverage
    ? ((latest - sevenDayAverage) / sevenDayAverage) * 100
    : 0;
  const verdict =
    changeVsSevenDayPct > 12 ? 'rising' : changeVsSevenDayPct < -12 ? 'falling' : 'flat';
  const currentPrice = toNumber(spot?.lastPrice ?? gecko?.usd);
  const atr14 = atr(candles);
  const { spreadPct, topBookDepthUsd } = depthMetrics(book);
  const fundingRatePct = premium?.lastFundingRate
    ? toNumber(premium.lastFundingRate) * 100
    : undefined;
  const openInterestUsd = interest?.openInterest
    ? toNumber(interest.openInterest) * currentPrice
    : undefined;
  const marketData: MarketDataInputs = {
    fundingRatePct,
    openInterestUsd,
    atr14,
    atr14Pct: atr14 && currentPrice ? (atr14 / currentPrice) * 100 : undefined,
    spreadPct,
    topBookDepthUsd,
    sources: [
      premium ? 'Binance futures funding' : undefined,
      interest ? 'Binance futures open interest' : undefined,
      book ? 'Binance spot order book' : undefined,
      atr14 ? 'Daily candle ATR14' : undefined
    ].filter((item): item is string => item !== undefined),
    missing: [
      premium ? undefined : 'funding rate',
      interest ? undefined : 'open interest',
      book ? undefined : 'order book depth',
      atr14 ? undefined : 'ATR14 volatility'
    ].filter((item): item is string => item !== undefined)
  };

  return {
    symbol,
    price: currentPrice,
    priceChangePct24h: toNumber(spot?.priceChangePercent ?? gecko?.usd_24h_change),
    spotQuoteVolume24h: toNumber(spot?.quoteVolume ?? gecko?.usd_24h_vol),
    futuresQuoteVolume24h: toNumber(futures?.quoteVolume),
    globalQuoteVolume24h: gecko?.usd_24h_vol,
    volumeTrend: {
      latest,
      previous,
      sevenDayAverage,
      changeVsPreviousPct,
      changeVsSevenDayPct,
      verdict
    },
    marketData,
    candles,
    updatedAt: new Date().toISOString()
  };
}

function sma(values: number[], period: number, index: number) {
  if (index + 1 < period) return undefined;
  const slice = values.slice(index + 1 - period, index + 1);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

function rsi(values: number[], period: number, index: number) {
  if (index < period) return undefined;
  let gains = 0;
  let losses = 0;

  for (let i = index - period + 1; i <= index; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  if (losses === 0) return 100;
  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function simulate(
  candles: Candle[],
  strategy: TradingStrategy,
  shouldBuy: (index: number, closes: number[]) => string | undefined,
  shouldSell: (index: number, closes: number[]) => string | undefined
): BacktestResult {
  const startCapital = 10_000;
  const feeRate = 0.001;
  const closes = candles.map((candle) => candle.close);
  let cash = startCapital;
  let btc = 0;
  let peakEquity = startCapital;
  let maxDrawdownPct = 0;
  let daysInMarket = 0;
  const trades: Trade[] = [];
  const roundTrips: number[] = [];
  let entryEquity = startCapital;

  candles.forEach((candle, index) => {
    const equity = cash + btc * candle.close;
    const buyReason = btc === 0 ? shouldBuy(index, closes) : undefined;
    const sellReason = btc > 0 ? shouldSell(index, closes) : undefined;

    if (buyReason && cash > 0) {
      const quantity = (cash * (1 - feeRate)) / candle.close;
      btc = quantity;
      cash = 0;
      entryEquity = equity;
      trades.push({
        side: 'buy',
        time: candle.time,
        price: candle.close,
        quantity,
        equity,
        reason: buyReason
      });
    } else if (sellReason && btc > 0) {
      cash = btc * candle.close * (1 - feeRate);
      const quantity = btc;
      btc = 0;
      roundTrips.push(((cash - entryEquity) / entryEquity) * 100);
      trades.push({
        side: 'sell',
        time: candle.time,
        price: candle.close,
        quantity,
        equity: cash,
        reason: sellReason
      });
    }

    const markedEquity = cash + btc * candle.close;
    if (btc > 0) daysInMarket += 1;
    peakEquity = Math.max(peakEquity, markedEquity);
    maxDrawdownPct = Math.min(maxDrawdownPct, ((markedEquity - peakEquity) / peakEquity) * 100);
  });

  const last = candles.at(-1);
  const finalEquity = cash + btc * (last?.close ?? 0);
  const winningTrades = roundTrips.filter((value) => value > 0).length;

  return {
    strategy,
    symbol: 'BTCUSDT',
    startCapital,
    finalEquity,
    returnPct: ((finalEquity - startCapital) / startCapital) * 100,
    maxDrawdownPct: Math.abs(maxDrawdownPct),
    trades,
    winRatePct: roundTrips.length ? (winningTrades / roundTrips.length) * 100 : 0,
    exposurePct: candles.length ? (daysInMarket / candles.length) * 100 : 0
  };
}

export function backtestStrategy(candles: Candle[], strategy: TradingStrategy): BacktestResult {
  const completedCandles = candles.slice(0, -1);

  if (strategy === 'rsi-reversion') {
    return simulate(
      completedCandles,
      strategy,
      (index, closes) => {
        const value = rsi(closes, 14, index);
        return value !== undefined && value < 34 ? `RSI oversold ${value.toFixed(1)}` : undefined;
      },
      (index, closes) => {
        const value = rsi(closes, 14, index);
        return value !== undefined && value > 58 ? `RSI normalized ${value.toFixed(1)}` : undefined;
      }
    );
  }

  if (strategy === 'volume-breakout') {
    return simulate(
      completedCandles,
      strategy,
      (index) => {
        if (index < 21) return undefined;
        const candle = completedCandles[index];
        const priorHigh = Math.max(
          ...completedCandles.slice(index - 20, index).map((item) => item.high)
        );
        const avgVolume =
          completedCandles
            .slice(index - 20, index)
            .reduce((sum, item) => sum + item.quoteVolume, 0) / 20;
        return candle.close > priorHigh && candle.quoteVolume > avgVolume * 1.15
          ? '20D breakout with volume confirmation'
          : undefined;
      },
      (index, closes) => {
        const fast = sma(closes, 10, index);
        return fast !== undefined && closes[index] < fast ? 'Close below 10D SMA' : undefined;
      }
    );
  }

  return simulate(
    completedCandles,
    strategy,
    (index, closes) => {
      const fast = sma(closes, 10, index);
      const slow = sma(closes, 30, index);
      const previousFast = sma(closes, 10, index - 1);
      const previousSlow = sma(closes, 30, index - 1);
      return fast !== undefined &&
        slow !== undefined &&
        previousFast !== undefined &&
        previousSlow !== undefined &&
        previousFast <= previousSlow &&
        fast > slow
        ? '10D SMA crossed above 30D SMA'
        : undefined;
    },
    (index, closes) => {
      const fast = sma(closes, 10, index);
      const slow = sma(closes, 30, index);
      const previousFast = sma(closes, 10, index - 1);
      const previousSlow = sma(closes, 30, index - 1);
      return fast !== undefined &&
        slow !== undefined &&
        previousFast !== undefined &&
        previousSlow !== undefined &&
        previousFast >= previousSlow &&
        fast < slow
        ? '10D SMA crossed below 30D SMA'
        : undefined;
    }
  );
}
