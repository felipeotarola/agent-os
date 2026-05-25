'use client';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RightContextSidebarRegistration } from '@/components/layout/right-context-sidebar';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
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
  type Trade,
  type TradingJournal
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
  startedAt: string;
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
  decision?: PaperBotDecision;
  synthetic?: boolean;
};

type DecisionViewModel = {
  action: TradeAction;
  time?: number | string;
  confidence?: number;
  strategy: string;
  price?: number;
  reason: string;
  risk: string;
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

const paperKey = 'agent-os:trading-lab:paper-portfolio:v1';
const tradingResetKey = 'agent-os:trading-lab:local-reset:v2';

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

function isPaperBotDecision(decision: PaperJournalEntry): decision is PaperBotDecision {
  return decision.kind === 'bot';
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
  return { cash: 10_000, btc: 0, startedAt: new Date().toISOString() };
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
  if (interval === '1W') return Math.min(7, candleCount);
  if (interval === '1M') return Math.min(30, candleCount);
  if (interval === '1Y') return Math.min(365, candleCount);
  if (interval === '5Y') return Math.min(365 * 5, candleCount);
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
    return [
      decision.reason,
      `Volume ${decision.evidence.volumeVerdict}`,
      `Backtest return ${percent(decision.evidence.returnPct)}`,
      `Win rate ${percent(decision.evidence.winRatePct)}`,
      ...(decision.research?.factors ?? [])
    ].filter(Boolean);
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
  decisions,
  selectedStrategy
}: {
  decisions: PaperJournalEntry[];
  selectedStrategy: TradingStrategy;
}): ReplayEvent[] {
  return decisions
    .filter(isPaperBotDecision)
    .filter((decision) => decision.strategy === selectedStrategy)
    .map((decision) => ({
      id: decision.id,
      action: decision.action,
      time: new Date(decision.createdAt).getTime(),
      price: decision.price,
      label: decision.action.toUpperCase(),
      reason: decision.reason,
      decision
    }))
    .toSorted((left, right) => left.time - right.time);
}

function createJournalRows({
  decisions,
  selectedStrategy,
  candles
}: {
  decisions: PaperJournalEntry[];
  selectedStrategy: TradingStrategy;
  candles: Candle[];
}): JournalReplayRow[] {
  return decisions
    .map((decision) => {
      const strategy = isPaperBotDecision(decision)
        ? strategyLabels[decision.strategy]
        : strategyLabels[selectedStrategy];
      return {
        id: decision.id,
        action: decision.action,
        time: decision.createdAt,
        confidence: isPaperBotDecision(decision) ? decision.confidence : undefined,
        price: decision.price,
        reason: decision.reason,
        strategy,
        strategyKey: isPaperBotDecision(decision) ? decision.strategy : selectedStrategy,
        decision,
        forward: getForwardPerformance(candles, decision.createdAt, decision.price, decision.action)
      };
    })
    .toSorted((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 12);
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
      <div className='mb-0.5 text-[10px] leading-none text-muted-foreground'>{label}</div>
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
  icon: Icon
}: {
  label: string;
  value: string;
  tone?: StatusTone;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[56px] items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2',
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
        <div className='text-[10px] leading-none text-muted-foreground'>{label}</div>
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
    <Card className='gap-0 rounded-2xl py-2.5'>
      <CardHeader className='mb-3 gap-1 border-b px-6 pb-4'>
        <div className='flex items-center gap-2'>
          <CardTitle>Regime / Diagnostics</CardTitle>
          <Icons.info className='size-3.5 text-muted-foreground' />
        </div>
        <CardDescription className='mt-[-2px] leading-[1.2]'>
          Derived from candles, volume trend, moving averages, and liquidity.
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3 pt-0 sm:grid-cols-3'>
        <StatusPill
          label='Trend'
          value={diagnostics.trend}
          tone={diagnosticTone(diagnostics.trend)}
          icon={TrendStatusIcon}
        />
        <StatusPill
          label='Volatility'
          value={diagnostics.volatility}
          tone={diagnosticTone(diagnostics.volatility)}
          icon={Icons.activity}
        />
        <StatusPill
          label='Volume'
          value={diagnostics.volume}
          tone={diagnosticTone(diagnostics.volume)}
          icon={Icons.adjustments}
        />
        <StatusPill
          label='Price vs 200 SMA'
          value={diagnostics.priceVsAverage}
          tone={diagnosticTone(diagnostics.priceVsAverage)}
          icon={Icons.trendingUp}
        />
        <StatusPill
          label='Market regime'
          value={diagnostics.marketRegime}
          tone={diagnosticTone(diagnostics.marketRegime)}
          icon={RegimeIcon}
        />
        <StatusPill
          label='Liquidity'
          value={diagnostics.liquidity}
          tone={diagnosticTone(diagnostics.liquidity)}
          icon={Icons.database}
        />
      </CardContent>
    </Card>
  );
}

