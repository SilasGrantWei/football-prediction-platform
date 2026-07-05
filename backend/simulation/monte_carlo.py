from __future__ import annotations

import random
from collections import Counter
from typing import Any

from db import db_connection
from ml.feature_store import build_online_prediction


def simulate_tournament(iterations: int = 10_000, seed: int = 42) -> dict[str, Any]:
    rng = random.Random(seed)
    fixtures = load_fixtures()
    if not fixtures:
        return {"iterations": iterations, "champion_probability": [], "semifinal_probability": [], "upset_probability": 0.0}

    champion_counter: Counter[str] = Counter()
    semifinal_counter: Counter[str] = Counter()
    upset_count = 0

    for _ in range(iterations):
        winners_by_match: dict[str, str] = {}
        stage_winners: list[str] = []
        for fixture in fixtures:
            winner, upset = simulate_match(fixture, rng)
            winners_by_match[fixture["id"]] = winner
            stage_winners.append(winner)
            upset_count += int(upset)
            if fixture["stage"] in {"sf", "final"}:
                semifinal_counter[winner] += 1
        if stage_winners:
            champion_counter[stage_winners[-1]] += 1

    return {
        "iterations": iterations,
        "champion_probability": normalize_counter(champion_counter, iterations),
        "semifinal_probability": normalize_counter(semifinal_counter, max(iterations, 1)),
        "dark_horse_probability": [
            item for item in normalize_counter(champion_counter, iterations) if item["team_rating"] < 80
        ],
        "upset_probability": round(upset_count / max(iterations * len(fixtures), 1), 5),
    }


def load_fixtures() -> list[dict[str, Any]]:
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
              m.id,
              m.stage,
              m.home_team_id,
              m.away_team_id,
              ht.name,
              at.name,
              ht.fifa_rating,
              at.fifa_rating,
              m.status,
              m.home_score,
              m.away_score
            FROM matches m
            JOIN teams ht ON ht.id = m.home_team_id
            JOIN teams at ON at.id = m.away_team_id
            WHERE m.stage IN ('r32', 'r16', 'qf', 'sf', 'third_place', 'final')
            ORDER BY COALESCE(m.kickoff_time, m.start_time) ASC
            """
        ).fetchall()
    return [
        {
            "id": row[0],
            "stage": row[1],
            "home_team_id": row[2],
            "away_team_id": row[3],
            "home_team": row[4],
            "away_team": row[5],
            "home_rating": float(row[6]),
            "away_rating": float(row[7]),
            "status": row[8],
            "home_score": int(row[9]),
            "away_score": int(row[10]),
        }
        for row in rows
    ]


def simulate_match(fixture: dict[str, Any], rng: random.Random) -> tuple[str, bool]:
    if fixture["status"] == "finished" and fixture["home_score"] != fixture["away_score"]:
        winner = fixture["home_team"] if fixture["home_score"] > fixture["away_score"] else fixture["away_team"]
        favorite = fixture["home_team"] if fixture["home_rating"] >= fixture["away_rating"] else fixture["away_team"]
        return winner, winner != favorite

    prediction = build_online_prediction(fixture["id"])
    if prediction:
        probs = [prediction["p_home"], prediction["p_draw"], prediction["p_away"]]
    else:
        home_edge = 0.5 + (fixture["home_rating"] - fixture["away_rating"]) / 80
        probs = [max(0.15, min(0.75, home_edge)), 0.24, max(0.15, min(0.75, 1 - home_edge))]
        total = sum(probs)
        probs = [p / total for p in probs]

    draw_adjusted = [probs[0] + probs[1] * 0.5, probs[2] + probs[1] * 0.5]
    draw_total = sum(draw_adjusted)
    pick_home = rng.random() < draw_adjusted[0] / draw_total
    winner = fixture["home_team"] if pick_home else fixture["away_team"]
    favorite = fixture["home_team"] if fixture["home_rating"] >= fixture["away_rating"] else fixture["away_team"]
    return winner, winner != favorite


def normalize_counter(counter: Counter[str], divisor: int) -> list[dict[str, Any]]:
    ratings = load_team_ratings()
    return [
        {"team": team, "probability": round(count / divisor, 5), "team_rating": ratings.get(team, 75.0)}
        for team, count in counter.most_common()
    ]


def load_team_ratings() -> dict[str, float]:
    with db_connection() as conn:
        rows = conn.execute("SELECT name, fifa_rating FROM teams").fetchall()
    return {row[0]: float(row[1]) for row in rows}


if __name__ == "__main__":
    print(simulate_tournament(1000))
