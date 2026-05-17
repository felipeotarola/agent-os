CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '⚛️' NOT NULL,
	"role" text NOT NULL,
	"runtime" text DEFAULT 'openclaw' NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"task_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"path" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"owner_agent_id" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text,
	"actor_agent_id" text,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"owner_agent_id" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_agent_id_agents_id_fk" FOREIGN KEY ("actor_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;