from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from ml.feature_store import build_online_prediction

router = APIRouter()


@router.get("/predict/{match_id}")
async def predict_match(match_id: str):
    prediction = await asyncio.to_thread(build_online_prediction, match_id)
    if not prediction:
        raise HTTPException(status_code=404, detail="match not found")
    return {"data": prediction}
