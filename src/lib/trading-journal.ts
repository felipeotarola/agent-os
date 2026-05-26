import 'server-only';

import {
  backtestStrategy,
  getTradeDecisionKey,
  type BacktestResult,
  type MarketSnapshot,
  type MarketRegime,
  type PaperBotDecision,
  type PaperJournalEntry,
  type PaperTradeReview,
  type PaperRiskAssessment,
  type PaperWallet,
  type Trade,
  type TradingSignal,
  type TradingStrategy
} from '@/lib/trading';
import { db, sql } from '@/db/client';
import {
  tradingBacktestRuns,
  tradingDecisions,
  tradingExecutions,
  tradingWallets
} from '@/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'agent-os', 'data', 'private')
  : path.join(process.cwd(), 'data', 'private');
const JOURNAL_PATH = path.join(DATA_DIR, 'trading-lab-journal.json');
const MAX_BACKTEST_RUNS = 40;
const MAX_DECISIONS = 120;
const PAPER_WALLET_ID = 'linda-btcusdc-paper';
const PAPER_WALLET_STARTING_CASH = 10_000;
const PAPER_WALLET_FEE_RATE = 0.001;
const RISK_CONFIDENCE_THRESHOLD = 65;
const RISK_MAX_POSITION_PCT = 25;
const RISK_MIN_POSITION_PCT = 10;
const RISK_MAX_BACKTEST_DRAWDOWN_PCT = 18;
const RISK_MAX_PAPER_LOSS_PCT = 8;
const RISK_COOLDOWN_DAYS = 2;

type TradingJournal = {
  version: 1;
  backtestRuns: BacktestRunRecord[];
  decisions: PaperJournalEntry[];
  wallet?: PaperWallet;
};

export type BacktestRunRecord = {
  id: string;
  createdAt: string;
  symbol: string;
  candleCount: number;
  updatedAt: string;
  strategies: Array<
    Pick<
      BacktestResult,
      'strategy' | 'finalEquity' | 'returnPct' | 'maxDrawdownPct' | 'winRatePct' | 'exposurePct'
    >
  >;
};

function emptyJournal(): TradingJournal {
  return { version: 1, backtestRuns: [], decisions: [] };
}

function decisionSignalId(decision: PaperJournalEntry) {
  if (decision.kind === 'bot' && decision.evidence.trade?.key) return decision.evidence.trade.key;
  return `decision:${decision.id}`;
}

function buildTradingSignals(decisions: PaperJournalEntry[]): TradingSignal[] {
  return decisions.map((decision) => ({
    id: decisionSignalId(decision),
    source: 'journal-decision',
    decisionId: decision.id,
    symbol: decision.symbol,
    strategy: decision.kind === 'bot' ? decision.strategy : undefined,
    action: decision.action,
    time: decision.createdAt,
    price: decision.price,
    reason: decision.reason,
    trade: decision.kind === 'bot' ? decision.evidence.trade : undefined,
    decision
  }));
}

function databaseEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

function fileJournalEnabled() {
  return process.env.TRADING_JOURNAL_FILE_FALLBACK === '1';
}

function persistenceEnabled() {
  return databaseEnabled() || fileJournalEnabled();
}

function toDate(value: string) {
  return new Date(value);
}

function fromDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function decisionToRow(entry: PaperJournalEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    agent: entry.kind === 'bot' ? entry.agent : null,
    symbol: entry.symbol,
    strategy: entry.kind === 'bot' ? entry.strategy : null,
    action: entry.action,
    price: entry.price,
    confidence: entry.kind === 'bot' ? entry.confidence : null,
    reason: entry.reason,
    risk: entry.kind === 'bot' ? entry.risk : '',
    nextCheck: entry.kind === 'bot' ? entry.nextCheck : '',
    evidence: entry.kind === 'bot' ? entry.evidence : {},
    research: entry.kind === 'bot' ? (entry.research ?? null) : null,
    portfolio: entry.kind === 'manual' ? entry.portfolio : null,
    disclaimer: entry.disclaimer,
    createdAt: toDate(entry.createdAt)
  };
}

function buildDecisionReview(
  decision: PaperBotDecision,
  snapshot: MarketSnapshot
): PaperTradeReview {
  const action = decision.action;
  const eventTime = Date.parse(decision.createdAt);
  const startIndex = snapshot.candles.findIndex((candle) => candle.time >= eventTime);
  const quantity = decision.evidence.risk?.positionCash
    ? decision.evidence.risk.positionCash / decision.price
    : (decision.evidence.trade?.quantity ?? 0);

  return {
    generatedAt: new Date().toISOString(),
    checkpoints: ([1, 3, 7] as const).map((days) => {
      const future = startIndex >= 0 ? snapshot.candles[startIndex + days] : undefined;
      if (!future || action === 'hold' || decision.price <= 0) {
        return {
          days,
          label: `${days}D` as '1D' | '3D' | '7D',
          available: false,
          thesisOutcome: 'pending',
          ruleViolations: [],
          lesson: 'Await enough completed candles before judging this paper decision.'
        };
      }

      const rawReturnPct = ((future.close - decision.price) / decision.price) * 100;
      const returnPct = action === 'sell' ? -rawReturnPct : rawReturnPct;
      const pnlUsd =
        quantity > 0
          ? (future.close - decision.price) * quantity * (action === 'sell' ? -1 : 1)
          : undefined;
      const thesisOutcome = returnPct > 1 ? 'working' : returnPct < -1 ? 'failed' : 'pending';
      const ruleViolations = [
        decision.evidence.risk && !decision.evidence.risk.allowed
          ? 'Risk manager did not allow execution.'
          : undefined,
        decision.evidence.regime?.noTrade ? 'Regime selector marked this as no-trade.' : undefined
      ].filter((item): item is string => item !== undefined);

      return {
        days,
        label: `${days}D` as '1D' | '3D' | '7D',
        available: true,
        price: future.close,
        returnPct,
        pnlUsd,
        thesisOutcome,
        ruleViolations,
        lesson:
          thesisOutcome === 'working'
            ? 'Thesis is working so far; keep the same guardrails and avoid increasing size just because one checkpoint worked.'
            : thesisOutcome === 'failed'
              ? 'Thesis failed at this checkpoint; reduce confidence in similar setups until regime or evidence improves.'
              : 'Outcome is inconclusive; wait for stronger follow-through before updating the playbook.'
      };
    })
  };
}

