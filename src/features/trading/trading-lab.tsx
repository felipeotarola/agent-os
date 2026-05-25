'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
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
import { useEffect, useMemo, useState } from 'react';

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

type WatchLevels = {
  upside: number;
  downside: number;
};

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

const strategyLabels: Record<string, string> = {
  'sma-cross': 'SMA cross',
  'rsi-reversion': 'RSI reversion',
  'volume-breakout': 'Volume breakout'
};

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
  return `${dateLabel(first.time)} - ${dateLabel(last.time)}`;
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
  selectedBacktest,
  decisions,
  selectedStrategy
}: {
  selectedBacktest?: BacktestResult;
  decisions: PaperJournalEntry[];
  selectedStrategy: TradingStrategy;
}): ReplayEvent[] {
  const trades = selectedBacktest?.trades ?? [];
  const tradeEvents = trades.map((trade) => ({
    id: getTradeDecisionKey(selectedStrategy, trade),
    action: trade.side,
    time: trade.time,
    price: trade.price,
    label: trade.side.toUpperCase(),
    reason: trade.reason,
    trade
  }));
  const holdEvents = decisions
    .filter(isPaperBotDecision)
    .filter((decision) => decision.action === 'hold' && decision.strategy === selectedStrategy)
    .map((decision) => ({
      id: decision.id,
      action: 'hold' as const,
      time: new Date(decision.createdAt).getTime(),
      price: decision.price,
      label: 'HOLD',
      reason: decision.reason,
      decision
    }));

  if (holdEvents.length === 0 && tradeEvents.length > 1) {
    const syntheticHolds = tradeEvents
      .slice(0, -1)
      .slice(0, 3)
      .map((event, index) => {
        const next = tradeEvents[index + 1];
        return {
          id: `synthetic-hold-${event.id}`,
          action: 'hold' as const,
          time: Math.round((event.time + next.time) / 2),
          price: (event.price + next.price) / 2,
          label: 'HOLD',
          reason: 'Synthetic replay checkpoint between strategy decisions',
          synthetic: true
        };
      });
    return [...tradeEvents, ...syntheticHolds].toSorted((left, right) => left.time - right.time);
  }

  return [...tradeEvents, ...holdEvents].toSorted((left, right) => left.time - right.time);
}

