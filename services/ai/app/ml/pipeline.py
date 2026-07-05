from __future__ import annotations

from dataclasses import dataclass
from math import sin
from pathlib import Path
from typing import Any

from app.ml.contracts import MatchRecord
from app.ml.elo import EloRatingModel
from app.ml.fusion import (
    GradientBoostingFusionLayer,
    build_fusion_features,
    fallback_gradient_probs,
    final_fusion,
)
from app.ml.poisson import PoissonGoalModel

MODEL_VERSION = "worldcup-contextual-lightgbm-elo-poisson-v2"


@dataclass(frozen=True)
class IndustrialPrediction:
    model_version: str
    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    expected_home_goals: float
    expected_away_goals: float
    top_scores: list[dict[str, float | str]]
    upset_risk: str
    game_style: str
    trend: list[dict[str, int]]
    model_breakdown: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_version": self.model_version,
            "win_prob": self.home_win_prob,
            "home_win_prob": self.home_win_prob,
            "draw_prob": self.draw_prob,
            "lose_prob": self.away_win_prob,
            "away_win_prob": self.away_win_prob,
            "expected_home_goals": self.expected_home_goals,
            "expected_away_goals": self.expected_away_goals,
            "score_prediction": self.top_scores[0]["score"] if self.top_scores else None,
            "top_scores": self.top_scores,
            "upset_risk": self.upset_risk,
            "game_style": self.game_style,
            "trend": self.trend,
            "model_breakdown": self.model_breakdown,
        }


class IndustrialFootballPredictor:
    def __init__(
        self,
        artifacts_dir: str | Path | None = None,
        preferred_engine: str = "lightgbm",
        use_gpu: bool = False,
    ) -> None:
        self.elo = EloRatingModel()
        self.poisson = PoissonGoalModel(max_goals=7, top_n=5)
        self.fusion = GradientBoostingFusionLayer(preferred_engine=preferred_engine, use_gpu=use_gpu)
        self.artifacts_dir = Path(artifacts_dir) if artifacts_dir else None
        self._load_artifacts()

    def predict(self, match: MatchRecord) -> IndustrialPrediction:
        elo_probs = self.elo.match_probabilities(
            match.home_team,
            match.away_team,
            match.home_elo,
            match.away_elo,
        )
        poisson_prediction = self.poisson.predict(match)
        poisson_probs = (
            poisson_prediction.home_win_prob,
            poisson_prediction.draw_prob,
            poisson_prediction.away_win_prob,
        )
        features = build_fusion_features(match, elo_probs, poisson_prediction)
        gradient_probs = self.fusion.predict_proba(features) if self.fusion.is_loaded else fallback_gradient_probs(features)
        final_probs = final_fusion(gradient_probs, elo_probs, poisson_probs)

        return IndustrialPrediction(
            model_version=MODEL_VERSION,
            home_win_prob=round4(final_probs[0]),
            draw_prob=round4(final_probs[1]),
            away_win_prob=round4(final_probs[2]),
            expected_home_goals=round2(poisson_prediction.lambda_home),
            expected_away_goals=round2(poisson_prediction.lambda_away),
            top_scores=[
                {"score": item.score, "probability": round4(item.probability)}
                for item in poisson_prediction.top_scores
            ],
            upset_risk=classify_upset_risk(
                match,
                final_probs,
                poisson_prediction.lambda_home,
                poisson_prediction.lambda_away,
            ),
            game_style=classify_game_style(poisson_prediction.lambda_home + poisson_prediction.lambda_away),
            trend=build_trend(final_probs, poisson_prediction.lambda_home, poisson_prediction.lambda_away),
            model_breakdown={
                "fusion_strategy": "0.60 * LightGBM + 0.40 * Elo/Poisson correction with World Cup context features",
                "gradient_engine": self.fusion.engine if self.fusion.is_loaded else "rule-fallback",
                "elo_probs": tuple(round4(value) for value in elo_probs),
                "poisson_probs": tuple(round4(value) for value in poisson_probs),
                "gradient_probs": tuple(round4(value) for value in gradient_probs),
                "features": features.to_named_dict(),
                "score_matrix_size": len(poisson_prediction.distribution_matrix),
            },
        )

    def predict_from_mapping(self, data: dict[str, Any]) -> IndustrialPrediction:
        return self.predict(MatchRecord.from_mapping(data))

    def reload(self) -> None:
        self.fusion = GradientBoostingFusionLayer(
            preferred_engine=self.fusion.preferred_engine,
            use_gpu=self.fusion.use_gpu,
        )
        self._load_artifacts()

    def _load_artifacts(self) -> None:
        if not self.artifacts_dir:
            return

        artifact_path = self.artifacts_dir / "gradient_boosting.pkl"
        if artifact_path.exists():
            try:
                self.fusion.load(artifact_path)
            except (ModuleNotFoundError, RuntimeError, OSError, KeyError, pickle_load_errors()):
                self.fusion = GradientBoostingFusionLayer(
                    preferred_engine=self.fusion.preferred_engine,
                    use_gpu=self.fusion.use_gpu,
                )


def classify_upset_risk(
    match: MatchRecord,
    probs: tuple[float, float, float],
    lambda_home: float,
    lambda_away: float,
) -> str:
    stronger_is_home = (match.home_elo + match.home_fifa_rating * 8) >= (match.away_elo + match.away_fifa_rating * 8)
    stronger_win_prob = probs[0] if stronger_is_home else probs[2]
    goal_edge = abs(lambda_home - lambda_away)
    underdog_xg = match.away_xg if stronger_is_home else match.home_xg
    underdog_xga = match.away_xga if stronger_is_home else match.home_xga

    if stronger_win_prob < 0.46 or (underdog_xg >= 1.45 and goal_edge < 0.45):
        return "high"
    if stronger_win_prob < 0.58 or underdog_xga < 1.0 or underdog_xg >= 1.20:
        return "medium"
    return "low"


def classify_game_style(total_expected_goals: float) -> str:
    if total_expected_goals < 2.15:
        return "defensive"
    if total_expected_goals > 3.10:
        return "open"
    return "balanced"


def build_trend(probs: tuple[float, float, float], lambda_home: float, lambda_away: float) -> list[dict[str, int]]:
    base = 50 + (probs[0] - probs[2]) * 35
    goal_pressure = (lambda_home - lambda_away) * 5
    points: list[dict[str, int]] = []
    for minute in range(0, 91, 15):
        home = int(round(clamp(base + goal_pressure * (minute / 90) + sin(minute / 18) * 4, 5, 95)))
        points.append({"minute": minute, "home_momentum": home, "away_momentum": 100 - home})
    return points


def pickle_load_errors() -> type[Exception]:
    try:
        import pickle

        return pickle.UnpicklingError
    except Exception:
        return RuntimeError


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def round2(value: float) -> float:
    return round(value, 2)


def round4(value: float) -> float:
    return round(value, 4)