function rowToDecision(row: typeof tradingDecisions.$inferSelect): PaperJournalEntry {
  const base = {
    id: row.id,
    createdAt: fromDate(row.createdAt),
    symbol: row.symbol,
    action: row.action as 'buy' | 'sell' | 'hold' | 'reset',
    price: row.price,
    reason: row.reason,
    disclaimer: row.disclaimer
  };

  if (row.kind === 'bot') {
    return {
      ...base,
      kind: 'bot',
      agent: (row.agent ?? 'Linda') as 'Linda',
      strategy: (row.strategy ?? 'volume-breakout') as TradingStrategy,
      action: base.action as 'buy' | 'sell' | 'hold',
      confidence: row.confidence ?? 0,
      risk: row.risk,
      nextCheck: row.nextCheck,
      evidence: row.evidence as Extract<PaperJournalEntry, { kind: 'bot' }>['evidence'],
      research: (row.research ?? undefined) as Extract<
        PaperJournalEntry,
        { kind: 'bot' }
      >['research']
    };
  }

  return {
    ...base,
    kind: 'manual',
    action: base.action as 'buy' | 'sell' | 'reset',
    portfolio: (row.portfolio ?? { cash: 0, btc: 0, equity: 0 }) as Extract<
      PaperJournalEntry,
      { kind: 'manual' }
    >['portfolio']
  };
}

function backtestRunToRow(record: BacktestRunRecord) {
  return {
    id: record.id,
    symbol: record.symbol,
    candleCount: record.candleCount,
    snapshotUpdatedAt: toDate(record.updatedAt),
    strategies: record.strategies,
    createdAt: toDate(record.createdAt)
  };
}

function rowToBacktestRun(row: typeof tradingBacktestRuns.$inferSelect): BacktestRunRecord {
  return {
    id: row.id,
    createdAt: fromDate(row.createdAt),
    symbol: row.symbol,
    candleCount: row.candleCount,
    updatedAt: fromDate(row.snapshotUpdatedAt),
    strategies: row.strategies as BacktestRunRecord['strategies']
  };
}

function emptyPaperWallet(): PaperWallet {
  return {
    id: PAPER_WALLET_ID,
    agent: 'Linda',
    symbol: 'BTCUSDC',
    baseAsset: 'BTC',
    quoteAsset: 'USDC',
    startingCash: PAPER_WALLET_STARTING_CASH,
    cashBalance: PAPER_WALLET_STARTING_CASH,
    assetBalance: 0,
    realizedPnl: 0,
    updatedAt: new Date().toISOString(),
    executions: []
  };
}

function walletEquityAtPrice(wallet: PaperWallet, price: number) {
  return wallet.cashBalance + wallet.assetBalance * price;
}

function lastExecutionWasLoss(wallet: PaperWallet, latestTime: number) {
  const latestExecution = wallet.executions.at(-1);
  if (!latestExecution) return false;

  const previousEquity = wallet.executions.at(-2)?.equityAfter ?? wallet.startingCash;
  const ageDays = (latestTime - Date.parse(latestExecution.createdAt)) / DAY_MS;

  return (
    latestExecution.equityAfter < previousEquity && ageDays >= 0 && ageDays <= RISK_COOLDOWN_DAYS
  );
}

function buildRiskAssessment({
  requestedAction,
  confidence,
  backtest,
  wallet,
  price,
  latestTime
}: {
  requestedAction: 'buy' | 'sell' | 'hold';
  confidence: number;
  backtest: BacktestResult;
  wallet: PaperWallet;
  price: number;
  latestTime?: number;
}): PaperRiskAssessment {
  const equity = walletEquityAtPrice(wallet, price);
  const currentExposureCash = wallet.assetBalance * price;
  const confidenceGuardActive =
    requestedAction !== 'hold' && confidence < RISK_CONFIDENCE_THRESHOLD;
  const drawdownGuardActive =
    requestedAction !== 'hold' && backtest.maxDrawdownPct > RISK_MAX_BACKTEST_DRAWDOWN_PCT;
  const paperLossPct =
    equity > 0 ? ((wallet.startingCash - equity) / wallet.startingCash) * 100 : 0;
  const paperLossGuardActive = requestedAction !== 'hold' && paperLossPct > RISK_MAX_PAPER_LOSS_PCT;
  const cooldownActive =
    requestedAction !== 'hold' &&
    latestTime !== undefined &&
    lastExecutionWasLoss(wallet, latestTime);
  const blockedReasons = [
    confidenceGuardActive
      ? `Confidence ${confidence.toFixed(0)}% below ${RISK_CONFIDENCE_THRESHOLD}% threshold`
      : undefined,
    drawdownGuardActive
      ? `Backtest drawdown ${backtest.maxDrawdownPct.toFixed(2)}% above ${RISK_MAX_BACKTEST_DRAWDOWN_PCT}% cap`
      : undefined,
    paperLossGuardActive
      ? `Paper wallet loss ${paperLossPct.toFixed(2)}% above ${RISK_MAX_PAPER_LOSS_PCT}% guard`
      : undefined,
    cooldownActive ? `${RISK_COOLDOWN_DAYS}D cooldown active after losing execution` : undefined
  ].filter((item): item is string => item !== undefined);
  const allowed = requestedAction !== 'hold' && blockedReasons.length === 0;
  const maxPositionCash = equity * (RISK_MAX_POSITION_PCT / 100);
  const confidenceScale = Math.max(
    0,
    Math.min(1, (confidence - RISK_CONFIDENCE_THRESHOLD) / (95 - RISK_CONFIDENCE_THRESHOLD))
  );
  const positionPct = allowed
    ? RISK_MIN_POSITION_PCT + (RISK_MAX_POSITION_PCT - RISK_MIN_POSITION_PCT) * confidenceScale
    : 0;
  const targetPositionCash = equity * (positionPct / 100);
  const positionCash =
    requestedAction === 'buy'
      ? Math.max(0, Math.min(wallet.cashBalance, targetPositionCash - currentExposureCash))
      : requestedAction === 'sell'
        ? Math.max(0, Math.min(currentExposureCash, targetPositionCash || maxPositionCash))
        : 0;

  return {
    requestedAction,
    executableAction: allowed && positionCash > 0 ? requestedAction : 'hold',
    allowed: allowed && positionCash > 0,
    blockedReasons:
      allowed && positionCash <= 0
        ? ['No position size available under risk limits']
        : blockedReasons,
    positionCash,
    positionPct: allowed ? positionPct : 0,
    maxPositionPct: RISK_MAX_POSITION_PCT,
    confidenceThreshold: RISK_CONFIDENCE_THRESHOLD,
    maxBacktestDrawdownPct: RISK_MAX_BACKTEST_DRAWDOWN_PCT,
    maxPaperLossPct: RISK_MAX_PAPER_LOSS_PCT,
    cooldownDays: RISK_COOLDOWN_DAYS,
    cooldownActive,
    confidenceGuardActive,
    drawdownGuardActive,
    paperLossGuardActive
  };
}

