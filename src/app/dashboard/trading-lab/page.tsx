import PageContainer from '@/components/layout/page-container';
import { TradingLab } from '@/features/trading/trading-lab';
import { getTradingJournal, persistBacktestRun } from '@/lib/trading-journal';
import { backtestStrategy, getMarketSnapshot, type TradingStrategy } from '@/lib/trading';

export const metadata = {
  title: 'Agent OS: Trading Lab'
};

const strategies: TradingStrategy[] = ['sma-cross', 'rsi-reversion', 'volume-breakout'];

export default async function TradingLabPage() {
  const snapshot = await getMarketSnapshot('BTCUSDT');
  const backtests = strategies.map((strategy) => backtestStrategy(snapshot.candles, strategy));
  await persistBacktestRun(snapshot, backtests);
  const journal = await getTradingJournal();

  return (
    <PageContainer>
      <TradingLab initialData={{ snapshot, backtests, journal }} />
    </PageContainer>
  );
}
