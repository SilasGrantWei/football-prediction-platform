from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from db import db_connection

router = APIRouter()


@router.get("/odds/{match_id}")
async def latest_odds(match_id: str):
    def load():
        with db_connection() as conn:
            row = conn.execute(
                """
                SELECT
                  match_id,
                  provider,
                  bookmaker,
                  home_odds,
                  draw_odds,
                  away_odds,
                  home_implied_prob,
                  draw_implied_prob,
                  away_implied_prob,
                  overround,
                  timestamp
                FROM odds_snapshots
                WHERE match_id = %s
                ORDER BY timestamp DESC, id DESC
                LIMIT 1
                """,
                (match_id,),
            ).fetchone()
        return row

    row = await asyncio.to_thread(load)
    if not row:
        raise HTTPException(status_code=404, detail="odds not found")

    return {
        "data": {
            "match_id": row[0],
            "provider": row[1],
            "bookmaker": row[2],
            "home_odds": float(row[3]),
            "draw_odds": float(row[4]),
            "away_odds": float(row[5]),
            "implied_probability": {
                "home": float(row[6]),
                "draw": float(row[7]),
                "away": float(row[8]),
            },
            "overround": float(row[9]),
            "timestamp": row[10].isoformat(),
        }
    }
