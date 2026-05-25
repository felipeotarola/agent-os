CREATE TABLE "trading_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"decision_id" text NOT NULL,
	"action" text NOT NULL,
	"price" double precision NOT NULL,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"cash_delta" double precision DEFAULT 0 NOT NULL,
	"asset_delta" double precision DEFAULT 0 NOT NULL,
	"fee" double precision DEFAULT 0 NOT NULL,
	"equity_after" double precision DEFAULT 0 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"agent" text DEFAULT 'Linda' NOT NULL,
	"symbol" text DEFAULT 'BTCUSDC' NOT NULL,
	"base_asset" text DEFAULT 'BTC' NOT NULL,
	"quote_asset" text DEFAULT 'USDC' NOT NULL,
	"starting_cash" double precision DEFAULT 10000 NOT NULL,
	"cash_balance" double precision DEFAULT 10000 NOT NULL,
	"asset_balance" double precision DEFAULT 0 NOT NULL,
	"realized_pnl" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trading_executions" ADD CONSTRAINT "trading_executions_wallet_id_trading_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."trading_wallets"("id") ON DELETE no action ON UPDATE no action;