function rowToWallet(
  wallet: typeof tradingWallets.$inferSelect,
  executions: Array<typeof tradingExecutions.$inferSelect>
): PaperWallet {
  return {
    id: wallet.id,
    agent: 'Linda',
    symbol: 'BTCUSDC',
    baseAsset: 'BTC',
    quoteAsset: 'USDC',
    startingCash: wallet.startingCash,
    cashBalance: wallet.cashBalance,
    assetBalance: wallet.assetBalance,
    realizedPnl: wallet.realizedPnl,
    updatedAt: fromDate(wallet.updatedAt),
    executions: executions.map((execution) => ({
      id: execution.id,
      walletId: execution.walletId,
      decisionId: execution.decisionId,
      action: execution.action as 'buy' | 'sell',
      price: execution.price,
      quantity: execution.quantity,
      cashDelta: execution.cashDelta,
      assetDelta: execution.assetDelta,
      fee: execution.fee,
      equityAfter: execution.equityAfter,
      reason: execution.reason,
      createdAt: fromDate(execution.createdAt)
    }))
  };
}

async function readDbWallet(): Promise<PaperWallet> {
  const [wallet] = await db
    .select()
    .from(tradingWallets)
    .where(eq(tradingWallets.id, PAPER_WALLET_ID))
    .limit(1);

  if (!wallet) return emptyPaperWallet();

  const executions = await db
    .select()
    .from(tradingExecutions)
    .where(eq(tradingExecutions.walletId, PAPER_WALLET_ID))
    .orderBy(asc(tradingExecutions.createdAt));

  return rowToWallet(wallet, executions);
}

async function rebuildPaperWallet(decisions: PaperJournalEntry[]) {
  if (!databaseEnabled()) return emptyPaperWallet();

  let cash = PAPER_WALLET_STARTING_CASH;
  let btc = 0;
  let realizedPnl = 0;
  const executions: Array<typeof tradingExecutions.$inferInsert> = [];

  for (const decision of decisions.toSorted(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
  )) {
    if (decision.action !== 'buy' && decision.action !== 'sell') continue;
    if (!Number.isFinite(decision.price) || decision.price <= 0) continue;
    const risk = decision.kind === 'bot' ? decision.evidence.risk : undefined;
    if (risk && risk.executableAction !== decision.action) continue;

    if (decision.action === 'buy') {
      if (cash <= 0) continue;
      const requestedCash = risk?.positionCash ?? cash;
      const grossCash = Math.max(0, Math.min(cash, requestedCash));
      if (grossCash <= 0) continue;
      const fee = grossCash * PAPER_WALLET_FEE_RATE;
      const quantity = (grossCash - fee) / decision.price;
      cash -= grossCash;
      btc += quantity;
      executions.push({
        id: randomUUID(),
        walletId: PAPER_WALLET_ID,
        decisionId: decision.id,
        action: 'buy',
        price: decision.price,
        quantity,
        cashDelta: -grossCash,
        assetDelta: quantity,
        fee,
        equityAfter: cash + btc * decision.price,
        reason: decision.reason,
        createdAt: toDate(decision.createdAt)
      });
    } else {
      if (btc <= 0) continue;
      const requestedCash = risk?.positionCash ?? btc * decision.price;
      const quantity = Math.max(0, Math.min(btc, requestedCash / decision.price));
      if (quantity <= 0) continue;
      const grossCash = quantity * decision.price;
      const fee = grossCash * PAPER_WALLET_FEE_RATE;
      const proceeds = grossCash - fee;
      btc -= quantity;
      cash += proceeds;
      realizedPnl = cash + btc * decision.price - PAPER_WALLET_STARTING_CASH;
      executions.push({
        id: randomUUID(),
        walletId: PAPER_WALLET_ID,
        decisionId: decision.id,
        action: 'sell',
        price: decision.price,
        quantity,
        cashDelta: proceeds,
        assetDelta: -quantity,
        fee,
        equityAfter: cash,
        reason: decision.reason,
        createdAt: toDate(decision.createdAt)
      });
    }
  }

  await sql.begin(async (tx) => {
    await tx`delete from trading_executions where wallet_id = ${PAPER_WALLET_ID}`;
    await tx`
      insert into trading_wallets (
        id, agent, symbol, base_asset, quote_asset, starting_cash, cash_balance,
        asset_balance, realized_pnl, updated_at
      ) values (
        ${PAPER_WALLET_ID}, 'Linda', 'BTCUSDC', 'BTC', 'USDC', ${PAPER_WALLET_STARTING_CASH},
        ${cash}, ${btc}, ${realizedPnl}, now()
      )
      on conflict (id) do update set
        cash_balance = excluded.cash_balance,
        asset_balance = excluded.asset_balance,
        realized_pnl = excluded.realized_pnl,
        updated_at = now()
    `;

    for (const execution of executions) {
      const id = execution.id ?? randomUUID();
      const walletId = execution.walletId ?? PAPER_WALLET_ID;
      const decisionId = execution.decisionId ?? '';
      const action = execution.action ?? 'buy';
      const price = execution.price ?? 0;
      const quantity = execution.quantity ?? 0;
      const cashDelta = execution.cashDelta ?? 0;
      const assetDelta = execution.assetDelta ?? 0;
      const fee = execution.fee ?? 0;
      const equityAfter = execution.equityAfter ?? 0;
      const reason = execution.reason ?? '';
      const createdAt = fromDate(execution.createdAt ?? new Date());

      await tx`
        insert into trading_executions (
          id, wallet_id, decision_id, action, price, quantity, cash_delta, asset_delta,
          fee, equity_after, reason, created_at
        ) values (
          ${id}, ${walletId}, ${decisionId}, ${action}, ${price}, ${quantity}, ${cashDelta}, ${assetDelta},
          ${fee}, ${equityAfter}, ${reason}, ${createdAt}
        )
      `;
    }
  });

  return readDbWallet();
}

