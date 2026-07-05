from __future__ import annotations

import argparse
import csv
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.ml.contracts import MatchRecord
from app.ml.fusion import GradientBoostingFusionLayer, build_fusion_features
from app.ml.pipeline import IndustrialFootballPredictor, MODEL_VERSION


@dataclass(frozen=True)
class TrainingConfig:
    dataset_path: Path | None
    output_dir: Path
    seed: int = 42
    preferred_engine: str = "lightgbm"
    use_gpu: bool = False


@dataclass(frozen=True)
class TrainingResult:
    model_version: str
    artifact_path: Path
    training_rows: int
    engine: str
    metrics: dict[str, float]


def load_dataset(path: Path) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".jsonl":
        return load_jsonl_dataset(path)
    if suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            return [dict(item) for item in payload]
        if isinstance(payload, dict) and isinstance(payload.get("matches"), list):
            return [dict(item) for item in payload["matches"]]
        raise ValueError(f"JSON dataset must be a list or contain matches[]: {path}")
    if suffix == ".csv":
        return load_csv_dataset(path)
    raise ValueError(f"unsupported dataset format: {path.suffix}")


def load_jsonl_dataset(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                records.append(json.loads(stripped))
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSON on line {line_no}: {path}") from exc
    return records


def load_csv_dataset(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def train_gradient_boosting(
    raw_records: list[dict[str, Any]],
    config: TrainingConfig,
) -> TrainingResult:
    if not raw_records:
        raise ValueError("training dataset is empty")

    random.seed(config.seed)
    records = [MatchRecord.from_mapping(row) for row in raw_records]
    predictor = IndustrialFootballPredictor(preferred_engine=config.preferred_engine, use_gpu=config.use_gpu)
    features = []
    labels = []
    for match in records:
        elo_probs = predictor.elo.match_probabilities(match.home_team, match.away_team, match.home_elo, match.away_elo)
        poisson_prediction = predictor.poisson.predict(match)
        features.append(build_fusion_features(match, elo_probs, poisson_prediction))
        labels.append(match.label)

    model = GradientBoostingFusionLayer(preferred_engine=config.preferred_engine, use_gpu=config.use_gpu)
    model.fit(features, labels)

    predictions = [max(enumerate(model.predict_proba(item)), key=lambda value: value[1])[0] for item in features]
    accuracy = sum(1 for pred, label in zip(predictions, labels) if pred == label) / len(labels)

    config.output_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = config.output_dir / "gradient_boosting.pkl"
    model.save(artifact_path)
    metadata_path = config.output_dir / "metadata.json"
    metadata_path.write_text(
        json.dumps(
            {
                "model_version": MODEL_VERSION,
                "engine": model.engine,
                "rows": len(records),
                "metrics": {"training_accuracy": round(accuracy, 4)},
                "dataset_path": str(config.dataset_path) if config.dataset_path else None,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return TrainingResult(
        model_version=MODEL_VERSION,
        artifact_path=artifact_path,
        training_rows=len(records),
        engine=model.engine or config.preferred_engine,
        metrics={"training_accuracy": round(accuracy, 4)},
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Train local World Cup football prediction model.")
    parser.add_argument("--dataset", required=True, type=Path, help="JSONL/JSON/CSV dataset following Match contract.")
    parser.add_argument("--output-dir", default=Path("artifacts/worldcup_lightgbm"), type=Path)
    parser.add_argument("--engine", default="lightgbm", choices=["lightgbm", "xgboost"])
    parser.add_argument("--gpu", action="store_true", help="Use GPU mode if the gradient boosting package supports it.")
    args = parser.parse_args()

    records = load_dataset(args.dataset)
    result = train_gradient_boosting(
        records,
        TrainingConfig(
            dataset_path=args.dataset,
            output_dir=args.output_dir,
            preferred_engine=args.engine,
            use_gpu=args.gpu,
        ),
    )
    print(
        json.dumps(
            {
                "model_version": result.model_version,
                "artifact_path": str(result.artifact_path),
                "training_rows": result.training_rows,
                "engine": result.engine,
                "metrics": result.metrics,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
