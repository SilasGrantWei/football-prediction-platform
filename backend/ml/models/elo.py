from __future__ import annotations

import math


def win_probability(home_elo: float, away_elo: float, home_advantage: float = 55.0) -> float:
    diff = home_elo + home_advantage - away_elo
    return 1.0 / (1.0 + 10.0 ** (-diff / 400.0))


def update_elo(home_elo: float, away_elo: float, home_goals: int, away_goals: int, k: float = 24.0) -> tuple[float, float]:
    expected_home = win_probability(home_elo, away_elo)
    if home_goals > away_goals:
        actual_home = 1.0
    elif home_goals == away_goals:
        actual_home = 0.5
    else:
        actual_home = 0.0
    goal_margin = abs(home_goals - away_goals)
    margin_multiplier = math.log(goal_margin + 1.0) * (2.2 / ((home_elo - away_elo) * 0.001 + 2.2)) if goal_margin else 1.0
    delta = k * margin_multiplier * (actual_home - expected_home)
    return round(home_elo + delta, 3), round(away_elo - delta, 3)


def three_way_from_elo(home_elo: float, away_elo: float) -> tuple[float, float, float]:
    home = win_probability(home_elo, away_elo)
    draw = max(0.18, min(0.32, 0.28 - abs(home - 0.5) * 0.18))
    home_adj = home * (1 - draw)
    away_adj = (1 - home) * (1 - draw)
    total = home_adj + draw + away_adj
    return home_adj / total, draw / total, away_adj / total
