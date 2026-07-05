from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "matches.csv"


def load_matches(path: Path = DATA_PATH) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def team_summary(name: str) -> dict[str, Any]:
    normalized = name.strip().lower()
    rows = load_matches()
    played = wins = draws = losses = goals_for = goals_against = 0
    recent_results: list[str] = []

    for row in rows:
        home = row.get("home_team", "")
        away = row.get("away_team", "")
        if home.lower() != normalized and away.lower() != normalized:
            continue

        home_score = int(row.get("home_goals", row.get("home_score", 0)) or 0)
        away_score = int(row.get("away_goals", row.get("away_score", 0)) or 0)
        is_home = home.lower() == normalized
        team_goals = home_score if is_home else away_score
        opponent_goals = away_score if is_home else home_score

        played += 1
        goals_for += team_goals
        goals_against += opponent_goals
        if team_goals > opponent_goals:
            wins += 1
            recent_results.append("W")
        elif team_goals == opponent_goals:
            draws += 1
            recent_results.append("D")
        else:
            losses += 1
            recent_results.append("L")

    return {
        "team": name,
        "matches": played,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "goals_for": goals_for,
        "goals_against": goals_against,
        "recent_form": recent_results[-5:],
        "source": str(DATA_PATH),
    }
