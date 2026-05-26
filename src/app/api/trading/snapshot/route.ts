import { backtestStrategy, getMarketSnapshot, type TradingStrategy } from '@/lib/trading';
import {
  getTradingJournal,
  runPaperBotDecision,
  updatePaperDecisionReviews
} from '@/lib/trading-journal';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const strategies: TradingStrategy[] = ['sma-cross', 'rsi-reversion', 'volume-breakout'];
const noStoreHeaders = { 'cache-control': 'no-store' };

export async function GET() {
  try {
    const snapshot = await getMarketSnapshot('BTCUSDT');
    const backtests = strategies.map((strategy) => backtestStrategy(snapshot.candles, strategy));
    await updatePaperDecisionReviews(snapshot);
    const journal = await getTradingJournal();

    return NextResponse.json({ snapshot, backtests, journal }, { headers: noStoreHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trading snapshot failed' },
      { status: 502, headers: noStoreHeaders }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { strategy?: TradingStrategy };
    const selectedStrategy = strategies.includes(body.strategy as TradingStrategy)
      ? (body.strategy as TradingStrategy)
      : 'sma-cross';
    const decision = await runPaperBotDecision(selectedStrategy);
    const snapshot = await getMarketSnapshot('BTCUSDT');
    const backtests = strategies.map((strategy) => backtestStrategy(snapshot.candles, strategy));
    await updatePaperDecisionReviews(snapshot);
    const journal = await getTradingJournal();

    return NextResponse.json(
      { snapshot, backtests, journal, decision },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Paper bot decision failed' },
      { status: 502, headers: noStoreHeaders }
    );
  }
}
