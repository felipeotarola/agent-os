import PageContainer from '@/components/layout/page-container';
import { TradingLab } from '@/features/trading/trading-lab';
import { getTradingJournal, persistBacktestRun } from '@/lib/trading-journal';
import {
  backtestStrategy,
  getFallbackMarketSnapshot,
  getMarketSnapshot,
  type TradingStrategy
} from '@/lib/trading';

export const metadata = {
  title: 'Agent OS: Trading Lab'
};

const strategies: TradingStrategy[] = ['sma-cross', 'rsi-reversion', 'volume-breakout'];

export default async function TradingLabPage() {
  const snapshot = await getMarketSnapshot('BTCUSDT').catch((error) => {
    console.error('Trading Lab snapshot failed; rendering fallback shell', error);
    return getFallbackMarketSnapshot('BTCUSDT');
  });
  const backtests = strategies.map((strategy) => backtestStrategy(snapshot.candles, strategy));

  if (snapshot.price > 0) {
    await persistBacktestRun(snapshot, backtests).catch((error) => {
      console.error('Trading Lab backtest persistence failed', error);
    });
  }

  const journal = await getTradingJournal().catch((error) => {
    console.error('Trading Lab journal read failed', error);
    return { backtestRuns: [], decisions: [] };
  });

  return (
    <PageContainer>
      <TradingLab initialData={{ snapshot, backtests, journal }} />
    </PageContainer>
  );
}
