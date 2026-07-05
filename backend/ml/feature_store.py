from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from db import db_connection
from ml.models.elo import three_way_from_elo
from ml.models.poisson_dixon_coles import score_matrix, three_way_from_matrix, top_scores


@dataclass(frozen=True)
class MatchFeatureRow:
    match_id: str
    kickoff_time: datetime
    label: int | None
    features: dict[str, float]


def load_feature_rows(include_unfinished: bool = False) -> list[MatchFeatureRow]:
    with db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
              m.id,
              COALESCE(m.kickoff_time, m.start_time) AS kickoff_time,
              m.home_score,
              m.away_score,
              m.status,
              ht.fifa_rating,
              at.fifa_rating,
              ht.recent_form,
              at.recent_form,
              ht.attack_avg,
              at.attack_avg,
              ht.defense_avg,
              at.defense_avg,
              ht.xga,
              at.xga,
              COALESCE(o.home_implied_prob, 0.0),
              COALESCE(o.draw_implied_prob, 0.0),
              COALESCE(o.away_implied_prob, 0.0)
            FROM matches m
            JOIN teams ht ON ht.id = m.home_team_id
            JOIN teams at ON at.id = m.away_team_id
            LEFT JOIN LATERAL (
              SELECT home_implied_prob, draw_implied_prob, away_implied_prob
              FROM odds_snapshots
              WHERE match_id = m.id
              ORDER BY timestamp DESC, id DESC
              LIMIT 1
            ) o ON TRUE
            WHERE (%s OR m.status = 'finished')
            ORDER BY COALESCE(m.kickoff_time, m.start_time) ASC
            """,
            (include_unfinished,),
        ).fetchall()

    feature_rows: list[MatchFeatureRow] = []
    for row in rows:
        home_score = int(row[2] or 0)
        away_score = int(row[3] or 0)
        label = None
        if row[4] == "finished":
            label = 0 if home_score > away_score else 1 if home_score == away_score else 2

        home_rating = float(row[5])
        away_rating = float(row[6])
        lambda_home = max(0.25, float(row[9]) * (100 - float(row[14])) / 100)
        lambda_away = max(0.25, float(row[10]) * (100 - float(row[13])) / 100)
        poisson_home, poisson_draw, poisson_away = three_way_from_matrix(score_matrix(lambda_home, lambda_away))
        elo_home, elo_draw, elo_away = three_way_from_elo(home_rating * 18, away_rating * 18)

        feature_rows.append(
            MatchFeatureRow(
                match_id=row[0],
                kickoff_time=row[1],
                label=label,
                features={
                    "rating_diff": home_rating - away_rating,
                    "form_diff": float(row[7]) - float(row[8]),
                    "attack_diff": float(row[9]) - float(row[10]),
                    "defense_diff": float(row[11]) - float(row[12]),
                    "xga_diff": float(row[13]) - float(row[14]),
                    "market_home": float(row[15]),
                    "market_draw": float(row[16]),
                    "market_away": float(row[17]),
                    "poisson_home": poisson_home,
                    "poisson_draw": poisson_draw,
                    "poisson_away": poisson_away,
                    "elo_home": elo_home,
                    "elo_draw": elo_draw,
                    "elo_away": elo_away,
                },
            )
        )
    return feature_rows


def build_online_prediction(match_id: str) -> dict[str, Any] | None:
    rows = [row for row in load_feature_rows(include_unfinished=True) if row.match_id == match_id]
    if not rows:
        return None
    row = rows[0]
    features = row.features
    lgbm_probs = normalize_probs([features["poisson_home"], features["poisson_draw"], features["poisson_away"]])
    elo_probs = normalize_probs([features["elo_home"], features["elo_draw"], features["elo_away"]])
    market_probs = normalize_probs([features["market_home"], features["market_draw"], features["market_away"]])
    if sum(market_probs) == 0:
        market_probs = [1 / 3, 1 / 3, 1 / 3]

    final = normalize_probs(
        [
            0.35 * lgbm_probs[0] + 0.30 * elo_probs[0] + 0.35 * market_probs[0],
            0.35 * lgbm_probs[1] + 0.30 * elo_probs[1] + 0.35 * market_probs[1],
            0.35 * lgbm_probs[2] + 0.30 * elo_probs[2] + 0.35 * market_probs[2],
        ]
    )
    value = {
        "home": round(final[0] - market_probs[0], 4),
        "draw": round(final[1] - market_probs[1], 4),
        "away": round(final[2] - market_probs[2], 4),
    }
    confidence = round(max(final) - sorted(final)[-2], 4)
    lambda_home = max(0.25, 1.25 + features["attack_diff"] * 0.25 + features["rating_diff"] * 0.015)
    lambda_away = max(0.25, 1.15 - features["attack_diff"] * 0.2 - features["rating_diff"] * 0.012)
    matrix = score_matrix(lambda_home, lambda_away)

    return {
        "match_id": match_id,
        "p_home": round(final[0], 5),
        "p_draw": round(final[1], 5),
        "p_away": round(final[2], 5),
        "expected_goals": {"home": round(lambda_home, 2), "away": round(lambda_away, 2)},
        "score_distribution": [item.__dict__ for item in top_scores(matrix, n=5)],
        "confidence_score": confidence,
        "value_bet": value,
        "upset_risk": upset_risk(final, features["rating_diff"]),
    }


def normalize_probs(values: list[float]) -> list[float]:
    total = sum(max(value, 0.0) for value in values)
    if total <= 0:
        return [0.0 for _ in values]
    return [max(value, 0.0) / total for value in values]


def upset_risk(probs: list[float], rating_diff: float) -> str:
    favorite_prob = probs[0] if rating_diff >= 0 else probs[2]
    if favorite_prob < 0.48:
        return "high"
    if favorite_prob < 0.60:
        return "medium"
    return "low"
