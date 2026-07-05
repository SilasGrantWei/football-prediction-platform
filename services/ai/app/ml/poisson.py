from __future__ import annotations

from dataclasses import dataclass
from math import exp, factorial

from app.ml.contracts import MatchRecord


@dataclass(frozen=True)
class ScoreProbability:
    score: str
    home_goals: int
    away_goals: int
    probability: float


@dataclass(frozen=True)
class PoissonPrediction:
    lambda_home: float
    lambda_away: float
    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    top_scores: list[ScoreProbability]
    distribution_matrix: list[ScoreProbability]


class PoissonGoalModel:
    def __init__(self, max_goals: int = 7, top_n: int = 5) -> None:
        self.max_goals = max_goals
        self.top_n = top_n

    def expected_goals(self, match: MatchRecord) -> tuple[float, float]:
        home_quality = (
            match.home_xg * 0.55
            + match.shots_home / 10.0 * 0.20
            + match.possession_home / 50.0 * 0.10
            + match.home_fifa_rating / 85.0 * 0.10
            + match.rest_days_home / 7.0 * 0.05
        )
        away_quality = (
            match.away_xg * 0.55
            + match.shots_away / 10.0 * 0.20
            + match.possession_away / 50.0 * 0.10
            + match.away_fifa_rating / 85.0 * 0.10
            + match.rest_days_away / 7.0 * 0.05
        )

        home_card_penalty = 1.0 - min(match.red_cards_home * 0.18 + match.yellow_cards_home * 0.015, 0.35)
        away_card_penalty = 1.0 - min(match.red_cards_away * 0.18 + match.yellow_cards_away * 0.015, 0.35)
        fifa_diff = (match.home_fifa_rating - match.away_fifa_rating) / 100.0
        elo_diff = (match.home_elo - match.away_elo) / 900.0

        home_defensive_leak = 1.0 + max(match.away_xga - 1.15, -0.35) * 0.18
        away_defensive_leak = 1.0 + max(match.home_xga - 1.15, -0.35) * 0.18
        home_context = tournament_goal_multiplier(
            match.group_points_home,
            match.group_goal_diff_home,
            match.travel_fatigue_home,
            match.knockout_pressure_home,
            match.squad_availability_home,
            match.tactical_transition_home,
            match.set_piece_home,
            match.volatility_home,
        )
        away_context = tournament_goal_multiplier(
            match.group_points_away,
            match.group_goal_diff_away,
            match.travel_fatigue_away,
            match.knockout_pressure_away,
            match.squad_availability_away,
            match.tactical_transition_away,
            match.set_piece_away,
            match.volatility_away,
        )

        lambda_home = clamp(home_quality * home_card_penalty * home_defensive_leak * home_context * (1.05 + fifa_diff + elo_diff), 0.15, 5.5)
        lambda_away = clamp(away_quality * away_card_penalty * away_defensive_leak * away_context * (0.98 - fifa_diff - elo_diff), 0.15, 5.5)
        return lambda_home, lambda_away

    def predict(self, match: MatchRecord) -> PoissonPrediction:
        lambda_home, lambda_away = self.expected_goals(match)
        matrix = self.score_matrix(lambda_home, lambda_away)
        total = sum(item.probability for item in matrix)
        home_win = sum(item.probability for item in matrix if item.home_goals > item.away_goals) / total
        draw = sum(item.probability for item in matrix if item.home_goals == item.away_goals) / total
        away_win = sum(item.probability for item in matrix if item.home_goals < item.away_goals) / total
        return PoissonPrediction(
            lambda_home=lambda_home,
            lambda_away=lambda_away,
            home_win_prob=home_win,
            draw_prob=draw,
            away_win_prob=away_win,
            top_scores=sorted(matrix, key=lambda item: item.probability, reverse=True)[: self.top_n],
            distribution_matrix=matrix,
        )

    def score_matrix(self, lambda_home: float, lambda_away: float) -> list[ScoreProbability]:
        scores: list[ScoreProbability] = []
        for home_goals in range(self.max_goals + 1):
            for away_goals in range(self.max_goals + 1):
                probability = poisson_pmf(home_goals, lambda_home) * poisson_pmf(away_goals, lambda_away)
                scores.append(
                    ScoreProbability(
                        score=f"{home_goals}-{away_goals}",
                        home_goals=home_goals,
                        away_goals=away_goals,
                        probability=probability,
                    )
                )
        return scores

    def simulate_goal_samples(
        self,
        lambda_home: float,
        lambda_away: float,
        samples: int = 10_000,
        seed: int | None = None,
    ) -> list[tuple[int, int]]:
        try:
            import numpy as np
        except ModuleNotFoundError as exc:
            raise RuntimeError("numpy is required for Poisson simulation. Install requirements-ml.txt.") from exc

        rng = np.random.default_rng(seed)
        home_goals = rng.poisson(lambda_home, samples)
        away_goals = rng.poisson(lambda_away, samples)
        return [(int(home), int(away)) for home, away in zip(home_goals, away_goals)]


def poisson_pmf(k: int, lambda_value: float) -> float:
    return (lambda_value**k * exp(-lambda_value)) / factorial(k)


def tournament_goal_multiplier(
    group_points: float,
    goal_diff: float,
    travel_fatigue: float,
    knockout_pressure: float,
    squad_availability: float,
    tactical_transition: float,
    set_piece: float,
    volatility: float,
) -> float:
    multiplier = 1.0
    multiplier += clamp(group_points, 0.0, 9.0) / 9.0 * 0.06
    multiplier += clamp(goal_diff, -6.0, 8.0) / 10.0 * 0.04
    multiplier += (squad_availability - 0.80) * 0.12
    multiplier += (tactical_transition - 0.50) * 0.08
    multiplier += (set_piece - 0.40) * 0.05
    multiplier -= travel_fatigue * 0.07
    multiplier -= knockout_pressure * 0.035
    multiplier -= volatility * 0.02
    return clamp(multiplier, 0.82, 1.18)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))
