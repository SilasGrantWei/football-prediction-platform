from __future__ import annotations

from dataclasses import dataclass, field
from math import log


@dataclass
class EloRatingModel:
    initial_rating: float = 1500.0
    k_factor: float = 32.0
    home_advantage: float = 60.0
    ratings: dict[str, float] = field(default_factory=dict)

    @staticmethod
    def win_probability(elo_a: float, elo_b: float) -> float:
        return 1.0 / (1.0 + 10.0 ** ((elo_b - elo_a) / 400.0))

    def get_rating(self, team: str) -> float:
        return self.ratings.get(team, self.initial_rating)

    def set_rating(self, team: str, rating: float) -> None:
        self.ratings[team] = rating

    def match_probabilities(self, home_team: str, away_team: str, home_elo: float | None = None, away_elo: float | None = None) -> tuple[float, float, float]:
        home_rating = home_elo if home_elo is not None else self.get_rating(home_team)
        away_rating = away_elo if away_elo is not None else self.get_rating(away_team)
        home_raw = self.win_probability(home_rating + self.home_advantage, away_rating)
        away_raw = self.win_probability(away_rating, home_rating + self.home_advantage)
        closeness = 1.0 - min(abs((home_rating + self.home_advantage) - away_rating) / 600.0, 1.0)
        draw = 0.16 + 0.13 * closeness
        remainder = 1.0 - draw
        home = home_raw / (home_raw + away_raw) * remainder
        away = away_raw / (home_raw + away_raw) * remainder
        return home, draw, away

    def update_match(self, home_team: str, away_team: str, home_goals: int, away_goals: int) -> tuple[float, float]:
        home_rating = self.get_rating(home_team)
        away_rating = self.get_rating(away_team)
        expected_home = self.win_probability(home_rating + self.home_advantage, away_rating)
        actual_home = 1.0 if home_goals > away_goals else 0.5 if home_goals == away_goals else 0.0
        goal_margin = abs(home_goals - away_goals)
        margin_multiplier = 1.0 if goal_margin <= 1 else log(goal_margin + 1.0)
        change = self.k_factor * margin_multiplier * (actual_home - expected_home)
        self.ratings[home_team] = home_rating + change
        self.ratings[away_team] = away_rating - change
        return self.ratings[home_team], self.ratings[away_team]
