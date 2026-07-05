from __future__ import annotations

import asyncio

from fastapi import APIRouter, Query

from simulation.backtest_engine import run_backtest
from simulation.monte_carlo import simulate_tournament

router = APIRouter()


@router.get("/simulate/worldcup")
async def simulate_worldcup(iterations: int = Query(default=10_000, ge=100, le=100_000)):
    return {"data": await asyncio.to_thread(simulate_tournament, iterations)}


@router.get("/backtest")
async def backtest():
    return {"data": await asyncio.to_thread(run_backtest)}