async function readDbJournal(): Promise<TradingJournal> {
  const [backtestRows, decisionRows] = await Promise.all([
    db
      .select()
      .from(tradingBacktestRuns)
      .orderBy(desc(tradingBacktestRuns.createdAt))
      .limit(MAX_BACKTEST_RUNS),
    db
      .select()
      .from(tradingDecisions)
      .orderBy(desc(tradingDecisions.createdAt))
      .limit(MAX_DECISIONS)
  ]);

  if (fileJournalEnabled() && backtestRows.length === 0 && decisionRows.length === 0) {
    const fileJournal = await readFileJournal();
    if (fileJournal.backtestRuns.length > 0 || fileJournal.decisions.length > 0) {
      await writeDbJournal(fileJournal);
      return fileJournal;
    }
  }

  const decisions = decisionRows.map(rowToDecision).toReversed();
  const wallet = await readDbWallet();
  const hasExecutableDecisions = decisions.some(
    (decision) => decision.action === 'buy' || decision.action === 'sell'
  );

  return {
    version: 1,
    backtestRuns: backtestRows.map(rowToBacktestRun).toReversed(),
    decisions,
    wallet:
      wallet.executions.length === 0 && hasExecutableDecisions
        ? await rebuildPaperWallet(decisions)
        : wallet
  };
}

async function writeDbJournal(journal: TradingJournal) {
  if (journal.backtestRuns.length > 0) {
    await db
      .insert(tradingBacktestRuns)
      .values(journal.backtestRuns.map(backtestRunToRow))
      .onConflictDoNothing();
  }

  if (journal.decisions.length > 0) {
    await db
      .insert(tradingDecisions)
      .values(journal.decisions.map(decisionToRow))
      .onConflictDoNothing();
  }
}

async function readJournal(): Promise<TradingJournal> {
  if (databaseEnabled()) {
    try {
      return await readDbJournal();
    } catch (error) {
      if (!fileJournalEnabled()) {
        console.error('Trading DB journal read failed; returning empty journal', error);
        return emptyJournal();
      }
      console.error('Trading DB journal read failed; falling back to file', error);
    }
  }

  if (!fileJournalEnabled()) return emptyJournal();

  return readFileJournal();
}

async function readFileJournal(): Promise<TradingJournal> {
  try {
    const raw = await readFile(JOURNAL_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<TradingJournal>;
    return {
      version: 1,
      backtestRuns: Array.isArray(parsed.backtestRuns) ? parsed.backtestRuns : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyJournal();
    throw error;
  }
}

async function writeJournal(journal: TradingJournal) {
  if (!persistenceEnabled()) {
    throw new Error('Trading journal persistence is not configured');
  }

  if (databaseEnabled()) {
    try {
      await writeDbJournal(journal);
      return;
    } catch (error) {
      if (!fileJournalEnabled()) {
        console.error('Trading DB journal write failed', error);
        throw error;
      }
      console.error('Trading DB journal write failed; falling back to file', error);
    }
  }

  await mkdir(DATA_DIR, { recursive: true });
  const temporaryPath = `${JOURNAL_PATH}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, JOURNAL_PATH);
}

export async function getTradingJournal() {
  const journal = await readJournal();
  const decisions = journal.decisions.slice(-MAX_DECISIONS);
  return {
    backtestRuns: journal.backtestRuns.slice(-MAX_BACKTEST_RUNS),
    decisions,
    signals: buildTradingSignals(decisions),
    wallet: journal.wallet ?? emptyPaperWallet()
  };
}

export async function updatePaperDecisionReviews(snapshot: MarketSnapshot) {
  const journal = await readJournal();
  const reviewedDecisions = journal.decisions.map((decision) => {
    if (decision.kind !== 'bot') return decision;
    if (decision.action === 'hold') return decision;

    const review = buildDecisionReview(decision, snapshot);
    const hasAvailableReview = review.checkpoints.some((checkpoint) => checkpoint.available);
    if (!hasAvailableReview) return decision;

    return {
      ...decision,
      evidence: {
        ...decision.evidence,
        review
      }
    };
  });
  const changed = reviewedDecisions.some(
    (decision, index) =>
      decision.kind === 'bot' &&
      JSON.stringify(decision.evidence.review) !==
        JSON.stringify((journal.decisions[index] as PaperBotDecision | undefined)?.evidence?.review)
  );

  if (!changed) return journal;

  journal.decisions = reviewedDecisions;

  if (databaseEnabled()) {
    await Promise.all(
      reviewedDecisions.flatMap((decision) =>
        decision.kind === 'bot'
          ? [
              db
                .update(tradingDecisions)
                .set({ evidence: decision.evidence })
                .where(eq(tradingDecisions.id, decision.id))
            ]
          : []
      )
    );
  }

  if (fileJournalEnabled()) await writeJournal(journal);
  return journal;
}

export async function clearTradingJournal() {
  const empty = emptyJournal();

  if (databaseEnabled()) {
    try {
      await Promise.all([db.delete(tradingExecutions), db.delete(tradingBacktestRuns)]);
      await db.delete(tradingDecisions);
    } catch (error) {
      console.error('Trading DB journal clear failed', error);
    }
  }

  if (fileJournalEnabled()) {
    await mkdir(DATA_DIR, { recursive: true });
    const temporaryPath = `${JOURNAL_PATH}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(empty, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, JOURNAL_PATH);
  }

  return {
    ...empty,
    wallet: databaseEnabled() ? await rebuildPaperWallet([]) : emptyPaperWallet()
  };
}

export async function deleteTradingSignal(signalId: string) {
  const journal = await readJournal();
  const decision = journal.decisions.find(
    (entry) => decisionSignalId(entry) === signalId || entry.id === signalId
  );

  if (!decision) {
    const decisions = journal.decisions.slice(-MAX_DECISIONS);
    return {
      backtestRuns: journal.backtestRuns.slice(-MAX_BACKTEST_RUNS),
      decisions,
      signals: buildTradingSignals(decisions),
      wallet: journal.wallet ?? emptyPaperWallet()
    };
  }

  if (databaseEnabled()) {
    try {
      await db.delete(tradingExecutions).where(eq(tradingExecutions.decisionId, decision.id));
      await db.delete(tradingDecisions).where(eq(tradingDecisions.id, decision.id));
    } catch (error) {
      console.error('Trading DB signal delete failed', error);
    }
  }

  const nextJournal = {
    ...journal,
    decisions: journal.decisions.filter((entry) => entry.id !== decision.id)
  };

  if (fileJournalEnabled()) await writeJournal(nextJournal);
  const wallet = databaseEnabled()
    ? await rebuildPaperWallet(nextJournal.decisions)
    : emptyPaperWallet();

  const decisions = nextJournal.decisions.slice(-MAX_DECISIONS);
  return {
    backtestRuns: nextJournal.backtestRuns.slice(-MAX_BACKTEST_RUNS),
    decisions,
    signals: buildTradingSignals(decisions),
    wallet
  };
}

export async function persistBacktestRun(snapshot: MarketSnapshot, backtests: BacktestResult[]) {
  const journal = await readJournal();
  const record: BacktestRunRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    symbol: snapshot.symbol,
    candleCount: snapshot.candles.length,
    updatedAt: snapshot.updatedAt,
    strategies: backtests.map(
      ({ strategy, finalEquity, returnPct, maxDrawdownPct, winRatePct, exposurePct }) => ({
        strategy,
        finalEquity,
        returnPct,
        maxDrawdownPct,
        winRatePct,
        exposurePct
      })
    )
  };

  journal.backtestRuns = [...journal.backtestRuns, record].slice(-MAX_BACKTEST_RUNS);
  await writeJournal(journal);
  return record;
}

