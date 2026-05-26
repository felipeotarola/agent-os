'use client';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { RightContextSidebarRegistration } from '@/components/layout/right-context-sidebar';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type LogicalRange,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp
} from 'lightweight-charts';
import {
  getTradeDecisionKey,
  type BacktestResult,
  type Candle,
  type MarketSnapshot,
  type PaperBotDecision,
  type PaperJournalEntry,
  type PaperRiskAssessment,
  type StrategyLearningScorecard,
  type Trade,
  type TradingJournal,
  type TradingSignal
} from '@/lib/trading';
import { useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';

type TradingLabPayload = {
  snapshot: MarketSnapshot;
  backtests: BacktestResult[];
  journal: TradingJournal;
};

type PaperPortfolio = {
  cash: number;
  btc: number;
  startingCash: number;
  averageEntryPrice?: number;
  realizedPnl: number;
  updatedAt: string;
  executions: Array<{
    id: string;
    decisionId: string;
    action: 'buy' | 'sell';
    price: number;
    quantity: number;
    cashDelta: number;
    assetDelta: number;
    fee: number;
    equityAfter: number;
    createdAt: string;
  }>;
};

type JournalEntry = PaperJournalEntry;
type TradingStrategy = BacktestResult['strategy'];
type TradeAction = 'buy' | 'sell' | 'hold' | 'reset';

type HoveredTrade = {
  trade: Trade;
  x: number;
  y: number;
};

type ForwardPerformance = {
  label: 'After 1D' | 'After 3D' | 'After 7D';
  value?: number;
};

type RegimeDiagnostics = {
  trend: 'Uptrend' | 'Range' | 'Downtrend';
  volatility: 'High volatility' | 'Normal volatility';
  volume: 'Volume rising' | 'Volume falling' | 'Volume flat';
  priceVsAverage: string;
  marketRegime: string;
  liquidity: 'Healthy' | 'Thin';
  movingAverage: number;
  volatilityHigh: boolean;
};

type StatusTone = 'default' | 'positive' | 'negative' | 'warning';

type WatchLevels = {
  upside: number;
  downside: number;
};

type ChartInterval = '1D' | '1W' | '1M' | '1Y' | '5Y' | 'All';

type ReplayEvent = {
  id: string;
  action: 'buy' | 'sell' | 'hold';
  time: number;
  price: number;
  label: string;
  reason: string;
  trade?: Trade;
  signal: TradingSignal;
  decision?: PaperBotDecision;
};

type DecisionViewModel = {
  action: TradeAction;
  time?: number | string;
  confidence?: number;
  strategy: string;
  price?: number;
  reason: string;
  risk: string;
  riskAssessment?: PaperRiskAssessment;
  nextCheck: string;
  evidence: string[];
  watchLevels: WatchLevels;
};

type JournalReplayRow = {
  id: string;
  action: TradeAction;
  time: number | string;
  confidence?: number;
  price: number;
  reason: string;
  strategy: string;
  strategyKey: TradingStrategy;
  trade?: Trade;
  decision?: PaperJournalEntry;
  forward: ForwardPerformance[];
};

type PersistedStrategySummary = {
  strategy: TradingStrategy;
  returnPct?: number;
  maxDrawdownPct?: number;
  winRatePct?: number;
  tradeCount: number;
};

const tradingStoragePrefix = 'agent-os:trading-lab';

const strategyLabels: Record<string, string> = {
  'sma-cross': 'SMA cross',
  'rsi-reversion': 'RSI reversion',
  'volume-breakout': 'Volume breakout'
};

const chartIntervals: ChartInterval[] = ['1D', '1W', '1M', '1Y', '5Y', 'All'];

const bestRegimeByStrategy: Record<string, string> = {
  'sma-cross': 'Uptrend, Low-Med Vol',
  'rsi-reversion': 'Range, Low Vol',
  'volume-breakout': 'High Vol, Breakout'
};

const tradingHelp: Record<string, { title: string; explanation: string; why: string }> = {
  'Trading Lab': {
    title: 'Trading Lab',
    explanation:
      'This is a practice cockpit. Linda tests rules, records paper decisions, and shows what would have happened without placing real orders.',
    why: 'It lets you learn market language and review decisions before risking real money.'
  },
  'Learning tips': {
    title: 'Learning tips',
    explanation:
      'Hover the dotted labels and small info icons to get plain-language trading explanations.',
    why: 'The goal is to teach the why behind each number, not just show another dashboard metric.'
  },
  Strategy: {
    title: 'Strategy',
    explanation:
      'A strategy is the rulebook Linda is following. For example, RSI reversion looks for price being stretched too far and possibly snapping back.',
    why: 'You want to judge the rule, not just one lucky or unlucky trade.'
  },
  'Date range': {
    title: 'Date range',
    explanation: 'The time window used for the candles and backtest summary.',
    why: 'A rule that worked for two weeks may fail over years. Longer ranges give more context.'
  },
  'Date / Time': {
    title: 'Date and time',
    explanation: 'When Linda recorded the paper decision.',
    why: 'Timing matters because the same idea can be good at one price and poor at another.'
  },
  Return: {
    title: 'Return',
    explanation:
      'The percent gain or loss the strategy produced in the saved paper results. +10% means $100 would become about $110 before fees and limits.',
    why: 'Return tells you reward, but it must be read together with drawdown and win rate.'
  },
  'Max drawdown': {
    title: 'Max drawdown',
    explanation:
      'The biggest drop from a high point to a later low point. If equity went from $10,000 to $8,000, drawdown is 20%.',
    why: 'This is the pain number. Big drawdowns can make a strategy hard to hold even if it later recovers.'
  },
  'Max DD': {
    title: 'Max drawdown',
    explanation:
      'Short for max drawdown: the largest peak-to-trough loss during the saved strategy run.',
    why: 'It shows how bad the ride got, not only where it ended.'
  },
  'Win rate': {
    title: 'Win rate',
    explanation:
      'The share of completed trades that ended better than the previous one. A 60% win rate means 6 out of 10 won.',
    why: 'A high win rate can still lose money if losses are huge, so compare it with return and drawdown.'
  },
  Trades: {
    title: 'Trades',
    explanation: 'How many buy or sell decisions are counted for this strategy.',
    why: 'One trade is a clue. Many trades give better evidence that the rule may be reliable.'
  },
  'Position / signal': {
    title: 'Position / signal',
    explanation:
      'Position is what the paper wallet currently holds. Signal is Linda’s latest strategy instruction, like BUY, SELL, or HOLD.',
    why: 'This separates what you own now from what the strategy is currently saying.'
  },
  'Paper portfolio': {
    title: 'Paper portfolio',
    explanation:
      'A fake-money account used for practice. It behaves like a wallet, but no real BTC or USDC is moved.',
    why: 'Paper trading helps you learn execution and risk without turning beginner mistakes into real losses.'
  },
  Cash: {
    title: 'Cash',
    explanation: 'The uninvested USDC-like balance in the paper wallet.',
    why: 'Cash is your dry powder. If it is low, most of the portfolio is already exposed to price moves.'
  },
  BTC: {
    title: 'BTC',
    explanation: 'The amount of Bitcoin the paper wallet currently holds.',
    why: 'More BTC means your account moves more when Bitcoin price moves.'
  },
  'USDC balance': {
    title: 'USDC balance',
    explanation: 'The cash side of the paper wallet.',
    why: 'It tells you how much buying power remains after Linda’s simulated trades.'
  },
  'BTC balance': {
    title: 'BTC balance',
    explanation: 'How much Bitcoin the paper wallet currently owns.',
    why: 'This shows your exposure. If BTC drops, this part loses value.'
  },
  'BTC price': {
    title: 'BTC price',
    explanation: 'The current reference price used to value the paper wallet.',
    why: 'Your BTC balance is multiplied by this price to estimate total equity.'
  },
  'Total equity': {
    title: 'Total equity',
    explanation: 'Cash plus the current value of the BTC position.',
    why: 'This is the main account value number. It answers: what is the paper wallet worth now?'
  },
  PnL: {
    title: 'PnL',
    explanation: 'Profit and loss. It compares current paper equity with the starting balance.',
    why: 'It quickly shows whether the wallet is up or down overall.'
  },
  Executions: {
    title: 'Executions',
    explanation: 'The simulated buy or sell fills that changed the paper wallet.',
    why: 'Signals are advice. Executions are what actually changed the fake portfolio.'
  },
  Trend: {
    title: 'Trend',
    explanation: 'The broad direction price appears to be moving: uptrend, range, or downtrend.',
    why: 'Many strategies work better when they match the market direction.'
  },
  Volatility: {
    title: 'Volatility',
    explanation: 'How jumpy price has been. High volatility means bigger, faster moves.',
    why: 'More volatility can create opportunity, but it also makes stop-outs and emotional decisions more likely.'
  },
  Volume: {
    title: 'Volume',
    explanation: 'How much trading activity happened. Rising volume means more participation.',
    why: 'Moves with volume are often more meaningful than moves on quiet trading.'
  },
  'Price vs 200 SMA': {
    title: 'Price vs 200 SMA',
    explanation:
      'Compares price with a long moving-average proxy. Above it often means healthier long-term trend; below it can mean weakness.',
    why: 'It is a simple market weather check before trusting a buy signal.'
  },
  'Market regime': {
    title: 'Market regime',
    explanation:
      'A plain-language summary of market conditions, like expansion, compression, or risk-off.',
    why: 'A strategy can be good in one regime and bad in another.'
  },
  Liquidity: {
    title: 'Liquidity',
    explanation:
      'How easy it should be to buy or sell without moving price too much. Healthy liquidity means there is activity on both sides.',
    why: 'Thin liquidity can make real trades fill at worse prices than expected.'
  },
  'Chart interval': {
    title: 'Chart interval',
    explanation:
      'Controls how each candle is grouped. 1D means each candle is one day; 1W means each candle is one week.',
    why: 'Zooming out helps you see the big story. Zooming in helps you inspect the exact trade area.'
  },
  Binance: {
    title: 'Binance',
    explanation: 'The exchange/source used for the BTC/USDT market reference.',
    why: 'Different venues can have slightly different prices and volume.'
  },
  Indicators: {
    title: 'Indicators',
    explanation: 'Helper lines or stats drawn from price and volume.',
    why: 'Indicators simplify noisy charts, but they are tools, not guarantees.'
  },
  'SMA proxy': {
    title: 'SMA proxy',
    explanation:
      'A simple moving average style line that smooths price so the trend is easier to see.',
    why: 'It helps you avoid reacting to every tiny candle.'
  },
  'trade marker': {
    title: 'Trade marker',
    explanation: 'A BUY or SELL label placed on the chart at the decision price/time.',
    why: 'It shows whether Linda bought near support, chased after a move, or sold into weakness.'
  },
  Open: {
    title: 'Open',
    explanation: 'The price at the start of the selected candle.',
    why: 'Comparing open and close shows whether buyers or sellers won that candle.'
  },
  High: {
    title: 'High',
    explanation: 'The highest price reached during the selected candle.',
    why: 'Highs show where price met resistance or excitement faded.'
  },
  Low: {
    title: 'Low',
    explanation: 'The lowest price reached during the selected candle.',
    why: 'Lows show where buyers stepped in or fear peaked.'
  },
  Close: {
    title: 'Close',
    explanation: 'The final price of the selected candle.',
    why: 'Close is often treated as the most important candle price because it shows where the market settled.'
  },
  Confidence: {
    title: 'Confidence',
    explanation: 'Linda’s score for how strong the decision looks based on the available evidence.',
    why: 'Low confidence should usually mean smaller size or no trade.'
  },
  'Entry price (ref)': {
    title: 'Entry price',
    explanation: 'The reference price Linda used for the paper decision.',
    why: 'Your result depends heavily on where you enter, even when the direction is right.'
  },
  'Forward performance': {
    title: 'Forward performance',
    explanation: 'What happened after the decision over the next 1, 3, and 7 days.',
    why: 'It helps you check whether the decision worked after it was made, not just in hindsight.'
  },
  'After 1D': {
    title: 'After 1 day',
    explanation: 'The price change one day after Linda made the decision.',
    why: 'It shows whether the trade got quick confirmation or immediately struggled.'
  },
  'After 3D': {
    title: 'After 3 days',
    explanation: 'The price change three days after the decision.',
    why: 'It gives the setup a little time to work without waiting too long.'
  },
  'After 7D': {
    title: 'After 7 days',
    explanation: 'The price change one week after the decision.',
    why: 'It helps you learn whether Linda’s ideas usually need patience or fade quickly.'
  },
  'Drawdown to date': {
    title: 'Drawdown to date',
    explanation: 'How deep the strategy has fallen from its previous high in the current backtest.',
    why: 'It tells you how much stress the strategy has already shown.'
  },
  'Position risk': {
    title: 'Position risk',
    explanation: 'A quick risk label based on volatility, drawdown, and strategy behavior.',
    why: 'It reminds you that a good idea can still be too risky at the wrong size.'
  },
  'Risk manager': {
    title: 'Risk manager',
    explanation: 'The guardrail that can approve a trade or force HOLD if the setup is too risky.',
    why: 'Risk controls stop one bad trade from becoming a portfolio problem.'
  },
  'Risk action': {
    title: 'Risk action',
    explanation:
      'The final action after risk rules are applied. It may be HOLD even if the signal wanted BUY.',
    why: 'The risk manager can override excitement when the setup is too dangerous.'
  },
  'Position size': {
    title: 'Position size',
    explanation: 'How much paper cash the risk manager allows for the trade.',
    why: 'Sizing decides how much a right or wrong idea actually affects the wallet.'
  },
  'Target exposure': {
    title: 'Target exposure',
    explanation: 'The intended percentage of the wallet to put into the trade.',
    why: 'Smaller exposure means smaller wins but also smaller mistakes.'
  },
  'Max position': {
    title: 'Max position',
    explanation: 'The largest percentage of the wallet the risk rules allow in one position.',
    why: 'This prevents overbetting on a single idea.'
  },
  'Min confidence': {
    title: 'Minimum confidence',
    explanation: 'The confidence score Linda must clear before the risk manager allows action.',
    why: 'It filters out weak trades where the evidence is not strong enough.'
  },
  'Loss cooldown': {
    title: 'Loss cooldown',
    explanation: 'A waiting period after losses before taking more risk.',
    why: 'It prevents revenge trading, which is when you trade emotionally after losing.'
  },
  Evidence: {
    title: 'Evidence',
    explanation:
      'The facts Linda used: backtest stats, volume, recent signal, research, and risk notes.',
    why: 'Good trading decisions should be explainable, not just vibes.'
  },
  'Why this decision?': {
    title: 'Why this decision?',
    explanation: 'The plain-language reason Linda made this call.',
    why: 'If you cannot explain a trade simply, it is usually too fuzzy to trust.'
  },
  'Risk / invalidations': {
    title: 'Risk and invalidations',
    explanation: 'The conditions that would weaken or cancel the idea.',
    why: 'This teaches you what would prove the trade wrong before the loss grows.'
  },
  'Volume trend': {
    title: 'Volume trend',
    explanation:
      'Whether trading activity is rising, falling, or flat compared with recent volume.',
    why: 'Rising volume can add weight to a move; falling volume can make it less convincing.'
  },
  'Portfolio equity': {
    title: 'Portfolio equity',
    explanation: 'The full paper account value after combining cash and BTC.',
    why: 'It is the scoreboard for the wallet, not just one asset balance.'
  },
  Risk: {
    title: 'Risk',
    explanation: 'What could make the trade wrong or dangerous.',
    why: 'Knowing the invalidation point helps you exit instead of hoping.'
  },
  'Next check': {
    title: 'Next check',
    explanation: 'When Linda should review the decision again.',
    why: 'Markets change. A good trade can become a bad hold if the evidence changes.'
  },
  'Watch levels': {
    title: 'Watch levels',
    explanation: 'Important upside and downside prices to monitor after the decision.',
    why: 'They give you reference points instead of reacting randomly.'
  },
  'Strategy comparison': {
    title: 'Strategy comparison',
    explanation: 'Side-by-side results for the saved strategy types.',
    why: 'It helps you see which rule is behaving best in the current market.'
  },
  'Regime / Diagnostics': {
    title: 'Regime diagnostics',
    explanation:
      'A simple market health panel built from trend, volume, volatility, and liquidity.',
    why: 'It gives beginner-friendly context before looking at a trade signal.'
  },
  'Linda trade journal': {
    title: 'Trade journal',
    explanation: 'The log of Linda’s saved paper decisions and the reasoning behind them.',
    why: 'A journal is how traders learn. It shows patterns in decisions, not just outcomes.'
  },
  Action: {
    title: 'Action',
    explanation: 'The decision type: BUY, SELL, HOLD, or reset.',
    why: 'It tells you whether Linda wanted to add risk, remove risk, or wait.'
  },
  Price: {
    title: 'Price',
    explanation: 'The BTC/USDT reference price when the decision was recorded.',
    why: 'Small price differences can matter a lot once position size grows.'
  },
  'Reason short': {
    title: 'Reason short',
    explanation: 'A compressed version of why Linda made the decision.',
    why: 'It lets you scan the journal quickly before opening the full detail.'
  },
  Details: {
    title: 'Details',
    explanation: 'Open the full decision pack: evidence, risk, research, and next check.',
    why: 'Never judge a trade only by the headline number.'
  },
  'Result 1D': {
    title: 'Result after 1 day',
    explanation: 'How price moved one day after the decision.',
    why: 'This checks the immediate follow-through.'
  },
  'Result 3D': {
    title: 'Result after 3 days',
    explanation: 'How price moved three days after the decision.',
    why: 'This shows whether the idea had short-term staying power.'
  },
  'Result 7D': {
    title: 'Result after 7 days',
    explanation: 'How price moved one week after the decision.',
    why: 'This gives a broader early outcome without waiting months.'
  }
};

function isPaperBotDecision(decision: PaperJournalEntry): decision is PaperBotDecision {
  return decision.kind === 'bot';
}

function signalFromDecision(decision: PaperJournalEntry): TradingSignal {
  return {
    id:
      isPaperBotDecision(decision) && decision.evidence.trade?.key
        ? decision.evidence.trade.key
        : `decision:${decision.id}`,
    source: 'journal-decision',
    decisionId: decision.id,
    symbol: decision.symbol,
    strategy: isPaperBotDecision(decision) ? decision.strategy : undefined,
    action: decision.action,
    time: decision.createdAt,
    price: decision.price,
    reason: decision.reason,
    trade: isPaperBotDecision(decision) ? decision.evidence.trade : undefined,
    decision
  };
}

function money(value?: number) {
  if (value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function moneyPrecise(value?: number) {
  if (value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value);
}

function percent(value?: number) {
  if (value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function dateLabel(value: number | string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' }).format(
    new Date(value)
  );
}

function dateTimeLabel(value?: number | string) {
  if (value === undefined) return '--';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function toChartTime(value: number): UTCTimestamp {
  return Math.floor(value / 1000) as UTCTimestamp;
}

function startOfUtcDay(value: number) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcWeek(value: number) {
  const dayStart = startOfUtcDay(value);
  const date = new Date(dayStart);
  const day = date.getUTCDay() || 7;
  return dayStart - (day - 1) * 24 * 60 * 60 * 1000;
}

function startOfUtcMonth(value: number) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function startOfUtcYear(value: number) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), 0, 1);
}

function startOfUtcFiveYear(value: number) {
  const date = new Date(value);
  return Date.UTC(Math.floor(date.getUTCFullYear() / 5) * 5, 0, 1);
}

function candleBucketTime(value: number, interval: ChartInterval) {
  if (interval === '1W') return startOfUtcWeek(value);
  if (interval === '1M') return startOfUtcMonth(value);
  if (interval === '1Y' || interval === 'All') return startOfUtcYear(value);
  if (interval === '5Y') return startOfUtcFiveYear(value);
  return startOfUtcDay(value);
}

function aggregateCandlesForInterval(candles: Candle[], interval: ChartInterval): Candle[] {
  if (interval === '1D') return candles;

  const aggregated = new Map<number, Candle>();

  for (const candle of candles) {
    const time = candleBucketTime(candle.time, interval);
    const existing = aggregated.get(time);

    if (!existing) {
      aggregated.set(time, { ...candle, time });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
    existing.quoteVolume += candle.quoteVolume;
  }

  return [...aggregated.values()].toSorted((left, right) => left.time - right.time);
}

function clampRgb(value: number) {
  return Math.min(255, Math.max(0, Math.round(value * 255)));
}

function linearRgbToSrgb(value: number) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function rgbString(red: number, green: number, blue: number) {
  return `rgb(${clampRgb(red)}, ${clampRgb(green)}, ${clampRgb(blue)})`;
}

function splitColorChannels(value: string) {
  return value
    .replace(/\s*\/\s*[\d.]+%?/, '')
    .trim()
    .split(/\s+/)
    .map((part) => part.trim());
}

function parseLabColor(value: string) {
  const match = value.match(/^lab\((.+)\)$/i);
  if (!match) return undefined;

  const [lightnessPart, aPart, bPart] = splitColorChannels(match[1]);
  const lightness = Number(lightnessPart.replace('%', ''));
  const a = Number(aPart);
  const b = Number(bPart);
  if (![lightness, a, b].every(Number.isFinite)) return undefined;

  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const inverse = (channel: number) => {
    const cubed = channel ** 3;
    return cubed > epsilon ? cubed : (116 * channel - 16) / kappa;
  };

  const xD50 = 0.96422 * inverse(fx);
  const yD50 = inverse(fy);
  const zD50 = 0.82521 * inverse(fz);
  const x = 0.9554734 * xD50 - 0.0230985 * yD50 + 0.0632593 * zD50;
  const y = -0.0283697 * xD50 + 1.0099956 * yD50 + 0.0210414 * zD50;
  const z = 0.012314 * xD50 - 0.0205077 * yD50 + 1.3303659 * zD50;

  const red = linearRgbToSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z);
  const green = linearRgbToSrgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z);
  const blue = linearRgbToSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z);
  return rgbString(red, green, blue);
}

