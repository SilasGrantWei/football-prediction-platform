from __future__ import annotations

from datetime import UTC, datetime
from math import exp, factorial

from app.schemas import GameStyle, PredictionRequest, PredictionResponse, ScorePrediction, TeamInput, UpsetRisk


MODEL_VERSION = "fastapi-poisson-rule-v2"


def predict_match(payload: PredictionRequest) -> PredictionResponse:
    home_strength = team_strength(payload.home_team)
    away_strength = team_strength(payload.away_team)

    expected_home_goals = expected_goals(
        attacker=payload.home_team,
        defender=payload.away_team,
        attack_strength=home_strength,
        defense_strength=away_strength,
        venue_factor=1.025,
    )
    expected_away_goals = expected_goals(
        attacker=payload.away_team,
        defender=payload.home_team,
        attack_strength=away_strength,
        defense_strength=home_strength,
        venue_factor=0.99,
    )

    poisson_home, poisson_draw, poisson_away = outcome_probabilities(expected_home_goals, expected_away_goals)
    prior_home, prior_draw, prior_away = strength_outcome_prior(home_strength, away_strength)
    home_win_prob, draw_prob, away_win_prob = normalize(
        [
            poisson_home * 0.76 + prior_home * 0.24,
            poisson_draw * 0.82 + prior_draw * 0.18,
            poisson_away * 0.76 + prior_away * 0.24,
        ]
    )

    return PredictionResponse(
        match_id=payload.match_id,
        home_win_prob=round4(home_win_prob),
        draw_prob=round4(draw_prob),
        away_win_prob=round4(away_win_prob),
        top_scores=top_scores(expected_home_goals, expected_away_goals),
        game_style=classify_style(expected_home_goals + expected_away_goals),
        upset_risk=classify_upset_risk(
            payload=payload,
            home_strength=home_strength,
            away_strength=away_strength,
            home_win_prob=home_win_prob,
            away_win_prob=away_win_prob,
        ),
        expected_home_goals=round2(expected_home_goals),
        expected_away_goals=round2(expected_away_goals),
        generated_at=datetime.now(UTC),
        model_version=MODEL_VERSION,
    )


def team_strength(team: TeamInput) -> float:
    return (
        team.rating * 0.34
        + team.form * 0.24
        + team.defense_avg * 0.16
        + team.attack_avg * 8.5
        + (2.1 - team.xga) * 5.5
    )


def expected_goals(
    attacker: TeamInput,
    defender: TeamInput,
    attack_strength: float,
    defense_strength: float,
    venue_factor: float,
) -> float:
    attack_index = 1 + (attacker.attack_avg - 1.45) * 0.28 + (attacker.form - 75) * 0.006
    defense_leak = 1 + (100 - defender.defense_avg) * 0.01 + (defender.xga - 1.1) * 0.34
    strength_factor = clamp(1 + (attack_strength - defense_strength) / 150, 0.78, 1.28)
    return clamp(attacker.attack_avg * attack_index * defense_leak * strength_factor * venue_factor * 1.02, 0.18, 5.2)


def strength_outcome_prior(home_strength: float, away_strength: float) -> tuple[float, float, float]:
    diff = home_strength - away_strength
    home, draw, away = softmax([diff / 9 + 0.15, 0.10 - abs(diff) / 24, -diff / 9])
    return home, draw, away


def outcome_probabilities(home_lambda: float, away_lambda: float) -> tuple[float, float, float]:
    matrix = score_matrix(home_lambda, away_lambda, 7)
    total = sum(probability for _, _, probability in matrix)
    home = sum(probability for home_goals, away_goals, probability in matrix if home_goals > away_goals) / total
    draw = sum(probability for home_goals, away_goals, probability in matrix if home_goals == away_goals) / total
    away = sum(probability for home_goals, away_goals, probability in matrix if home_goals < away_goals) / total
    return home, draw, away


def normalize(values: list[float]) -> list[float]:
    total = sum(values)
    return [value / total for value in values]


def softmax(values: list[float]) -> list[float]:
    max_value = max(values)
    exps = [exp(value - max_value) for value in values]
    total = sum(exps)
    return [value / total for value in exps]


def poisson(k: int, lambda_value: float) -> float:
    return (lambda_value**k * exp(-lambda_value)) / factorial(k)


def score_matrix(home_lambda: float, away_lambda: float, max_goals: int) -> list[tuple[int, int, float]]:
    scores: list[tuple[int, int, float]] = []
    for home_goals in range(0, max_goals + 1):
        for away_goals in range(0, max_goals + 1):
            scores.append((home_goals, away_goals, poisson(home_goals, home_lambda) * poisson(away_goals, away_lambda)))
    return scores


def top_scores(home_lambda: float, away_lambda: float) -> list[ScorePrediction]:
    score_probs = sorted(score_matrix(home_lambda, away_lambda, 7), key=lambda item: item[2], reverse=True)
    return [
        ScorePrediction(score=f"{home_goals}-{away_goals}", probability=round4(probability))
        for home_goals, away_goals, probability in score_probs[:3]
    ]


def classify_style(total_expected_goals: float) -> GameStyle:
    if total_expected_goals < 2.25:
        return "defensive"
    if total_expected_goals > 3.15:
        return "open"
    return "balanced"


def classify_upset_risk(
    payload: PredictionRequest,
    home_strength: float,
    away_strength: float,
    home_win_prob: float,
    away_win_prob: float,
) -> UpsetRisk:
    stronger_is_home = home_strength >= away_strength
    stronger_win_prob = home_win_prob if stronger_is_home else away_win_prob
    underdog = payload.away_team if stronger_is_home else payload.home_team
    underdog_can_defend = underdog.xga < 1.05 or underdog.defense_avg >= 78
    underdog_can_break = underdog.attack_avg >= 1.35 or underdog.form >= 78

    if stronger_win_prob < 0.46 or (underdog_can_defend and underdog_can_break):
        return "high"
    if stronger_win_prob < 0.58 or underdog_can_defend or underdog_can_break:
        return "medium"
    return "low"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def round2(value: float) -> float:
    return round(value, 2)


def round4(value: float) -> float:
    return round(value, 4)
