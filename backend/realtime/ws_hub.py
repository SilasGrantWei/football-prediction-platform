from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from db import db_connection

router = APIRouter()


@dataclass(frozen=True)
class LiveUpdate:
    match_id: str
    minute: int
    status: str
    home_score: int
    away_score: int
    xg_live: dict[str, float]
    possession: dict[str, int]
    shots: dict[str, int]
    dangerous_attacks: dict[str, int]
    updated_at: str | None


@router.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(
                {
                    "type": "live_matches",
                    "updated_at": datetime.utcnow().isoformat() + "Z",
                    "data": [asdict(item) for item in await asyncio.to_thread(load_live_updates)],
                }
            )
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        return


@router.websocket("/ws/match/{match_id}")
async def ws_match(websocket: WebSocket, match_id: str):
    await websocket.accept()
    try:
        while True:
            update = await asyncio.to_thread(load_match_update, match_id)
            await websocket.send_json(
                {
                    "type": "match_update",
                    "updated_at": datetime.utcnow().isoformat() + "Z",
                    "data": asdict(update) if update else None,
                }
            )
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        return


@router.websocket("/ws/odds")
async def ws_odds(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(
                {
                    "type": "odds_update",
                    "updated_at": datetime.utcnow().isoformat() + "Z",
                    "data": await asyncio.to_thread(load_latest_odds),
                }
            )
            await asyncio.sleep(15)
    except WebSocketDisconnect:
        return


def load_live_updates() -> list[LiveUpdate]:
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
              id,
              home_score,
              away_score,
              status,
              minute,
              updated_at
            FROM matches
            WHERE status IN ('live', 'halftime')
               OR updated_at >= NOW() - INTERVAL '20 seconds'
            ORDER BY COALESCE(kickoff_time, start_time) ASC
            """
        ).fetchall()
    return [row_to_update(row) for row in rows]


def load_match_update(match_id: str) -> LiveUpdate | None:
    with db_connection() as conn:
        row = conn.execute(
            """
            SELECT id, home_score, away_score, status, minute, updated_at
            FROM matches
            WHERE id = %s OR match_id = %s
            LIMIT 1
            """,
            (match_id, match_id),
        ).fetchone()
    return row_to_update(row) if row else None


def load_latest_odds() -> list[dict[str, Any]]:
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT ON (o.match_id)
              o.match_id,
              o.home_odds,
              o.draw_odds,
              o.away_odds,
              o.home_implied_prob,
              o.draw_implied_prob,
              o.away_implied_prob,
              o.overround,
              o.timestamp
            FROM odds_snapshots o
            ORDER BY o.match_id, o.timestamp DESC, o.id DESC
            LIMIT 100
            """
        ).fetchall()
    return [
        {
            "match_id": row[0],
            "home_odds": float(row[1]),
            "draw_odds": float(row[2]),
            "away_odds": float(row[3]),
            "home_prob_market": float(row[4]),
            "draw_prob_market": float(row[5]),
            "away_prob_market": float(row[6]),
            "overround": float(row[7]),
            "timestamp": row[8].isoformat(),
        }
        for row in rows
    ]


def row_to_update(row) -> LiveUpdate:
    match_id, home_score, away_score, status, minute, updated_at = row
    metrics = derive_live_metrics(int(minute or 0), int(home_score or 0), int(away_score or 0))
    return LiveUpdate(
        match_id=match_id,
        minute=int(minute or 0),
        status=status,
        home_score=int(home_score or 0),
        away_score=int(away_score or 0),
        xg_live=metrics["xg_live"],
        possession=metrics["possession"],
        shots=metrics["shots"],
        dangerous_attacks=metrics["dangerous_attacks"],
        updated_at=updated_at.isoformat() if updated_at else None,
    )


def derive_live_metrics(minute: int, home_score: int, away_score: int) -> dict[str, dict[str, float] | dict[str, int]]:
    active_minute = max(minute, 1)
    home_pressure = 0.52 + (home_score - away_score) * 0.03
    home_possession = max(35, min(65, round(home_pressure * 100)))
    away_possession = 100 - home_possession
    home_xg = round(home_score * 0.72 + active_minute / 90 * home_pressure * 1.25, 2)
    away_xg = round(away_score * 0.72 + active_minute / 90 * (1 - home_pressure) * 1.25, 2)
    return {
        "xg_live": {"home": home_xg, "away": away_xg},
        "possession": {"home": home_possession, "away": away_possession},
        "shots": {"home": max(home_score, round(home_xg * 3.2)), "away": max(away_score, round(away_xg * 3.2))},
        "dangerous_attacks": {"home": round(home_xg * 12), "away": round(away_xg * 12)},
    }