function parseOklchColor(value: string) {
  const match = value.match(/^oklch\((.+)\)$/i);
  if (!match) return undefined;

  const [lightnessPart, chromaPart, huePart = '0'] = splitColorChannels(match[1]);
  const lightness = lightnessPart.endsWith('%')
    ? Number(lightnessPart.replace('%', '')) / 100
    : Number(lightnessPart);
  const chroma = Number(chromaPart);
  const hue = Number(huePart);
  if (![lightness, chroma, hue].every(Number.isFinite)) return undefined;

  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  const red = linearRgbToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = linearRgbToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = linearRgbToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return rgbString(red, green, blue);
}

function normalizeCanvasColor(value: string, fallback: string) {
  const parsed = parseLabColor(value) ?? parseOklchColor(value);
  if (parsed) return parsed;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return fallback;

  context.fillStyle = fallback;
  context.fillStyle = value;
  const resolved = context.fillStyle || fallback;
  return parseLabColor(resolved) ?? parseOklchColor(resolved) ?? resolved;
}

function chartTokenColor(container: HTMLElement, tokenName: string, fallback: string) {
  const probe = document.createElement('span');
  probe.style.color = `var(${tokenName})`;
  probe.style.display = 'none';
  container.appendChild(probe);

  const resolved = getComputedStyle(probe).color;
  probe.remove();

  return normalizeCanvasColor(resolved, fallback);
}

function defaultPortfolio(): PaperPortfolio {
  return {
    cash: 10_000,
    btc: 0,
    startingCash: 10_000,
    averageEntryPrice: undefined,
    realizedPnl: 0,
    updatedAt: new Date().toISOString(),
    executions: []
  };
}

function normalizePortfolio(journal: TradingJournal): PaperPortfolio {
  if (!journal.wallet) return defaultPortfolio();
  return {
    cash: journal.wallet.cashBalance,
    btc: journal.wallet.assetBalance,
    startingCash: journal.wallet.startingCash,
    averageEntryPrice: journal.wallet.averageEntryPrice,
    realizedPnl: journal.wallet.realizedPnl,
    updatedAt: journal.wallet.updatedAt,
    executions: journal.wallet.executions
  };
}

function LearningTooltip({
  term,
  children,
  className,
  icon = true
}: {
  term: string;
  children: React.ReactNode;
  className?: string;
  icon?: boolean;
}) {
  const help = tradingHelp[term];
  if (!help) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex min-w-0 items-center gap-1 rounded-sm underline decoration-dotted underline-offset-4 hover:text-foreground',
            className
          )}
        >
          {children}
          {icon ? <Icons.info className='size-3 shrink-0 opacity-70' /> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side='top'
        align='start'
        sideOffset={8}
        className='max-w-80 border bg-popover p-3 text-left text-popover-foreground shadow-xl'
      >
        <div className='text-sm font-semibold'>{help.title}</div>
        <p className='mt-1 text-xs leading-5 text-muted-foreground'>{help.explanation}</p>
        <p className='mt-2 border-t pt-2 text-xs leading-5 text-muted-foreground'>
          <span className='font-semibold text-foreground'>Why it matters:</span> {help.why}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function latestItem<T>(items: T[]) {
  return items.length > 0 ? items[items.length - 1] : undefined;
}

function newestFirst<T>(items: T[]) {
  return items.reduceRight<T[]>((accumulator, item) => [...accumulator, item], []);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function movingAverage(candles: Candle[], period: number) {
  const slice = candles.slice(-period);
  return average(slice.map((candle) => candle.close));
}

function dateRangeLabel(candles: Candle[]) {
  const first = candles.at(0);
  const last = candles.at(-1);
  if (!first || !last) return '--';

  const firstDate = new Date(first.time);
  const lastDate = new Date(last.time);
  if (firstDate.getUTCFullYear() !== lastDate.getUTCFullYear()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    });
    return `${formatter.format(firstDate)} - ${formatter.format(lastDate)}`;
  }

  return `${dateLabel(first.time)} - ${dateLabel(last.time)}`;
}

function chartRangeBars(interval: ChartInterval, candleCount: number) {
  if (interval === '1D') return Math.min(95, candleCount);
  if (interval === '1W') return Math.min(52, candleCount);
  if (interval === '1M') return Math.min(36, candleCount);
  if (interval === '1Y') return Math.min(12, candleCount);
  if (interval === '5Y') return Math.min(8, candleCount);
  return candleCount;
}

function currentOhlc(candles: Candle[], fallbackPrice: number) {
  const candle = candles.at(-1);
  if (!candle) {
    return {
      open: fallbackPrice,
      high: fallbackPrice,
      low: fallbackPrice,
      close: fallbackPrice,
      change: 0,
      changePct: 0
    };
  }

  const change = candle.close - candle.open;
  const changePct = candle.open ? (change / candle.open) * 100 : 0;
  return { ...candle, change, changePct };
}

function actionBadgeVariant(action?: TradeAction | string) {
  if (action === 'buy') return 'default' as const;
  if (action === 'sell') return 'destructive' as const;
  return 'secondary' as const;
}

function getWatchLevels(candles: Candle[], price: number): WatchLevels {
  const recent = candles.slice(-14);
  const range = average(recent.map((candle) => Math.max(0, candle.high - candle.low)));
  const buffer = range || price * 0.03;

  // UI-only derived value until backend exposes persisted watch levels.
  return {
    upside: price + buffer,
    downside: Math.max(0, price - buffer)
  };
}

function getRegimeDiagnostics(snapshot: MarketSnapshot): RegimeDiagnostics {
  const candles = snapshot.candles.filter((candle) => candle.close > 0);
  const latest = candles.at(-1);
  const close = latest?.close ?? snapshot.price;
  const last20 = candles.slice(-20);
  const prior20 = candles.slice(-40, -20);
  const avg20 = movingAverage(candles, Math.min(20, Math.max(candles.length, 1)));
  const avg200 =
    candles.length >= 200
      ? movingAverage(candles, 200)
      : candles.length >= 100
        ? movingAverage(candles, 100)
        : avg20;
  const rangeRecent = average(last20.map((candle) => Math.max(0, candle.high - candle.low)));
  const rangePrior = average(prior20.map((candle) => Math.max(0, candle.high - candle.low)));
  const volatilityHigh = rangePrior > 0 ? rangeRecent > rangePrior * 1.12 : false;
  const volumeVerdict =
    snapshot.volumeTrend?.verdict ??
    (average(candles.slice(-7).map((candle) => candle.quoteVolume)) >
    average(candles.slice(-14, -7).map((candle) => candle.quoteVolume))
      ? 'rising'
      : 'flat');
  const trend = close > avg20 * 1.015 ? 'Uptrend' : close < avg20 * 0.985 ? 'Downtrend' : 'Range';

  // UI-only derived value until backend exposes explicit regime diagnostics.
  return {
    trend,
    volatility: volatilityHigh ? 'High volatility' : 'Normal volatility',
    volume:
      volumeVerdict === 'rising'
        ? 'Volume rising'
        : volumeVerdict === 'falling'
          ? 'Volume falling'
          : 'Volume flat',
    priceVsAverage: close >= avg200 ? 'Above MA proxy' : 'Below MA proxy',
    marketRegime:
      trend === 'Uptrend' && volumeVerdict === 'rising'
        ? 'Expansion'
        : trend === 'Downtrend'
          ? 'Risk-off'
          : 'Compression',
    liquidity:
      snapshot.spotQuoteVolume24h > 0 || snapshot.futuresQuoteVolume24h > 0 ? 'Healthy' : 'Thin',
    movingAverage: avg200,
    volatilityHigh
  };
}

function getForwardPerformance(
  candles: Candle[],
  time?: number | string,
  price?: number,
  action: TradeAction = 'hold'
): ForwardPerformance[] {
  const labels: ForwardPerformance[] = [
    { label: 'After 1D' },
    { label: 'After 3D' },
    { label: 'After 7D' }
  ];
  if (time === undefined || price === undefined || price <= 0) return labels;

  const eventTime = typeof time === 'string' ? new Date(time).getTime() : time;
  const startIndex = candles.findIndex((candle) => candle.time >= eventTime);
  if (startIndex < 0) return labels;

  // UI-only derived value until backend exposes persisted forward results.
  return labels.map((item, index) => {
    const offset = [1, 3, 7][index];
    const future = candles[startIndex + offset];
    if (!future) return item;

    const raw = ((future.close - price) / price) * 100;
    const value = action === 'sell' ? -raw : raw;
    return { ...item, value };
  });
}

