CREATE TABLE IF NOT EXISTS "trading_backtest_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"candle_count" integer DEFAULT 0 NOT NULL,
	"snapshot_updated_at" timestamp with time zone NOT NULL,
	"strategies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trading_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"agent" text,
	"symbol" text DEFAULT 'BTCUSDT' NOT NULL,
	"strategy" text,
	"action" text NOT NULL,
	"price" double precision DEFAULT 0 NOT NULL,
	"confidence" double precision,
	"reason" text DEFAULT '' NOT NULL,
	"risk" text DEFAULT '' NOT NULL,
	"next_check" text DEFAULT '' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"research" jsonb,
	"portfolio" jsonb,
	"disclaimer" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
