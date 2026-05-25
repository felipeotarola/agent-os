import {
  appendPaperDecision,
  clearTradingJournal,
  getTradingJournal,
  runPaperBotDecision
} from '@/lib/trading-journal';
import type { ManualPaperDecision, TradingStrategy } from '@/lib/trading';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const strategies: TradingStrategy[] = ['sma-cross', 'rsi-reversion', 'volume-breakout'];

function isStrategy(value: unknown): value is TradingStrategy {
  return typeof value === 'string' && strategies.includes(value as TradingStrategy);
}

function toFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isTradeSide(value: unknown): value is 'buy' | 'sell' {
  return value === 'buy' || value === 'sell';
}

export async function GET() {
  try {
    return NextResponse.json(await getTradingJournal());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trading journal read failed' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    return NextResponse.json(await clearTradingJournal());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trading journal clear failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (body.kind === 'bot') {
      if (!isStrategy(body.strategy)) {
        return NextResponse.json({ error: 'Invalid strategy' }, { status: 400 });
      }

      const tradeTime = toFiniteNumber(body.tradeTime);
      const tradeSide = body.tradeSide;

      if (body.tradeTime !== undefined && tradeTime === undefined) {
        return NextResponse.json({ error: 'Invalid trade time' }, { status: 400 });
      }

      if (tradeSide !== undefined && !isTradeSide(tradeSide)) {
        return NextResponse.json({ error: 'Invalid trade side' }, { status: 400 });
      }

      return NextResponse.json({
        decision: await runPaperBotDecision(body.strategy, { tradeTime, tradeSide })
      });
    }

    if (body.kind === 'manual') {
      const action = body.action;
      const price = toFiniteNumber(body.price);
      const cash = toFiniteNumber(body.cash);
      const btc = toFiniteNumber(body.btc);
      const equity = toFiniteNumber(body.equity);

      if (
        (action !== 'buy' && action !== 'sell' && action !== 'reset') ||
        price === undefined ||
        cash === undefined ||
        btc === undefined ||
        equity === undefined
      ) {
        return NextResponse.json({ error: 'Invalid manual paper decision' }, { status: 400 });
      }

      const entry: ManualPaperDecision = {
        id: randomUUID(),
        kind: 'manual',
        createdAt: new Date().toISOString(),
        symbol: 'BTCUSDT',
        action,
        price,
        reason:
          typeof body.reason === 'string' ? body.reason.slice(0, 180) : `Manual paper ${action}`,
        portfolio: { cash, btc, equity },
        disclaimer: 'Paper-only journal entry. No exchange keys, no real orders, no execution.'
      };

      const decision = await appendPaperDecision(entry);
      return NextResponse.json({ decision });
    }

    return NextResponse.json({ error: 'Invalid journal action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Trading journal write failed' },
      { status: 500 }
    );
  }
}
