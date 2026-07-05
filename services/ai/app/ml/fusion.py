from __future__ import annotations

import pickle
from dataclasses import dataclass
from math import exp
from pathlib import Path
from typing import Sequence

from app.ml.contracts import MatchRecord, normalized_form
from app.ml.poisson import PoissonPrediction

OutcomeProbs = tuple[float, float, float]

GRADIENT_FEATURE_NAMES = [
    "elo_diff",
    "elo_home_prob",
    "recent5_form_diff",
    "xg_diff",
    "xga_diff",
    "shots_diff",
    "possession_diff",
    "yellow_card_diff",
    "red_card_diff",
    "rest_days_diff",
    "home_advantage",
    "group_points_diff",
    "group_goal_diff",
    "travel_fatigue_diff",
    "knockout_pressure_diff",
    "squad_availability_diff",
    "tactical_transition_diff",
    "set_piece_diff",
    "volatility_diff",
    "poisson_goal_diff",
    "team_strength_diff",
]


@dataclass(frozen=True)
class FusionFeatures:
    elo_diff: float
    elo_home_prob: float
    recent5_form_diff: float
    xg_diff: float
    xga_diff: float
    shots_diff: float
    possession_diff: float
    yellow_card_diff: float
    red_card_diff: float
    rest_days_diff: float
    home_advantage: float
    group_points_diff: float
    group_goal_diff: float
    travel_fatigue_diff: float
    knockout_pressure_diff: float
    squad_availability_diff: float
    tactical_transition_diff: float
    set_piece_diff: float
    volatility_diff: float
    poisson_goal_diff: float
    team_strength_diff: float

    def to_vector(self) -> list[float]:
        return [
            self.elo_diff,
            self.elo_home_prob,
            self.recent5_form_diff,
            self.xg_diff,
            self.xga_diff,
            self.shots_diff,
            self.possession_diff,
            self.yellow_card_diff,
            self.red_card_diff,
            self.rest_days_diff,
            self.home_advantage,
            self.group_points_diff,
            self.group_goal_diff,
            self.travel_fatigue_diff,
            self.knockout_pressure_diff,
            self.squad_availability_diff,
            self.tactical_transition_diff,
            self.set_piece_diff,
            self.volatility_diff,
            self.poisson_goal_diff,
            self.team_strength_diff,
        ]

    def to_named_dict(self) -> dict[str, float]:
        return dict(zip(GRADIENT_FEATURE_NAMES, self.to_vector()))


class GradientBoostingFusionLayer:
    def __init__(self, preferred_engine: str = "lightgbm", use_gpu: bool = False) -> None:
        self.preferred_engine = preferred_engine
        self.use_gpu = use_gpu
        self.engine: str | None = None
        self._model = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def fit(self, features: Sequence[FusionFeatures], labels: Sequence[int]) -> None:
        if not features:
            raise ValueError("training features are empty")
        if len(features) != len(labels):
            raise ValueError("features and labels length mismatch")

        vectors = as_model_input(features)
        label_values = list(labels)

        if self.preferred_engine == "lightgbm":
            try:
                self._fit_lightgbm(vectors, label_values)
                return
            except ModuleNotFoundError:
                pass

        self._fit_xgboost(vectors, label_values)

    def _fit_lightgbm(self, vectors: list[list[float]], labels: list[int]) -> None:
        from lightgbm import LGBMClassifier

        model = LGBMClassifier(
            objective="multiclass",
            num_class=3,
            n_estimators=260,
            max_depth=-1,
            learning_rate=0.035,
            subsample=0.9,
            colsample_bytree=0.9,
            reg_lambda=1.2,
            min_data_in_leaf=1,
            min_data_in_bin=1,
            verbosity=-1,
            random_state=42,
            device_type="gpu" if self.use_gpu else "cpu",
        )
        model.fit(vectors, labels)
        self.engine = "lightgbm"
        self._model = model

    def _fit_xgboost(self, vectors: list[list[float]], labels: list[int]) -> None:
        try:
            from xgboost import XGBClassifier
        except ModuleNotFoundError as exc:
            raise RuntimeError("LightGBM or XGBoost is required for training. Install requirements-ml.txt.") from exc

        model = XGBClassifier(
            objective="multi:softprob",
            num_class=3,
            n_estimators=220,
            max_depth=4,
            learning_rate=0.045,
            subsample=0.9,
            colsample_bytree=0.9,
            eval_metric="mlogloss",
            tree_method="hist",
            device="cuda" if self.use_gpu else "cpu",
        )
        try:
            model.fit(vectors, labels)
        except TypeError:
            model.set_params(tree_method="gpu_hist" if self.use_gpu else "hist")
            model.fit(vectors, labels)
        self.engine = "xgboost"
        self._model = model

    def load(self, path: str | Path) -> None:
        with Path(path).open("rb") as handle:
            payload = pickle.load(handle)
        self.engine = payload["engine"]
        self._model = payload["model"]

    def save(self, path: str | Path) -> None:
        if self._model is None:
            raise RuntimeError("fusion model is not trained")
        artifact_path = Path(path)
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        with artifact_path.open("wb") as handle:
            pickle.dump({"engine": self.engine, "model": self._model}, handle)

    def predict_proba(self, features: FusionFeatures) -> OutcomeProbs:
        if self._model is None:
            raise RuntimeError("fusion model is not loaded")

        raw = self._model.predict_proba(as_model_input([features]))[0]
        classes = list(getattr(self._model, "classes_", [0, 1, 2]))
        by_class = {int(label): float(probability) for label, probability in zip(classes, raw)}
        return normalize((by_class.get(0, 0.0), by_class.get(1, 0.0), by_class.get(2, 0.0)))


