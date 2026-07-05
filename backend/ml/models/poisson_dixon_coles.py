from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class ScoreProbability:
    score: str
    probability: float


def poisson_probability(lam: float, goals: int) -> float:
    return math.exp(-lam) * lam**goals / math.factorial(goals)


def dixon_coles_adjustment(home_goals: int, away_goals: int, lambda_home: float, lambda_away: float, rho: float = -0.08) -> float:
    if home_goals == 0 and away_goals == 0:
        return 1 - lambda_home * lambda_away * rho
    if home_goals == 0 and away_goals == 1:
        return 1 + lambda_home * rho
    if home_goals == 1 and away_goals == 0:
        return 1 + lambda_away * rho
    if home_goals == 1 and away_goals == 1:
        return 1 - rho
    return 1.0


def score_matrix(lambda_home: float, lambda_away: float, max_goals: int = 7) -> list[list[float]]:
    matrix: list[list[float]] = []
    for home_goals in range(max_goals + 1):
        row: list[float] = []
        for away_goals in range(max_goals + 1):
            base = poisson_probability(lambda_home, home_goals) * poisson_probability(lambda_away, away_goals)
            adjusted = base * dixon_coles_adjustment(home_goals, away_goals, lambda_home, lambda_away)
            row.append(max(adjusted, 0.0))
        matrix.append(row)
    total = sum(sum(row) for row in matrix) or 1.0
    return [[value / total for value in row] for row in matrix]


def three_way_from_matrix(matrix: list[list[float]]) -> tuple[float, float, float]:
    home = draw = away = 0.0
    for i, row in enumerate(matrix):
        for j, probability in enumerate(row):
            if i > j:
                home += probability
            elif i == j:
                draw += probability
            else:
                away += probability
    return home, draw, away


def top_scores(matrix: list[list[float]], n: int = 5) -> list[ScoreProbability]:
    scores: list[ScoreProbability] = []
    for home_goals, row in enumerate(matrix):
        for away_goals, probability in enumerate(row):
            scores.append(ScoreProbability(f"{home_goals}-{away_goals}", round(probability, 5)))
    return sorted(scores, key=lambda item: item.probability, reverse=True)[:n]
