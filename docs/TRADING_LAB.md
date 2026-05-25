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
- Appends manual and Linda paper decisions to the private runtime journal.
- Shows a Linda Bradford agent panel with stance, guardrails, latest evidence, risk, and next check.

## Linda trading agent

- Agent id: `linda`
- Workspace: `/root/.openclaw/agents/linda/workspace`
- Mandate: paper-only BTC research and backtest critique.
- Phase 1: no exchange keys, no real orders, no money movement.
- Every Linda decision should include action, confidence, evidence, risk, and next check.
- Trade-level briefs are stored as normal Linda decisions with a stable evidence key:
  `strategy:tradeTime:side:price`.

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
