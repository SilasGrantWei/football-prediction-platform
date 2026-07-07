from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from models.exact_score_poisson import (  # noqa: E402
    ExactScoreMatch,
    TeamProfile,
    combo_score,
    compute_lambda,
    predict_exact_score,
)
from services.parlay_3x1_ranker import rank_3x1_combinations  # noqa: E402


class ExactScorePoissonTest(unittest.TestCase):
    def test_prediction_returns_normalized_full_matrix_and_top3(self) -> None:
        match = ExactScoreMatch(
            match_id="m1",
            home_team="Home",
            away_team="Away",
            stage="group",
            is_home=True,
            team_strength={
                "Home": TeamProfile(attack=1.6, defense=0.95, elo_rating=1700),
                "Away": TeamProfile(attack=1.1, defense=1.20, elo_rating=1540),
            },
        )

        prediction = predict_exact_score(match)
        total = sum(sum(row) for row in prediction.probability_matrix)

        self.assertEqual(len(prediction.probability_matrix), 6)
        self.assertTrue(all(len(row) == 6 for row in prediction.probability_matrix))
        self.assertAlmostEqual(total, 1.0)
        self.assertEqual(len(prediction.top3_scores), 3)
        self.assertGreaterEqual(prediction.top3_scores[0].probability, prediction.top3_scores[1].probability)
        self.assertGreater(prediction.expected_goals_home, prediction.expected_goals_away)

    def test_compute_lambda_uses_elo_direction(self) -> None:
        stronger_home = ExactScoreMatch(
            match_id="m2",
            home_team="Home",
            away_team="Away",
            stage="knockout",
            team_strength={
                "Home": {"attack": 1.4, "defense": 0.95, "elo_rating": 1750},
                "Away": {"attack": 1.4, "defense": 0.95, "elo_rating": 1500},
            },
        )

        lambda_home, lambda_away = compute_lambda(stronger_home)

        self.assertGreater(lambda_home, lambda_away)

    def test_combo_score_uses_top1_product_and_penalties(self) -> None:
        result = combo_score(
            [
                {"top3_scores": [{"score": "1-0", "probability": 0.2}], "elo_bucket": "balanced"},
                {"top3_scores": [{"score": "2-0", "probability": 0.15}], "elo_bucket": "balanced"},
                {"top3_scores": [{"score": "1-1", "probability": 0.1}], "elo_bucket": "mid_gap"},
            ]
        )

        self.assertAlmostEqual(result["top1_product"], 0.003)
        self.assertAlmostEqual(result["correlation_penalty"], 0.13)
        self.assertAlmostEqual(result["combo_score"], 0.00261)
        self.assertEqual(result["penalty_reasons"], ["same_score_family", "same_goal_band", "same_elo_bucket"])

    def test_parlay_ranker_formula_uses_top1_not_top3_mass_or_edge(self) -> None:
        matches = [
            _parlay_match("a", "1-0", 0.20, "balanced"),
            _parlay_match("b", "2-0", 0.15, "balanced"),
            _parlay_match("c", "1-1", 0.10, "mid_gap"),
        ]

        ranked = rank_3x1_combinations(matches, top_n=1)

        self.assertEqual(len(ranked), 1)
        self.assertAlmostEqual(ranked[0]["top1_product"], 0.003)
        self.assertAlmostEqual(ranked[0]["rho"], 0.13)
        self.assertAlmostEqual(ranked[0]["combo_score"], 0.00261)


def _parlay_match(match_id: str, score: str, probability: float, elo_bucket: str) -> dict[str, object]:
    return {
        "match_id": match_id,
        "match_input": {"match_id": match_id, "elo_bucket": elo_bucket},
        "enhancement": {
            "keep": True,
            "mass3": 0.9,
            "adjusted_top3": [
                {"score": score, "probability": probability},
                {"score": "0-0", "probability": 0.01},
                {"score": "3-3", "probability": 0.01},
            ],
        },
    }


if __name__ == "__main__":
    unittest.main()
