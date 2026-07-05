from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.matches import router as matches_router
from api.odds import router as odds_router
from api.predict import router as predict_router
from api.simulate import router as simulate_router
from db import db_connection
from realtime.ws_hub import router as ws_router


def parse_origins(value: str | None) -> list[str]:
    if not value:
        return ["http://localhost:3000", "http://localhost:3001", "http://localhost:4000"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    with db_connection():
        pass
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Sports Intelligence Gateway", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=parse_origins(os.environ.get("CORS_ORIGINS")),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "sports-intelligence-gateway"}

    app.include_router(matches_router)
    app.include_router(odds_router)
    app.include_router(predict_router)
    app.include_router(simulate_router)
    app.include_router(ws_router)
    return app


app = create_app()
