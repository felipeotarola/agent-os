'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { BacktestResult, MarketSnapshot, TradingJournal } from '@/lib/trading';
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

const paperKey = 'agent-os:trading-lab:paper-portfolio:v1';

function money(value?: number) {
  if (value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function percent(value?: number) {
  if (value === undefined || Number.isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function dateLabel(value: number | string) {
  return new Intl.DateTimeFormat('sv-SE', { month: 'short', day: 'numeric' }).format(
    new Date(value)
  );
}

const strategyLabels: Record<string, string> = {
  'sma-cross': 'SMA cross',
  'rsi-reversion': 'RSI reversion',
  'volume-breakout': 'Volume breakout'
};

function defaultPortfolio(): PaperPortfolio {
  return { cash: 10_000, btc: 0, startedAt: new Date().toISOString() };
}

function latestItem<T>(items: T[]) {
  return items.length > 0 ? items[items.length - 1] : undefined;
}

function newestFirst<T>(items: T[]) {
  return items.reduceRight<T[]>((accumulator, item) => [...accumulator, item], []);
}

function actionTone(action?: string) {
  if (action === 'buy') return 'text-primary';
  if (action === 'sell') return 'text-destructive';
  return 'text-muted-foreground';
}

export function TradingLab({ initialData }: { initialData: TradingLabPayload }) {
  const [data, setData] = useState(initialData);
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(defaultPortfolio());
  const [loading, setLoading] = useState(false);
  const [botRunning, setBotRunning] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState(
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
  const latestCandles = data.snapshot.candles.slice(-8, -1);
  const maxVolume = Math.max(...latestCandles.map((candle) => candle.quoteVolume), 1);

  const lastSignal = useMemo(
    () => (selectedBacktest ? latestItem(selectedBacktest.trades) : undefined),
    [selectedBacktest]
  );
  const latestBotDecision = useMemo(
    () => newestFirst(data.journal.decisions).find((decision) => decision.kind === 'bot'),
    [data.journal.decisions]
  );
  const lindaDecisions = data.journal.decisions.filter(
    (decision) => decision.kind === 'bot' && decision.agent === 'Linda'
  );
  const latestLindaAction = latestBotDecision?.kind === 'bot' ? latestBotDecision.action : 'hold';

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
    };
    if (payload.decision) {
      setData((current) => ({
        ...current,
        journal: {
          ...current.journal,
          decisions: [...current.journal.decisions, payload.decision!]
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

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
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
            BTC cockpit för backtest, låtsastrades och volymkoll. Inga riktiga order.
          </p>
        </div>
        <Button onClick={refresh} disabled={loading}>
          {loading ? 'Uppdaterar…' : 'Uppdatera data'}
        </Button>
      </div>

      <div className='grid gap-4 md:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>BTCUSDT</CardDescription>
            <CardTitle>{money(price)}</CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={data.snapshot.priceChangePct24h >= 0 ? 'text-primary' : 'text-destructive'}
            >
              {percent(data.snapshot.priceChangePct24h)} 24h
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Global 24h-volym</CardDescription>
            <CardTitle>{money(data.snapshot.globalQuoteVolume24h)}</CardTitle>
          </CardHeader>
          <CardContent className='text-muted-foreground text-sm'>
            CoinGecko market volume
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Binance futures</CardDescription>
            <CardTitle>{money(data.snapshot.futuresQuoteVolume24h)}</CardTitle>
          </CardHeader>
          <CardContent className='text-muted-foreground text-sm'>
            Spot: {money(data.snapshot.spotQuoteVolume24h)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Volym mot 7D-snitt</CardDescription>
            <CardTitle>{percent(data.snapshot.volumeTrend.changeVsSevenDayPct)}</CardTitle>
          </CardHeader>
          <CardContent className='text-muted-foreground text-sm'>
            Senaste fulla dag: {money(data.snapshot.volumeTrend.latest)}
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]'>
        <Card className='overflow-hidden'>
          <CardHeader>
            <CardTitle>TradingView BTCUSDT</CardTitle>
            <CardDescription>
              Grafen är TradingView. Signaler/backtester är våra egna.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='bg-muted aspect-video overflow-hidden rounded-lg border'>
              <iframe
                title='TradingView BTCUSDT chart'
                src='https://www.tradingview.com/widgetembed/?symbol=BINANCE%3ABTCUSDT&interval=60&theme=dark&style=1&timezone=Europe%2FStockholm&withdateranges=1&hide_side_toolbar=0&allow_symbol_change=1&save_image=0&studies=%5B%22Volume%40tv-basicstudies%22%5D'
                className='h-full w-full'
                loading='lazy'
                sandbox='allow-forms allow-popups allow-scripts'
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paper portfolio</CardTitle>
            <CardDescription>LocalStorage-portfölj med startkapital $10k.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div>
                <div className='text-muted-foreground'>Equity</div>
                <div className='font-medium'>{money(paperEquity)}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>Return</div>
                <div
                  className={
                    paperReturnPct >= 0
                      ? 'font-medium text-primary'
                      : 'font-medium text-destructive'
                  }
                >
                  {percent(paperReturnPct)}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground'>Cash</div>
                <div className='font-medium'>{money(portfolio.cash)}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>BTC</div>
                <div className='font-medium'>{portfolio.btc.toFixed(6)}</div>
              </div>
            </div>
            <div className='grid grid-cols-3 gap-2'>
              <Button variant='secondary' onClick={paperBuy}>
                Paper buy
              </Button>
              <Button variant='secondary' onClick={paperSell}>
                Paper sell
              </Button>
              <Button variant='outline' onClick={paperReset}>
                Reset
              </Button>
            </div>
            <p className='text-muted-foreground text-xs'>
              Det här är medvetet friktionslöst och ofarligt: ingen exchange, inga API-keys, inga
              riktiga pengar.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]'>
        <Card>
          <CardHeader>
            <CardTitle>Backtest strategies</CardTitle>
            <CardDescription>
              90 dagar, dagliga candles, 0.1% fee. Rough men användbart.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {data.backtests.map((backtest) => (
              <button
                key={backtest.strategy}
                onClick={() => setSelectedStrategy(backtest.strategy)}
                className={`w-full rounded-lg border p-3 text-left transition ${selectedStrategy === backtest.strategy ? 'border-primary bg-primary/10' : 'bg-card hover:bg-muted/50'}`}
              >
                <div className='flex items-center justify-between gap-3'>
                  <span className='font-medium'>{strategyLabels[backtest.strategy]}</span>
                  <span className={backtest.returnPct >= 0 ? 'text-primary' : 'text-destructive'}>
                    {percent(backtest.returnPct)}
                  </span>
                </div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {backtest.trades.length} trades · max DD {percent(-backtest.maxDrawdownPct)}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{strategyLabels[selectedBacktest.strategy]} result</CardTitle>
            <CardDescription>
              Senaste signal:{' '}
              {lastSignal
                ? `${lastSignal.side.toUpperCase()} · ${lastSignal.reason} · ${dateLabel(lastSignal.time)}`
                : 'Ingen signal ännu'}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='grid gap-4 md:grid-cols-4'>
              <div>
                <div className='text-muted-foreground text-sm'>Final equity</div>
                <div className='text-lg font-semibold'>{money(selectedBacktest.finalEquity)}</div>
              </div>
              <div>
                <div className='text-muted-foreground text-sm'>Return</div>
                <div
                  className={
                    selectedBacktest.returnPct >= 0
                      ? 'text-lg font-semibold text-primary'
                      : 'text-lg font-semibold text-destructive'
                  }
                >
                  {percent(selectedBacktest.returnPct)}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-sm'>Win rate</div>
                <div className='text-lg font-semibold'>{percent(selectedBacktest.winRatePct)}</div>
              </div>
              <div>
                <div className='text-muted-foreground text-sm'>Exposure</div>
                <div className='text-lg font-semibold'>{percent(selectedBacktest.exposurePct)}</div>
              </div>
            </div>

            <div>
              <div className='mb-2 flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>Max drawdown</span>
                <span>{percent(-selectedBacktest.maxDrawdownPct)}</span>
              </div>
              <Progress value={Math.min(selectedBacktest.maxDrawdownPct, 100)} />
            </div>

            <div>
              <div className='mb-3 text-sm font-medium'>Senaste fulla dagars volym</div>
              <div className='flex h-32 items-end gap-2 rounded-lg border p-3'>
                {latestCandles.map((candle) => (
                  <div key={candle.time} className='flex flex-1 flex-col items-center gap-2'>
                    <div
                      className='bg-primary/80 w-full rounded-t'
                      style={{ height: `${Math.max(8, (candle.quoteVolume / maxVolume) * 100)}%` }}
                    />
                    <div className='text-muted-foreground text-[10px]'>
                      {dateLabel(candle.time)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className='overflow-hidden rounded-lg border'>
              <table className='w-full text-sm'>
                <thead className='bg-muted/50 text-muted-foreground'>
                  <tr>
                    <th className='p-2 text-left'>Date</th>
                    <th className='p-2 text-left'>Side</th>
                    <th className='p-2 text-right'>Price</th>
                    <th className='p-2 text-left'>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {newestFirst(selectedBacktest.trades.slice(-8)).map((trade) => (
                    <tr key={`${trade.time}-${trade.side}`} className='border-t'>
                      <td className='p-2'>{dateLabel(trade.time)}</td>
                      <td className='p-2'>
                        <Badge variant={trade.side === 'buy' ? 'default' : 'secondary'}>
                          {trade.side}
                        </Badge>
                      </td>
                      <td className='p-2 text-right'>{money(trade.price)}</td>
                      <td className='text-muted-foreground p-2'>{trade.reason}</td>
                    </tr>
                  ))}
                  {selectedBacktest.trades.length === 0 ? (
                    <tr>
                      <td className='text-muted-foreground p-3' colSpan={4}>
                        Inga trades för perioden.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]'>
        <Card>
          <CardHeader>
            <div className='mb-2 flex items-center gap-2'>
              <Badge variant='outline'>Linda</Badge>
              <Badge variant='secondary'>Paper agent</Badge>
            </div>
            <CardTitle>Linda Bradford</CardTitle>
            <CardDescription>
              Dedikerad trading-agent för paper research. Hon får analysera och journalföra — inte
              handla riktiga pengar.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div>
                <div className='text-muted-foreground'>Senaste stance</div>
                <div className={`font-semibold uppercase ${actionTone(latestLindaAction)}`}>
                  {latestLindaAction}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground'>Beslut loggade</div>
                <div className='font-semibold'>{lindaDecisions.length}</div>
              </div>
              <div>
                <div className='text-muted-foreground'>Scope</div>
                <div className='font-medium'>BTC first</div>
              </div>
              <div>
                <div className='text-muted-foreground'>Mode</div>
                <div className='font-medium'>No keys</div>
              </div>
            </div>
            <div className='rounded-lg border p-3 text-sm'>
              <div className='mb-1 font-medium'>Phase 1 guardrails</div>
              <ul className='text-muted-foreground list-disc space-y-1 pl-4 text-xs'>
                <li>Ingen live trading, inga riktiga order.</li>
                <li>Inga Binance API-nycklar behövs ännu.</li>
                <li>Varje signal måste ha risk, evidens och nästa check.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linda decision brief</CardTitle>
            <CardDescription>
              Senaste paper-beslutet i rätt format: action, confidence, evidence, risk, next check.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {latestBotDecision?.kind === 'bot' ? (
              <>
                <div className='grid gap-4 md:grid-cols-4'>
                  <div>
                    <div className='text-muted-foreground text-sm'>Action</div>
                    <div
                      className={`text-lg font-semibold uppercase ${actionTone(latestBotDecision.action)}`}
                    >
                      {latestBotDecision.action}
                    </div>
                  </div>
                  <div>
                    <div className='text-muted-foreground text-sm'>Confidence</div>
                    <div className='text-lg font-semibold'>
                      {latestBotDecision.confidence.toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className='text-muted-foreground text-sm'>Strategy</div>
                    <div className='text-lg font-semibold'>
                      {strategyLabels[latestBotDecision.strategy]}
                    </div>
                  </div>
                  <div>
                    <div className='text-muted-foreground text-sm'>Price</div>
                    <div className='text-lg font-semibold'>{money(latestBotDecision.price)}</div>
                  </div>
                </div>
                <div className='grid gap-3 md:grid-cols-3'>
                  <div className='rounded-lg border p-3'>
                    <div className='mb-1 text-sm font-medium'>Evidence</div>
                    <p className='text-muted-foreground text-sm'>{latestBotDecision.reason}</p>
                  </div>
                  <div className='rounded-lg border p-3'>
                    <div className='mb-1 text-sm font-medium'>Risk</div>
                    <p className='text-muted-foreground text-sm'>{latestBotDecision.risk}</p>
                  </div>
                  <div className='rounded-lg border p-3'>
                    <div className='mb-1 text-sm font-medium'>Next check</div>
                    <p className='text-muted-foreground text-sm'>{latestBotDecision.nextCheck}</p>
                  </div>
                </div>
                {latestBotDecision.research ? (
                  <div className='rounded-lg border p-3'>
                    <div className='mb-2 text-sm font-medium'>Research brief</div>
                    <p className='text-muted-foreground text-sm'>
                      {latestBotDecision.research.thesis}
                    </p>
                    <div className='mt-3 grid gap-2 md:grid-cols-2'>
                      {latestBotDecision.research.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target='_blank'
                          rel='noreferrer'
                          className='hover:bg-muted/50 rounded-md border p-2 text-sm transition'
                        >
                          <div className='font-medium'>{link.label}</div>
                          <div className='text-muted-foreground text-xs'>{link.note}</div>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className='text-muted-foreground text-sm'>
                Linda har inte loggat något paper-beslut ännu. Kör en decision cycle nedan.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <div>
            <CardTitle>Paper bot journal</CardTitle>
            <CardDescription>
              Lindas lokala beslutslogg. Sparas privat i runtime storage, inga riktiga order.
            </CardDescription>
          </div>
          <Button onClick={runPaperBot} disabled={botRunning} variant='secondary'>
            {botRunning ? 'Linda analyserar…' : 'Kör Linda decision'}
          </Button>
        </CardHeader>
        <CardContent>
          <div className='overflow-hidden rounded-lg border'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50 text-muted-foreground'>
                <tr>
                  <th className='p-2 text-left'>Time</th>
                  <th className='p-2 text-left'>Agent</th>
                  <th className='p-2 text-left'>Action</th>
                  <th className='p-2 text-right'>Price</th>
                  <th className='p-2 text-right'>Confidence</th>
                  <th className='p-2 text-left'>Reason</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst(data.journal.decisions.slice(-8)).map((decision) => (
                  <tr key={decision.id} className='border-t'>
                    <td className='p-2'>{new Date(decision.createdAt).toLocaleString('sv-SE')}</td>
                    <td className='p-2'>{decision.kind === 'bot' ? decision.agent : 'Manual'}</td>
                    <td className='p-2'>
                      <div className='flex items-center gap-2'>
                        <Badge
                          variant={
                            decision.action === 'buy'
                              ? 'default'
                              : decision.action === 'sell'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {decision.action}
                        </Badge>
                        <span className='text-muted-foreground text-xs'>{decision.kind}</span>
                      </div>
                    </td>
                    <td className='p-2 text-right'>{money(decision.price)}</td>
                    <td className='p-2 text-right'>
                      {decision.kind === 'bot' ? `${decision.confidence.toFixed(0)}%` : '—'}
                    </td>
                    <td className='text-muted-foreground p-2'>{decision.reason}</td>
                  </tr>
                ))}
                {data.journal.decisions.length === 0 ? (
                  <tr>
                    <td className='text-muted-foreground p-3' colSpan={6}>
                      Ingen bot-logg ännu. Kör en paper-beslutscykel när du vill börja samla
                      datapunkter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {latestBotDecision?.kind === 'bot' ? (
            <div className='text-muted-foreground mt-3 space-y-1 text-xs'>
              {[
                `Strategy: ${strategyLabels[latestBotDecision.strategy]}`,
                `Backtest return: ${percent(latestBotDecision.evidence.returnPct)} · max DD ${percent(-latestBotDecision.evidence.maxDrawdownPct)} · volume ${latestBotDecision.evidence.volumeVerdict}`,
                latestBotDecision.evidence.lastSignal
                  ? `Last signal: ${latestBotDecision.evidence.lastSignal.side} · ${latestBotDecision.evidence.lastSignal.reason}`
                  : 'Last signal: none in this window',
                ...(latestBotDecision.research?.factors ?? [])
              ].map((signal) => (
                <div key={signal}>• {signal}</div>
              ))}
              {latestBotDecision.research ? (
                <div className='flex flex-wrap gap-2 pt-2'>
                  {latestBotDecision.research.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target='_blank'
                      rel='noreferrer'
                      className='rounded-full border px-2 py-1 hover:text-foreground'
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className='text-muted-foreground text-xs'>
        Uppdaterad {new Date(data.snapshot.updatedAt).toLocaleString('sv-SE')} · Datakälla: Binance
        + CoinGecko. Inte finansiell rådgivning.
      </div>
    </div>
  );
}