function getEvidenceBullets({
  decision,
  selectedBacktest,
  diagnostics,
  lastSignal
}: {
  decision?: PaperBotDecision;
  selectedBacktest?: BacktestResult;
  diagnostics: RegimeDiagnostics;
  lastSignal?: Trade;
}) {
  if (decision) {
    const risk = decision.evidence.risk;
    return [
      decision.reason,
      risk
        ? `Risk manager: ${risk.executableAction.toUpperCase()} ${money(risk.positionCash)} (${risk.positionPct.toFixed(1)}% target)`
        : undefined,
      risk && risk.blockedReasons.length > 0
        ? `Blocked: ${risk.blockedReasons.join('; ')}`
        : undefined,
      decision.evidence.regime
        ? `Regime selector: ${decision.evidence.regime.rationale}`
        : undefined,
      ...(decision.evidence.regime?.rejectedStrategies.map(
        (item) => `Rejected ${item.strategy}: ${item.reason}`
      ) ?? []),
      decision.evidence.review
        ? `Post-trade review: ${decision.evidence.review.checkpoints
            .filter((checkpoint) => checkpoint.available)
            .map((checkpoint) => `${checkpoint.label} ${percent(checkpoint.returnPct)}`)
            .join(', ')}`
        : undefined,
      decision.evidence.marketData?.fundingRatePct !== undefined
        ? `Funding ${decision.evidence.marketData.fundingRatePct.toFixed(4)}%`
        : undefined,
      decision.evidence.marketData?.openInterestUsd !== undefined
        ? `Open interest ${money(decision.evidence.marketData.openInterestUsd)}`
        : undefined,
      decision.evidence.marketData?.atr14Pct !== undefined
        ? `ATR14 ${percent(decision.evidence.marketData.atr14Pct)}`
        : undefined,
      `Volume ${decision.evidence.volumeVerdict}`,
      `Backtest return ${percent(decision.evidence.returnPct)}`,
      `Win rate ${percent(decision.evidence.winRatePct)}`,
      ...(decision.research?.factors ?? [])
    ].filter((item): item is string => Boolean(item));
  }

  // Mocked for decision replay UI; replace with persisted metric later.
  return [
    `Price is ${diagnostics.priceVsAverage.toLowerCase()} at ${money(diagnostics.movingAverage)}`,
    lastSignal
      ? `Latest signal: ${lastSignal.side.toUpperCase()} - ${lastSignal.reason}`
      : 'No strategy signal in the selected window',
    diagnostics.volume,
    `Backtest return ${percent(selectedBacktest?.returnPct)}`,
    `Max drawdown ${percent(-(selectedBacktest?.maxDrawdownPct ?? 0))}`,
    `Win rate ${percent(selectedBacktest?.winRatePct)}`
  ];
}

function getPositionRisk(diagnostics: RegimeDiagnostics, selectedBacktest?: BacktestResult) {
  const drawdown = selectedBacktest?.maxDrawdownPct ?? 0;
  if (diagnostics.volatilityHigh || drawdown > 10) return 'High';
  if (!diagnostics.volatilityHigh && drawdown < 5) return 'Low';
  return 'Medium';
}

function createReplayEvents({
  signals,
  selectedStrategy
}: {
  signals: TradingSignal[];
  selectedStrategy: TradingStrategy;
}): ReplayEvent[] {
  return signals
    .filter((signal) => signal.decision.kind === 'bot')
    .filter((signal) => signal.strategy === selectedStrategy)
    .map((signal) => ({
      id: signal.id,
      action: signal.action as 'buy' | 'sell' | 'hold',
      time: new Date(signal.time).getTime(),
      price: signal.price,
      label: signal.action.toUpperCase(),
      reason: signal.reason,
      trade: signal.trade
        ? {
            ...signal.trade,
            id: signal.id,
            decisionId: signal.decisionId,
            reason: signal.reason
          }
        : undefined,
      signal,
      decision: signal.decision as PaperBotDecision
    }))
    .toSorted((left, right) => left.time - right.time);
}

