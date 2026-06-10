CREATE TABLE "qa_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website_url" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qa_customers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "qa_report_evidence_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"kind" text DEFAULT 'screenshot' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"blob_key" text,
	"blob_url" text,
	"file_name" text,
	"content_type" text,
	"viewport" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"vertical" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"target_url" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"agent_name" text DEFAULT 'Sladdis' NOT NULL,
	"report_template" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"verdict" text DEFAULT '' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"report_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qa_report_evidence_assets" ADD CONSTRAINT "qa_report_evidence_assets_report_id_qa_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."qa_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_reports" ADD CONSTRAINT "qa_reports_customer_id_qa_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."qa_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qa_reports_customer_vertical_slug_unique" ON "qa_reports" USING btree ("customer_id","vertical","slug");