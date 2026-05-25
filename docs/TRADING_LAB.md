# Trading Lab

Agent OS Trading Lab is a local BTC research workspace for paper-only experiments. It is deliberately not connected to an exchange and must not place real orders.

## Route

- Dashboard: `/dashboard/trading-lab`
- Snapshot API: `/api/trading/snapshot`
- Journal API: `/api/trading/journal`

## What it does

- Embeds a TradingView BTCUSDT chart for visual context.
- Pulls public BTC market data from Binance spot/futures and CoinGecko.
- Shows recent daily volume trend against the previous day and 7-day average.
- Runs three simple local backtests:
  - `sma-cross`
  - `rsi-reversion`
  - `volume-breakout`
- Backtest trade rows can create/open a Linda brief for that exact paper trade.
- Maintains a browser-local paper portfolio in `localStorage`.
- Appends manual and Linda paper decisions to the private runtime journal only after an explicit user action.
- Shows a Linda Bradford agent panel with stance, guardrails, latest evidence, risk, and next check.

## Linda trading agent

- Agent id: `linda`
- Workspace: `/root/.openclaw/agents/linda/workspace`
- Mandate: paper-only BTC research and backtest critique.
- Phase 1: no exchange keys, no real orders, no money movement.
- Every Linda decision should include action, confidence, evidence, risk, and next check.
- Trade-level briefs are stored as normal Linda decisions with a stable evidence key:
  `strategy:tradeTime:side:price`.

## Data model direction

Current model is too muddy: backtest outputs, trade-level briefs, manual paper portfolio actions, and Linda decisions all live under “journal/decisions”. That makes normal page loads look like trading activity.

Better split:

- `market_snapshots` / ephemeral API response: fetched public candles, price, volume regime. Usually not persisted.
- `backtest_runs`: explicit saved experiment runs only, created by a “Save run” action, not page load.
- `strategy_signals`: deterministic generated signals from a backtest run. These are not journal decisions.
- `paper_orders` / `paper_portfolio_events`: user-created paper buy/sell/reset actions.
- `agent_decisions`: Linda decisions created only by pressing “Run Linda decision” or opening a trade brief.
- `decision_briefs`: optional research/brief payload linked to an `agent_decision` or `strategy_signal`.

Rule: reads must not write. Opening or refreshing Trading Lab should never mutate persistence.
Chart markers must come from persisted journal decisions, not raw backtest output, so clearing the journal removes them everywhere.
Chart interval buttons aggregate OHLCV candles: 1D=daily, 1W=weekly, 1M=monthly, 1Y=yearly, 5Y=five-year buckets.

### Persistence rule

Production must not use the JSON file fallback unless `TRADING_JOURNAL_FILE_FALLBACK=1` is explicitly set. Without `DATABASE_URL`, Trading Lab returns an empty journal and skips durable writes, because serverless file fallback can keep warm-instance ghost rows across browsers.

## Guardrails

- Paper-only: no exchange keys, no real orders, no execution.
- Public market data only.
- Journal data is local/private runtime state and should not be committed.
- Bot decisions are observations for research, not financial advice.
- Binance integration must start later with read-only or testnet access before any live-order scope.

## Useful validation

```bash
npm run lint
npm run typecheck
npm run build
```

## Possible next improvements

- Add a date-range selector for backtests.
- Add strategy parameter controls with safe defaults.
- Add CSV export for paper journal and backtest summaries.
- Add a small risk panel showing max allocation, drawdown, and paper-only status.
