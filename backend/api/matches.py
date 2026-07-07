from __future__ import annotations

from fastapi import APIRouter, Query

from db import db_connection

router = APIRouter()
STALE_SCHEDULED_DISPLAY_CUTOFF = "150 minutes"


@router.get("/matches")
async def list_matches(status: str | None = Query(default=None), period: str | None = Query(default=None)):
    def load():
        values: list[object] = []
        clauses: list[str] = []
        if status:
            values.append(status)
            clauses.append("m.status = %s")
        utc_today_start = "(date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')"
        if period == "today":
            clauses.append(f"COALESCE(m.kickoff_time, m.start_time) >= {utc_today_start}")
            clauses.append(f"COALESCE(m.kickoff_time, m.start_time) < {utc_today_start} + INTERVAL '1 day'")
        elif period == "tomorrow":
            clauses.append(f"COALESCE(m.kickoff_time, m.start_time) >= {utc_today_start} + INTERVAL '1 day'")
            clauses.append(f"COALESCE(m.kickoff_time, m.start_time) < {utc_today_start} + INTERVAL '2 days'")
        clauses.append(
            "NOT (m.status = 'scheduled' AND COALESCE(m.kickoff_time, m.start_time) < NOW() - %s::interval)"
        )
        values.append(STALE_SCHEDULED_DISPLAY_CUTOFF)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with db_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT
                  m.id,
                  m.match_id,
                  m.home_score,
                  m.away_score,
                  m.status,
                  m.minute,
                  COALESCE(m.kickoff_time, m.start_time) AS kickoff_time,
                  m.stage,
                  m.competition,
                  ht.id AS home_team_id,
                  ht.name AS home_team,
                  at.id AS away_team_id,
                  at.name AS away_team,
                  m.updated_at
                FROM matches m
                JOIN teams ht ON ht.id = m.home_team_id
                JOIN teams at ON at.id = m.away_team_id
                {where}
                ORDER BY
                  CASE m.status WHEN 'live' THEN 1 WHEN 'halftime' THEN 2 WHEN 'scheduled' THEN 3 ELSE 4 END,
                  COALESCE(m.kickoff_time, m.start_time) ASC
                """,
                values,
            ).fetchall()
        return [row_to_match(row) for row in rows]

    import asyncio

    return {"data": await asyncio.to_thread(load)}


@router.get("/live")
async def live_matches():
    def load():
        with db_connection() as conn:
            rows = conn.execute(
                """
                SELECT
                  m.id,
                  m.match_id,
                  m.home_score,
                  m.away_score,
                  m.status,
                  m.minute,
                  COALESCE(m.kickoff_time, m.start_time) AS kickoff_time,
                  m.stage,
                  m.competition,
                  ht.id AS home_team_id,
                  ht.name AS home_team,
                  at.id AS away_team_id,
                  at.name AS away_team,
                  m.updated_at
                FROM matches m
                JOIN teams ht ON ht.id = m.home_team_id
                JOIN teams at ON at.id = m.away_team_id
                WHERE m.status IN ('live', 'halftime')
                   OR (
                     m.updated_at >= NOW() - INTERVAL '10 minutes'
                     AND NOT (
                       m.status = 'scheduled'
                       AND COALESCE(m.kickoff_time, m.start_time) < NOW() - INTERVAL '150 minutes'
                     )
                   )
                ORDER BY COALESCE(m.kickoff_time, m.start_time) ASC
                """
            ).fetchall()
        return [row_to_match(row) for row in rows]

    import asyncio

    return {"data": await asyncio.to_thread(load), "refreshSeconds": 5}


def row_to_match(row) -> dict:
    return {
        "id": row[0],
        "match_id": row[1],
        "home_score": row[2],
        "away_score": row[3],
        "status": row[4],
        "minute": row[5],
        "kickoff_time": row[6].isoformat(),
        "stage": row[7],
        "competition": row[8],
        "home_team": {"id": row[9], "name": row[10]},
        "away_team": {"id": row[11], "name": row[12]},
        "updated_at": row[13].isoformat() if row[13] else None,
    }
