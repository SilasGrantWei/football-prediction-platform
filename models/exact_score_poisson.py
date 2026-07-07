from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PRIOR_PATH = ROOT / "data" / "worldcup" / "fifa_score_distribution.json"
HIST_PRIOR_PATH = ROOT / "data" / "worldcup" / "hist_score_priors.json"


@dataclass(frozen=True)
class TeamProfile:
    attack: float
    defense: float
    elo_rating: float
    fifa_rank: int | None = None
    confederation: str | None = None


@dataclass(frozen=True)
class ExactScoreMatch:
    match_id: str
    home_team: str
    away_team: str
    stage: str
    team_strength: Mapping[str, TeamProfile | Mapping[str, Any]]
    is_home: bool = False
    fifa_historical_prior_factor: float = 1.0


@dataclass(frozen=True)
class ScoreProbability:
    score: str
    probability: float
    home_goals: int
    away_goals: int


@dataclass(frozen=True)
class ExactScorePrediction:
    probability_matrix: list[list[float]]
    top3_scores: list[ScoreProbability]
    expected_goals_home: float
    expected_goals_away: float
    lambda_home: float
    lambda_away: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "probability_matrix": self.probability_matrix,
            "top3_scores": [asdict(item) for item in self.top3_scores],
            "expected_goals_home": self.expected_goals_home,
            "expected_goals_away": self.expected_goals_away,
            "lambda_home": self.lambda_home,
            "lambda_away": self.lambda_away,
        }


def compute_lambda(match: ExactScoreMatch) -> tuple[float, float]:
    home = _team_profile(match, match.home_team)
    away = _team_profile(match, match.away_team)
    stage = stage_factor(match.stage)
    prior_factor = clamp(match.fifa_historical_prior_factor, 0.80, 1.20)
    elo_diff = home.elo_rating - away.elo_rating

    lambda_home = (
        home.attack
        * away.defense
        * stage
        * elo_factor(elo_diff)
        * home_advantage(match.is_home)
        * prior_factor
    )
    lambda_away = away.attack * home.defense * stage * elo_factor(-elo_diff) * prior_factor

    return clamp(lambda_home, 0.05, 5.5), clamp(lambda_away, 0.05, 5.5)


def predict_exact_score(
    match: ExactScoreMatch,
    prior_path: str | Path | None = None,
    max_goals: int = 5,
) -> ExactScorePrediction:
    lambda_home, lambda_away = compute_lambda(match)
    return generate_score_distribution(lambda_home, lambda_away, prior_path=prior_path, max_goals=max_goals)


def generate_score_distribution(
    lambda_home: float,
    lambda_away: float,
    prior_path: str | Path | None = None,
    max_goals: int = 5,
) -> ExactScorePrediction:
    priors = load_fifa_score_distribution(prior_path, max_goals=max_goals)
    cells: list[ScoreProbability] = []
    raw_matrix: list[list[float]] = []

    for home_goals in range(max_goals + 1):
        row: list[float] = []
        for away_goals in range(max_goals + 1):
            score = f"{home_goals}-{away_goals}"
            probability = poisson(lambda_home, home_goals) * poisson(lambda_away, away_goals) * priors[score]
            row.append(probability)
            cells.append(ScoreProbability(score, probability, home_goals, away_goals))
        raw_matrix.append(row)

    total = sum(sum(row) for row in raw_matrix)
    if total <= 0:
        raise ValueError("Exact-score probability matrix cannot be normalized")

    probability_matrix = [[value / total for value in row] for row in raw_matrix]
    normalized_cells = [
        ScoreProbability(cell.score, probability_matrix[cell.home_goals][cell.away_goals], cell.home_goals, cell.away_goals)
        for cell in cells
    ]
    top3_scores = sorted(normalized_cells, key=lambda item: item.probability, reverse=True)[:3]
    expected_home = sum(item.home_goals * item.probability for item in normalized_cells)
    expected_away = sum(item.away_goals * item.probability for item in normalized_cells)

    return ExactScorePrediction(
        probability_matrix=probability_matrix,
        top3_scores=top3_scores,
        expected_goals_home=expected_home,
        expected_goals_away=expected_away,
        lambda_home=lambda_home,
        lambda_away=lambda_away,
    )


def load_fifa_score_distribution(
    prior_path: str | Path | None = None,
    max_goals: int = 5,
    floor: float = 0.0001,
) -> dict[str, float]:
    path = Path(prior_path) if prior_path is not None else DEFAULT_PRIOR_PATH
    payload = _read_json(path) if path.exists() else _read_json(HIST_PRIOR_PATH)
    raw_scores = _extract_score_pmf(payload)

    scores: dict[str, float] = {}
    for home_goals in range(max_goals + 1):
        for away_goals in range(max_goals + 1):
            score = f"{home_goals}-{away_goals}"
            scores[score] = max(float(raw_scores.get(score, 0.0)), floor)

    total = sum(scores.values())
    if total <= 0:
        raise ValueError(f"No usable FIFA score prior found at {path}")
    return {score: value / total for score, value in scores.items()}