function scoreBacktest(backtest: BacktestResult, snapshot: MarketSnapshot) {
  const trendBonus =
    snapshot.volumeTrend.verdict === 'rising'
      ? 8
      : snapshot.volumeTrend.verdict === 'falling'
        ? -8
        : 0;
  const returnComponent = Math.max(-25, Math.min(25, backtest.returnPct));
  const winComponent = Math.max(-15, Math.min(15, backtest.winRatePct - 50));
  const drawdownPenalty = Math.min(25, backtest.maxDrawdownPct);
  return returnComponent + winComponent + trendBonus - drawdownPenalty;
}

function latestCompleteCandleTime(snapshot: MarketSnapshot) {
  return snapshot.candles.slice(0, -1).at(-1)?.time;
}

const ACTIVE_SIGNAL_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function activeRecentTrade(backtest: BacktestResult, latestTime?: number) {
  const lastTrade = backtest.trades.at(-1);
  if (!lastTrade || latestTime === undefined) return undefined;

  const ageDays = (latestTime - lastTrade.time) / DAY_MS;
  return ageDays >= 0 && ageDays <= ACTIVE_SIGNAL_WINDOW_DAYS ? lastTrade : undefined;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function detectMarketRegime(snapshot: MarketSnapshot, backtests: BacktestResult[]): MarketRegime {
  const completed = snapshot.candles.filter((candle) => candle.close > 0).slice(0, -1);
  const recent = completed.slice(-20);
  const longer = completed.slice(-50);
  const latest = completed.at(-1);
  const sma20 = average(recent.map((candle) => candle.close));
  const sma50 = average(longer.map((candle) => candle.close));
  const trend: MarketRegime['trend'] =
    latest && latest.close > sma20 && sma20 > sma50
      ? 'uptrend'
      : latest && latest.close < sma20 && sma20 < sma50
        ? 'downtrend'
        : 'range';
  const atrPct = snapshot.marketData.atr14Pct ?? 0;
  const volatility: MarketRegime['volatility'] =
    atrPct >= 4 ? 'high' : atrPct > 0 && atrPct < 1.8 ? 'low' : 'normal';
  const depth = snapshot.marketData.topBookDepthUsd ?? 0;
  const spread = snapshot.marketData.spreadPct ?? 1;
  const liquidity: MarketRegime['liquidity'] =
    depth > 2_000_000 && spread < 0.03 ? 'deep' : depth > 0 && depth < 250_000 ? 'thin' : 'normal';
  const preferredStrategy: TradingStrategy =
    liquidity === 'thin'
      ? 'rsi-reversion'
      : volatility === 'high' || snapshot.volumeTrend.verdict === 'rising'
        ? 'volume-breakout'
        : trend === 'uptrend' || trend === 'downtrend'
          ? 'sma-cross'
          : 'rsi-reversion';
  const bestBacktest = [...backtests].toSorted(
    (left, right) => scoreBacktest(right, snapshot) - scoreBacktest(left, snapshot)
  )[0];
  const selectedStrategy = backtests.some((item) => item.strategy === preferredStrategy)
    ? preferredStrategy
    : (bestBacktest?.strategy ?? 'volume-breakout');
  const selectedBacktest = backtests.find((item) => item.strategy === selectedStrategy);
  const noTrade =
    liquidity === 'thin' ||
    snapshot.marketData.missing.length >= 3 ||
    (selectedBacktest !== undefined && scoreBacktest(selectedBacktest, snapshot) < -20);
  const rejectedStrategies = (['sma-cross', 'rsi-reversion', 'volume-breakout'] as const)
    .filter((strategy) => strategy !== selectedStrategy)
    .map((strategy) => ({
      strategy,
      reason:
        strategy === 'sma-cross' && trend === 'range'
          ? 'Rejected because market is range-bound, not trending.'
          : strategy === 'rsi-reversion' && trend !== 'range' && volatility !== 'low'
            ? 'Rejected because current regime is not a low-volatility range.'
            : strategy === 'volume-breakout' && snapshot.volumeTrend.verdict !== 'rising'
              ? 'Rejected because volume is not confirming a breakout.'
              : `Lower regime fit than ${selectedStrategy}.`
    }));

  return {
    trend,
    volatility,
    liquidity,
    volume: snapshot.volumeTrend.verdict,
    selectedStrategy,
    noTrade,
    rationale: `${trend}, ${volatility} volatility, ${liquidity} liquidity, ${snapshot.volumeTrend.verdict} volume -> ${noTrade ? 'no-trade guard' : selectedStrategy}.`,
    rejectedStrategies
  };
}

type ResearchLink = NonNullable<PaperBotDecision['research']>['links'][number];

type ResearchFeed = {
  source: string;
  url: string;
};

const RESEARCH_FEEDS: ResearchFeed[] = [
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { source: 'Decrypt', url: 'https://decrypt.co/feed' }
];

function decodeXml(value: string) {
  return value
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function firstXmlTag(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : undefined;
}

async function fetchResearchFeed(feed: ResearchFeed): Promise<ResearchLink[]> {
  try {
    const response = await fetch(feed.url, {
      cache: 'no-store',
      headers: { accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) return [];

    const xml = await response.text();
    return xml
      .split(/<item\b/i)
      .slice(1)
      .map((rawItem) => `<item${rawItem}`)
      .map((item): ResearchLink | undefined => {
        const title = firstXmlTag(item, 'title');
        const link = firstXmlTag(item, 'link') ?? firstXmlTag(item, 'guid');
        const description = firstXmlTag(item, 'description');
        const publishedAt = firstXmlTag(item, 'pubDate');
        if (!title || !link) return undefined;
        const haystack = `${title} ${description ?? ''}`.toLowerCase();
        if (!/(bitcoin|btc|crypto|etf|macro|liquidity|binance|coinbase)/.test(haystack)) {
          return undefined;
        }
        const researchLink: ResearchLink = {
          label: title.slice(0, 120),
          url: link,
          note: description
            ? description.replace(/\s+/g, ' ').slice(0, 180)
            : `Fresh ${feed.source} RSS item considered for market context.`,
          source: feed.source
        };
        if (publishedAt) researchLink.publishedAt = new Date(publishedAt).toISOString();
        return researchLink;
      })
      .filter((item): item is ResearchLink => item !== undefined)
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function fetchLiveResearchLinks() {
  const settled = await Promise.allSettled(RESEARCH_FEEDS.map((feed) => fetchResearchFeed(feed)));
  const seen = new Set<string>();
  return settled
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    })
    .toSorted((left, right) => {
      const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
      const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;
      return rightTime - leftTime;
    })
    .slice(0, 6);
}

async function buildResearchBrief(
  snapshot: MarketSnapshot,
  backtest: BacktestResult,
  selectedStrategy: TradingStrategy,
  action: 'buy' | 'sell' | 'hold',
  reason: string,
  risk: string,
  regime: MarketRegime | undefined,
  targetTrade?: Trade
): Promise<PaperBotDecision['research']> {
  const performanceLabel = `${backtest.returnPct.toFixed(2)}% return, ${backtest.maxDrawdownPct.toFixed(2)}% max drawdown, ${backtest.winRatePct.toFixed(2)}% win rate`;
  const volumeLabel = `${snapshot.volumeTrend.verdict} volume, ${snapshot.volumeTrend.changeVsSevenDayPct.toFixed(2)}% vs 7D average`;
  const marketData = snapshot.marketData;
  const marketDataLabel = [
    marketData.fundingRatePct !== undefined
      ? `funding ${marketData.fundingRatePct.toFixed(4)}%`
      : undefined,
    marketData.openInterestUsd !== undefined
      ? `open interest ${marketData.openInterestUsd.toLocaleString('en-US', {
          maximumFractionDigits: 0
        })} USD`
      : undefined,
    marketData.atr14Pct !== undefined ? `ATR14 ${marketData.atr14Pct.toFixed(2)}%` : undefined,
    marketData.spreadPct !== undefined ? `spread ${marketData.spreadPct.toFixed(4)}%` : undefined
  ]
    .filter(Boolean)
    .join(', ');
  const liveLinks = targetTrade ? [] : await fetchLiveResearchLinks();
  const tradeLabel = targetTrade
    ? `${new Date(targetTrade.time).toISOString().slice(0, 10)} ${targetTrade.side.toUpperCase()} at ${targetTrade.price.toFixed(2)}`
    : undefined;
  const thesis = targetTrade
    ? `Trade-level brief for ${tradeLabel}: ${reason} Backtest quality is ${performanceLabel}; volume context is ${volumeLabel}. This is a historical paper decision brief for the selected backtest trade.`
    : action === 'hold'
      ? `Stand down: ${reason} Backtest quality is ${performanceLabel}; volume context is ${volumeLabel}. Live research is logged as context, not as permission to override the signal.`
      : `${action.toUpperCase()} is paper-only and conditional: ${reason} Backtest quality is ${performanceLabel}; volume context is ${volumeLabel}. Live research is logged as context, not confirmation by itself.`;

  return {
    summary: targetTrade
      ? `Linda trade brief for ${snapshot.symbol}: strategy=${selectedStrategy}, action=${action}, trade=${tradeLabel}.`
      : `Linda decision research pack for ${snapshot.symbol}: strategy=${selectedStrategy}, action=${action}, price=${snapshot.price.toFixed(2)}.`,
    thesis,
    invalidation: risk,
    fetchedAt: new Date().toISOString(),
    factors: [
      `Strategy: ${selectedStrategy}`,
      `Backtest: ${performanceLabel}`,
      `Exposure: ${backtest.exposurePct.toFixed(2)}% of completed daily candles`,
      `Volume regime: ${volumeLabel}`,
      regime ? `Detected regime: ${regime.rationale}` : undefined,
      ...(regime?.rejectedStrategies.map((item) => `Rejected ${item.strategy}: ${item.reason}`) ??
        []),
      marketDataLabel
        ? `Market data inputs: ${marketDataLabel}`
        : 'Market data inputs: unavailable; decision handled missing sources gracefully',
      `Market data sources: ${marketData.sources.length ? marketData.sources.join(', ') : 'none'}`,
      marketData.missing.length
        ? `Missing market data: ${marketData.missing.join(', ')}`
        : undefined,
      `Live research links captured: ${liveLinks.length}`,
      ...(targetTrade ? [`Selected trade: ${tradeLabel} — ${targetTrade.reason}`] : []),
      backtest.trades.at(-1)
        ? `Latest backtest signal: ${backtest.trades.at(-1)?.side} — ${backtest.trades.at(-1)?.reason}`
        : 'Latest backtest signal: none in this window'
    ].filter((item): item is string => item !== undefined),
    links: [
      ...liveLinks,
      {
        label: 'Binance BTCUSDT spot ticker',
        url: 'https://www.binance.com/en/trade/BTC_USDT',
        note: 'Spot price and spot volume reference used by the snapshot when available.',
        source: 'Binance'
      },
      {
        label: 'Binance BTCUSDT futures',
        url: 'https://www.binance.com/en/futures/BTCUSDT',
        note: 'Futures quote-volume context used by Trading Lab when available.',
        source: 'Binance'
      },
      {
        label: 'CoinGecko Bitcoin market data',
        url: 'https://www.coingecko.com/en/coins/bitcoin',
        note: 'Fallback/current market data and broad 24h market-volume context.',
        source: 'CoinGecko'
      },
      {
        label: 'TradingView BTCUSDT chart',
        url: 'https://www.tradingview.com/symbols/BTCUSDT/',
        note: 'Visual chart context shown in Trading Lab; strategy signals are still internal paper signals.',
        source: 'TradingView'
      }
    ]
  };
}

export async function buildPaperBotDecision(
  snapshot: MarketSnapshot,
  backtest: BacktestResult,
  selectedStrategy: TradingStrategy,
  regime?: MarketRegime,
  targetTrade?: Trade
): Promise<PaperBotDecision> {
  const lastTrade = backtest.trades.at(-1);
  const latestTime = latestCompleteCandleTime(snapshot);
  const recentTrade = activeRecentTrade(backtest, latestTime);
  const score = scoreBacktest(backtest, snapshot);
  const latestSignalIsFresh =
    lastTrade !== undefined && latestTime !== undefined && lastTrade.time === latestTime;
  const requestedAction = targetTrade
    ? targetTrade.side
    : regime?.noTrade
      ? 'hold'
      : latestSignalIsFresh
        ? lastTrade.side
        : recentTrade
          ? recentTrade.side
          : 'hold';
  const activeSignalConfidenceBonus = !targetTrade && !latestSignalIsFresh && recentTrade ? 8 : 0;
  const confidence = Math.max(5, Math.min(95, 50 + score + activeSignalConfidenceBonus));
  const wallet = targetTrade ? emptyPaperWallet() : await readDbWallet();
  const riskAssessment = targetTrade
    ? undefined
    : buildRiskAssessment({
        requestedAction,
        confidence,
        backtest,
        wallet,
        price: snapshot.price,
        latestTime
      });
  const action = riskAssessment?.executableAction ?? requestedAction;
  const reason = targetTrade
    ? `${targetTrade.side.toUpperCase()} signal from ${selectedStrategy} on ${new Date(targetTrade.time).toISOString().slice(0, 10)}: ${targetTrade.reason}`
    : regime?.noTrade
      ? `Regime selector forced HOLD: ${regime.rationale}`
      : latestSignalIsFresh
        ? action === 'hold' && requestedAction !== 'hold'
          ? `Risk manager blocked ${requestedAction.toUpperCase()} from ${selectedStrategy}: ${riskAssessment?.blockedReasons.join('; ')}. Original signal: ${lastTrade.reason}`
          : `${lastTrade.side.toUpperCase()} signal from ${selectedStrategy}: ${lastTrade.reason}`
        : recentTrade
          ? action === 'hold' && requestedAction !== 'hold'
            ? `Risk manager blocked active ${requestedAction.toUpperCase()} from ${selectedStrategy}: ${riskAssessment?.blockedReasons.join('; ')}. Original signal (${new Date(recentTrade.time).toISOString().slice(0, 10)}): ${recentTrade.reason}`
            : `Recent ${recentTrade.side.toUpperCase()} signal from ${selectedStrategy} remains active (${new Date(recentTrade.time).toISOString().slice(0, 10)}): ${recentTrade.reason}`
          : `No fresh or active ${selectedStrategy} signal on the latest completed candle; observe only.`;
  const risk = riskAssessment
    ? riskAssessment.allowed
      ? `Risk manager approved ${riskAssessment.executableAction.toUpperCase()} with ${riskAssessment.positionPct.toFixed(1)}% target exposure (${riskAssessment.positionCash.toFixed(2)} USDC notional). Limits: max ${riskAssessment.maxPositionPct}% position, confidence >= ${riskAssessment.confidenceThreshold}%, drawdown <= ${riskAssessment.maxBacktestDrawdownPct}%, paper loss <= ${riskAssessment.maxPaperLossPct}%, ${riskAssessment.cooldownDays}D loss cooldown.`
      : `Risk manager forced HOLD. ${riskAssessment.blockedReasons.join('; ') || 'No executable size under risk limits'}. Limits: max ${riskAssessment.maxPositionPct}% position, confidence >= ${riskAssessment.confidenceThreshold}%, drawdown <= ${riskAssessment.maxBacktestDrawdownPct}%, paper loss <= ${riskAssessment.maxPaperLossPct}%, ${riskAssessment.cooldownDays}D loss cooldown.`
    : targetTrade
      ? `Historical ${selectedStrategy} trade can fail if the next candles invalidate ${targetTrade.reason}, liquidity fades, or the strategy regime changes before exit.`
      : action === 'hold'
        ? 'No fresh edge. Main risk is overtrading stale signals or acting on incomplete candles.'
        : recentTrade && !latestSignalIsFresh
          ? `Active ${selectedStrategy} signal is ${Math.round(((latestTime ?? recentTrade.time) - recentTrade.time) / DAY_MS)} completed candle(s) old; reduce conviction if price action fails to confirm or volume keeps fading.`
          : `Signal can fail if BTC rejects the current move, volume dries up, or the ${selectedStrategy} backtest regime stops matching current market structure.`;
  const research = await buildResearchBrief(
    snapshot,
    backtest,
    selectedStrategy,
    action,
    reason,
    risk,
    regime,
    targetTrade
  );
  const evidenceTrade = targetTrade
    ? {
        key: getTradeDecisionKey(selectedStrategy, targetTrade),
        side: targetTrade.side,
        time: targetTrade.time,
        price: targetTrade.price,
        quantity: targetTrade.quantity,
        equity: targetTrade.equity,
        reason: targetTrade.reason
      }
    : undefined;

  return {
    id: randomUUID(),
    kind: 'bot',
    agent: 'Linda',
    createdAt: targetTrade ? new Date(targetTrade.time).toISOString() : new Date().toISOString(),
    symbol: snapshot.symbol,
    strategy: selectedStrategy,
    action,
    price: targetTrade ? targetTrade.price : snapshot.price,
    confidence,
    reason,
    risk,
    nextCheck: targetTrade
      ? 'Follow the next completed candle after this trade and compare the strategy exit rule before repeating the setup.'
      : riskAssessment?.cooldownActive
        ? `Wait for the ${riskAssessment.cooldownDays}D loss cooldown to clear, then re-check the next completed candle.`
        : 'Re-evaluate after the next completed daily candle or a major volume regime change.',
    evidence: {
      returnPct: backtest.returnPct,
      maxDrawdownPct: backtest.maxDrawdownPct,
      winRatePct: backtest.winRatePct,
      exposurePct: backtest.exposurePct,
      volumeVerdict: snapshot.volumeTrend.verdict,
      volumeVsSevenDayPct: snapshot.volumeTrend.changeVsSevenDayPct,
      marketData: snapshot.marketData,
      regime,
      lastSignal: targetTrade
        ? { side: targetTrade.side, time: targetTrade.time, reason: targetTrade.reason }
        : recentTrade
          ? { side: recentTrade.side, time: recentTrade.time, reason: recentTrade.reason }
          : lastTrade
            ? { side: lastTrade.side, time: lastTrade.time, reason: lastTrade.reason }
            : undefined,
      trade: evidenceTrade,
      risk: riskAssessment
    },
    research,
    disclaimer: 'Paper-only decision. No exchange keys, no real orders, no execution.'
  };
}

export async function appendPaperDecision(entry: PaperJournalEntry) {
  const journal = await readJournal();
  journal.decisions = [...journal.decisions, entry].slice(-MAX_DECISIONS);
  await writeJournal(journal);
  if (databaseEnabled()) await rebuildPaperWallet(journal.decisions);
  return entry;
}

export async function ensurePaperBotDecisionBrief(
  snapshot: MarketSnapshot,
  backtests: BacktestResult[],
  selectedStrategy: TradingStrategy = 'volume-breakout'
) {
  const journal = await readJournal();
  const latestDecision = journal.decisions.at(-1);

  if (latestDecision?.kind === 'bot' && latestDecision.research) return undefined;

  const backtest =
    backtests.find((item) => item.strategy === selectedStrategy) ??
    backtests[0] ??
    backtestStrategy(snapshot.candles, selectedStrategy);
  const regime = detectMarketRegime(snapshot, backtests.length ? backtests : [backtest]);
  const selectedBacktest =
    backtests.find((item) => item.strategy === regime.selectedStrategy) ?? backtest;
  const decision = await buildPaperBotDecision(
    snapshot,
    selectedBacktest,
    regime.selectedStrategy,
    regime
  );

  journal.decisions = [...journal.decisions, decision].slice(-MAX_DECISIONS);
  await writeJournal(journal);
  if (databaseEnabled()) await rebuildPaperWallet(journal.decisions);
  return decision;
}

export async function runPaperBotDecision(
  selectedStrategy: TradingStrategy,
  target?: { tradeTime?: number; tradeSide?: Trade['side'] }
) {
  const snapshot = await import('@/lib/trading').then((mod) => mod.getMarketSnapshot('BTCUSDT'));
  const backtest = backtestStrategy(snapshot.candles, selectedStrategy);
  const targetTrade =
    target?.tradeTime === undefined
      ? undefined
      : backtest.trades.find(
          (trade) =>
            trade.time === target.tradeTime &&
            (target.tradeSide === undefined || trade.side === target.tradeSide)
        );

  if (target?.tradeTime !== undefined && targetTrade === undefined) {
    throw new Error('Backtest trade was not found for this strategy');
  }

  if (targetTrade) {
    const journal = await readJournal();
    const tradeKey = getTradeDecisionKey(selectedStrategy, targetTrade);
    const existingDecision = journal.decisions.find(
      (decision) =>
        decision.kind === 'bot' &&
        decision.strategy === selectedStrategy &&
        decision.evidence.trade?.key === tradeKey
    );

    if (existingDecision?.kind === 'bot') return existingDecision;

    const decision = await buildPaperBotDecision(
      snapshot,
      backtest,
      selectedStrategy,
      undefined,
      targetTrade
    );
    journal.decisions = [...journal.decisions, decision].slice(-MAX_DECISIONS);
    await writeJournal(journal);
    if (databaseEnabled()) await rebuildPaperWallet(journal.decisions);
    return decision;
  }

  const allBacktests = (['sma-cross', 'rsi-reversion', 'volume-breakout'] as const).map(
    (strategy) =>
      strategy === selectedStrategy ? backtest : backtestStrategy(snapshot.candles, strategy)
  );
  const regime = detectMarketRegime(snapshot, allBacktests);
  const selectedBacktest =
    allBacktests.find((item) => item.strategy === regime.selectedStrategy) ?? backtest;
  const decision = await buildPaperBotDecision(
    snapshot,
    selectedBacktest,
    regime.selectedStrategy,
    regime
  );
  await appendPaperDecision(decision);
  return decision;
}