XGBoostFusionLayer = GradientBoostingFusionLayer


def build_fusion_features(
    match: MatchRecord,
    elo_probs: OutcomeProbs,
    poisson_prediction: PoissonPrediction,
) -> FusionFeatures:
    return FusionFeatures(
        elo_diff=match.home_elo - match.away_elo,
        elo_home_prob=elo_probs[0],
        recent5_form_diff=normalized_form(match.recent5_form_home) - normalized_form(match.recent5_form_away),
        xg_diff=match.home_xg - match.away_xg,
        xga_diff=match.away_xga - match.home_xga,
        shots_diff=float(match.shots_home - match.shots_away),
        possession_diff=match.possession_home - match.possession_away,
        yellow_card_diff=float(match.yellow_cards_away - match.yellow_cards_home),
        red_card_diff=float(match.red_cards_away - match.red_cards_home),
        rest_days_diff=float(match.rest_days_home - match.rest_days_away),
        home_advantage=match.home_advantage,
        group_points_diff=match.group_points_home - match.group_points_away,
        group_goal_diff=match.group_goal_diff_home - match.group_goal_diff_away,
        travel_fatigue_diff=match.travel_fatigue_away - match.travel_fatigue_home,
        knockout_pressure_diff=match.knockout_pressure_away - match.knockout_pressure_home,
        squad_availability_diff=match.squad_availability_home - match.squad_availability_away,
        tactical_transition_diff=match.tactical_transition_home - match.tactical_transition_away,
        set_piece_diff=match.set_piece_home - match.set_piece_away,
        volatility_diff=match.volatility_away - match.volatility_home,
        poisson_goal_diff=poisson_prediction.lambda_home - poisson_prediction.lambda_away,
        team_strength_diff=match.team_strength_diff,
    )


def as_model_input(features: Sequence[FusionFeatures]):
    try:
        import pandas as pd
    except ModuleNotFoundError:
        return [item.to_vector() for item in features]

    return pd.DataFrame([item.to_named_dict() for item in features], columns=GRADIENT_FEATURE_NAMES)


def fallback_gradient_probs(features: FusionFeatures) -> OutcomeProbs:
    home_signal = (
        features.elo_diff / 260.0
        + features.recent5_form_diff * 1.15
        + features.xg_diff * 0.65
        + features.xga_diff * 0.42
        + features.shots_diff / 18.0 * 0.35
        + features.possession_diff / 30.0 * 0.18
        + features.rest_days_diff * 0.045
        + features.home_advantage * 0.16
        + features.group_points_diff / 9.0 * 0.48
        + features.group_goal_diff / 8.0 * 0.30
        + features.travel_fatigue_diff * 0.26
        + features.knockout_pressure_diff * 0.16
        + features.squad_availability_diff * 0.58
        + features.tactical_transition_diff * 0.20
        + features.set_piece_diff * 0.16
        + features.volatility_diff * 0.14
        + features.red_card_diff * 0.55
        + features.yellow_card_diff * 0.055
    )
    away_signal = -home_signal
    draw_signal = 0.22 - abs(home_signal) * 0.42 - abs(features.poisson_goal_diff) * 0.12
    return softmax((home_signal, draw_signal, away_signal))


def final_fusion(
    gradient_probs: OutcomeProbs,
    elo_probs: OutcomeProbs,
    poisson_probs: OutcomeProbs,
) -> OutcomeProbs:
    rating_correction = normalize(
        (
            elo_probs[0] * 0.70 + poisson_probs[0] * 0.30,
            elo_probs[1] * 0.70 + poisson_probs[1] * 0.30,
            elo_probs[2] * 0.70 + poisson_probs[2] * 0.30,
        )
    )
    return normalize(
        (
            gradient_probs[0] * 0.60 + rating_correction[0] * 0.40,
            gradient_probs[1] * 0.60 + rating_correction[1] * 0.40,
            gradient_probs[2] * 0.60 + rating_correction[2] * 0.40,
        )
    )


def normalize(values: OutcomeProbs) -> OutcomeProbs:
    total = sum(values)
    if total <= 0:
        return 1 / 3, 1 / 3, 1 / 3
    return values[0] / total, values[1] / total, values[2] / total


def softmax(values: OutcomeProbs) -> OutcomeProbs:
    maximum = max(values)
    exps = tuple(exp(value - maximum) for value in values)
    return normalize((exps[0], exps[1], exps[2]))
