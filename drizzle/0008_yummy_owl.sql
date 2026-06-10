CREATE TABLE "qa_report_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_agent" text DEFAULT 'Sladdis' NOT NULL,
	"vertical" text NOT NULL,
	"customer_slug" text DEFAULT '' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"report_slug" text DEFAULT '' NOT NULL,
	"target_url" text DEFAULT '' NOT NULL,
	"writer_token_id" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"exchanged_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qa_report_claims_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "qa_report_writer_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"name" text DEFAULT 'Sladdis QA writer' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qa_report_writer_tokens_token_hash_unique" UNIQUE("token_hash")
);
