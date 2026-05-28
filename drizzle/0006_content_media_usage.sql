ALTER TABLE "content_media_assets" ADD COLUMN "used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_media_assets" ADD COLUMN "used_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL;