function createJournalRows({
  selectedBacktest,
  decisions,
  selectedStrategy,
  candles
}: {
  selectedBacktest?: BacktestResult;
  decisions: PaperJournalEntry[];
  selectedStrategy: TradingStrategy;
  candles: Candle[];
}): JournalReplayRow[] {
  const botTradeKeys = new Set(
    decisions
      .filter(isPaperBotDecision)
      .flatMap((decision) => (decision.evidence.trade?.key ? [decision.evidence.trade.key] : []))
  );
  const decisionRows: JournalReplayRow[] = decisions.map((decision) => {
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
  });
  const tradeRows: JournalReplayRow[] = (selectedBacktest?.trades ?? [])
    .filter((trade) => !botTradeKeys.has(getTradeDecisionKey(selectedStrategy, trade)))
    .map((trade) => ({
      id: getTradeDecisionKey(selectedStrategy, trade),
      action: trade.side,
      time: trade.time,
      confidence: undefined,
      price: trade.price,
      reason: trade.reason,
      strategy: strategyLabels[selectedStrategy],
      strategyKey: selectedStrategy,
      trade,
      forward: getForwardPerformance(candles, trade.time, trade.price, trade.side)
    }));

  return [...decisionRows, ...tradeRows]
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
    <div className='min-w-0 border-l px-4 first:border-l-0'>
      <div className='text-muted-foreground text-[11px]'>{label}</div>
      <div
        className={cn(
          'truncate text-sm font-semibold',
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
  tone = 'default'
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-muted/30 p-3',
        tone === 'positive' && 'border-primary/40 bg-primary/10',
        tone === 'negative' && 'border-destructive/40 bg-destructive/10',
        tone === 'warning' && 'border-muted-foreground/30 bg-muted/50'
      )}
    >
      <div className='text-muted-foreground text-[11px]'>{label}</div>
      <div
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'positive' && 'text-primary',
          tone === 'negative' && 'text-destructive',
          tone === 'warning' && 'text-foreground'
        )}
      >
        {value}
      </div>
    </div>
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
    <Card className='overflow-hidden rounded-2xl'>
      <CardContent className='p-0'>
        <div className='grid gap-0 lg:grid-cols-[1fr_340px]'>
          <div className='grid gap-0 md:grid-cols-4 xl:grid-cols-8'>
            <div className='flex items-center gap-3 border-b p-4 md:border-b-0'>
              <div className='flex size-10 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary'>
                B
              </div>
              <div>
                <div className='font-semibold'>BTC/USDT</div>
                <div className='text-muted-foreground text-xs'>1D - Binance</div>
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
          </div>
          <div className='border-t p-4 lg:border-l lg:border-t-0'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <div className='text-muted-foreground text-xs'>Paper portfolio</div>
                <div className='font-semibold'>{money(paperEquity)}</div>
                <div
                  className={cn(
                    'text-xs',
                    paperReturnPct >= 0 ? 'text-primary' : 'text-destructive'
                  )}
                >
                  {percent(paperReturnPct)}
                </div>
              </div>
              <div className='flex gap-2'>
                <Button type='button' variant='outline' size='sm' disabled>
                  Export report
                </Button>
                <Button type='button' size='sm' disabled>
                  New backtest
                </Button>
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
  strategy,
  ohlc,
  hoveredTrade,
  onHoverTrade
}: {
  candles: Candle[];
  trades: Trade[];
  strategy: string;
  ohlc: ReturnType<typeof currentOhlc>;
  hoveredTrade?: HoveredTrade;
  onHoverTrade: (trade?: HoveredTrade) => void;
}) {
  const visibleCandles = candles.filter((candle) => candle.close > 0).slice(-95);
  const width = 1120;
  const height = 520;
  const padding = { top: 24, right: 76, bottom: 40, left: 54 };
  const priceHeight = 350;
  const volumeTop = padding.top + priceHeight + 28;
  const volumeHeight = height - volumeTop - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  const highs = visibleCandles.map((candle) => candle.high || candle.close);
  const lows = visibleCandles.map((candle) => candle.low || candle.close);
  const minPrice = Math.min(...lows, ohlc.close || 0);
  const maxPrice = Math.max(...highs, ohlc.close || 1);
  const priceRange = Math.max(1, maxPrice - minPrice);
  const maxChartVolume = Math.max(...visibleCandles.map((candle) => candle.quoteVolume), 1);
  const candleIndex = new Map(visibleCandles.map((candle, index) => [candle.time, index]));
  const visibleTrades = trades.filter((trade) => candleIndex.has(trade.time));

  function xForIndex(index: number) {
    return padding.left + (index / Math.max(visibleCandles.length - 1, 1)) * plotWidth;
  }

  function yForPrice(value: number) {
    return padding.top + ((maxPrice - value) / priceRange) * priceHeight;
  }

  const closePoints = visibleCandles
    .map((candle, index) => `${xForIndex(index)},${yForPrice(candle.close)}`)
    .join(' ');
  const smaPoints = visibleCandles
    .map((_, index) => {
      const slice = visibleCandles.slice(Math.max(0, index - 19), index + 1);
      return `${xForIndex(index)},${yForPrice(average(slice.map((candle) => candle.close)))}`;
    })
    .join(' ');
  const lastCandle = visibleCandles.at(-1);
  const firstCandle = visibleCandles.at(0);

  return (
    <div className='overflow-hidden rounded-2xl border bg-card'>
      <div className='flex flex-col gap-3 border-b bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='font-semibold'>BTC/USDT</div>
            <Badge variant='outline'>1D</Badge>
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
        <div className='flex flex-wrap gap-2 text-xs'>
          <Badge variant='secondary'>Indicators</Badge>
          <Badge variant='outline'>SMA proxy</Badge>
          <Badge variant='outline'>Volume</Badge>
        </div>
      </div>
      <div className='relative bg-background'>
        <svg viewBox={`0 0 ${width} ${height}`} className='h-[520px] w-full' role='img'>
          <title>{strategy} decision replay with volume</title>
          <defs>
            <linearGradient id='tradeVolumeGradient' x1='0' x2='0' y1='0' y2='1'>
              <stop offset='0%' stopColor='currentColor' stopOpacity='0.7' />
              <stop offset='100%' stopColor='currentColor' stopOpacity='0.16' />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = padding.top + tick * priceHeight;
            const value = maxPrice - tick * priceRange;
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  className='stroke-border'
                  strokeDasharray='5 7'
                  opacity='0.8'
                />
                <text
                  x={width - padding.right + 12}
                  y={y + 4}
                  className='fill-muted-foreground text-[11px]'
                >
                  {money(value)}
                </text>
              </g>
            );
          })}
          <text x={padding.left} y={volumeTop - 10} className='fill-muted-foreground text-[11px]'>
            Volume
          </text>
          {visibleCandles.map((candle, index) => {
            const x = xForIndex(index);
            const barWidth = Math.max(3, plotWidth / Math.max(visibleCandles.length, 1) - 2);
            const barHeight = Math.max(2, (candle.quoteVolume / maxChartVolume) * volumeHeight);
            const isUp = candle.close >= candle.open;
            return (
              <g key={candle.time}>
                <line
                  x1={x}
                  x2={x}
                  y1={yForPrice(candle.high || candle.close)}
                  y2={yForPrice(candle.low || candle.close)}
                  className={isUp ? 'stroke-primary/60' : 'stroke-destructive/60'}
                />
                <line
                  x1={x}
                  x2={x}
                  y1={yForPrice(candle.open || candle.close)}
                  y2={yForPrice(candle.close)}
                  className={isUp ? 'stroke-primary' : 'stroke-destructive'}
                  strokeLinecap='round'
                  strokeWidth={Math.max(3, barWidth * 0.65)}
                />
                <rect
                  x={x - barWidth / 2}
                  y={volumeTop + volumeHeight - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx='2'
                  className='fill-primary'
                  opacity={isUp ? 0.45 : 0.25}
                />
              </g>
            );
          })}
          <polyline
            points={smaPoints}
            fill='none'
            className='stroke-primary/50'
            strokeWidth='1.7'
          />
          <polyline
            points={closePoints}
            fill='none'
            className='stroke-foreground/75'
            strokeWidth='1.25'
          />
          {visibleTrades.map((trade) => {
            const index = candleIndex.get(trade.time) ?? 0;
            const x = xForIndex(index);
            const y = yForPrice(trade.price);
            const buy = trade.side === 'buy';
            return (
              <g
                key={`${trade.time}-${trade.side}-${trade.price}`}
                onMouseEnter={() => onHoverTrade({ trade, x, y })}
                onMouseLeave={() => onHoverTrade(undefined)}
                className='cursor-pointer'
              >
                <circle
                  cx={x}
                  cy={y}
                  r='11'
                  className={buy ? 'fill-primary' : 'fill-destructive'}
                  opacity='0.18'
                />
                <circle
                  cx={x}
                  cy={y}
                  r='5'
                  className={buy ? 'fill-primary' : 'fill-destructive'}
                  stroke='currentColor'
                  strokeWidth='2'
                />
                <text
                  x={x}
                  y={buy ? y - 15 : y + 25}
                  textAnchor='middle'
                  className={
                    buy
                      ? 'fill-primary text-[10px] font-bold'
                      : 'fill-destructive text-[10px] font-bold'
                  }
                >
                  {buy ? 'BUY' : 'SELL'}
                </text>
              </g>
            );
          })}
          {firstCandle ? (
            <text x={padding.left} y={height - 14} className='fill-muted-foreground text-[11px]'>
              {dateLabel(firstCandle.time)}
            </text>
          ) : null}
          {lastCandle ? (
            <text
              x={width - padding.right}
              y={height - 14}
              textAnchor='end'
              className='fill-muted-foreground text-[11px]'
            >
              {dateLabel(lastCandle.time)}
            </text>
          ) : null}
        </svg>
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
        {visibleCandles.length === 0 ? (
          <div className='absolute inset-x-0 top-1/2 text-center text-sm text-muted-foreground'>
            No candles available for the selected replay.
          </div>
        ) : null}
      </div>
    </div>
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

function DecisionTimeline({
  events,
  selectedId,
  onSelect
}: {
  events: ReplayEvent[];
  selectedId?: string;
  onSelect: (event: ReplayEvent) => void;
}) {
  return (
    <Card className='rounded-2xl'>
      <CardHeader className='pb-2'>
        <CardTitle>Decision timeline</CardTitle>
        <CardDescription>
          Backtrack every selected strategy decision in chronological order.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length > 0 ? (
          <div className='flex gap-3 overflow-x-auto pb-2'>
            {events.map((event) => {
              const selected = selectedId === event.id;
              return (
                <button
                  key={event.id}
                  type='button'
                  onClick={() => onSelect(event)}
                  className={cn(
                    'min-w-36 rounded-2xl border bg-muted/20 p-3 text-left transition hover:bg-muted/40',
                    selected && 'border-primary bg-primary/10 shadow-sm'
                  )}
                >
                  <div className='flex items-center justify-between gap-2'>
                    <Badge variant={actionBadgeVariant(event.action)}>
                      {event.action.toUpperCase()}
                    </Badge>
                    {event.synthetic ? (
                      <span className='text-muted-foreground text-[10px]'>UI</span>
                    ) : null}
                  </div>
                  <div className='mt-3 text-sm font-semibold'>{dateLabel(event.time)}</div>
                  <div className='text-muted-foreground mt-1 text-xs'>
                    {moneyPrecise(event.price)}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className='rounded-xl border border-dashed p-5 text-sm text-muted-foreground'>
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
    <Card className='rounded-2xl'>
      <CardHeader>
        <CardTitle>Strategy comparison</CardTitle>
        <CardDescription>Compare replay outcomes across available strategy runs.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[560px] text-sm'>
            <thead className='text-muted-foreground'>
              <tr className='border-b'>
                <th className='py-2 text-left'>Strategy</th>
                <th className='py-2 text-right'>Return</th>
                <th className='py-2 text-right'>Max drawdown</th>
                <th className='py-2 text-right'>Win rate</th>
                <th className='py-2 text-right'>Trades</th>
                <th className='py-2 text-left'>Best regime</th>
              </tr>
            </thead>
            <tbody>
              {backtests.map((backtest) => {
                const selected = selectedStrategy === backtest.strategy;
                return (
                  <tr
                    key={backtest.strategy}
                    className={cn(
                      'cursor-pointer border-b transition hover:bg-muted/30',
                      selected && 'bg-primary/10'
                    )}
                    onClick={() => onSelectStrategy(backtest.strategy)}
                  >
                    <td className='py-3 font-medium'>
                      <div className='flex items-center gap-2'>
                        {strategyLabels[backtest.strategy]}
                        {selected ? <Badge variant='outline'>Active</Badge> : null}
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
                    <td className='py-3 text-right'>{backtest.trades.length}</td>
                    <td className='py-3 text-muted-foreground'>
                      {bestRegimeByStrategy[backtest.strategy]}
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

function RegimeDiagnosticsCard({ diagnostics }: { diagnostics: RegimeDiagnostics }) {
  return (
    <Card className='rounded-2xl'>
      <CardHeader>
        <CardTitle>Regime / Diagnostics</CardTitle>
        <CardDescription>Derived market state for the replay window.</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3 sm:grid-cols-2'>
        <StatusPill
          label='Trend'
          value={diagnostics.trend}
          tone={
            diagnostics.trend === 'Uptrend'
              ? 'positive'
              : diagnostics.trend === 'Downtrend'
                ? 'negative'
                : 'warning'
          }
        />
        <StatusPill
          label='Volatility'
          value={diagnostics.volatility}
          tone={diagnostics.volatilityHigh ? 'warning' : 'positive'}
        />
        <StatusPill
          label='Volume'
          value={diagnostics.volume}
          tone={
            diagnostics.volume === 'Volume rising'
              ? 'positive'
              : diagnostics.volume === 'Volume falling'
                ? 'negative'
                : 'warning'
          }
        />
        <StatusPill label='Price vs 200 SMA' value={diagnostics.priceVsAverage} tone='positive' />
        <StatusPill label='Market regime' value={diagnostics.marketRegime} />
        <StatusPill
          label='Liquidity'
          value={diagnostics.liquidity}
          tone={diagnostics.liquidity === 'Healthy' ? 'positive' : 'warning'}
        />
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

function PaperPortfolioCompact({
  portfolio,
  paperEquity,
  paperReturnPct,
  onBuy,
  onSell,
  onReset
}: {
  portfolio: PaperPortfolio;
  paperEquity: number;
  paperReturnPct: number;
  onBuy: () => void;
  onSell: () => void;
  onReset: () => void;
}) {
  return (
    <Card className='rounded-2xl'>
      <CardHeader>
        <CardTitle>Paper portfolio</CardTitle>
        <CardDescription>Local paper controls remain secondary to replay analysis.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='grid grid-cols-2 gap-3 text-sm'>
          <div>
            <div className='text-muted-foreground'>Equity</div>
            <div className='font-semibold'>{money(paperEquity)}</div>
          </div>
          <div>
            <div className='text-muted-foreground'>Return</div>
            <div
              className={cn(
                'font-semibold',
                paperReturnPct >= 0 ? 'text-primary' : 'text-destructive'
              )}
            >
              {percent(paperReturnPct)}
            </div>
          </div>
          <div>
            <div className='text-muted-foreground'>Cash</div>
            <div className='font-semibold'>{money(portfolio.cash)}</div>
          </div>
          <div>
            <div className='text-muted-foreground'>BTC</div>
            <div className='font-semibold'>{portfolio.btc.toFixed(6)}</div>
          </div>
        </div>
        <div className='grid grid-cols-3 gap-2'>
          <Button type='button' variant='secondary' size='sm' onClick={onBuy}>
            Paper buy
          </Button>
          <Button type='button' variant='secondary' size='sm' onClick={onSell}>
            Paper sell
          </Button>
          <Button type='button' variant='outline' size='sm' onClick={onReset}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
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
  tradeBriefRunningKey?: string;
  watchLevels: WatchLevels;
}) {
  const expandedDecision = selectedJournalEntry;

  return (
    <Card className='rounded-2xl'>
      <CardHeader className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
        <div>
          <CardTitle>Paper bot journal</CardTitle>
          <CardDescription>Review every decision the strategy made.</CardDescription>
        </div>
        <Button type='button' variant='secondary' isLoading={botRunning} onClick={onRunPaperBot}>
          Run Linda decision
        </Button>
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
                  selectedRowId === row.id ||
                  selectedJournalEntry?.id === row.decision?.id ||
                  selectedTradeKey === row.id ||
                  selectedTradeKey === tradeKey;
                const creating = tradeKey !== undefined && tradeBriefRunningKey === tradeKey;

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-t transition hover:bg-muted/30',
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

        {expandedDecision ? (
          <div className='grid gap-4 rounded-2xl border bg-muted/20 p-4 lg:grid-cols-4'>
            <div>
              <div className='mb-1 text-sm font-semibold'>Why this decision?</div>
              <p className='text-sm text-muted-foreground'>{expandedDecision.reason}</p>
            </div>
            <div>
              <div className='mb-1 text-sm font-semibold'>Evidence</div>
              <div className='flex flex-col gap-1 text-xs text-muted-foreground'>
                {isPaperBotDecision(expandedDecision) ? (
                  <>
                    <span>Return {percent(expandedDecision.evidence.returnPct)}</span>
                    <span>Win rate {percent(expandedDecision.evidence.winRatePct)}</span>
                    <span>Volume {expandedDecision.evidence.volumeVerdict}</span>
                  </>
                ) : (
                  <>
                    <span>Manual paper action</span>
                    <span>Portfolio equity {money(expandedDecision.portfolio.equity)}</span>
                  </>
                )}
              </div>
            </div>
            <div>
              <div className='mb-1 text-sm font-semibold'>Risk / invalidations</div>
              <p className='text-sm text-muted-foreground'>
                {isPaperBotDecision(expandedDecision)
                  ? expandedDecision.risk
                  : 'Manual paper action with no automated risk pack.'}
              </p>
            </div>
            <div>
              <div className='mb-1 text-sm font-semibold'>Next check</div>
              <p className='text-sm text-muted-foreground'>
                {isPaperBotDecision(expandedDecision)
                  ? expandedDecision.nextCheck
                  : 'Review at the next replay checkpoint.'}
              </p>
              <div className='mt-2 text-xs text-muted-foreground'>
                Watch {money(watchLevels.upside)} / {money(watchLevels.downside)}
              </div>
            </div>
            {isPaperBotDecision(expandedDecision) && expandedDecision.research ? (
              <div className='lg:col-span-4'>
                <div className='mb-2 text-sm font-semibold'>Research used</div>
                <p className='text-sm text-muted-foreground'>{expandedDecision.research.thesis}</p>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {expandedDecision.research.links.map((link) => (
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
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TradingLab({ initialData }: { initialData: TradingLabPayload }) {
  const [data, setData] = useState(initialData);
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(defaultPortfolio());
  const [loading, setLoading] = useState(false);
  const [botRunning, setBotRunning] = useState(false);
  const [hoveredTrade, setHoveredTrade] = useState<HoveredTrade>();
  const [selectedJournalId, setSelectedJournalId] = useState<string>();
  const [selectedTradeKey, setSelectedTradeKey] = useState<string>();
  const [selectedReplayEventId, setSelectedReplayEventId] = useState<string>();
  const [tradeBriefRunningKey, setTradeBriefRunningKey] = useState<string>();
  const [selectedStrategy, setSelectedStrategy] = useState<TradingStrategy>(
    initialData.backtests[0]?.strategy ?? 'sma-cross'
  );

  useEffect(() => {
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
        selectedBacktest,
        decisions: data.journal.decisions,
        selectedStrategy
      }),
    [data.journal.decisions, selectedBacktest, selectedStrategy]
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
        selectedBacktest,
        decisions: data.journal.decisions,
        selectedStrategy,
        candles: data.snapshot.candles
      }),
    [data.journal.decisions, data.snapshot.candles, selectedBacktest, selectedStrategy]
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
        setSelectedJournalId(payload.decision.id);
        setSelectedReplayEventId(payload.decision.id);
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

  async function logManualDecision(
    action: 'buy' | 'sell' | 'reset',
    nextPortfolio: PaperPortfolio,
    reason: string
  ) {
    const response = await fetch('/api/trading/journal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'manual',
        action,
        price,
        cash: nextPortfolio.cash,
        btc: nextPortfolio.btc,
        equity: nextPortfolio.cash + nextPortfolio.btc * price,
        reason
      })
    });
    const payload = (await response.json()) as {
      decision?: TradingLabPayload['journal']['decisions'][number];
      briefDecision?: TradingLabPayload['journal']['decisions'][number];
    };
    const newDecisions = [payload.decision, payload.briefDecision].filter(
      (decision): decision is TradingLabPayload['journal']['decisions'][number] =>
        decision !== undefined
    );
    if (newDecisions.length > 0) {
      setData((current) => ({
        ...current,
        journal: {
          ...current.journal,
          decisions: [...current.journal.decisions, ...newDecisions]
        }
      }));
    }
  }

  function paperBuy() {
    if (portfolio.cash <= 0) return;
    const quantity = portfolio.cash / price;
    const nextPortfolio = { ...portfolio, cash: 0, btc: portfolio.btc + quantity };
    setPortfolio(nextPortfolio);
    void logManualDecision('buy', nextPortfolio, 'Manual LocalStorage paper buy').catch(
      () => undefined
    );
  }

  function paperSell() {
    if (portfolio.btc <= 0) return;
    const nextPortfolio = { ...portfolio, cash: portfolio.cash + portfolio.btc * price, btc: 0 };
    setPortfolio(nextPortfolio);
    void logManualDecision('sell', nextPortfolio, 'Manual LocalStorage paper sell').catch(
      () => undefined
    );
  }

  function paperReset() {
    const nextPortfolio = defaultPortfolio();
    setPortfolio(nextPortfolio);
    void logManualDecision('reset', nextPortfolio, 'Manual LocalStorage paper reset').catch(
      () => undefined
    );
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
    setSelectedJournalId(decision.id);
    setSelectedReplayEventId(decision.id);
    if (isPaperBotDecision(decision)) {
      setSelectedTradeKey(decision.evidence.trade?.key);
    }
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='mb-2 flex flex-wrap items-center gap-2'>
            <Badge variant='outline'>Paper only</Badge>
            <Badge
              variant={data.snapshot.volumeTrend.verdict === 'rising' ? 'default' : 'secondary'}
            >
              Volume {data.snapshot.volumeTrend.verdict}
            </Badge>
          </div>
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

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]'>
        <div className='flex flex-col gap-6'>
          <StrategyTradeChart
            candles={data.snapshot.candles}
            trades={selectedBacktest?.trades ?? []}
            strategy={strategyLabels[selectedBacktest?.strategy ?? selectedStrategy]}
            ohlc={ohlc}
            hoveredTrade={hoveredTrade}
            onHoverTrade={setHoveredTrade}
          />
          <DecisionTimeline
            events={replayEvents}
            selectedId={selectedReplayEventId ?? selectedTradeKey ?? selectedJournalId}
            onSelect={selectReplayEvent}
          />
        </div>

        <div className='flex flex-col gap-6'>
          <SelectedDecisionInspector
            decision={selectedDecision}
            forwardPerformance={forwardPerformance}
            positionRisk={getPositionRisk(diagnostics, selectedBacktest)}
            selectedBacktest={selectedBacktest}
          />
          <PaperPortfolioCompact
            portfolio={portfolio}
            paperEquity={paperEquity}
            paperReturnPct={paperReturnPct}
            onBuy={paperBuy}
            onSell={paperSell}
            onReset={paperReset}
          />
        </div>
      </div>

      <div className='grid gap-6 xl:grid-cols-[1.3fr_1fr_1fr]'>
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
        <LindaAnalystBrief
          activeLindaDecision={activeLindaDecision}
          latestLindaAction={latestLindaAction}
          watchLevels={watchLevels}
          botRunning={botRunning}
          onRunPaperBot={() => void runPaperBot()}
        />
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
        tradeBriefRunningKey={tradeBriefRunningKey}
        watchLevels={watchLevels}
      />

      <div className='text-muted-foreground text-xs'>
        Updated {dateTimeLabel(data.snapshot.updatedAt)} - Data source: Binance + CoinGecko. Not
        financial advice.
      </div>
    </div>
  );
}
