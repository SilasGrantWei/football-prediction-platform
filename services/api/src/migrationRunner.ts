import type { PoolClient } from "pg";

import { pool } from "./db.js";

type Migration = {
  id: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    id: "004_match_winner",
    sql: `
      ALTER TABLE matches
      ADD COLUMN IF NOT EXISTS winner_team_id TEXT REFERENCES teams(id);

      UPDATE matches
      SET home_score = 2,
          away_score = 2,
          minute = 90,
          winner_team_id = 'belgium',
          updated_at = NOW()
      WHERE id = 'match-001'
        AND home_team_id = 'belgium'
        AND away_team_id = 'senegal'
        AND status = 'finished';
    `
  },
  {
    id: "005_full_match_score",
    sql: `
      ALTER TABLE matches
      ADD COLUMN IF NOT EXISTS full_match_home_score INTEGER,
      ADD COLUMN IF NOT EXISTS full_match_away_score INTEGER,
      ADD COLUMN IF NOT EXISTS penalty_shootout_home_score INTEGER,
      ADD COLUMN IF NOT EXISTS penalty_shootout_away_score INTEGER,
      ADD COLUMN IF NOT EXISTS result_decision TEXT
        CHECK (result_decision IN ('regulation', 'extra_time', 'penalties'));
    `
  }
];

export async function runDatabaseMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('football-prediction-platform:migrations'))");
    await runMigrationsWithClient(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('football-prediction-platform:migrations'))").catch(() => undefined);
    client.release();
  }
}

export async function runMigrationsWithClient(client: Pick<PoolClient, "query">): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const appliedResult = await client.query<{ migration_id: string }>("SELECT migration_id FROM schema_migrations");
  const applied = new Set(appliedResult.rows.map((row) => row.migration_id));

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (migration_id) VALUES ($1)", [migration.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}
