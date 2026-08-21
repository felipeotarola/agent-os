CREATE TABLE IF NOT EXISTS "work_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "business_date" date NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "location_type" text DEFAULT 'unknown' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'cockpit' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_notes" (
  "id" text PRIMARY KEY NOT NULL,
  "business_date" date NOT NULL,
  "work_session_id" text REFERENCES "work_sessions"("id"),
  "body" text NOT NULL,
  "source" text DEFAULT 'cockpit' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_expenses" (
  "id" text PRIMARY KEY NOT NULL,
  "business_date" date NOT NULL,
  "work_session_id" text REFERENCES "work_sessions"("id"),
  "category" text DEFAULT 'other' NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'SEK' NOT NULL,
  "merchant" text DEFAULT '' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "receipt_status" text DEFAULT 'missing' NOT NULL,
  "source" text DEFAULT 'cockpit' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_entry_events" (
  "id" text PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "action" text NOT NULL,
  "source" text NOT NULL,
  "source_ref" text DEFAULT '' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_sessions_date_idx" ON "work_sessions" ("business_date", "started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_expenses_date_idx" ON "work_expenses" ("business_date");
