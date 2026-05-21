CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pillar" text DEFAULT '' NOT NULL,
	"campaign" text DEFAULT 'sladdis' NOT NULL,
	"owner_agent_id" text,
	"source" text DEFAULT 'cockpit' NOT NULL,
	"schedule_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"variant_id" text,
	"kind" text DEFAULT 'source' NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"blob_key" text,
	"blob_url" text,
	"file_name" text,
	"content_type" text,
	"bytes" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schedule_at" timestamp with time zone,
	"external_url" text,
	"failure_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_media_assets" ADD CONSTRAINT "content_media_assets_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_media_assets" ADD CONSTRAINT "content_media_assets_variant_id_content_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."content_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;