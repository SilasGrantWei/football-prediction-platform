import os
from collections.abc import Sequence
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.ml.pipeline import IndustrialFootballPredictor
from app.ml.training import TrainingConfig, load_dataset, train_gradient_boosting
from app.schemas import (
    IndustrialPredictionResponse,
    MatchFeatureInput,
    PredictionRequest,
    PredictionResponse,
    TrainModelRequest,
    TrainModelResponse,
)
from app.services.prediction import predict_match
from app.services.sample_data import load_matches, team_summary


def parse_origins(value: str | None) -> list[str]:
    if not value:
        return ["http://localhost:3000", "http://localhost:3001", "http://localhost:4000"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


def create_app() -> FastAPI:
    artifact_dir = Path(os.getenv("WORLD_CUP_MODEL_DIR", "artifacts/worldcup_lightgbm"))
    use_gpu = os.getenv("LIGHTGBM_USE_GPU", "false").lower() == "true"
    predictor = IndustrialFootballPredictor(artifacts_dir=artifact_dir, use_gpu=use_gpu)

    app = FastAPI(
        title="世界杯 AI 预测服务",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=parse_origins(os.getenv("CORS_ORIGINS")),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "model": "lightgbm-elo-poisson",
            "artifact_dir": str(artifact_dir),
            "gradient_loaded": predictor.fusion.is_loaded,
            "gpu_enabled": use_gpu,
        }

    @app.get("/matches")
    async def matches():
        return {"data": load_matches()}

    @app.get("/team/{name}")
    async def team(name: str):
        return team_summary(name)

    @app.post("/predict", response_model=IndustrialPredictionResponse)
    async def predict_industrial(payload: MatchFeatureInput):
        return predictor.predict_from_mapping(payload.model_dump()).to_dict()

    @app.post("/predict_match", response_model=IndustrialPredictionResponse)
    async def predict_match_industrial(payload: MatchFeatureInput):
        return predictor.predict_from_mapping(payload.model_dump()).to_dict()

    @app.post("/train_model", response_model=TrainModelResponse)
    async def train_model(payload: TrainModelRequest):
        if payload.dataset:
            records = [item.model_dump() for item in payload.dataset]
            dataset_path = None
        elif payload.dataset_path:
            dataset_path = Path(payload.dataset_path)
            records = load_dataset(dataset_path)
        else:
            raise HTTPException(status_code=400, detail="dataset or dataset_path is required")

        try:
            result = train_gradient_boosting(
                records,
                TrainingConfig(
                    dataset_path=dataset_path,
                    output_dir=Path(payload.output_dir),
                    preferred_engine=payload.preferred_engine,
                    use_gpu=payload.use_gpu,
                ),
            )
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        predictor.artifacts_dir = Path(payload.output_dir)
        predictor.reload()
        return TrainModelResponse(
            model_version=result.model_version,
            artifact_path=str(result.artifact_path),
            training_rows=result.training_rows,
            engine=result.engine,
            metrics=result.metrics,
        )

    @app.post("/api/v1/predict", response_model=PredictionResponse)
    async def predict(payload: PredictionRequest):
        return predict_match(payload)

    @app.post("/api/v1/predict/batch", response_model=list[PredictionResponse])
    async def predict_batch(payloads: Sequence[PredictionRequest]):
        return [predict_match(payload) for payload in payloads]

    return app


app = create_app()
