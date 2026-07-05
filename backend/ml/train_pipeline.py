from __future__ import annotations

import json
import os
import pickle
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from db import db_connection
from ml.feature_store import load_feature_rows
from ml.models.catboost import build_catboost_classifier
from ml.models.elo import update_elo
from ml.models.lgbm import build_lightgbm_classifier


@dataclass(frozen=True)
class TrainingResult:
    model_version: str
    train_rows: int
    validation_rows: int
    log_loss: float | None
    brier_score: float | None
    artifact_path: str
    status: str


FEATURE_NAMES = [
    "rating_diff",
    "form_diff",
    "attack_diff",
    "defense_diff",
    "xga_diff",
    "market_home",
    "market_draw",
    "market_away",
    "poisson_home",
    "poisson_draw",
    "poisson_away",
    "elo_home",
    "elo_draw",
    "elo_away",
]


def daily_retrain(rolling_days: int = 730, min_rows: int = 30) -> dict:
    rows = [row for row in load_feature_rows(include_unfinished=False) if row.label is not None]
    if len(rows) < min_rows:
        result = TrainingResult(
            model_version=version_name("skipped"),
            train_rows=len(rows),
            validation_rows=0,
            log_loss=None,
            brier_score=None,
            artifact_path="",
            status="skipped_insufficient_rows",
        )
        save_training_run(result, {"reason": f"need at least {min_rows} finished matches", "rolling_days": rolling_days})
        return result.__dict__

    rows = rows[-min(len(rows), rolling_days * 4) :]
    split = max(1, int(len(rows) * 0.8))
    train_rows = rows[:split]
    validation_rows = rows[split:] or rows[-max(1, len(rows) // 5) :]

    x_train, y_train = to_matrix(train_rows)
    x_val, y_val = to_matrix(validation_rows)

    lgbm = build_lightgbm_classifier()
    catboost = build_catboost_classifier()
    lgbm.fit(x_train, y_train)
    catboost.fit(x_train, y_train)

    lgbm_probs = predict_proba(lgbm, x_val)
    cat_probs = predict_proba(catboost, x_val)
    stacked_probs = normalize_prob_matrix(0.55 * lgbm_probs + 0.45 * cat_probs)
    calibrated_probs = temperature_scale(stacked_probs, temperature=1.08)

    metrics = {
        "log_loss": safe_log_loss(y_val, calibrated_probs),
        "brier_score": multiclass_brier_score(y_val, calibrated_probs),
        "calibration_curve": calibration_curve(y_val, calibrated_probs),
        "roi_simulation": roi_simulation(validation_rows, calibrated_probs),
    }

    model_version = version_name("ensemble")
    artifact_dir = Path(os.environ.get("MODEL_ARTIFACT_DIR", "backend/artifacts/models")) / model_version
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / "model_bundle.pkl"
    with artifact_path.open("wb") as fh:
        pickle.dump(
            {
                "version": model_version,
                "feature_names": FEATURE_NAMES,
                "lgbm": lgbm,
                "catboost": catboost,
                "temperature": 1.08,
                "metrics": metrics,
            },
            fh,
        )

    update_elo_ratings()
    log_to_mlflow(model_version, metrics, artifact_path, len(train_rows), len(validation_rows))
    result = TrainingResult(
        model_version=model_version,
        train_rows=len(train_rows),
        validation_rows=len(validation_rows),
        log_loss=metrics["log_loss"],
        brier_score=metrics["brier_score"],
        artifact_path=str(artifact_path),
        status="ok",
    )
    save_training_run(result, metrics)
    return result.__dict__


def to_matrix(rows) -> tuple[np.ndarray, np.ndarray]:
    x = np.array([[row.features[name] for name in FEATURE_NAMES] for row in rows], dtype=float)
    y = np.array([row.label for row in rows], dtype=int)
    return x, y


def predict_proba(model, x: np.ndarray) -> np.ndarray:
    probs = model.predict_proba(x)
    if probs.shape[1] == 3:
        return probs
    full = np.zeros((probs.shape[0], 3))
    for idx, klass in enumerate(model.classes_):
        full[:, int(klass)] = probs[:, idx]
    return normalize_prob_matrix(full)


def normalize_prob_matrix(probs: np.ndarray) -> np.ndarray:
    probs = np.maximum(probs, 1e-9)
    return probs / probs.sum(axis=1, keepdims=True)


def temperature_scale(probs: np.ndarray, temperature: float) -> np.ndarray:
    logits = np.log(np.maximum(probs, 1e-9)) / temperature
    exp = np.exp(logits - logits.max(axis=1, keepdims=True))
    return exp / exp.sum(axis=1, keepdims=True)


def safe_log_loss(y_true: np.ndarray, probs: np.ndarray) -> float:
    selected = np.maximum(probs[np.arange(len(y_true)), y_true], 1e-9)
    return float(-np.log(selected).mean())


def multiclass_brier_score(y_true: np.ndarray, probs: np.ndarray) -> float:
    one_hot = np.zeros_like(probs)
    one_hot[np.arange(len(y_true)), y_true] = 1.0
    return float(np.mean(np.sum((probs - one_hot) ** 2, axis=1)))


def calibration_curve(y_true: np.ndarray, probs: np.ndarray) -> list[dict[str, float]]:
    confidence = probs.max(axis=1)
    correct = probs.argmax(axis=1) == y_true
    bins: list[dict[str, float]] = []
    for lower in np.linspace(0.0, 0.8, 5):
        upper = lower + 0.2
        mask = (confidence >= lower) & (confidence < upper if upper < 1.0 else confidence <= upper)
        if not mask.any():
            continue
        bins.append({"confidence": float(confidence[mask].mean()), "accuracy": float(correct[mask].mean()), "count": int(mask.sum())})
    return bins


def roi_simulation(rows, probs: np.ndarray, threshold: float = 0.06) -> dict[str, float]:
    profit = 0.0
    bets = 0
    for row, prob in zip(rows, probs):
        market = np.array([row.features["market_home"], row.features["market_draw"], row.features["market_away"]], dtype=float)
        if market.sum() <= 0:
            continue
        values = prob - market
        pick = int(values.argmax())
        if values[pick] < threshold:
            continue
        odds = 1.0 / max(market[pick], 1e-6)
        profit += odds - 1.0 if pick == row.label else -1.0
        bets += 1
    return {"bets": float(bets), "profit_units": round(profit, 4), "roi": round(profit / bets, 4) if bets else 0.0}


def update_elo_ratings() -> None:
    ratings: dict[str, float] = {}
    with db_connection() as conn:
        matches = conn.execute(
            """
            SELECT home_team_id, away_team_id, home_score, away_score
            FROM matches
            WHERE status = 'finished'
            ORDER BY COALESCE(kickoff_time, start_time) ASC
            """
        ).fetchall()
        for home_id, away_id, home_goals, away_goals in matches:
            home_rating = ratings.get(home_id, 1500.0)
            away_rating = ratings.get(away_id, 1500.0)
            ratings[home_id], ratings[away_id] = update_elo(home_rating, away_rating, int(home_goals), int(away_goals))

        for team_id, rating in ratings.items():
            conn.execute(
                """
                INSERT INTO team_elo_ratings (team_id, rating, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (team_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()
                """,
                (team_id, rating),
            )


def log_to_mlflow(model_version: str, metrics: dict, artifact_path: Path, train_rows: int, validation_rows: int) -> None:
    try:
        import mlflow

        mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "file:backend/artifacts/mlruns"))
        mlflow.set_experiment("worldcup_prediction")
        with mlflow.start_run(run_name=model_version):
            mlflow.log_param("train_rows", train_rows)
            mlflow.log_param("validation_rows", validation_rows)
            mlflow.log_metric("log_loss", metrics["log_loss"])
            mlflow.log_metric("brier_score", metrics["brier_score"])
            mlflow.log_dict(metrics, "metrics.json")
            mlflow.log_artifact(str(artifact_path))
    except Exception as exc:
        print({"level": "warn", "message": "mlflow logging skipped", "error": str(exc)})


def save_training_run(result: TrainingResult, metadata: dict) -> None:
    with db_connection() as conn:
        conn.execute("UPDATE model_training_runs SET champion = FALSE WHERE champion = TRUE")
        conn.execute(
            """
            INSERT INTO model_training_runs (
              model_version,
              train_rows,
              validation_rows,
              log_loss,
              brier_score,
              artifact_path,
              champion,
              metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s, TRUE, %s::jsonb)
            ON CONFLICT (model_version) DO UPDATE SET
              train_rows = EXCLUDED.train_rows,
              validation_rows = EXCLUDED.validation_rows,
              log_loss = EXCLUDED.log_loss,
              brier_score = EXCLUDED.brier_score,
              artifact_path = EXCLUDED.artifact_path,
              champion = EXCLUDED.champion,
              metadata = EXCLUDED.metadata
            """,
            (
                result.model_version,
                result.train_rows,
                result.validation_rows,
                result.log_loss,
                result.brier_score,
                result.artifact_path,
                json.dumps(metadata),
            ),
        )


def version_name(prefix: str) -> str:
    return f"{prefix}-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"


if __name__ == "__main__":
    print(daily_retrain())
