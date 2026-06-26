CREATE TABLE IF NOT EXISTS "rnd_loops" (
	"id" text PRIMARY KEY NOT NULL,
	"theme" text NOT NULL,
	"question" text DEFAULT '' NOT NULL,
	"hypothesis" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"experiment" text DEFAULT '' NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"next_task" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'backlog' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"owner_agent_id" text,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rnd_loops_status_position_idx" ON "rnd_loops" ("status", "position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rnd_loops_owner_status_idx" ON "rnd_loops" ("owner_agent_id", "status");
--> statement-breakpoint
INSERT INTO "rnd_loops" (
	"id",
	"theme",
	"question",
	"hypothesis",
	"status",
	"priority",
	"owner_agent_id",
	"cadence",
	"source",
	"position",
	"metadata"
) VALUES
	(
		'rnd-autonomous-task-picking',
		'Autonomous task picking',
		'How should heartbeats select one useful safe task without needing Felipe to prompt?',
		'The agent needs a ranked queue with autonomy levels, freshness, and a clear stop condition.',
		'backlog',
		90,
		'cai',
		'weekly',
		'migration-seed',
		1000,
		'{"seeded": true}'::jsonb
	),
	(
		'rnd-agent-os-product-usefulness',
		'Agent OS product usefulness',
		'What would make Agent OS feel more useful every week instead of just being a dashboard?',
		'The system should turn broad operating goals into small research tasks, experiments, and shipped changes.',
		'backlog',
		80,
		'cai',
		'weekly',
		'migration-seed',
		2000,
		'{"seeded": true}'::jsonb
	),
	(
		'rnd-cai-charles-operating-model',
		'Cai / Charles operating model',
		'Which responsibilities should stay with Cai, Charles, coding-worker, TaskFlow, or cron?',
		'Clear ownership rules reduce idle heartbeats and prevent broad goals from becoming vague prompts.',
		'backlog',
		70,
		'cai',
		'weekly',
		'migration-seed',
		3000,
		'{"seeded": true}'::jsonb
	)
ON CONFLICT ("id") DO NOTHING;
