import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
  summary: text('summary').notNull().default(''),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export type Agent = typeof agents.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