function TradingContextBar({
  selectedBacktest,
  candles,
  portfolio,
  paperEquity,
  paperReturnPct,
  lastSignal,
  latestLindaAction
}: {
  selectedBacktest?: BacktestResult;
  candles: Candle[];
  portfolio: PaperPortfolio;
  paperEquity: number;
  paperReturnPct: number;
  lastSignal?: Trade;
  latestLindaAction: TradeAction;
}) {
  const currentPosition = portfolio.btc > 0 ? 'LONG' : 'FLAT';
  const lastSignalLabel = lastSignal
    ? lastSignal.side.toUpperCase()
    : latestLindaAction.toUpperCase();

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
            value={percent(selectedBacktest?.returnPct)}
            tone={(selectedBacktest?.returnPct ?? 0) >= 0 ? 'positive' : 'negative'}
          />
          <MetricItem
            label='Max drawdown'
            value={percent(-(selectedBacktest?.maxDrawdownPct ?? 0))}
            tone='negative'
          />
          <MetricItem label='Win rate' value={percent(selectedBacktest?.winRatePct)} />
          <MetricItem label='Trades' value={selectedBacktest?.trades.length ?? 0} />
          <MetricItem
            label='Position / signal'
            value={`${currentPosition} / ${lastSignalLabel}`}
            tone={currentPosition === 'LONG' ? 'positive' : 'warning'}
          />
          <div className='flex h-16 min-w-0 items-center justify-between gap-4 overflow-hidden border-l px-4 py-2'>
            <div className='min-w-0'>
              <div className='mb-0.5 text-[10px] leading-none text-muted-foreground'>
                Paper portfolio
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
                <div className='mb-0.5 text-[10px] leading-none text-muted-foreground'>Cash</div>
                <div className='font-semibold leading-tight'>{money(portfolio.cash)}</div>
              </div>
              <div>
                <div className='mb-0.5 text-[10px] leading-none text-muted-foreground'>BTC</div>
                <div className='font-semibold leading-tight'>{portfolio.btc.toFixed(6)}</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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
  const chartCandles = sourceCandles;
  const width = 1120;
  const height = 520;
  const visibleCandleTimes = useMemo(
    () => new Set(chartCandles.map((candle) => candle.time)),
    [chartCandles]
  );
  const visibleTrades = useMemo(
    () => trades.filter((trade) => visibleCandleTimes.has(trade.time)),
    [trades, visibleCandleTimes]
  );

  return (
    <div className='overflow-hidden rounded-2xl border bg-card'>
      <div className='flex flex-col gap-3 border-b bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='font-semibold'>BTC/USDT</div>
            <div
              className='flex items-center rounded-full border bg-background/50 p-0.5'
              aria-label='Chart interval'
            >
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
            <Badge variant='secondary'>Binance</Badge>
            <Badge variant='outline'>{strategy}</Badge>
          </div>
          <div className='text-muted-foreground mt-2 flex flex-wrap gap-3 text-xs'>
            <span>O {moneyPrecise(ohlc.open)}</span>
            <span>H {moneyPrecise(ohlc.high)}</span>
            <span>L {moneyPrecise(ohlc.low)}</span>
            <span>C {moneyPrecise(ohlc.close)}</span>
            <span className={ohlc.change >= 0 ? 'text-primary' : 'text-destructive'}>
              {moneyPrecise(ohlc.change)} ({percent(ohlc.changePct)})
            </span>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2 text-xs'>
          <Badge variant='secondary'>Indicators</Badge>
          <Badge variant='outline'>SMA proxy</Badge>
          <Badge variant='outline'>Volume</Badge>
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
    const buyMarker = chartTokenColor(container, '--chart-1', '#a3e635'); // theme-guard-ignore-line -- chart/canvas color
    const sellMarker = chartTokenColor(container, '--chart-4', '#f59e0b'); // theme-guard-ignore-line -- chart/canvas color

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
      const tradeKey = getTradeDecisionKey(strategyKey, trade);
      const buy = trade.side === 'buy';
      const selected = selectedTradeKey === tradeKey;
      const markerTime = toChartTime(trade.time);
      tradeById.set(tradeKey, trade);
      tradeByTime.set(markerTime as number, trade);

      return {
        id: tradeKey,
        time: markerTime,
        position: buy ? 'belowBar' : 'aboveBar',
        color: buy ? buyMarker : sellMarker,
        shape: buy ? 'arrowUp' : 'arrowDown',
        text: buy ? 'BUY' : 'SELL',
        size: selected ? 2.5 : 1.8
      };
    });

    priceSeries.setData(candleData);
    volumeSeries.setData(volumeData);
    smaSeries.setData(smaData);
    createSeriesMarkers(priceSeries, markers, { autoScale: true });

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
  decision: DecisionViewModel;
  forwardPerformance: ForwardPerformance[];
  positionRisk: string;
  selectedBacktest?: BacktestResult;
}) {
  return (
    <Card className='rounded-2xl'>
      <CardHeader className='flex flex-row items-start justify-between gap-3'>
        <div>
          <CardTitle>Selected decision</CardTitle>
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
          <div className='mb-3 text-sm font-semibold'>Forward performance</div>
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
            <div className='text-muted-foreground text-xs'>Drawdown to date</div>
            <div className='font-semibold text-destructive'>
              {percent(-(selectedBacktest?.maxDrawdownPct ?? 0))}
            </div>
          </div>
          <div>
            <div className='text-muted-foreground text-xs'>Position risk</div>
            <div className={cn('font-semibold', positionRisk === 'High' && 'text-destructive')}>
              {positionRisk}
            </div>
          </div>
        </div>

        <div className='border-t pt-4'>
          <div className='mb-2 text-sm font-semibold'>Evidence</div>
          <div className='flex flex-col gap-2 text-xs text-muted-foreground'>
            {decision.evidence.slice(0, 5).map((item) => (
              <div key={item}>- {item}</div>
            ))}
          </div>
        </div>

        <div className='grid gap-3 border-t pt-4 text-sm'>
          <div>
            <div className='text-muted-foreground text-xs'>Risk</div>
            <div>{decision.risk}</div>
          </div>
          <div>
            <div className='text-muted-foreground text-xs'>Next check</div>
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
      <span className='text-muted-foreground'>{label}</span>
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
    <Card className='relative h-[196px] shrink-0 gap-0 overflow-hidden rounded-3xl border bg-card py-0 text-card-foreground shadow-none'>
      <CardHeader className='shrink-0 px-6 pb-0 pt-6'>
        <div className='flex items-center gap-2'>
          <CardTitle className='text-[15px] font-semibold leading-none tracking-tight'>
            Decision timeline
          </CardTitle>

          <span className='flex h-4 w-4 items-center justify-center rounded-full border text-[10px] leading-none text-muted-foreground'>
            i
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
              className='absolute left-0 top-[36px] z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background/95 text-muted-foreground transition hover:bg-muted hover:text-foreground'
            >
              &lsaquo;
            </button>

            <button
              type='button'
              onClick={() => scrollByAmount(260)}
              aria-label='Scroll right'
              className='absolute right-0 top-[36px] z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background/95 text-muted-foreground transition hover:bg-muted hover:text-foreground'
            >
              &rsaquo;
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
                        selected && 'border-border bg-muted/60 shadow-sm',
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
  backtests,
  selectedStrategy,
  onSelectStrategy
}: {
  backtests: BacktestResult[];
  selectedStrategy: TradingStrategy;
  onSelectStrategy: (strategy: TradingStrategy) => void;
}) {
  return (
    <Card className='gap-0 rounded-2xl py-2.5'>
      <CardHeader className='mb-3 gap-1 border-b px-6 pb-4'>
        <CardTitle>Strategy comparison</CardTitle>
        <CardDescription className='mt-[-2px] leading-[1.2]'>
          Compare replay outcomes across available strategy runs.
        </CardDescription>
      </CardHeader>
      <CardContent className='pt-0'>
        <div className='overflow-x-auto'>
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
              {backtests.map((backtest) => {
                const selected = selectedStrategy === backtest.strategy;
                return (
                  <tr
                    key={backtest.strategy}
                    className={cn(
                      'cursor-pointer border-t transition hover:bg-muted/30',
                      selected && 'bg-primary/10'
                    )}
                    onClick={() => onSelectStrategy(backtest.strategy)}
                  >
                    <td className='py-3 text-left font-medium'>
                      <div className='flex min-w-0 items-center gap-2'>
                        <span className='flex size-5 shrink-0 items-center justify-center rounded-full border bg-background/50 text-muted-foreground'>
                          {React.createElement(StrategyRowIcon({ strategy: backtest.strategy }), {
                            className: 'size-3'
                          })}
                        </span>
                        <span className='min-w-0 truncate'>
                          {strategyLabels[backtest.strategy]}
                        </span>
                        {selected ? (
                          <Icons.exclusive className='size-3.5 shrink-0 text-primary' />
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={cn(
                        'py-3 text-right font-medium',
                        backtest.returnPct >= 0 ? 'text-primary' : 'text-destructive'
                      )}
                    >
                      {percent(backtest.returnPct)}
                    </td>
                    <td className='py-3 text-right text-destructive'>
                      {percent(-backtest.maxDrawdownPct)}
                    </td>
                    <td className='py-3 text-right'>{percent(backtest.winRatePct)}</td>
                    <td className='py-3 pr-6 text-right'>{backtest.trades.length}</td>
                    <td className='py-3 pl-3 text-left text-muted-foreground'>
                      <span className='block truncate'>
                        {bestRegimeByStrategy[backtest.strategy]}
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

function LindaAnalystBrief({
  activeLindaDecision,
  latestLindaAction,
  watchLevels,
  botRunning,
  onRunPaperBot
}: {
  activeLindaDecision?: PaperBotDecision;
  latestLindaAction: TradeAction;
  watchLevels: WatchLevels;
  botRunning: boolean;
  onRunPaperBot: () => void;
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
              No Linda decision is selected yet. Run a paper decision to create a replay-ready
              rationale, risk note, and next check.
            </p>
            <div className='flex items-center justify-between gap-3'>
              <Badge variant={actionBadgeVariant(latestLindaAction)}>
                {latestLindaAction.toUpperCase()}
              </Badge>
              <Button
                type='button'
                variant='secondary'
                isLoading={botRunning}
                onClick={onRunPaperBot}
              >
                Run Linda decision
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JournalDecisionDetail({
  decision,
  watchLevels
}: {
  decision: JournalEntry;
  watchLevels: WatchLevels;
}) {
  return (
    <div className='grid gap-4 rounded-2xl border bg-muted/20 p-4 lg:grid-cols-4'>
      <div>
        <div className='mb-1 text-sm font-semibold'>Why this decision?</div>
        <p className='text-sm text-muted-foreground'>{decision.reason}</p>
      </div>
      <div>
        <div className='mb-1 text-sm font-semibold'>Evidence</div>
        <div className='flex flex-col gap-1 text-xs text-muted-foreground'>
          {isPaperBotDecision(decision) ? (
            <>
              <span>Return {percent(decision.evidence.returnPct)}</span>
              <span>Win rate {percent(decision.evidence.winRatePct)}</span>
              <span>Volume {decision.evidence.volumeVerdict}</span>
            </>
          ) : (
            <>
              <span>Manual paper action</span>
              <span>Portfolio equity {money(decision.portfolio.equity)}</span>
            </>
          )}
        </div>
      </div>
      <div>
        <div className='mb-1 text-sm font-semibold'>Risk / invalidations</div>
        <p className='text-sm text-muted-foreground'>
          {isPaperBotDecision(decision)
            ? decision.risk
            : 'Manual paper action with no automated risk pack.'}
        </p>
      </div>
      <div>
        <div className='mb-1 text-sm font-semibold'>Next check</div>
        <p className='text-sm text-muted-foreground'>
          {isPaperBotDecision(decision)
            ? decision.nextCheck
            : 'Review at the next replay checkpoint.'}
        </p>
        <div className='mt-2 text-xs text-muted-foreground'>
          Watch {money(watchLevels.upside)} / {money(watchLevels.downside)}
        </div>
      </div>
      {isPaperBotDecision(decision) && decision.research ? (
        <div className='lg:col-span-4'>
          <div className='mb-2 text-sm font-semibold'>Research used</div>
          <p className='text-sm text-muted-foreground'>{decision.research.thesis}</p>
          <div className='mt-3 flex flex-wrap gap-2'>
            {decision.research.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target='_blank'
                rel='noreferrer'
                className='rounded-full border px-3 py-1 text-xs hover:text-foreground'
              >
                {link.source ? `${link.source}: ` : ''}
                {link.label}
              </a>
            ))}
          </div>
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
  onOpenTradeBrief,
  botRunning,
  onRunPaperBot,
  onClearJournal,
  journalClearing,
  tradeBriefRunningKey,
  watchLevels
}: {
  rows: JournalReplayRow[];
  selectedRowId?: string;
  selectedJournalEntry?: JournalEntry;
  selectedTradeKey?: string;
  onSelectDecision: (decision: PaperJournalEntry) => void;
  onOpenTradeBrief: (trade: Trade) => void;
  botRunning: boolean;
  onRunPaperBot: () => void;
  onClearJournal: () => void;
  journalClearing: boolean;
  tradeBriefRunningKey?: string;
  watchLevels: WatchLevels;
}) {
  return (
    <Card className='rounded-2xl'>
      <CardHeader className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
        <div>
          <CardTitle>Paper bot journal</CardTitle>
          <CardDescription>Review every decision the strategy made.</CardDescription>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            isLoading={journalClearing}
            onClick={onClearJournal}
          >
            Clear journal
          </Button>
          <Button type='button' variant='secondary' isLoading={botRunning} onClick={onRunPaperBot}>
            Run Linda decision
          </Button>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Button type='button' variant='outline' size='sm' disabled>
            All decisions
          </Button>
          <Button type='button' variant='outline' size='sm' disabled>
            All actions
          </Button>
          <Button type='button' variant='outline' size='sm' disabled>
            Date range
          </Button>
          <Button type='button' variant='outline' size='sm' disabled>
            More filters
          </Button>
          <div className='ml-auto flex flex-wrap gap-2'>
            <Button type='button' variant='outline' size='sm' disabled>
              Search decisions...
            </Button>
            <Button type='button' variant='outline' size='sm' disabled>
              Show only key decisions
            </Button>
          </div>
        </div>
        <div className='overflow-x-auto rounded-xl border'>
          <table className='w-full min-w-[980px] text-sm'>
            <thead className='bg-muted/40 text-muted-foreground'>
              <tr>
                <th className='p-3 text-left'>Date / Time</th>
                <th className='p-3 text-left'>Action</th>
                <th className='p-3 text-right'>Confidence</th>
                <th className='p-3 text-right'>Price</th>
                <th className='p-3 text-left'>Reason short</th>
                <th className='p-3 text-left'>Strategy</th>
                <th className='p-3 text-right'>Result 1D</th>
                <th className='p-3 text-right'>Result 3D</th>
                <th className='p-3 text-right'>Result 7D</th>
                <th className='p-3 text-right'>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const tradeKey = row.trade
                  ? getTradeDecisionKey(row.strategyKey, row.trade)
                  : undefined;
                const selected =
                  (selectedRowId !== undefined && selectedRowId === row.id) ||
                  selectedJournalEntry?.id === row.decision?.id ||
                  (selectedTradeKey !== undefined &&
                    (selectedTradeKey === row.id || selectedTradeKey === tradeKey));
                const expandedDecision = selected && row.decision ? row.decision : undefined;
                const creating = tradeKey !== undefined && tradeBriefRunningKey === tradeKey;

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={cn(
                        'cursor-pointer border-t transition hover:bg-muted/30',
                        selected && 'bg-primary/10'
                      )}
                      onClick={() => {
                        if (row.decision) onSelectDecision(row.decision);
                        else if (row.trade) onOpenTradeBrief(row.trade);
                      }}
                    >
                      <td className='p-3'>{dateTimeLabel(row.time)}</td>
                      <td className='p-3'>
                        <Badge variant={actionBadgeVariant(row.action)}>
                          {row.action.toUpperCase()}
                        </Badge>
                      </td>
                      <td className='p-3 text-right'>
                        {row.confidence !== undefined ? `${row.confidence.toFixed(0)}%` : '--'}
                      </td>
                      <td className='p-3 text-right'>{moneyPrecise(row.price)}</td>
                      <td className='max-w-80 truncate p-3 text-muted-foreground'>{row.reason}</td>
                      <td className='p-3'>{row.strategy}</td>
                      {row.forward.map((item) => (
                        <td
                          key={item.label}
                          className={cn(
                            'p-3 text-right',
                            (item.value ?? 0) > 0 && 'text-primary',
                            (item.value ?? 0) < 0 && 'text-destructive'
                          )}
                        >
                          {item.value === undefined ? '--' : percent(item.value)}
                        </td>
                      ))}
                      <td className='p-3 text-right'>
                        <Button
                          type='button'
                          size='sm'
                          variant={selected ? 'default' : 'outline'}
                          isLoading={creating}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (row.decision) onSelectDecision(row.decision);
                            else if (row.trade) onOpenTradeBrief(row.trade);
                          }}
                        >
                          {selected ? 'Viewing' : row.decision ? 'View' : 'Create brief'}
                        </Button>
                      </td>
                    </tr>
                    {expandedDecision ? (
                      <tr className='border-t bg-muted/10'>
                        <td colSpan={10} className='p-4'>
                          <JournalDecisionDetail
                            decision={expandedDecision}
                            watchLevels={watchLevels}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className='p-6 text-center text-muted-foreground'>
                    No replay decisions yet. Run Linda or pick a strategy with trades.
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
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(defaultPortfolio());
  const [loading, setLoading] = useState(false);
  const [botRunning, setBotRunning] = useState(false);
  const [journalClearing, setJournalClearing] = useState(false);
  const [hoveredTrade, setHoveredTrade] = useState<HoveredTrade>();
  const [selectedJournalId, setSelectedJournalId] = useState<string>();
  const [selectedTradeKey, setSelectedTradeKey] = useState<string>();
  const [selectedReplayEventId, setSelectedReplayEventId] = useState<string>();
  const [tradeBriefRunningKey, setTradeBriefRunningKey] = useState<string>();
  const [selectedStrategy, setSelectedStrategy] = useState<TradingStrategy>(
    initialData.backtests[0]?.strategy ?? 'sma-cross'
  );

  useEffect(() => {
    if (window.localStorage.getItem(tradingResetKey) !== 'done') {
      for (const key of Object.keys(window.localStorage)) {
        if (key.toLowerCase().includes('trading-lab')) window.localStorage.removeItem(key);
      }
      window.localStorage.setItem(tradingResetKey, 'done');
      setPortfolio(defaultPortfolio());
      return;
    }

    const stored = window.localStorage.getItem(paperKey);
    if (stored) setPortfolio(JSON.parse(stored) as PaperPortfolio);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(paperKey, JSON.stringify(portfolio));
  }, [portfolio]);

  const selectedBacktest =
    data.backtests.find((item) => item.strategy === selectedStrategy) ?? data.backtests[0];
  const price = data.snapshot.price;
  const paperEquity = portfolio.cash + portfolio.btc * price;
  const paperReturnPct = ((paperEquity - 10_000) / 10_000) * 100;
  const lastSignal = useMemo(
    () => (selectedBacktest ? latestItem(selectedBacktest.trades) : undefined),
    [selectedBacktest]
  );
  const latestBotDecision = useMemo(
    () => newestFirst(data.journal.decisions).find(isPaperBotDecision),
    [data.journal.decisions]
  );
  const tradeDecisionMap = useMemo(() => {
    const entries = data.journal.decisions
      .filter(isPaperBotDecision)
      .flatMap((decision) =>
        decision.evidence.trade?.key ? [[decision.evidence.trade.key, decision] as const] : []
      );

    return new Map(entries);
  }, [data.journal.decisions]);
  const selectedTrade = useMemo(() => {
    if (!selectedTradeKey || !selectedBacktest) return undefined;

    return selectedBacktest.trades.find(
      (trade) => getTradeDecisionKey(selectedBacktest.strategy, trade) === selectedTradeKey
    );
  }, [selectedBacktest, selectedTradeKey]);
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
        decisions: data.journal.decisions,
        selectedStrategy
      }),
    [data.journal.decisions, selectedStrategy]
  );
  const selectedReplayEvent = replayEvents.find((event) => event.id === selectedReplayEventId);
  const selectedReplayDecision = selectedReplayEvent?.decision;
  const activeLindaDecision = selectedTradeDecision ?? selectedReplayDecision ?? latestBotDecision;
  const primaryTrade = selectedTrade ?? selectedReplayEvent?.trade ?? lastSignal;
  const decisionPrice = activeLindaDecision?.price ?? primaryTrade?.price ?? data.snapshot.price;
  const watchLevels = useMemo(
    () => getWatchLevels(data.snapshot.candles, decisionPrice),
    [data.snapshot.candles, decisionPrice]
  );
  const evidence = getEvidenceBullets({
    decision: activeLindaDecision,
    selectedBacktest,
    diagnostics,
    lastSignal
  });
  const selectedDecision: DecisionViewModel = {
    action: activeLindaDecision?.action ?? primaryTrade?.side ?? 'hold',
    time: activeLindaDecision?.createdAt ?? primaryTrade?.time ?? selectedReplayEvent?.time,
    confidence: activeLindaDecision?.confidence,
    strategy:
      strategyLabels[
        activeLindaDecision?.strategy ?? selectedBacktest?.strategy ?? selectedStrategy
      ],
    price: decisionPrice,
    reason: activeLindaDecision?.reason ?? primaryTrade?.reason ?? 'No selected decision yet.',
    risk:
      activeLindaDecision?.risk ??
      `${getPositionRisk(diagnostics, selectedBacktest)} position risk based on volatility and drawdown.`,
    nextCheck: activeLindaDecision?.nextCheck ?? 'Review again at the next daily candle close.',
    evidence,
    watchLevels
  };
  const forwardPerformance = getForwardPerformance(
    data.snapshot.candles,
    selectedDecision.time,
    selectedDecision.price,
    selectedDecision.action
  );
  const journalRows = useMemo(
    () =>
      createJournalRows({
        decisions: data.journal.decisions,
        selectedStrategy,
        candles: data.snapshot.candles
      }),
    [data.journal.decisions, data.snapshot.candles, selectedStrategy]
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

  async function clearJournal() {
    setJournalClearing(true);
    try {
      await fetch('/api/trading/journal', { method: 'DELETE', cache: 'no-store' });
      setSelectedJournalId(undefined);
      setSelectedReplayEventId(undefined);
      setSelectedTradeKey(undefined);
      setData((current) => ({
        ...current,
        journal: { backtestRuns: [], decisions: [] }
      }));
    } finally {
      setJournalClearing(false);
    }
  }

  async function runPaperBot() {
    setBotRunning(true);
    try {
      const response = await fetch('/api/trading/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'bot', strategy: selectedStrategy })
      });
      const payload = (await response.json()) as {
        decision?: TradingLabPayload['journal']['decisions'][number];
      };
      if (payload.decision) {
        const tradeKey = isPaperBotDecision(payload.decision)
          ? payload.decision.evidence.trade?.key
          : undefined;
        setSelectedJournalId(payload.decision.id);
        setSelectedTradeKey(tradeKey);
        setSelectedReplayEventId(tradeKey ?? payload.decision.id);
        setData((current) => ({
          ...current,
          journal: {
            ...current.journal,
            decisions: [...current.journal.decisions, payload.decision!]
          }
        }));
      }
    } finally {
      setBotRunning(false);
    }
  }

  async function openTradeBrief(trade: Trade) {
    if (!selectedBacktest) return;
    const tradeKey = getTradeDecisionKey(selectedBacktest.strategy, trade);
    const existingDecision = tradeDecisionMap.get(tradeKey);

    setSelectedTradeKey(tradeKey);
    setSelectedReplayEventId(tradeKey);

    if (existingDecision) {
      setSelectedJournalId(existingDecision.id);
      return;
    }

    setTradeBriefRunningKey(tradeKey);
    try {
      const response = await fetch('/api/trading/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'bot',
          strategy: selectedBacktest.strategy,
          tradeTime: trade.time,
          tradeSide: trade.side
        })
      });
      const payload = (await response.json()) as {
        decision?: TradingLabPayload['journal']['decisions'][number];
      };
      if (payload.decision) {
        setSelectedJournalId(payload.decision.id);
        setData((current) => ({
          ...current,
          journal: {
            ...current.journal,
            decisions: [...current.journal.decisions, payload.decision!]
          }
        }));
      }
    } finally {
      setTradeBriefRunningKey(undefined);
    }
  }

  function selectReplayEvent(event: ReplayEvent) {
    setSelectedReplayEventId(event.id);
    if (event.trade) {
      void openTradeBrief(event.trade);
      return;
    }
    if (event.decision) {
      setSelectedJournalId(event.decision.id);
      setSelectedTradeKey(event.decision.evidence.trade?.key);
      return;
    }
    setSelectedTradeKey(undefined);
    setSelectedJournalId(undefined);
  }

  function selectJournalDecision(decision: PaperJournalEntry) {
    const tradeKey = isPaperBotDecision(decision) ? decision.evidence.trade?.key : undefined;
    setSelectedJournalId(decision.id);
    setSelectedTradeKey(tradeKey);
    setSelectedReplayEventId(tradeKey ?? decision.id);
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
        <LindaAnalystBrief
          activeLindaDecision={activeLindaDecision}
          latestLindaAction={latestLindaAction}
          watchLevels={watchLevels}
          botRunning={botRunning}
          onRunPaperBot={() => void runPaperBot()}
        />
      </RightContextSidebarRegistration>

      <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <h1 className='text-3xl font-semibold tracking-tight'>Trading Lab</h1>
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
        candles={data.snapshot.candles}
        portfolio={portfolio}
        paperEquity={paperEquity}
        paperReturnPct={paperReturnPct}
        lastSignal={lastSignal}
        latestLindaAction={latestLindaAction}
      />

      <div className='flex flex-col gap-6'>
        <StrategyTradeChart
          candles={data.snapshot.candles}
          trades={selectedBacktest?.trades ?? []}
          strategyKey={selectedBacktest?.strategy ?? selectedStrategy}
          strategy={strategyLabels[selectedBacktest?.strategy ?? selectedStrategy]}
          ohlc={ohlc}
          selectedTradeKey={selectedTradeKey}
          hoveredTrade={hoveredTrade}
          onHoverTrade={setHoveredTrade}
          onSelectTrade={(trade) => void openTradeBrief(trade)}
        />
        <DecisionTimeline
          events={replayEvents}
          selectedId={selectedReplayEventId ?? selectedTradeKey ?? selectedJournalId}
          onSelect={selectReplayEvent}
        />
        <div className='grid gap-6 2xl:grid-cols-2'>
          <StrategyComparison
            backtests={data.backtests}
            selectedStrategy={selectedStrategy}
            onSelectStrategy={(strategy) => {
              setSelectedStrategy(strategy);
              setSelectedTradeKey(undefined);
              setSelectedReplayEventId(undefined);
            }}
          />
          <RegimeDiagnosticsCard diagnostics={diagnostics} />
        </div>

        <PaperBotJournal
          rows={journalRows}
          selectedRowId={selectedReplayEventId}
          selectedJournalEntry={selectedJournalEntry}
          selectedTradeKey={selectedTradeKey}
          onSelectDecision={selectJournalDecision}
          onOpenTradeBrief={(trade) => void openTradeBrief(trade)}
          botRunning={botRunning}
          onRunPaperBot={() => void runPaperBot()}
          onClearJournal={() => void clearJournal()}
          journalClearing={journalClearing}
          tradeBriefRunningKey={tradeBriefRunningKey}
          watchLevels={watchLevels}
        />
      </div>

      <div className='text-muted-foreground text-xs'>
        Updated {dateTimeLabel(data.snapshot.updatedAt)} - Data source: Binance + CoinGecko. Not
        financial advice.
      </div>
    </div>
  );
}
