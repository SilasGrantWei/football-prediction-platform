from __future__ import annotations

import json

from db import db_connection


def sync_results() -> dict[str, int]:
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
              id,
              home_team_id,
              away_team_id,
              home_score,
              away_score,
              status,
              COALESCE(kickoff_time, start_time) AS kickoff_time,
              stage,
              source,
              external_id,
              minute,
              updated_at
            FROM matches
            WHERE status = 'finished'
              AND minute < 120
            """
        ).fetchall()

        written = 0
        for row in rows:
            raw = {
                "external_id": row[9],
                "minute": row[10],
                "updated_at": row[11].isoformat() if row[11] else None,
            }
            conn.execute(
                """
                INSERT INTO match_results (
                  match_id,
                  home_team_id,
                  away_team_id,
                  home_score,
                  away_score,
                  status,
                  kickoff_time,
                  stage,
                  source,
                  synced_at,
                  raw
                )
                VALUES (%s, %s, %s, %s, %s, 'finished', %s, %s, %s, NOW(), %s::jsonb)
                ON CONFLICT (match_id) DO UPDATE SET
                  home_team_id = EXCLUDED.home_team_id,
                  away_team_id = EXCLUDED.away_team_id,
                  home_score = EXCLUDED.home_score,
                  away_score = EXCLUDED.away_score,
                  kickoff_time = EXCLUDED.kickoff_time,
                  stage = EXCLUDED.stage,
                  source = EXCLUDED.source,
                  synced_at = NOW(),
                  raw = EXCLUDED.raw
                """,
                (
                    row[0],
                    row[1],
                    row[2],
                    row[3],
                    row[4],
                    row[6],
                    row[7],
                    row[8] or "ingestion",
                    json.dumps(raw),
                ),
            )
            written += 1

    return {"finished": len(rows), "written": written}


if __name__ == "__main__":
    print(sync_results())