function createJournalRows({
  signals,
  selectedStrategy,
  candles
}: {
  signals: TradingSignal[];
  selectedStrategy: TradingStrategy;
  candles: Candle[];
}): JournalReplayRow[] {
  return signals
    .map((signal) => {
      const strategyKey = signal.strategy ?? selectedStrategy;
      const trade = signal.trade
        ? {
            ...signal.trade,
            id: signal.id,
            decisionId: signal.decisionId,
            reason: signal.reason
          }
        : undefined;
      return {
        id: signal.id,
        action: signal.action,
        time: signal.time,
        confidence: isPaperBotDecision(signal.decision) ? signal.decision.confidence : undefined,
        price: signal.price,
        reason: signal.reason,
        strategy: strategyLabels[strategyKey],
        strategyKey,
        trade,
        decision: signal.decision,
        forward: getForwardPerformance(candles, signal.time, signal.price, signal.action)
      };
    })
    .toSorted((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 12);
}

function createChartTradeFromSignal(signal: TradingSignal): Trade | undefined {
  if (signal.trade) {
    return {
      ...signal.trade,
      id: signal.id,
      decisionId: signal.decisionId,
      reason: signal.reason
    };
  }

  if (signal.action !== 'buy' && signal.action !== 'sell') return undefined;

  const signalTime =
    signal.decision.kind === 'bot' && signal.decision.evidence.lastSignal
      ? signal.decision.evidence.lastSignal.time
      : signal.time;

  return {
    id: signal.id,
    decisionId: signal.decisionId,
    side: signal.action,
    time: new Date(signalTime).getTime(),
    price: signal.price,
    quantity: 0,
    equity: signal.decision.kind === 'manual' ? signal.decision.portfolio.equity : signal.price,
    reason: signal.reason
  };
}

function createPersistedChartTrades(signals: TradingSignal[], selectedStrategy: TradingStrategy) {
  return signals
    .filter((signal) => signal.strategy === selectedStrategy || !signal.strategy)
    .flatMap((signal): Trade[] => {
      const trade = createChartTradeFromSignal(signal);
      return trade ? [trade] : [];
    });
}

function resolveTradeMarkerTime(trade: Trade, candles: Candle[], interval: ChartInterval) {
  const bucketTime = candleBucketTime(trade.time, interval);
  if (candles.length === 0) return bucketTime;

  if (interval !== '1D' && candles.some((candle) => candle.time === bucketTime)) {
    return bucketTime;
  }

  let nearest = candles[0].time;
  let nearestDistance = Math.abs(nearest - trade.time);

  for (const candle of candles) {
    const distance = Math.abs(candle.time - trade.time);
    if (distance < nearestDistance) {
      nearest = candle.time;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function createPersistedStrategySummaries(
  signals: TradingSignal[],
  strategies: TradingStrategy[]
): PersistedStrategySummary[] {
  return strategies.map((strategy) => {
    const strategySignals = signals.filter((signal) => signal.strategy === strategy);
    const latestEvidenceDecision = newestFirst(strategySignals)
      .map((signal) => signal.decision)
      .find(isPaperBotDecision);
    const trades = strategySignals
      .flatMap((signal): Trade[] => {
        const trade = createChartTradeFromSignal(signal);
        return trade ? [trade] : [];
      })
      .toSorted((left, right) => left.time - right.time);

    if (trades.length === 0) {
      return latestEvidenceDecision
        ? {
            strategy,
            returnPct: latestEvidenceDecision.evidence.returnPct,
            maxDrawdownPct: latestEvidenceDecision.evidence.maxDrawdownPct,
            winRatePct: latestEvidenceDecision.evidence.winRatePct,
            tradeCount: 0
          }
        : { strategy, tradeCount: 0 };
    }

    const firstEquity = trades[0].equity || trades[0].price || 10_000;
    const lastEquity = trades.at(-1)?.equity ?? firstEquity;
    let peak = firstEquity;
    let maxDrawdownPct = 0;
    let wins = 0;

    for (let index = 0; index < trades.length; index += 1) {
      const equity = trades[index].equity;
      peak = Math.max(peak, equity);
      if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - equity) / peak) * 100);
      if (index > 0 && equity > trades[index - 1].equity) wins += 1;
    }

    return {
      strategy,
      returnPct:
        latestEvidenceDecision?.evidence.returnPct ??
        (firstEquity ? ((lastEquity - firstEquity) / firstEquity) * 100 : undefined),
      maxDrawdownPct: latestEvidenceDecision?.evidence.maxDrawdownPct ?? maxDrawdownPct,
      winRatePct:
        latestEvidenceDecision?.evidence.winRatePct ??
        (trades.length > 1 ? (wins / (trades.length - 1)) * 100 : undefined),
      tradeCount: trades.length
    };
  });
}

function MetricItem({
  label,
  value,
  tone = 'default'
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}) {
  return (
    <div className='flex h-16 min-w-0 flex-col justify-center overflow-hidden border-l px-4 py-2 first:border-l-0'>
      <div className='mb-0.5 text-[10px] leading-none text-muted-foreground'>
        <LearningTooltip term={label}>{label}</LearningTooltip>
      </div>
      <div
        className={cn(
          'truncate text-sm font-semibold leading-tight',
          tone === 'positive' && 'text-primary',
          tone === 'negative' && 'text-destructive',
          tone === 'warning' && 'text-muted-foreground'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({
  label,
  value,
  tone = 'default',
  icon: Icon,
  compact = false
}: {
  label: string;
  value: string;
  tone?: StatusTone;
  icon: React.ComponentType<{ className?: string }>;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[56px] items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2',
        compact && 'min-h-[52px] gap-2.5 px-2.5',
        tone === 'positive' && 'border-primary/40 bg-primary/10',
        tone === 'negative' && 'border-destructive/40 bg-destructive/10',
        tone === 'warning' && 'border-chart-4/40 bg-chart-4/10'
      )}
    >
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg border bg-background/50',
          tone === 'positive' && 'border-primary/30 text-primary',
          tone === 'negative' && 'border-destructive/30 text-destructive',
          tone === 'warning' && 'border-chart-4/40 text-chart-4',
          tone === 'default' && 'text-muted-foreground'
        )}
      >
        <Icon className='size-3.5' />
      </div>
      <div className='min-w-0'>
        <div className='text-[10px] leading-none text-muted-foreground'>
          <LearningTooltip term={label}>{label}</LearningTooltip>
        </div>
        <div
          className={cn(
            'mt-1 truncate text-sm font-semibold leading-tight',
            tone === 'positive' && 'text-primary',
            tone === 'negative' && 'text-destructive',
            tone === 'warning' && 'text-chart-4',
            tone === 'default' && 'text-foreground'
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function diagnosticTone(value: string): StatusTone {
  if (
    value === 'Uptrend' ||
    value === 'Volume rising' ||
    value === 'Above MA proxy' ||
    value === 'Expansion' ||
    value === 'Healthy'
  ) {
    return 'positive';
  }

  if (
    value === 'Downtrend' ||
    value === 'Volume falling' ||
    value === 'Below MA proxy' ||
    value === 'Risk-off' ||
    value === 'Thin'
  ) {
    return 'negative';
  }

  if (value === 'High volatility' || value === 'Range' || value === 'Compression') {
    return 'warning';
  }

  return 'default';
}

function TrendIcon({ trend }: { trend: RegimeDiagnostics['trend'] }) {
  const Icon = trend === 'Downtrend' ? Icons.trendingDown : Icons.trendingUp;
  return Icon;
}

function MarketRegimeIcon({ regime }: { regime: string }) {
  if (regime === 'Risk-off') return Icons.warning;
  if (regime === 'Expansion') return Icons.trendingUp;
  return Icons.activity;
}

function StrategyRowIcon({ strategy }: { strategy: TradingStrategy }) {
  if (strategy === 'sma-cross') return Icons.activity;
  if (strategy === 'rsi-reversion') return Icons.circleDot;
  return Icons.database;
}

function RegimeDiagnosticsCard({ diagnostics }: { diagnostics: RegimeDiagnostics }) {
  const TrendStatusIcon = TrendIcon({ trend: diagnostics.trend });
  const RegimeIcon = MarketRegimeIcon({ regime: diagnostics.marketRegime });

  return (
    <Card className='@container gap-0 rounded-2xl py-2.5'>
      <CardHeader className='mb-3 gap-1 border-b px-6 pb-4'>
        <div className='flex items-center gap-2'>
          <CardTitle>
            <LearningTooltip term='Regime / Diagnostics'>Regime / Diagnostics</LearningTooltip>
          </CardTitle>
        </div>
        <CardDescription className='mt-[-2px] leading-[1.2]'>
          Derived from candles, volume trend, moving averages, and liquidity.
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3 pt-0 @[360px]:grid-cols-2'>
        <StatusPill
          label='Trend'
          value={diagnostics.trend}
          tone={diagnosticTone(diagnostics.trend)}
          icon={TrendStatusIcon}
          compact
        />
        <StatusPill
          label='Volatility'
          value={diagnostics.volatility}
          tone={diagnosticTone(diagnostics.volatility)}
          icon={Icons.activity}
          compact
        />
        <StatusPill
          label='Volume'
          value={diagnostics.volume}
          tone={diagnosticTone(diagnostics.volume)}
          icon={Icons.adjustments}
          compact
        />
        <StatusPill
          label='Price vs 200 SMA'
          value={diagnostics.priceVsAverage}
          tone={diagnosticTone(diagnostics.priceVsAverage)}
          icon={Icons.trendingUp}
          compact
        />
        <StatusPill
          label='Market regime'
          value={diagnostics.marketRegime}
          tone={diagnosticTone(diagnostics.marketRegime)}
          icon={RegimeIcon}
          compact
        />
        <StatusPill
          label='Liquidity'
          value={diagnostics.liquidity}
          tone={diagnosticTone(diagnostics.liquidity)}
          icon={Icons.database}
          compact
        />
      </CardContent>
    </Card>
  );
}

function TradingContextBar({
  selectedBacktest,
  selectedSummary,
  candles,
  portfolio,
  paperEquity,
  paperReturnPct,
  latestLindaAction
}: {
  selectedBacktest?: BacktestResult;
  selectedSummary?: PersistedStrategySummary;
  candles: Candle[];
  portfolio: PaperPortfolio;
  paperEquity: number;
  paperReturnPct: number;
  latestLindaAction: TradeAction;
}) {
  const currentPosition = portfolio.btc > 0 ? 'LONG' : 'FLAT';
  const hasPersistedTrades = (selectedSummary?.tradeCount ?? 0) > 0;
  const lastSignalLabel = hasPersistedTrades ? latestLindaAction.toUpperCase() : 'NONE';

  return (
    <Card className='overflow-hidden rounded-2xl py-0'>
      <CardContent className='p-0'>
        <div className='grid gap-0 md:grid-cols-4 xl:grid-cols-[minmax(140px,1fr)_repeat(7,minmax(0,1fr))_minmax(280px,2fr)]'>
          <div className='flex h-16 min-w-0 items-center gap-2 overflow-hidden border-b px-3 py-0 md:border-b-0'>
            <div className='flex size-8 min-w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary'>
              B
            </div>
            <div className='min-w-0 text-left'>
              <div className='truncate text-sm font-semibold leading-tight'>BTC/USDT</div>
              <div className='truncate text-xs text-muted-foreground'>1D - Binance</div>
            </div>
          </div>
          <MetricItem label='Strategy' value={strategyLabels[selectedBacktest?.strategy ?? '']} />
          <MetricItem label='Date range' value={dateRangeLabel(candles)} />
          <MetricItem
            label='Return'
            value={hasPersistedTrades ? percent(selectedSummary?.returnPct) : '--'}
            tone={(selectedSummary?.returnPct ?? 0) >= 0 ? 'positive' : 'negative'}
          />
          <MetricItem
            label='Max drawdown'
            value={hasPersistedTrades ? percent(-(selectedSummary?.maxDrawdownPct ?? 0)) : '--'}
            tone='negative'
          />
          <MetricItem
            label='Win rate'
            value={hasPersistedTrades ? percent(selectedSummary?.winRatePct) : '--'}
          />
          <MetricItem label='Trades' value={selectedSummary?.tradeCount ?? 0} />
          <MetricItem
            label='Position / signal'
            value={`${currentPosition} / ${lastSignalLabel}`}
            tone={currentPosition === 'LONG' ? 'positive' : 'warning'}
          />
          <div className='flex h-16 min-w-0 items-center justify-between gap-4 overflow-hidden border-l px-4 py-2'>
            <div className='min-w-0'>
              <div className='mb-0.5 text-[10px] leading-none text-muted-foreground'>
                <LearningTooltip term='Paper portfolio'>Paper portfolio</LearningTooltip>
              </div>
              <div className='truncate text-sm font-semibold leading-tight'>
                {money(paperEquity)}
              </div>
              <div
                className={cn(
                  'text-xs leading-tight',
                  paperReturnPct >= 0 ? 'text-primary' : 'text-destructive'
                )}
              >
                {percent(paperReturnPct)}
              </div>
            </div>
            <div className='grid shrink-0 grid-cols-2 gap-x-5 text-right text-xs'>
              <div>
                <div className='mb-0.5 text-[10px] leading-none text-muted-foreground'>
                  <LearningTooltip term='Cash'>Cash</LearningTooltip>
                </div>
                <div className='font-semibold leading-tight'>{money(portfolio.cash)}</div>
              </div>
              <div>
                <div className='mb-0.5 text-[10px] leading-none text-muted-foreground'>
                  <LearningTooltip term='BTC'>BTC</LearningTooltip>
                </div>
                <div className='font-semibold leading-tight'>{portfolio.btc.toFixed(6)}</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaperWalletCard({
  portfolio,
  price,
  paperEquity,
  paperReturnPct
}: {
  portfolio: PaperPortfolio;
  price: number;
  paperEquity: number;
  paperReturnPct: number;
}) {
  const latestExecution = portfolio.executions.at(-1);
  const position = portfolio.btc > 0 ? 'LONG BTC' : 'FLAT USDC';
  const exposurePct = paperEquity > 0 ? ((portfolio.btc * price) / paperEquity) * 100 : 0;
  const unrealizedPnl =
    portfolio.averageEntryPrice && portfolio.btc > 0
      ? (price - portfolio.averageEntryPrice) * portfolio.btc
      : 0;
  const recentExecutions = portfolio.executions.slice(-3).toReversed();

  return (
    <Card>
      <CardHeader className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <CardTitle>
            <LearningTooltip term='Paper portfolio'>Linda paper wallet</LearningTooltip>
          </CardTitle>
          <CardDescription>
            Starts with 10,000 USDC. Backend simulates BTC/USDC paper executions from Linda
            decisions.
          </CardDescription>
        </div>
        <Badge variant={portfolio.btc > 0 ? 'default' : 'secondary'}>{position}</Badge>
      </CardHeader>
      <CardContent className='grid gap-4'>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-6'>
          <MetricItem label='USDC balance' value={money(portfolio.cash)} />
          <MetricItem label='BTC balance' value={portfolio.btc.toFixed(6)} />
          <MetricItem label='Avg entry' value={moneyPrecise(portfolio.averageEntryPrice)} />
          <MetricItem
            label='Exposure'
            value={percent(exposurePct)}
            tone={exposurePct > 50 ? 'warning' : undefined}
          />
          <MetricItem
            label='Realized PnL'
            value={money(portfolio.realizedPnl)}
            tone={portfolio.realizedPnl >= 0 ? 'positive' : 'negative'}
          />
          <MetricItem
            label='Unrealized PnL'
            value={money(unrealizedPnl)}
            tone={unrealizedPnl >= 0 ? 'positive' : 'negative'}
          />
          <MetricItem label='BTC price' value={moneyPrecise(price)} />
          <MetricItem
            label='Total equity'
            value={money(paperEquity)}
            tone={paperReturnPct >= 0 ? 'positive' : 'negative'}
          />
          <MetricItem
            label='Total PnL'
            value={`${money(paperEquity - portfolio.startingCash)} / ${percent(paperReturnPct)}`}
            tone={paperReturnPct >= 0 ? 'positive' : 'negative'}
          />
          <MetricItem
            label='Lifecycle'
            value={portfolio.btc > 0 ? 'open' : latestExecution ? 'closed' : 'not started'}
          />
          <MetricItem
            label='Executions'
            value={
              latestExecution
                ? `${portfolio.executions.length} · ${latestExecution.action.toUpperCase()}`
                : '0'
            }
          />
        </div>
        {recentExecutions.length > 0 ? (
          <div className='rounded-xl border bg-muted/20 p-3 text-xs'>
            <div className='mb-2 font-medium'>Recent execution audit</div>
            <div className='grid gap-2'>
              {recentExecutions.map((execution) => (
                <div key={execution.id} className='grid gap-2 sm:grid-cols-5'>
                  <span>{dateTimeLabel(execution.createdAt)}</span>
                  <span className='font-semibold'>{execution.action.toUpperCase()}</span>
                  <span>{execution.quantity.toFixed(6)} BTC</span>
                  <span>{moneyPrecise(execution.price)}</span>
                  <span>{money(execution.equityAfter)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartStat({
  term,
  label,
  value
}: {
  term: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <span>
      <LearningTooltip term={term}>{label}</LearningTooltip> {value}
    </span>
  );
}

function StrategyTradeChart({
  candles,
  trades,
  strategyKey,
  strategy,
  ohlc,
  selectedTradeKey,
  hoveredTrade,
  onHoverTrade,
  onSelectTrade
}: {
  candles: Candle[];
  trades: Trade[];
  strategyKey: TradingStrategy;
  strategy: string;
  ohlc: ReturnType<typeof currentOhlc>;
  selectedTradeKey?: string;
  hoveredTrade?: HoveredTrade;
  onHoverTrade: (trade?: HoveredTrade) => void;
  onSelectTrade: (trade: Trade) => void;
}) {
  const [chartInterval, setChartInterval] = useState<ChartInterval>('1D');
  const sourceCandles = useMemo(() => candles.filter((candle) => candle.close > 0), [candles]);
  const chartCandles = useMemo(
    () => aggregateCandlesForInterval(sourceCandles, chartInterval),
    [chartInterval, sourceCandles]
  );
  const chartOhlc = useMemo(
    () => currentOhlc(chartCandles, ohlc.close),
    [chartCandles, ohlc.close]
  );
  const width = 1120;
  const height = 520;
  const visibleTrades = trades;

  return (
    <div className='overflow-hidden rounded-2xl border bg-card'>
      <div className='flex flex-col gap-3 border-b bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='font-semibold'>
              <LearningTooltip term='BTC price'>BTC/USDT</LearningTooltip>
            </div>
            <div
              className='flex items-center rounded-full border bg-background/50 p-0.5'
              aria-label='Chart interval'
            >
              <LearningTooltip term='Chart interval'>
                <span className='px-2 text-[10px] text-muted-foreground'>Range</span>
              </LearningTooltip>
              {chartIntervals.map((interval) => (
                <Button
                  key={interval}
                  type='button'
                  variant={chartInterval === interval ? 'secondary' : 'ghost'}
                  size='sm'
                  className='h-6 rounded-full px-2.5 text-xs'
                  onClick={() => setChartInterval(interval)}
                >
                  {interval}
                </Button>
              ))}
            </div>
            <Badge variant='secondary'>
              <LearningTooltip term='Binance' icon={false}>
                Binance
              </LearningTooltip>
            </Badge>
            <Badge variant='outline'>
              <LearningTooltip term='Strategy' icon={false}>
                {strategy}
              </LearningTooltip>
            </Badge>
            <Badge variant={visibleTrades.length > 0 ? 'default' : 'secondary'}>
              <LearningTooltip term='trade marker' icon={false}>
                {visibleTrades.length} trade {visibleTrades.length === 1 ? 'marker' : 'markers'}
              </LearningTooltip>
            </Badge>
          </div>
          <div className='text-muted-foreground mt-2 flex flex-wrap gap-3 text-xs'>
            <ChartStat term='Open' label='O' value={moneyPrecise(chartOhlc.open)} />
            <ChartStat term='High' label='H' value={moneyPrecise(chartOhlc.high)} />
            <ChartStat term='Low' label='L' value={moneyPrecise(chartOhlc.low)} />
            <ChartStat term='Close' label='C' value={moneyPrecise(chartOhlc.close)} />
            <span className={chartOhlc.change >= 0 ? 'text-primary' : 'text-destructive'}>
              {moneyPrecise(chartOhlc.change)} ({percent(chartOhlc.changePct)})
            </span>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2 text-xs'>
          <Badge variant='secondary'>
            <LearningTooltip term='Indicators' icon={false}>
              Indicators
            </LearningTooltip>
          </Badge>
          <Badge variant='outline'>
            <LearningTooltip term='SMA proxy' icon={false}>
              SMA proxy
            </LearningTooltip>
          </Badge>
          <Badge variant='outline'>
            <LearningTooltip term='Volume' icon={false}>
              Volume
            </LearningTooltip>
          </Badge>
        </div>
      </div>
      <div className='relative bg-background'>
        <TradingViewDecisionChart
          candles={chartCandles}
          trades={visibleTrades}
          strategyKey={strategyKey}
          interval={chartInterval}
          selectedTradeKey={selectedTradeKey}
          onHoverTrade={onHoverTrade}
          onSelectTrade={onSelectTrade}
        />
        {hoveredTrade ? (
          <div
            className='pointer-events-none absolute z-10 w-72 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-xl'
            style={{
              left: `${Math.min(76, Math.max(8, (hoveredTrade.x / width) * 100))}%`,
              top: `${Math.min(70, Math.max(8, (hoveredTrade.y / height) * 100))}%`
            }}
          >
            <div className='mb-2 flex items-center justify-between gap-2'>
              <Badge variant={hoveredTrade.trade.side === 'buy' ? 'default' : 'destructive'}>
                {hoveredTrade.trade.side.toUpperCase()}
              </Badge>
              <span className='text-muted-foreground'>{dateLabel(hoveredTrade.trade.time)}</span>
            </div>
            <div className='font-medium'>{moneyPrecise(hoveredTrade.trade.price)}</div>
            <div className='mt-1 text-muted-foreground'>{hoveredTrade.trade.reason}</div>
            <div className='mt-2 text-muted-foreground'>
              Equity then: {money(hoveredTrade.trade.equity)}
            </div>
          </div>
        ) : null}
        {chartCandles.length === 0 ? (
          <div className='absolute inset-x-0 top-1/2 text-center text-sm text-muted-foreground'>
            No candles available for the selected chart.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TradingViewDecisionChart({
  candles,
  trades,
  strategyKey,
  interval,
  selectedTradeKey,
  onHoverTrade,
  onSelectTrade
}: {
  candles: Candle[];
  trades: Trade[];
  strategyKey: TradingStrategy;
  interval: ChartInterval;
  selectedTradeKey?: string;
  onHoverTrade: (trade?: HoveredTrade) => void;
  onSelectTrade: (trade: Trade) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onHoverTradeRef = useRef(onHoverTrade);
  const onSelectTradeRef = useRef(onSelectTrade);
  const visibleLogicalRangeRef = useRef<LogicalRange | null>(null);
  const previousDataViewKeyRef = useRef<string | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    onHoverTradeRef.current = onHoverTrade;
    onSelectTradeRef.current = onSelectTrade;
  }, [onHoverTrade, onSelectTrade]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeVersion((version) => version + 1);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style']
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const firstCandle = candles.at(0);
    const lastCandle = candles.at(-1);
    const dataViewKey = [
      interval,
      themeVersion,
      candles.length,
      firstCandle?.time ?? 'empty',
      lastCandle?.time ?? 'empty'
    ].join(':');
    const shouldFitContent =
      previousDataViewKeyRef.current !== dataViewKey || !visibleLogicalRangeRef.current;

    // Lightweight Charts needs canvas-safe colors, so theme tokens are resolved to sRGB.
    const background = chartTokenColor(container, '--card', '#020817'); // theme-guard-ignore-line -- chart/canvas color
    const mutedForeground = chartTokenColor(container, '--muted-foreground', '#8aa0bb'); // theme-guard-ignore-line -- chart/canvas color
    const border = chartTokenColor(container, '--border', '#223047'); // theme-guard-ignore-line -- chart/canvas color
    const upCandle = chartTokenColor(container, '--chart-2', '#67e8f9'); // theme-guard-ignore-line -- chart/canvas color
    const downCandle = chartTokenColor(container, '--destructive', '#f87171'); // theme-guard-ignore-line -- chart/canvas color
    const smaLine = chartTokenColor(container, '--primary', '#67e8f9'); // theme-guard-ignore-line -- chart/canvas color
    const buyMarker = chartTokenColor(container, '--chart-2', '#22d3ee'); // theme-guard-ignore-line -- chart/canvas color
    const sellMarker = chartTokenColor(container, '--destructive', '#f87171'); // theme-guard-ignore-line -- chart/canvas color

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 520,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: background },
        textColor: mutedForeground
      },
      grid: {
        vertLines: { color: border, visible: false },
        horzLines: { color: border }
      },
      crosshair: {
        mode: CrosshairMode.Normal
      },
      localization: {
        priceFormatter: (price: number) => money(price)
      },
      rightPriceScale: {
        borderColor: border,
        scaleMargins: { top: 0.08, bottom: 0.25 }
      },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        secondsVisible: false
      }
    });

    const priceSeries = chart.addSeries(CandlestickSeries, {
      upColor: upCandle,
      downColor: downCandle,
      borderVisible: false,
      wickUpColor: upCandle,
      wickDownColor: downCandle
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: ''
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 }
    });

    const smaSeries = chart.addSeries(LineSeries, {
      color: smaLine,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false
    });

    const candleData: CandlestickData<Time>[] = candles.map((candle) => ({
      time: toChartTime(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));

    const volumeData: HistogramData<Time>[] = candles.map((candle) => ({
      time: toChartTime(candle.time),
      value: candle.quoteVolume,
      color: candle.close >= candle.open ? upCandle : downCandle
    }));

    const smaData: LineData<Time>[] = candles.map((_, index) => {
      const slice = candles.slice(Math.max(0, index - 19), index + 1);
      return {
        time: toChartTime(candles[index].time),
        value: average(slice.map((candle) => candle.close))
      };
    });

    const tradeById = new Map<string, Trade>();
    const tradeByTime = new Map<number, Trade>();
    const markers: SeriesMarker<Time>[] = trades.map((trade) => {
      const tradeKey = trade.id ?? getTradeDecisionKey(strategyKey, trade);
      const buy = trade.side === 'buy';
      const selected = selectedTradeKey === tradeKey;
      const markerTime = toChartTime(resolveTradeMarkerTime(trade, candles, interval));
      const markerColor = buy ? buyMarker : sellMarker;
      tradeById.set(tradeKey, trade);
      tradeByTime.set(markerTime as number, trade);

      return {
        id: tradeKey,
        time: markerTime,
        position: buy ? 'belowBar' : 'aboveBar',
        color: markerColor,
        shape: buy ? 'arrowUp' : 'arrowDown',
        text: `${buy ? 'BUY' : 'SELL'} ${money(trade.price)}`,
        size: selected ? 3.5 : 3
      };
    });

    priceSeries.setData(candleData);
    volumeSeries.setData(volumeData);
    smaSeries.setData(smaData);
    createSeriesMarkers(priceSeries, markers, { autoScale: true });
    trades.slice(-8).forEach((trade) => {
      const buy = trade.side === 'buy';
      const color = buy ? buyMarker : sellMarker;
      priceSeries.createPriceLine({
        id: trade.id ?? getTradeDecisionKey(strategyKey, trade),
        price: trade.price,
        color,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        axisLabelVisible: true,
        axisLabelColor: color,
        axisLabelTextColor: background,
        title: `${buy ? 'BUY' : 'SELL'} ${dateLabel(trade.time)}`
      });
    });

    if (shouldFitContent) {
      const targetBars = chartRangeBars(interval, candles.length);
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - targetBars),
        to: Math.max(candles.length - 1, 0) + 3
      });
    } else if (visibleLogicalRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(visibleLogicalRangeRef.current);
    }

    previousDataViewKeyRef.current = dataViewKey;

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.point || !param.time) {
        onHoverTradeRef.current(undefined);
        return;
      }

      const objectId =
        typeof param.hoveredObjectId === 'string' ? param.hoveredObjectId : undefined;
      const hoveredTrade =
        (objectId ? tradeById.get(objectId) : undefined) ??
        (typeof param.time === 'number' ? tradeByTime.get(param.time) : undefined);

      if (!hoveredTrade) {
        onHoverTradeRef.current(undefined);
        return;
      }

      onHoverTradeRef.current({
        trade: hoveredTrade,
        x: param.point.x,
        y: param.point.y
      });
    };

    const handleClick = (param: MouseEventParams<Time>) => {
      const objectId =
        typeof param.hoveredObjectId === 'string' ? param.hoveredObjectId : undefined;
      const selectedTrade =
        (objectId ? tradeById.get(objectId) : undefined) ??
        (typeof param.time === 'number' ? tradeByTime.get(param.time) : undefined);

      if (selectedTrade) onSelectTradeRef.current(selectedTrade);
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.subscribeClick(handleClick);

    return () => {
      visibleLogicalRangeRef.current = chart.timeScale().getVisibleLogicalRange();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleClick);
      chart.remove();
    };
  }, [candles, interval, selectedTradeKey, strategyKey, themeVersion, trades]);

  return (
    <div
      ref={containerRef}
      className='h-[520px] w-full overflow-hidden bg-card 2xl:aspect-[1120/520] 2xl:h-auto'
      aria-label='BTC/USDT TradingView chart with strategy trade markers'
    />
  );
}

function SelectedDecisionInspector({
  decision,
  forwardPerformance,
  positionRisk,
  selectedBacktest
}: {
  decision?: DecisionViewModel;
  forwardPerformance: ForwardPerformance[];
  positionRisk: string;
  selectedBacktest?: BacktestResult;
}) {
  if (!decision) {
    return (
      <Card className='rounded-2xl'>
        <CardHeader className='flex flex-row items-start justify-between gap-3'>
          <div>
            <CardTitle>
              <LearningTooltip term='Details'>Selected decision</LearningTooltip>
            </CardTitle>
            <CardDescription>No persisted trade or Linda decision selected.</CardDescription>
          </div>
          <Badge variant='secondary'>EMPTY</Badge>
        </CardHeader>
        <CardContent className='text-sm text-muted-foreground'>
          Strategy comparison is only a backtest summary. It no longer creates or selects a trade
          decision. Run Linda or open a saved journal decision to populate this panel.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='rounded-2xl'>
      <CardHeader className='flex flex-row items-start justify-between gap-3'>
        <div>
          <CardTitle>
            <LearningTooltip term='Details'>Selected decision</LearningTooltip>
          </CardTitle>
          <CardDescription>{decision.action.toUpperCase()} replay context</CardDescription>
        </div>
        <Badge variant={actionBadgeVariant(decision.action)}>{decision.action.toUpperCase()}</Badge>
      </CardHeader>
      <CardContent className='flex flex-col gap-5'>
        <div className='grid gap-3 text-sm'>
          <InspectorRow label='Date / Time' value={dateTimeLabel(decision.time)} />
          <InspectorRow
            label='Confidence'
            value={decision.confidence !== undefined ? `${decision.confidence.toFixed(0)}%` : '--'}
          />
          {decision.confidence !== undefined ? <Progress value={decision.confidence} /> : null}
          <InspectorRow label='Strategy' value={decision.strategy} />
          <InspectorRow label='Entry price (ref)' value={moneyPrecise(decision.price)} />
        </div>

        <div className='border-t pt-4'>
          <div className='mb-3 text-sm font-semibold'>
            <LearningTooltip term='Forward performance'>Forward performance</LearningTooltip>
          </div>
          <div className='grid grid-cols-3 gap-3'>
            {forwardPerformance.map((item) => (
              <div key={item.label} className='rounded-xl border bg-muted/20 p-3'>
                <div className='text-muted-foreground text-[11px]'>{item.label}</div>
                <div
                  className={cn(
                    'mt-1 text-sm font-semibold',
                    (item.value ?? 0) > 0 && 'text-primary',
                    (item.value ?? 0) < 0 && 'text-destructive'
                  )}
                >
                  {item.value === undefined ? '--' : percent(item.value)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='grid grid-cols-2 gap-3 border-t pt-4 text-sm'>
          <div>
            <div className='text-muted-foreground text-xs'>
              <LearningTooltip term='Drawdown to date'>Drawdown to date</LearningTooltip>
            </div>
            <div className='font-semibold text-destructive'>
              {percent(-(selectedBacktest?.maxDrawdownPct ?? 0))}
            </div>
          </div>
          <div>
            <div className='text-muted-foreground text-xs'>
              <LearningTooltip term='Position risk'>Position risk</LearningTooltip>
            </div>
            <div className={cn('font-semibold', positionRisk === 'High' && 'text-destructive')}>
              {positionRisk}
            </div>
          </div>
        </div>

        {decision.riskAssessment ? (
          <div className='grid gap-3 border-t pt-4 text-sm'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <div className='text-muted-foreground text-xs'>
                  <LearningTooltip term='Risk manager'>Risk manager</LearningTooltip>
                </div>
                <div className='font-semibold'>
                  {decision.riskAssessment.allowed ? 'Approved' : 'Forced HOLD'} ·{' '}
                  {decision.riskAssessment.executableAction.toUpperCase()}
                </div>
              </div>
              <Badge variant={decision.riskAssessment.allowed ? 'default' : 'secondary'}>
                {money(decision.riskAssessment.positionCash)}
              </Badge>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <InspectorRow
                label='Target exposure'
                value={`${decision.riskAssessment.positionPct.toFixed(1)}%`}
              />
              <InspectorRow
                label='Max position'
                value={`${decision.riskAssessment.maxPositionPct.toFixed(0)}%`}
              />
              <InspectorRow
                label='Min confidence'
                value={`${decision.riskAssessment.confidenceThreshold.toFixed(0)}%`}
              />
              <InspectorRow
                label='Loss cooldown'
                value={`${decision.riskAssessment.cooldownDays}D`}
              />
            </div>
            {decision.riskAssessment.blockedReasons.length > 0 ? (
              <div className='rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground'>
                {decision.riskAssessment.blockedReasons.join('; ')}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className='border-t pt-4'>
          <div className='mb-2 text-sm font-semibold'>
            <LearningTooltip term='Evidence'>Evidence</LearningTooltip>
          </div>
          <div className='flex flex-col gap-2 text-xs text-muted-foreground'>
            {decision.evidence.slice(0, 5).map((item) => (
              <div key={item}>- {item}</div>
            ))}
          </div>
        </div>

        <div className='grid gap-3 border-t pt-4 text-sm'>
          <div>
            <div className='text-muted-foreground text-xs'>
              <LearningTooltip term='Risk'>Risk</LearningTooltip>
            </div>
            <div>{decision.risk}</div>
          </div>
          <div>
            <div className='text-muted-foreground text-xs'>
              <LearningTooltip term='Next check'>Next check</LearningTooltip>
            </div>
            <div>{decision.nextCheck}</div>
          </div>
          <div>
            <div className='text-muted-foreground text-xs'>Watch levels</div>
            <div>
              Upside {money(decision.watchLevels.upside)} / Downside{' '}
              {money(decision.watchLevels.downside)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InspectorRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <span className='text-muted-foreground'>
        <LearningTooltip term={label}>{label}</LearningTooltip>
      </span>
      <span className='text-right font-medium'>{value}</span>
    </div>
  );
}

function timelineActionTone(action: ReplayEvent['action']) {
  const normalized = String(action).toLowerCase();

  if (normalized === 'buy') {
    return {
      dot: 'bg-chart-2 shadow-sm',
      text: 'text-chart-2',
      selected: 'border-chart-2/50 bg-chart-2/10'
    };
  }

  if (normalized === 'sell') {
    return {
      dot: 'bg-destructive shadow-sm',
      text: 'text-destructive',
      selected: 'border-destructive/50 bg-destructive/10'
    };
  }

  if (normalized === 'hold') {
    return {
      dot: 'bg-chart-1 shadow-sm',
      text: 'text-chart-1',
      selected: 'border-chart-1/50 bg-chart-1/10'
    };
  }

  return {
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    selected: 'border-border bg-muted/50'
  };
}

function DecisionTimeline({
  events,
  selectedId,
  onSelect
}: {
  events: ReplayEvent[];
  selectedId?: string;
  onSelect: (event: ReplayEvent) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !selectedId) return;

    const selectedNode = Array.from(
      container.querySelectorAll<HTMLElement>('[data-replay-event-id]')
    ).find((node) => node.dataset.replayEventId === selectedId);

    selectedNode?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth'
    });
  }, [selectedId]);

  const scrollByAmount = (amount: number) => {
    scrollRef.current?.scrollBy({
      left: amount,
      behavior: 'smooth'
    });
  };

  const hasEvents = events.length > 0;

  return (
    <Card className='relative h-[196px] shrink-0 gap-0 overflow-hidden rounded-2xl border bg-card py-0 text-card-foreground shadow-none'>
      <CardHeader className='shrink-0 px-6 pb-0 pt-6'>
        <div className='flex items-center gap-2'>
          <CardTitle className='text-[15px] font-semibold leading-none tracking-tight'>
            <LearningTooltip term='Linda trade journal'>Decision timeline</LearningTooltip>
          </CardTitle>

          <span className='flex h-4 w-4 items-center justify-center rounded-full border text-muted-foreground'>
            <Icons.info className='size-3' />
          </span>
        </div>
      </CardHeader>

      <CardContent className='flex min-h-0 flex-1 items-center px-6 pb-5 pt-0'>
        {hasEvents ? (
          <div className='relative h-[118px] w-full'>
            <button
              type='button'
              onClick={() => scrollByAmount(-260)}
              aria-label='Scroll left'
              className='absolute left-0 top-[36px] z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background/95 text-muted-foreground shadow-xs transition hover:bg-muted hover:text-foreground'
            >
              <Icons.chevronLeft className='size-4' />
            </button>

            <button
              type='button'
              onClick={() => scrollByAmount(260)}
              aria-label='Scroll right'
              className='absolute right-0 top-[36px] z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background/95 text-muted-foreground shadow-xs transition hover:bg-muted hover:text-foreground'
            >
              <Icons.chevronRight className='size-4' />
            </button>

            <div className='pointer-events-none absolute left-12 right-12 top-[36px] h-px bg-border' />

            <div
              ref={scrollRef}
              className='h-full overflow-x-auto overflow-y-hidden px-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            >
              <div className='flex h-full min-w-full items-start gap-5'>
                {events.map((event) => {
                  const selected = selectedId === event.id;
                  const tone = timelineActionTone(event.action);

                  return (
                    <button
                      key={event.id}
                      type='button'
                      data-replay-event-id={event.id}
                      onClick={() => onSelect(event)}
                      className={cn(
                        'relative flex h-[112px] min-w-[92px] flex-col items-center rounded-2xl border border-transparent px-2 pt-[29px] text-center transition-all duration-200',
                        'hover:bg-muted/50',
                        selected && 'border-border bg-background shadow-sm',
                        selected && tone.selected
                      )}
                    >
                      <span
                        className={cn(
                          'absolute left-1/2 top-[29px] z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full ring-4 ring-card',
                          tone.dot
                        )}
                      />

                      <div className='mt-[27px] flex flex-col items-center'>
                        <div
                          className={cn(
                            'text-[10px] font-semibold uppercase leading-none tracking-wide',
                            tone.text
                          )}
                        >
                          {String(event.action).toUpperCase()}
                        </div>

                        <div className='mt-2 text-[10px] font-medium leading-none text-foreground'>
                          {dateLabel(event.time)}
                        </div>

                        <div className='mt-2 text-[10px] leading-none text-muted-foreground'>
                          {moneyPrecise(event.price)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className='w-full rounded-2xl border border-dashed p-4 text-sm text-muted-foreground'>
            No decisions available for this strategy yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StrategyComparison({
  summaries,
  selectedStrategy,
  onSelectStrategy,
  compact = false
}: {
  summaries: PersistedStrategySummary[];
  selectedStrategy: TradingStrategy;
  onSelectStrategy: (strategy: TradingStrategy) => void;
  compact?: boolean;
}) {
  return (
    <Card className='gap-0 rounded-2xl py-2.5'>
      <CardHeader className='mb-3 gap-1 border-b px-6 pb-4'>
        <CardTitle>
          <LearningTooltip term='Strategy comparison'>Strategy comparison</LearningTooltip>
        </CardTitle>
        <CardDescription className='mt-[-2px] leading-[1.2]'>
          Compare persisted paper trade outcomes by strategy.
        </CardDescription>
      </CardHeader>
      <CardContent className='pt-0'>
        <div className={cn('grid gap-3 md:hidden', compact && 'md:grid')}>
          {summaries.map((summary) => {
            const selected = selectedStrategy === summary.strategy;
            const hasTrades = summary.tradeCount > 0;
            return (
              <button
                key={summary.strategy}
                type='button'
                className={cn(
                  'rounded-2xl border p-4 text-left transition hover:bg-muted/30',
                  compact && 'p-3',
                  selected && 'border-primary/40 bg-primary/10'
                )}
                onClick={() => onSelectStrategy(summary.strategy)}
              >
                <div className='mb-3 flex items-center justify-between gap-3'>
                  <div className='flex min-w-0 items-center gap-2 font-medium'>
                    <span className='flex size-6 shrink-0 items-center justify-center rounded-full border bg-background/50 text-muted-foreground'>
                      {React.createElement(StrategyRowIcon({ strategy: summary.strategy }), {
                        className: 'size-3.5'
                      })}
                    </span>
                    <span className='truncate'>{strategyLabels[summary.strategy]}</span>
                  </div>
                  {selected ? <Icons.exclusive className='size-4 shrink-0 text-primary' /> : null}
                </div>
                <div
                  className={cn(
                    'grid grid-cols-2 gap-3 text-sm',
                    compact && 'gap-x-4 gap-y-2 text-xs'
                  )}
                >
                  <StrategyMetric
                    label='Return'
                    value={hasTrades ? percent(summary.returnPct) : '--'}
                    tone={(summary.returnPct ?? 0) >= 0 ? 'positive' : 'negative'}
                  />
                  <StrategyMetric
                    label='Max DD'
                    value={hasTrades ? percent(-(summary.maxDrawdownPct ?? 0)) : '--'}
                    tone='negative'
                  />
                  <StrategyMetric
                    label='Win rate'
                    value={hasTrades ? percent(summary.winRatePct) : '--'}
                  />
                  <StrategyMetric label='Trades' value={summary.tradeCount} />
                </div>
                <div className='mt-3 text-xs text-muted-foreground'>
                  {hasTrades ? bestRegimeByStrategy[summary.strategy] : 'No persisted trades'}
                </div>
              </button>
            );
          })}
        </div>
        <div className={cn('hidden overflow-x-auto md:block', compact && 'md:hidden')}>
          <table className='w-full min-w-[620px] table-fixed border-collapse text-sm'>
            <thead className='text-muted-foreground'>
              <tr className='border-b'>
                <th className='w-[25%] py-3 text-left'>Strategy</th>
                <th className='w-[12%] py-3 text-right'>Return</th>
                <th className='w-[18%] py-3 text-right'>Max drawdown</th>
                <th className='w-[15%] py-3 text-right'>Win rate</th>
                <th className='w-[13%] py-3 pr-6 text-right'>Trades</th>
                <th className='w-[17%] py-3 pl-3 text-left'>Best regime</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => {
                const selected = selectedStrategy === summary.strategy;
                const hasTrades = summary.tradeCount > 0;
                return (
                  <tr
                    key={summary.strategy}
                    className={cn(
                      'cursor-pointer border-t transition hover:bg-muted/30',
                      selected && 'bg-primary/10'
                    )}
                    onClick={() => onSelectStrategy(summary.strategy)}
                  >
                    <td className='py-3 text-left font-medium'>
                      <div className='flex min-w-0 items-center gap-2'>
                        <span className='flex size-5 shrink-0 items-center justify-center rounded-full border bg-background/50 text-muted-foreground'>
                          {React.createElement(StrategyRowIcon({ strategy: summary.strategy }), {
                            className: 'size-3'
                          })}
                        </span>
                        <span className='min-w-0 truncate'>{strategyLabels[summary.strategy]}</span>
                        {selected ? (
                          <Icons.exclusive className='size-3.5 shrink-0 text-primary' />
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={cn(
                        'py-3 text-right font-medium',
                        (summary.returnPct ?? 0) >= 0 ? 'text-primary' : 'text-destructive'
                      )}
                    >
                      {hasTrades ? percent(summary.returnPct) : '--'}
                    </td>
                    <td className='py-3 text-right text-destructive'>
                      {hasTrades ? percent(-(summary.maxDrawdownPct ?? 0)) : '--'}
                    </td>
                    <td className='py-3 text-right'>
                      {hasTrades ? percent(summary.winRatePct) : '--'}
                    </td>
                    <td className='py-3 pr-6 text-right'>{summary.tradeCount}</td>
                    <td className='py-3 pl-3 text-left text-muted-foreground'>
                      <span className='block truncate'>
                        {hasTrades ? bestRegimeByStrategy[summary.strategy] : 'No persisted trades'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function LearningScorecard({
  learning,
  selectedStrategy,
  compact = false
}: {
  learning?: StrategyLearningScorecard;
  selectedStrategy: TradingStrategy;
  compact?: boolean;
}) {
  const rows = learning?.strategies ?? [];
  return (
    <Card className='gap-0 rounded-2xl py-2.5'>
      <CardHeader className='mb-3 gap-1 border-b px-6 pb-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <CardTitle>Linda learning scorecard</CardTitle>
            <CardDescription className='mt-[-2px] leading-[1.2]'>
              What post-trade reviews are teaching Linda before any strategy tuning.
            </CardDescription>
          </div>
          <Badge variant='outline'>{learning?.totalReviewedTrades ?? 0} reviewed</Badge>
        </div>
      </CardHeader>
      <CardContent className='grid gap-3 pt-0'>
        {rows.length === 0 ? (
          <div className='rounded-xl border border-dashed p-4 text-sm text-muted-foreground'>
            No reviewed trades yet. Linda needs 1D/3D/7D outcomes before she can learn.
          </div>
        ) : (
          rows.map((row) => {
            const selected = row.strategy === selectedStrategy;
            return (
              <div
                key={row.strategy}
                className={cn(
                  'rounded-xl border bg-background p-4 text-sm shadow-xs',
                  selected && 'border-primary/40 bg-primary/5',
                  compact && 'p-3'
                )}
              >
                <div className='mb-3 flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2 font-semibold'>
                      <span>{strategyLabels[row.strategy]}</span>
                      {selected ? <Badge variant='outline'>selected</Badge> : null}
                    </div>
                    <div className='mt-1 text-xs text-muted-foreground'>{row.recommendation}</div>
                  </div>
                  <Badge
                    variant='outline'
                    className={cn(
                      row.status === 'promising' && 'border-chart-2/30 bg-chart-2/10 text-chart-2',
                      row.status === 'caution' &&
                        'border-destructive/30 bg-destructive/10 text-destructive'
                    )}
                  >
                    {row.status.replace('-', ' ')}
                  </Badge>
                </div>
                <div className='grid grid-cols-2 gap-3 text-xs md:grid-cols-4'>
                  <StrategyMetric label='Reviewed' value={row.reviewedTrades} />
                  <StrategyMetric label='3D avg' value={percent(row.avgReturnPct.threeDay)} />
                  <StrategyMetric
                    label='Works / fails'
                    value={`${row.working}/${row.failed}`}
                    tone={
                      row.failed > row.working
                        ? 'negative'
                        : row.working > row.failed
                          ? 'positive'
                          : 'default'
                    }
                  />
                  <StrategyMetric
                    label='Confidence adj.'
                    value={`${row.confidenceAdjustment > 0 ? '+' : ''}${row.confidenceAdjustment}`}
                    tone={
                      row.confidenceAdjustment > 0
                        ? 'positive'
                        : row.confidenceAdjustment < 0
                          ? 'negative'
                          : 'default'
                    }
                  />
                </div>
                <div className='mt-3 grid gap-2 text-xs text-muted-foreground'>
                  <div>
                    <span className='font-medium text-foreground'>Lesson:</span>{' '}
                    {row.lessons[0] ?? 'Await more completed review checkpoints.'}
                  </div>
                  {row.failurePatterns.length > 0 ? (
                    <div>
                      <span className='font-medium text-foreground'>Failure pattern:</span>{' '}
                      {row.failurePatterns.join(' · ')}
                    </div>
                  ) : null}
                  {row.regimeNotes[0] ? (
                    <div>
                      <span className='font-medium text-foreground'>Regime note:</span>{' '}
                      {row.regimeNotes[0]}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function StrategyMetric({
  label,
  value,
  tone = 'default'
}: {
  label: string;
  value: React.ReactNode;
  tone?: StatusTone;
}) {
  return (
    <div className='min-w-0'>
      <div className='text-[10px] leading-none text-muted-foreground'>
        <LearningTooltip term={label}>{label}</LearningTooltip>
      </div>
      <div
        className={cn(
          'mt-1 truncate font-semibold leading-tight',
          tone === 'positive' && 'text-primary',
          tone === 'negative' && 'text-destructive',
          tone === 'warning' && 'text-chart-4'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function LindaAnalystBrief({
  activeLindaDecision,
  latestLindaAction,
  watchLevels
}: {
  activeLindaDecision?: PaperBotDecision;
  latestLindaAction: TradeAction;
  watchLevels: WatchLevels;
}) {
  return (
    <Card className='rounded-2xl'>
      <CardHeader className='flex flex-row items-start justify-between gap-4'>
        <div className='flex gap-3'>
          <div className='flex size-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary'>
            LB
          </div>
          <div>
            <CardTitle>AI analyst brief</CardTitle>
            <CardDescription>Linda Bradford - AI Market Analyst</CardDescription>
          </div>
        </div>
        <Badge variant='secondary'>Agent insight</Badge>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {activeLindaDecision ? (
          <>
            <div>
              <div className='mb-1 text-sm font-semibold'>Decision rationale</div>
              <p className='text-sm text-muted-foreground'>{activeLindaDecision.reason}</p>
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='rounded-xl border bg-muted/20 p-3'>
                <div className='text-muted-foreground text-xs'>Upside</div>
                <div className='font-semibold text-primary'>{money(watchLevels.upside)}</div>
              </div>
              <div className='rounded-xl border bg-muted/20 p-3'>
                <div className='text-muted-foreground text-xs'>Downside</div>
                <div className='font-semibold text-destructive'>{money(watchLevels.downside)}</div>
              </div>
            </div>
            <div className='flex items-center justify-between gap-3 text-sm'>
              <div>
                <div className='text-muted-foreground text-xs'>Next update</div>
                <div>{activeLindaDecision.nextCheck}</div>
              </div>
              <Button type='button' variant='secondary' size='sm'>
                View full brief
              </Button>
            </div>
          </>
        ) : (
          <div className='flex flex-col gap-4'>
            <p className='text-sm text-muted-foreground'>
              No Linda trade is selected yet. Linda is the trading agent; this page is read-only for
              review, rationale, risk notes, and next checks.
            </p>
            <div className='flex items-center justify-between gap-3'>
              <Badge variant={actionBadgeVariant(latestLindaAction)}>
                {latestLindaAction.toUpperCase()}
              </Badge>
              <Badge variant='outline'>Read-only</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ResearchLink = NonNullable<PaperBotDecision['research']>['links'][number];
type ResearchSourceTone = 'market' | 'chart' | 'news' | 'research';

function actionPillClass(action: TradeAction | string) {
  const normalized = String(action).toLowerCase();
  if (normalized === 'buy') return 'border-chart-2/30 bg-chart-2/15 text-chart-2';
  if (normalized === 'sell') return 'border-destructive/30 bg-destructive/10 text-destructive';
  if (normalized === 'hold') return 'border-chart-1/30 bg-chart-1/15 text-chart-1';
  return 'border-border bg-muted text-muted-foreground';
}

function isKeyDecisionRow(row: JournalReplayRow) {
  return (
    row.action !== 'hold' ||
    (row.confidence ?? 0) >= 70 ||
    row.forward.some((item) => Math.abs(item.value ?? 0) >= 2)
  );
}

function sourceTone(source?: string): ResearchSourceTone {
  const normalized = source?.toLowerCase() ?? '';
  if (normalized.includes('binance') || normalized.includes('coingecko')) return 'market';
  if (normalized.includes('tradingview')) return 'chart';
  if (
    normalized.includes('desk') ||
    normalized.includes('telegraph') ||
    normalized.includes('decrypt')
  ) {
    return 'news';
  }
  return 'research';
}

function sourceBadgeLabel(source?: string) {
  const tone = sourceTone(source);
  if (tone === 'market') return 'Market data';
  if (tone === 'chart') return 'Chart';
  if (tone === 'news') return 'News';
  return 'Research';
}

function sourceBadgeClass(source?: string) {
  const tone = sourceTone(source);
  if (tone === 'market') return 'border-chart-2/20 bg-chart-2/10 text-chart-2';
  if (tone === 'chart') return 'border-chart-1/20 bg-chart-1/10 text-chart-1';
  if (tone === 'news') return 'border-primary/20 bg-primary/10 text-primary';
  return 'border-muted-foreground/20 bg-muted text-muted-foreground';
}

function SourceAvatar({ source }: { source?: string }) {
  const normalized = source?.toLowerCase() ?? '';
  const Icon = normalized.includes('binance')
    ? Icons.binance
    : normalized.includes('tradingview')
      ? Icons.chartCandle
      : normalized.includes('coingecko')
        ? Icons.databaseSearch
        : sourceTone(source) === 'news'
          ? Icons.news
          : Icons.library;

  return (
    <span className='flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background shadow-xs'>
      <Icon className='size-5 text-foreground' />
    </span>
  );
}

function DetailStat({
  icon: Icon,
  label,
  children
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className='min-w-0 border-b p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0'>
      <div className='mb-3 flex items-center gap-3'>
        <span className='flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-primary shadow-xs'>
          <Icon className='size-4' />
        </span>
        <div className='font-semibold leading-none'>
          <LearningTooltip term={label}>{label}</LearningTooltip>
        </div>
      </div>
      <div className='text-sm leading-6 text-muted-foreground'>{children}</div>
    </div>
  );
}

function EvidenceMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div className='flex items-center gap-2'>
      <Icons.chevronRight className='size-3.5 text-muted-foreground' />
      <LearningTooltip term={label}>{label}</LearningTooltip>
      <span
        className={cn(
          'font-semibold text-foreground',
          tone === 'positive' && 'text-chart-2',
          tone === 'negative' && 'text-destructive'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ResearchSourceCard({ link }: { link: ResearchLink }) {
  return (
    <a
      href={link.url}
      target='_blank'
      rel='noreferrer'
      className='group flex min-w-0 gap-3 rounded-lg border bg-background p-4 shadow-xs transition hover:border-primary/40 hover:bg-muted/20'
    >
      <SourceAvatar source={link.source} />
      <div className='min-w-0 flex-1'>
        <div className='mb-1 flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <Badge
              variant='outline'
              className={cn('mb-2 h-5 px-2 text-[10px]', sourceBadgeClass(link.source))}
            >
              {sourceBadgeLabel(link.source)}
            </Badge>
            <div className='text-xs font-semibold leading-none text-muted-foreground'>
              {link.source ?? 'Research'}
            </div>
          </div>
          <Icons.externalLink className='size-4 shrink-0 text-muted-foreground transition group-hover:text-foreground' />
        </div>
        <div className='line-clamp-1 text-sm font-semibold'>{link.label}</div>
        <p className='mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground'>{link.note}</p>
      </div>
    </a>
  );
}

function ResearchSourceRow({ link }: { link: ResearchLink }) {
  return (
    <a
      href={link.url}
      target='_blank'
      rel='noreferrer'
      className='grid min-w-[760px] grid-cols-[44px_120px_minmax(220px,1.2fr)_minmax(240px,1fr)_32px] items-center border-b px-3 py-2 text-sm transition last:border-b-0 hover:bg-muted/30'
    >
      <SourceAvatar source={link.source} />
      <Badge variant='outline' className={cn('w-fit text-[10px]', sourceBadgeClass(link.source))}>
        {sourceBadgeLabel(link.source)}
      </Badge>
      <div className='truncate font-medium'>{link.source ?? 'Research source'}</div>
      <div className='truncate text-muted-foreground'>{link.label}</div>
      <Icons.externalLink className='size-4 justify-self-end text-muted-foreground' />
    </a>
  );
}

function JournalFlowStep({
  label,
  title,
  detail,
  meta,
  tone = 'default'
}: {
  label: string;
  title: React.ReactNode;
  detail: React.ReactNode;
  meta: React.ReactNode;
  tone?: 'default' | 'positive' | 'warning';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-background p-4 text-sm shadow-xs',
        tone === 'positive' && 'border-chart-2/30 bg-chart-2/5',
        tone === 'warning' && 'border-chart-4/30 bg-chart-4/5'
      )}
    >
      <div className='text-muted-foreground text-[11px] font-medium uppercase tracking-wide'>
        {label}
      </div>
      <div className='mt-1 font-semibold'>{title}</div>
      <div className='mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground'>{detail}</div>
      <div className='mt-3 text-[11px] text-muted-foreground'>{meta}</div>
    </div>
  );
}

function JournalDecisionDetail({
  decision,
  watchLevels,
  execution
}: {
  decision: JournalEntry;
  watchLevels: WatchLevels;
  execution?: PaperPortfolio['executions'][number];
}) {
  const botDecision = isPaperBotDecision(decision) ? decision : undefined;
  const researchLinks = botDecision?.research?.links ?? [];
  const primaryLinks = researchLinks.slice(0, 3);
  const contextLinks = researchLinks.slice(3);

  return (
    <div className='overflow-hidden rounded-xl border bg-card shadow-sm'>
      <div className='grid md:grid-cols-2 xl:grid-cols-4'>
        <DetailStat icon={Icons.bulb} label='Why this decision?'>
          {decision.reason}
        </DetailStat>

        <DetailStat icon={Icons.chartBar} label='Evidence'>
          {botDecision ? (
            <div className='grid gap-1'>
              <EvidenceMetric
                label='Return'
                value={percent(botDecision.evidence.returnPct)}
                tone={botDecision.evidence.returnPct >= 0 ? 'positive' : 'negative'}
              />
              <EvidenceMetric label='Win rate' value={percent(botDecision.evidence.winRatePct)} />
              <EvidenceMetric label='Volume trend' value={botDecision.evidence.volumeVerdict} />
              {botDecision.evidence.regime ? (
                <EvidenceMetric
                  label='Regime strategy'
                  value={botDecision.evidence.regime.selectedStrategy}
                  tone={botDecision.evidence.regime.noTrade ? 'negative' : undefined}
                />
              ) : null}
              {botDecision.evidence.marketData?.fundingRatePct !== undefined ? (
                <EvidenceMetric
                  label='Funding'
                  value={percent(botDecision.evidence.marketData.fundingRatePct)}
                />
              ) : null}
              {botDecision.evidence.marketData?.openInterestUsd !== undefined ? (
                <EvidenceMetric
                  label='Open interest'
                  value={money(botDecision.evidence.marketData.openInterestUsd)}
                />
              ) : null}
              {botDecision.evidence.marketData?.atr14Pct !== undefined ? (
                <EvidenceMetric
                  label='ATR14'
                  value={percent(botDecision.evidence.marketData.atr14Pct)}
                />
              ) : null}
              {botDecision.evidence.review?.checkpoints.some(
                (checkpoint) => checkpoint.available
              ) ? (
                <EvidenceMetric
                  label='Review'
                  value={botDecision.evidence.review.checkpoints
                    .filter((checkpoint) => checkpoint.available)
                    .map((checkpoint) => `${checkpoint.label} ${percent(checkpoint.returnPct)}`)
                    .join(' · ')}
                />
              ) : null}
              {botDecision.evidence.learning ? (
                <EvidenceMetric
                  label='Learning'
                  value={`${botDecision.evidence.learning.status.replace('-', ' ')} (${botDecision.evidence.learning.confidenceAdjustment > 0 ? '+' : ''}${botDecision.evidence.learning.confidenceAdjustment})`}
                  tone={
                    botDecision.evidence.learning.confidenceAdjustment > 0
                      ? 'positive'
                      : botDecision.evidence.learning.confidenceAdjustment < 0
                        ? 'negative'
                        : undefined
                  }
                />
              ) : null}
            </div>
          ) : (
            <div className='grid gap-1'>
              <EvidenceMetric label='Action' value='Manual paper action' />
              <EvidenceMetric
                label='Portfolio equity'
                value={decision.kind === 'manual' ? money(decision.portfolio.equity) : '--'}
              />
            </div>
          )}
        </DetailStat>

        <DetailStat icon={Icons.shieldCheck} label='Risk / invalidations'>
          {botDecision ? (
            <div className='grid gap-2'>
              <div>{botDecision.risk}</div>
              {botDecision.evidence.risk ? (
                <div className='grid gap-1 rounded-lg border bg-muted/20 p-2 text-xs'>
                  <EvidenceMetric
                    label='Risk action'
                    value={botDecision.evidence.risk.executableAction.toUpperCase()}
                    tone={botDecision.evidence.risk.allowed ? 'positive' : 'negative'}
                  />
                  <EvidenceMetric
                    label='Position size'
                    value={money(botDecision.evidence.risk.positionCash)}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            'Manual paper action with no automated risk pack.'
          )}
        </DetailStat>

        <DetailStat icon={Icons.calendarStats} label='Next check'>
          <div>{botDecision ? botDecision.nextCheck : 'Review at the next replay checkpoint.'}</div>
          <div className='mt-2 text-xs'>
            Watch {money(watchLevels.upside)} / {money(watchLevels.downside)}
          </div>
        </DetailStat>
      </div>

      {botDecision ? (
        <div className='grid gap-3 border-t p-5 xl:grid-cols-4'>
          <JournalFlowStep
            label='1. Signal'
            title={
              botDecision.evidence.lastSignal?.side.toUpperCase() ??
              botDecision.action.toUpperCase()
            }
            detail={botDecision.evidence.lastSignal?.reason ?? botDecision.reason}
            meta={
              botDecision.evidence.lastSignal?.time
                ? dateTimeLabel(botDecision.evidence.lastSignal.time)
                : dateTimeLabel(botDecision.createdAt)
            }
          />
          <JournalFlowStep
            label='2. Regime / strategy'
            title={botDecision.evidence.regime?.selectedStrategy ?? botDecision.strategy}
            detail={
              botDecision.evidence.regime?.rationale ??
              'No persisted regime selector data for this decision.'
            }
            meta={botDecision.evidence.regime?.noTrade ? 'no-trade guard' : 'strategy accepted'}
            tone={botDecision.evidence.regime?.noTrade ? 'warning' : 'default'}
          />
          <JournalFlowStep
            label='3. Risk / execution'
            title={
              execution
                ? `${execution.action.toUpperCase()} executed`
                : (botDecision.evidence.risk?.executableAction.toUpperCase() ??
                  botDecision.action.toUpperCase())
            }
            detail={
              execution
                ? `${execution.quantity.toFixed(6)} BTC at ${moneyPrecise(execution.price)} · equity ${money(execution.equityAfter)}`
                : botDecision.evidence.risk
                  ? `${botDecision.evidence.risk.allowed ? 'Allowed' : 'Blocked'} · ${money(botDecision.evidence.risk.positionCash)} notional`
                  : 'No execution attached.'
            }
            meta={execution ? 'wallet audit linked' : 'no wallet execution'}
            tone={execution ? 'positive' : botDecision.action === 'hold' ? 'warning' : 'default'}
          />
          <JournalFlowStep
            label='4. Review'
            title={
              botDecision.evidence.review?.checkpoints.some((checkpoint) => checkpoint.available)
                ? botDecision.evidence.review.checkpoints
                    .filter((checkpoint) => checkpoint.available)
                    .map((checkpoint) => `${checkpoint.label} ${percent(checkpoint.returnPct)}`)
                    .join(' · ')
                : 'Pending'
            }
            detail={
              botDecision.evidence.review?.checkpoints.find((checkpoint) => checkpoint.available)
                ?.lesson ?? 'Await enough completed candles before judging this decision.'
            }
            meta={
              botDecision.evidence.review
                ? dateTimeLabel(botDecision.evidence.review.generatedAt)
                : 'not generated yet'
            }
            tone={
              botDecision.evidence.review?.checkpoints.some(
                (checkpoint) => checkpoint.available && (checkpoint.returnPct ?? 0) > 0
              )
                ? 'positive'
                : 'default'
            }
          />
        </div>
      ) : null}

      {botDecision?.research ? (
        <div className='border-t p-5'>
          <div className='mb-4 flex flex-wrap items-center gap-2'>
            <h3 className='text-base font-semibold'>Research used</h3>
            <Badge variant='outline'>{researchLinks.length} sources</Badge>
          </div>
          <p className='mb-4 max-w-5xl text-sm leading-6 text-muted-foreground'>
            {botDecision.research.thesis}
          </p>

          {primaryLinks.length > 0 ? (
            <>
              <div className='mb-2 text-sm font-medium'>Primary evidence</div>
              <div className='mb-5 grid gap-3 xl:grid-cols-3'>
                {primaryLinks.map((link) => (
                  <ResearchSourceCard key={link.url} link={link} />
                ))}
              </div>
            </>
          ) : null}

          {contextLinks.length > 0 ? (
            <>
              <div className='mb-2 text-sm font-medium'>Context sources</div>
              <div className='overflow-x-auto rounded-lg border'>
                {contextLinks.map((link) => (
                  <ResearchSourceRow key={link.url} link={link} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PaperBotJournal({
  rows,
  selectedRowId,
  selectedJournalEntry,
  selectedTradeKey,
  onSelectDecision,
  onDeleteSignal,
  signalDeletingId,
  watchLevels,
  portfolio
}: {
  rows: JournalReplayRow[];
  selectedRowId?: string;
  selectedJournalEntry?: JournalEntry;
  selectedTradeKey?: string;
  onSelectDecision: (decision: PaperJournalEntry) => void;
  onDeleteSignal: (signalId: string) => Promise<void>;
  signalDeletingId?: string;
  watchLevels: WatchLevels;
  portfolio: PaperPortfolio;
}) {
  const [checkedRowIds, setCheckedRowIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showKeyOnly, setShowKeyOnly] = useState(false);
  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (showKeyOnly && !isKeyDecisionRow(row)) return false;
      if (!normalizedQuery) return true;

      return [
        dateTimeLabel(row.time),
        row.action,
        row.strategy,
        row.reason,
        row.confidence?.toFixed(0),
        moneyPrecise(row.price)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [rows, searchQuery, showKeyOnly]);
  const visibleRowIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows]);
  const checkedVisibleIds = checkedRowIds.filter((id) => visibleRowIds.includes(id));
  const allVisibleChecked =
    visibleRowIds.length > 0 && checkedVisibleIds.length === visibleRowIds.length;
  const someVisibleChecked = checkedVisibleIds.length > 0;

  const executionByDecisionId = useMemo(
    () => new Map(portfolio.executions.map((execution) => [execution.decisionId, execution])),
    [portfolio.executions]
  );

  useEffect(() => {
    setCheckedRowIds((current) => current.filter((id) => visibleRowIds.includes(id)));
  }, [visibleRowIds]);

  const toggleRow = (rowId: string, checked: boolean) => {
    setCheckedRowIds((current) => {
      if (checked) return current.includes(rowId) ? current : [...current, rowId];
      return current.filter((id) => id !== rowId);
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setCheckedRowIds(checked ? visibleRowIds : []);
  };

  const deleteCheckedRows = async () => {
    setBulkDeleting(true);
    try {
      for (const rowId of checkedVisibleIds) {
        await onDeleteSignal(rowId);
      }
      setCheckedRowIds([]);
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <Card className='rounded-2xl shadow-none'>
      <CardHeader className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
        <div>
          <CardTitle>
            <LearningTooltip term='Linda trade journal'>Linda trade journal</LearningTooltip>
          </CardTitle>
          <CardDescription>
            Review Linda's persisted paper trades. Creation happens agent-side.
          </CardDescription>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground shadow-xs'>
            <Checkbox
              checked={allVisibleChecked}
              onCheckedChange={(checked) => toggleAllVisible(checked === true)}
              aria-label='Select all visible journal rows'
              disabled={visibleRowIds.length === 0 || bulkDeleting}
            />
            <span>Select all visible</span>
          </div>
          <Button
            type='button'
            variant='destructive'
            isLoading={bulkDeleting}
            disabled={!someVisibleChecked || bulkDeleting}
            onClick={() => void deleteCheckedRows()}
          >
            Delete selected{someVisibleChecked ? ` (${checkedVisibleIds.length})` : ''}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Button type='button' variant='outline' size='sm' disabled>
            <LearningTooltip term='Linda trade journal' icon={false}>
              All decisions
            </LearningTooltip>
          </Button>
          <Button type='button' variant='outline' size='sm' disabled>
            <LearningTooltip term='Action' icon={false}>
              All actions
            </LearningTooltip>
          </Button>
          <Button type='button' variant='outline' size='sm' disabled>
            <LearningTooltip term='Date range' icon={false}>
              Date range
            </LearningTooltip>
          </Button>
          <Button type='button' variant='outline' size='sm' disabled>
            More filters
          </Button>
          <div className='flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap'>
            <div className='relative min-w-[220px] flex-1 sm:w-[280px] sm:flex-none'>
              <Icons.search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder='Search decisions...'
                className='pl-9'
              />
            </div>
            <Button
              type='button'
              variant={showKeyOnly ? 'default' : 'outline'}
              size='sm'
              onClick={() => setShowKeyOnly((current) => !current)}
              aria-pressed={showKeyOnly}
            >
              <Icons.filter className='size-4' />
              <LearningTooltip term='Confidence' icon={false}>
                Key decisions
              </LearningTooltip>
            </Button>
          </div>
        </div>
        <div className='grid gap-3 md:hidden'>
          {filteredRows.map((row) => {
            const tradeKey = row.trade
              ? getTradeDecisionKey(row.strategyKey, row.trade)
              : undefined;
            const selected =
              (selectedRowId !== undefined && selectedRowId === row.id) ||
              selectedJournalEntry?.id === row.decision?.id ||
              (selectedTradeKey !== undefined &&
                (selectedTradeKey === row.id || selectedTradeKey === tradeKey));
            const deleting = signalDeletingId === row.id;
            const checked = checkedRowIds.includes(row.id);
            return (
              <div
                key={row.id}
                className={cn(
                  'rounded-xl border bg-card p-4 shadow-xs',
                  selected && 'border-chart-2/30 bg-chart-2/5 shadow-sm'
                )}
              >
                <div className='mb-3 flex items-start justify-between gap-3'>
                  <div className='flex min-w-0 items-start gap-3'>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(nextChecked) => toggleRow(row.id, nextChecked === true)}
                      aria-label={`Select ${dateTimeLabel(row.time)} journal row`}
                    />
                    <div className='min-w-0'>
                      <div className='text-sm font-medium'>{dateTimeLabel(row.time)}</div>
                      <div className='mt-1 text-xs text-muted-foreground'>{row.strategy}</div>
                    </div>
                  </div>
                  <Badge variant='outline' className={actionPillClass(row.action)}>
                    {row.action.toUpperCase()}
                  </Badge>
                </div>
                <button
                  type='button'
                  className='w-full text-left'
                  onClick={() => {
                    if (row.decision) onSelectDecision(row.decision);
                  }}
                >
                  <div className='mb-3 text-sm text-muted-foreground'>{row.reason}</div>
                  <div className='grid grid-cols-2 gap-3 text-sm'>
                    <InspectorRow
                      label='Confidence'
                      value={row.confidence !== undefined ? `${row.confidence.toFixed(0)}%` : '--'}
                    />
                    <InspectorRow label='Price' value={moneyPrecise(row.price)} />
                    {row.forward.map((item) => (
                      <InspectorRow
                        key={item.label}
                        label={item.label}
                        value={item.value === undefined ? '--' : percent(item.value)}
                      />
                    ))}
                  </div>
                </button>
                <div className='mt-4 flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    variant={selected ? 'default' : 'outline'}
                    onClick={() => {
                      if (row.decision) onSelectDecision(row.decision);
                    }}
                  >
                    {selected ? 'Viewing' : 'View'}
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    isLoading={deleting}
                    onClick={() => onDeleteSignal(row.id)}
                  >
                    Delete
                  </Button>
                </div>
                {selected && row.decision ? (
                  <div className='mt-4 border-t pt-4'>
                    <JournalDecisionDetail
                      decision={row.decision}
                      watchLevels={watchLevels}
                      execution={executionByDecisionId.get(row.decision.id)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          {filteredRows.length === 0 ? (
            <div className='rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground'>
              {rows.length === 0
                ? 'No Linda trades yet. Trades are created by Linda, not from this UI.'
                : 'No decisions match the current journal filters.'}
            </div>
          ) : null}
        </div>
        <div className='hidden overflow-x-auto rounded-xl border bg-card md:block'>
          <table className='w-full min-w-[980px] text-sm'>
            <thead className='bg-muted/30 text-xs text-muted-foreground'>
              <tr>
                <th className='px-4 py-3 text-left font-semibold'>
                  <LearningTooltip term='Date / Time'>Date / Time</LearningTooltip>
                </th>
                <th className='px-4 py-3 text-left font-semibold'>
                  <LearningTooltip term='Action'>Action</LearningTooltip>
                </th>
                <th className='px-4 py-3 text-right font-semibold'>
                  <LearningTooltip term='Confidence'>Confidence</LearningTooltip>
                </th>
                <th className='px-4 py-3 text-right font-semibold'>
                  <LearningTooltip term='Price'>Price</LearningTooltip>
                </th>
                <th className='px-4 py-3 text-left font-semibold'>
                  <LearningTooltip term='Reason short'>Reason short</LearningTooltip>
                </th>
                <th className='px-4 py-3 text-left font-semibold'>
                  <LearningTooltip term='Strategy'>Strategy</LearningTooltip>
                </th>
                <th className='px-4 py-3 text-right font-semibold'>
                  <LearningTooltip term='Result 1D'>Result 1D</LearningTooltip>
                </th>
                <th className='px-4 py-3 text-right font-semibold'>
                  <LearningTooltip term='Result 3D'>Result 3D</LearningTooltip>
                </th>
                <th className='px-4 py-3 text-right font-semibold'>
                  <LearningTooltip term='Result 7D'>Result 7D</LearningTooltip>
                </th>
                <th className='px-4 py-3 text-right font-semibold'>
                  <LearningTooltip term='Details'>Details</LearningTooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const tradeKey = row.trade
                  ? getTradeDecisionKey(row.strategyKey, row.trade)
                  : undefined;
                const selected =
                  (selectedRowId !== undefined && selectedRowId === row.id) ||
                  selectedJournalEntry?.id === row.decision?.id ||
                  (selectedTradeKey !== undefined &&
                    (selectedTradeKey === row.id || selectedTradeKey === tradeKey));
                const expandedDecision = selected && row.decision ? row.decision : undefined;
                const deleting = signalDeletingId === row.id;
                const checked = checkedRowIds.includes(row.id);

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={cn(
                        'cursor-pointer border-t transition hover:bg-muted/30',
                        selected && 'bg-chart-2/5'
                      )}
                      onClick={() => {
                        if (row.decision) onSelectDecision(row.decision);
                      }}
                    >
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-3'>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) =>
                              toggleRow(row.id, nextChecked === true)
                            }
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Select ${dateTimeLabel(row.time)} journal row`}
                          />
                          <span>{dateTimeLabel(row.time)}</span>
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <Badge variant='outline' className={actionPillClass(row.action)}>
                          {row.action.toUpperCase()}
                        </Badge>
                      </td>
                      <td className='px-4 py-3 text-right'>
                        {row.confidence !== undefined ? `${row.confidence.toFixed(0)}%` : '--'}
                      </td>
                      <td className='px-4 py-3 text-right'>{moneyPrecise(row.price)}</td>
                      <td className='max-w-80 truncate px-4 py-3 text-muted-foreground'>
                        {row.reason}
                      </td>
                      <td className='px-4 py-3'>{row.strategy}</td>
                      {row.forward.map((item) => (
                        <td
                          key={item.label}
                          className={cn(
                            'px-4 py-3 text-right',
                            (item.value ?? 0) > 0 && 'text-chart-2',
                            (item.value ?? 0) < 0 && 'text-destructive'
                          )}
                        >
                          {item.value === undefined ? '--' : percent(item.value)}
                        </td>
                      ))}
                      <td className='px-4 py-3 text-right'>
                        <div className='flex justify-end gap-2'>
                          <Button
                            type='button'
                            size='sm'
                            variant={selected ? 'default' : 'outline'}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (row.decision) onSelectDecision(row.decision);
                            }}
                          >
                            {selected ? 'Viewing' : 'View'}
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            isLoading={deleting}
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteSignal(row.id);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expandedDecision ? (
                      <tr className='border-t bg-muted/10'>
                        <td colSpan={10} className='p-3'>
                          <JournalDecisionDetail
                            decision={expandedDecision}
                            watchLevels={watchLevels}
                            execution={executionByDecisionId.get(expandedDecision.id)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className='p-6 text-center text-muted-foreground'>
                    {rows.length === 0
                      ? 'No Linda trades yet. Trades are created by Linda, not from this UI.'
                      : 'No decisions match the current journal filters.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function TradingLab({ initialData }: { initialData: TradingLabPayload }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [signalDeletingId, setSignalDeletingId] = useState<string>();
  const [hoveredTrade, setHoveredTrade] = useState<HoveredTrade>();
  const [selectedJournalId, setSelectedJournalId] = useState<string>();
  const [selectedTradeKey, setSelectedTradeKey] = useState<string>();
  const [selectedReplayEventId, setSelectedReplayEventId] = useState<string>();
  const [selectedStrategy, setSelectedStrategy] = useState<TradingStrategy>(
    initialData.backtests[0]?.strategy ?? 'sma-cross'
  );

  useEffect(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(tradingStoragePrefix) || key.toLowerCase().includes('trading-lab')) {
        window.localStorage.removeItem(key);
      }
    }
  }, []);

  const selectedBacktest =
    data.backtests.find((item) => item.strategy === selectedStrategy) ?? data.backtests[0];
  const price = data.snapshot.price;
  const portfolio = normalizePortfolio(data.journal);
  const paperEquity = portfolio.cash + portfolio.btc * price;
  const paperReturnPct = ((paperEquity - portfolio.startingCash) / portfolio.startingCash) * 100;
  const lastSignal = useMemo(
    () => (selectedBacktest ? latestItem(selectedBacktest.trades) : undefined),
    [selectedBacktest]
  );
  const latestBotDecision = useMemo(
    () => newestFirst(data.journal.decisions).find(isPaperBotDecision),
    [data.journal.decisions]
  );
  const tradeDecisionMap = useMemo(() => {
    const entries = data.journal.signals.flatMap((signal) =>
      signal.decision.kind === 'bot' ? [[signal.id, signal.decision] as const] : []
    );

    return new Map(entries);
  }, [data.journal.signals]);
  const chartTrades = useMemo(
    () => createPersistedChartTrades(data.journal.signals, selectedStrategy),
    [data.journal.signals, selectedStrategy]
  );
  const selectedTradeDecision = selectedTradeKey
    ? tradeDecisionMap.get(selectedTradeKey)
    : undefined;
  const selectedJournalEntry = useMemo<JournalEntry | undefined>(() => {
    if (selectedJournalId) {
      const selected = data.journal.decisions.find((decision) => decision.id === selectedJournalId);
      if (selected) return selected;
    }
    return newestFirst(data.journal.decisions)[0];
  }, [data.journal.decisions, selectedJournalId]);
  const latestLindaAction = latestBotDecision?.kind === 'bot' ? latestBotDecision.action : 'hold';
  const diagnostics = useMemo(() => getRegimeDiagnostics(data.snapshot), [data.snapshot]);
  const ohlc = useMemo(
    () => currentOhlc(data.snapshot.candles, data.snapshot.price),
    [data.snapshot.candles, data.snapshot.price]
  );
  const replayEvents = useMemo(
    () =>
      createReplayEvents({
        signals: data.journal.signals,
        selectedStrategy
      }),
    [data.journal.signals, selectedStrategy]
  );
  const selectedReplayEvent = replayEvents.find((event) => event.id === selectedReplayEventId);
  const selectedReplayDecision = selectedReplayEvent?.decision;
  const activeLindaDecision = selectedTradeDecision ?? selectedReplayDecision;
  const decisionPrice = activeLindaDecision?.price ?? data.snapshot.price;
  const watchLevels = useMemo(
    () => getWatchLevels(data.snapshot.candles, decisionPrice),
    [data.snapshot.candles, decisionPrice]
  );
  const evidence = activeLindaDecision
    ? getEvidenceBullets({
        decision: activeLindaDecision,
        selectedBacktest,
        diagnostics,
        lastSignal
      })
    : [];
  const selectedDecision: DecisionViewModel | undefined = activeLindaDecision
    ? {
        action: activeLindaDecision.action,
        time: activeLindaDecision.createdAt,
        confidence: activeLindaDecision.confidence,
        strategy: strategyLabels[activeLindaDecision.strategy],
        price: activeLindaDecision.price,
        reason: activeLindaDecision.reason,
        risk: activeLindaDecision.risk,
        riskAssessment: activeLindaDecision.evidence.risk,
        nextCheck: activeLindaDecision.nextCheck,
        evidence,
        watchLevels
      }
    : undefined;
  const forwardPerformance = selectedDecision
    ? getForwardPerformance(
        data.snapshot.candles,
        selectedDecision.time,
        selectedDecision.price,
        selectedDecision.action
      )
    : [];
  const journalRows = useMemo(
    () =>
      createJournalRows({
        signals: data.journal.signals,
        selectedStrategy,
        candles: data.snapshot.candles
      }),
    [data.journal.signals, data.snapshot.candles, selectedStrategy]
  );

  const strategySummaries = useMemo(
    () =>
      createPersistedStrategySummaries(
        data.journal.signals,
        data.backtests.map((backtest) => backtest.strategy)
      ),
    [data.backtests, data.journal.signals]
  );

  const selectedStrategySummary = strategySummaries.find(
    (summary) => summary.strategy === selectedStrategy
  );

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/trading/snapshot', { cache: 'no-store' });
      const payload = (await response.json()) as TradingLabPayload;
      setData(payload);
    } finally {
      setLoading(false);
    }
  }

  async function deleteSignal(signalId: string) {
    setSignalDeletingId(signalId);
    try {
      const response = await fetch(`/api/trading/journal?id=${encodeURIComponent(signalId)}`, {
        method: 'DELETE',
        cache: 'no-store'
      });
      const journal = (await response.json()) as TradingLabPayload['journal'];
      setSelectedJournalId(undefined);
      setSelectedReplayEventId(undefined);
      setSelectedTradeKey(undefined);
      setHoveredTrade(undefined);
      setData((current) => ({ ...current, journal }));
    } finally {
      setSignalDeletingId(undefined);
    }
  }

  function selectPersistedTrade(trade: Trade) {
    const signal = data.journal.signals.find(
      (item) => item.id === trade.id || item.decisionId === trade.decisionId
    );
    if (!signal) return;
    setSelectedJournalId(signal.decisionId);
    setSelectedTradeKey(signal.id);
    setSelectedReplayEventId(signal.id);
  }

  function selectReplayEvent(event: ReplayEvent) {
    setSelectedReplayEventId(event.id);
    setSelectedTradeKey(event.id);
    setSelectedJournalId(event.signal.decisionId);
  }

  function selectJournalDecision(decision: PaperJournalEntry) {
    const signal =
      data.journal.signals.find((item) => item.decisionId === decision.id) ??
      signalFromDecision(decision);
    if (decision.kind === 'bot') setSelectedStrategy(decision.strategy);
    setSelectedJournalId(decision.id);
    setSelectedTradeKey(signal.id);
    setSelectedReplayEventId(signal.id);
  }

  return (
    <div className='flex flex-col gap-6'>
      <RightContextSidebarRegistration
        title='Trading context'
        description='Decision, portfolio, and analyst brief.'
      >
        <SelectedDecisionInspector
          decision={selectedDecision}
          forwardPerformance={forwardPerformance}
          positionRisk={getPositionRisk(diagnostics, selectedBacktest)}
          selectedBacktest={selectedBacktest}
        />
        <StrategyComparison
          summaries={strategySummaries}
          selectedStrategy={selectedStrategy}
          compact
          onSelectStrategy={(strategy) => {
            setSelectedStrategy(strategy);
            setSelectedTradeKey(undefined);
            setSelectedReplayEventId(undefined);
            setSelectedJournalId(undefined);
            setHoveredTrade(undefined);
          }}
        />
        <LearningScorecard
          learning={data.journal.learning}
          selectedStrategy={selectedStrategy}
          compact
        />
        <RegimeDiagnosticsCard diagnostics={diagnostics} />
        <LindaAnalystBrief
          activeLindaDecision={activeLindaDecision}
          latestLindaAction={latestLindaAction}
          watchLevels={watchLevels}
        />
      </RightContextSidebarRegistration>

      <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='flex flex-wrap items-center gap-3'>
            <h1 className='text-3xl font-semibold tracking-tight'>
              <LearningTooltip term='Trading Lab'>Trading Lab</LearningTooltip>
            </h1>
            <Badge variant='outline' className='gap-1'>
              <LearningTooltip term='Learning tips' icon={false}>
                <Icons.info className='size-3' />
                Learning tips
              </LearningTooltip>
            </Badge>
          </div>
          <p className='text-muted-foreground'>
            Decision replay cockpit for backtesting and paper trading
          </p>
        </div>
        <Button type='button' onClick={refresh} disabled={loading} isLoading={loading}>
          Refresh data
        </Button>
      </div>

      <TradingContextBar
        selectedBacktest={selectedBacktest}
        selectedSummary={selectedStrategySummary}
        candles={data.snapshot.candles}
        portfolio={portfolio}
        paperEquity={paperEquity}
        paperReturnPct={paperReturnPct}
        latestLindaAction={latestLindaAction}
      />

      <PaperWalletCard
        portfolio={portfolio}
        price={price}
        paperEquity={paperEquity}
        paperReturnPct={paperReturnPct}
      />

      <LearningScorecard learning={data.journal.learning} selectedStrategy={selectedStrategy} />

      <div className='flex flex-col gap-6'>
        <StrategyTradeChart
          candles={data.snapshot.candles}
          trades={chartTrades}
          strategyKey={selectedBacktest?.strategy ?? selectedStrategy}
          strategy={strategyLabels[selectedBacktest?.strategy ?? selectedStrategy]}
          ohlc={ohlc}
          selectedTradeKey={selectedTradeKey}
          hoveredTrade={hoveredTrade}
          onHoverTrade={setHoveredTrade}
          onSelectTrade={selectPersistedTrade}
        />
        <DecisionTimeline
          events={replayEvents}
          selectedId={selectedReplayEventId ?? selectedTradeKey ?? selectedJournalId}
          onSelect={selectReplayEvent}
        />

        <PaperBotJournal
          rows={journalRows}
          selectedRowId={selectedReplayEventId}
          selectedJournalEntry={selectedJournalEntry}
          selectedTradeKey={selectedTradeKey}
          onSelectDecision={selectJournalDecision}
          onDeleteSignal={deleteSignal}
          signalDeletingId={signalDeletingId}
          watchLevels={watchLevels}
          portfolio={portfolio}
        />
      </div>

      <div className='text-muted-foreground text-xs'>
        Updated {dateTimeLabel(data.snapshot.updatedAt)} - Data source: Binance + CoinGecko. Not
        financial advice.
      </div>
    </div>
  );
}
