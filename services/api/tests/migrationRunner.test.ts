import { describe, expect, it, vi } from "vitest";

import { runMigrationsWithClient } from "../src/migrationRunner.js";

describe("database migration runner", () => {
  it("applies the winner migration and records it exactly once", async () => {
    const statements: Array<{ sql: string; params?: readonly unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        statements.push({ sql, params });
        if (sql.includes("SELECT migration_id")) return { rows: [] };
        return { rows: [] };
      })
    };

    await runMigrationsWithClient(client);

    expect(statements.some(({ sql }) => sql.includes("ADD COLUMN IF NOT EXISTS winner_team_id"))).toBe(true);
    expect(
      statements.some(({ sql }) => sql.includes("home_score = 2") && sql.includes("winner_team_id = 'belgium'"))
    ).toBe(true);
    expect(
      statements.some(
        ({ sql, params }) => sql.includes("INSERT INTO schema_migrations") && params?.includes("004_match_winner")
      )
    ).toBe(true);
    expect(
      statements.some(
        ({ sql }) =>
          sql.includes("ADD COLUMN IF NOT EXISTS full_match_home_score") &&
          sql.includes("ADD COLUMN IF NOT EXISTS result_decision")
      )
    ).toBe(true);
    expect(
      statements.some(
        ({ sql, params }) => sql.includes("INSERT INTO schema_migrations") && params?.includes("005_full_match_score")
      )
    ).toBe(true);
  });
});
