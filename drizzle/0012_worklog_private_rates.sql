CREATE TABLE IF NOT EXISTS "work_rate_rules" (
  "id" text PRIMARY KEY NOT NULL,
  "effective_date" date NOT NULL,
  "rate_minor" integer NOT NULL,
  "currency" text DEFAULT 'SEK' NOT NULL,
  "visibility" text DEFAULT 'private' NOT NULL,
  "source" text DEFAULT 'cockpit' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_rate_rules_effective_date_idx" ON "work_rate_rules" ("effective_date" DESC, "created_at" DESC);
