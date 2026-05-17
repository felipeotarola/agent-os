import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://agent_os:agent_os_local_password@localhost:5433/agent_os';

const globalForDb = globalThis as unknown as {
  agentOsSql?: postgres.Sql;
};

export const sql =
  globalForDb.agentOsSql ??
  postgres(connectionString, {
    max: 5,
    prepare: false
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.agentOsSql = sql;
}

export const db = drizzle(sql, { schema });