def combo_score(legs: Sequence[ExactScorePrediction | Mapping[str, Any]]) -> dict[str, Any]:
    if len(legs) != 3:
        raise ValueError("Three-leg combo_score requires exactly 3 legs")

    top_scores = [_top1_score(leg) for leg in legs]
    top1_product = math.prod(item.probability for item in top_scores)
    penalty, reasons = correlation_penalty(top_scores, legs)

    return {
        "combo_score": top1_product * (1 - penalty),
        "top1_product": top1_product,
        "correlation_penalty": penalty,
        "penalty_reasons": reasons,
        "top1_scores": [asdict(item) for item in top_scores],
    }


def correlation_penalty(
    top_scores: Sequence[ScoreProbability],
    legs: Sequence[ExactScorePrediction | Mapping[str, Any]],
) -> tuple[float, list[str]]:
    penalty = 0.0
    reasons: list[str] = []

    if _has_duplicate(score_family(item.score) for item in top_scores):
        penalty += 0.05
        reasons.append("same_score_family")
    if _has_duplicate(goal_band(item.score) for item in top_scores):
        penalty += 0.05
        reasons.append("same_goal_band")
    if _has_duplicate(_elo_bucket_from_leg(leg) for leg in legs):
        penalty += 0.03
        reasons.append("same_elo_bucket")

    return min(penalty, 0.30), reasons


def stage_factor(stage: str) -> float:
    text = stage.lower()
    if "final" in text:
        return 0.90
    if "semi" in text or "qf" in text or "knockout" in text or "round" in text or "1/" in text:
        return 0.94
    return 1.02


def elo_factor(elo_diff: float) -> float:
    return math.exp(clamp(elo_diff, -450, 450) / 400 * 0.18)


def home_advantage(is_home: bool) -> float:
    return 1.06 if is_home else 1.0


def poisson(lambda_value: float, goals: int) -> float:
    return (math.pow(lambda_value, goals) * math.exp(-lambda_value)) / math.factorial(goals)


def score_family(score: str) -> str:
    home, away = _parse_score(score)
    if home > away:
        return "home_win"
    if home < away:
        return "away_win"
    return "draw"


def goal_band(score: str) -> str:
    home, away = _parse_score(score)
    total = home + away
    if total <= 1:
        return "low"
    if total <= 3:
        return "medium"
    return "high"


def clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def _team_profile(match: ExactScoreMatch, team: str) -> TeamProfile:
    raw = match.team_strength[team]
    if isinstance(raw, TeamProfile):
        return raw
    return TeamProfile(
        attack=float(raw["attack"]),
        defense=float(raw["defense"]),
        elo_rating=float(raw["elo_rating"]),
        fifa_rank=int(raw["fifa_rank"]) if raw.get("fifa_rank") is not None else None,
        confederation=str(raw["confederation"]) if raw.get("confederation") is not None else None,
    )


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"FIFA prior file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid FIFA prior JSON: {path}") from exc


def _extract_score_pmf(payload: Mapping[str, Any]) -> Mapping[str, Any]:
    if "scores" in payload and isinstance(payload["scores"], Mapping):
        return payload["scores"]
    if "pmf" in payload and isinstance(payload["pmf"], Mapping):
        return payload["pmf"]
    global_payload = payload.get("global")
    if isinstance(global_payload, Mapping) and isinstance(global_payload.get("pmf"), Mapping):
        return global_payload["pmf"]
    raise ValueError("FIFA score prior must contain scores, pmf, or global.pmf")


def _top1_score(leg: ExactScorePrediction | Mapping[str, Any]) -> ScoreProbability:
    if isinstance(leg, ExactScorePrediction):
        return leg.top3_scores[0]

    raw_scores = leg.get("top3_scores") or leg.get("top_scores") or leg.get("adjusted_top3")
    if not raw_scores:
        raise ValueError("Combo leg is missing top score data")
    first = raw_scores[0]
    if isinstance(first, ScoreProbability):
        return first
    home, away = _parse_score(str(first["score"]))
    return ScoreProbability(str(first["score"]).replace(":", "-"), float(first["probability"]), home, away)


def _elo_bucket_from_leg(leg: ExactScorePrediction | Mapping[str, Any]) -> str:
    if not isinstance(leg, Mapping):
        return "unknown"
    if "elo_bucket" in leg:
        return str(leg["elo_bucket"])

    home = leg.get("elo_home") or leg.get("home_elo")
    away = leg.get("elo_away") or leg.get("away_elo")
    if home is None or away is None:
        return "unknown"

    diff = abs(float(home) - float(away))
    if diff <= 60:
        return "balanced"
    if diff < 150:
        return "mid_gap"
    return "strong_gap"


def _has_duplicate(values: Sequence[str] | Any) -> bool:
    materialized = list(values)
    return len(set(materialized)) < len(materialized)


def _parse_score(score: str) -> tuple[int, int]:
    left, right = score.replace(":", "-").split("-", 1)
    return int(left), int(right)
