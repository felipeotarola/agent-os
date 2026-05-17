CREATE TABLE "knowledge_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"status" text DEFAULT 'raw' NOT NULL,
	"source_url" text,
	"raw_content" text DEFAULT '' NOT NULL,
	"raw_path" text DEFAULT '' NOT NULL,
	"wiki_path" text,
	"summary" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
