import { doublePrecision, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji').notNull().default('⚛️'),
  role: text('role').notNull(),
  runtime: text('runtime').notNull().default('openclaw'),
  status: text('status').notNull().default('online'),
  detail: text('detail').notNull().default(''),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('active'),
  summary: text('summary').notNull().default(''),
  ownerAgentId: text('owner_agent_id').references(() => agents.id),
  priority: integer('priority').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('todo'),
  priority: integer('priority').notNull().default(0),
  ownerAgentId: text('owner_agent_id').references(() => agents.id),
  source: text('source').notNull().default('manual'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const taskEvents = pgTable('task_events', {
  id: text('id').primaryKey(),
  taskId: text('task_id').references(() => tasks.id),
  actorAgentId: text('actor_agent_id').references(() => agents.id),
  kind: text('kind').notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const inboxItems = pgTable('inbox_items', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  sourceId: text('source_id').notNull().default(''),
  kind: text('kind').notNull().default('signal'),
  status: text('status').notNull().default('active'),
  priority: integer('priority').notNull().default(50),
  title: text('title').notNull(),
  detail: text('detail').notNull().default(''),
  href: text('href').notNull().default('/dashboard/radar'),
  actionLabel: text('action_label').notNull().default('Open'),
  ownerAgentId: text('owner_agent_id').references(() => agents.id),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const artifacts = pgTable('artifacts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  taskId: text('task_id').references(() => tasks.id),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  path: text('path').notNull(),
  summary: text('summary').notNull().default(''),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const knowledgeSources = pgTable('knowledge_sources', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('note'),
  status: text('status').notNull().default('raw'),
  sourceUrl: text('source_url'),
  rawContent: text('raw_content').notNull().default(''),
  rawPath: text('raw_path').notNull().default(''),
  wikiPath: text('wiki_path'),
  wikiContent: text('wiki_content').notNull().default(''),
  summary: text('summary').notNull().default(''),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  agentId: text('agent_id'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  role: text('role').notNull().default('assistant'),
  author: text('author'),
  content: text('content').notNull().default(''),
  attachments: jsonb('attachments').$type<unknown[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id),
  status: text('status').notNull().default('running'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  runId: text('run_id').references(() => runs.id),
  conversationId: text('conversation_id').references(() => conversations.id),
  kind: text('kind').notNull().default('event'),
  sequence: integer('sequence').notNull().default(0),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const contentItems = pgTable('content_items', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  brief: text('brief').notNull().default(''),
  status: text('status').notNull().default('draft'),
  pillar: text('pillar').notNull().default(''),
  campaign: text('campaign').notNull().default('sladdis'),
  ownerAgentId: text('owner_agent_id').references(() => agents.id),
  source: text('source').notNull().default('cockpit'),
  scheduleAt: timestamp('schedule_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const contentVariants = pgTable('content_variants', {
  id: text('id').primaryKey(),
  contentItemId: text('content_item_id')
    .notNull()
    .references(() => contentItems.id),
  platform: text('platform').notNull(),
  status: text('status').notNull().default('draft'),
  title: text('title').notNull().default(''),
  caption: text('caption').notNull().default(''),
  hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
  scheduleAt: timestamp('schedule_at', { withTimezone: true }),
  externalUrl: text('external_url'),
  failureReason: text('failure_reason'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const contentMediaAssets = pgTable('content_media_assets', {
  id: text('id').primaryKey(),
  contentItemId: text('content_item_id')
    .notNull()
    .references(() => contentItems.id),
  variantId: text('variant_id').references(() => contentVariants.id),
  kind: text('kind').notNull().default('source'),
  status: text('status').notNull().default('prepared'),
  blobKey: text('blob_key'),
  blobUrl: text('blob_url'),
  fileName: text('file_name'),
  contentType: text('content_type'),
  bytes: integer('bytes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const tradingBacktestRuns = pgTable('trading_backtest_runs', {
  id: text('id').primaryKey(),
  symbol: text('symbol').notNull(),
  candleCount: integer('candle_count').notNull().default(0),
  snapshotUpdatedAt: timestamp('snapshot_updated_at', { withTimezone: true }).notNull(),
  strategies: jsonb('strategies').$type<unknown[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const tradingDecisions = pgTable('trading_decisions', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  agent: text('agent'),
  symbol: text('symbol').notNull().default('BTCUSDT'),
  strategy: text('strategy'),
  action: text('action').notNull(),
  price: doublePrecision('price').notNull().default(0),
  confidence: doublePrecision('confidence'),
  reason: text('reason').notNull().default(''),
  risk: text('risk').notNull().default(''),
  nextCheck: text('next_check').notNull().default(''),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  research: jsonb('research').$type<Record<string, unknown> | null>(),
  portfolio: jsonb('portfolio').$type<Record<string, unknown> | null>(),
  disclaimer: text('disclaimer').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export type Agent = typeof agents.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type InboxItem = typeof inboxItems.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Event = typeof events.$inferSelect;
export type ContentItem = typeof contentItems.$inferSelect;
export type ContentVariant = typeof contentVariants.$inferSelect;
export type ContentMediaAsset = typeof contentMediaAssets.$inferSelect;
export type TradingBacktestRun = typeof tradingBacktestRuns.$inferSelect;
export type TradingDecision = typeof tradingDecisions.$inferSelect;
