from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

try:
    import pandas as pd
except Exception:  # pragma: no cover - optional in minimal installs.
    pd = None

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.worldcup.build_worldcup_hist_priors import build_hist_priors, smooth_pmf
from scripts.worldcup.build_worldcup_reg90_table import build_reg90_table, is_regulation_goal, reconstruct_reg90_score
from services.worldcup_score_enhancer import enhance_match_scores, is_extreme_tail, normalize_implied_prob, scenario_span


CONFIG = {
    "elo_buckets": {"balanced_max_abs_diff": 60, "mid_gap_max_abs_diff": 150},
    "enhancement": {
        "model_power": 0.60,
        "hist_power": 0.25,
        "edge_weight": 0.15,
        "min_probability": 0.000001,
        "total_goal_sigma": 1.15,
        "goal_diff_sigma": 1.10,
    },
    "filters": {
        "keep": {"min_mass3": 0.44, "min_p1": 0.16, "max_entropy3": 0.92, "max_scenario_span": 2},
        "reject": {
            "min_mass3": 0.38,
            "scenario_span_eq": 3,
            "high_xg_total": 3.1,
            "high_xg_p1": 0.14,
            "bonus_p85": 0.85,
            "hist_tail_prob": 0.015,
        },
    },
}

PRIORS = {
    "global": {
        "n": 200,
        "pmf": {"1-1": 0.14, "1-0": 0.12, "2-1": 0.1, "0-0": 0.08, "2-0": 0.08, "0-1": 0.08},
        "top3": [
            {"score": "1-1", "probability": 0.14},
            {"score": "1-0", "probability": 0.12},
            {"score": "2-1", "probability": 0.1},
        ],
        "top3_mass": 0.36,
    },
    "parents": {
        "group": {
            "n": 120,
            "pmf": {"1-1": 0.13, "1-0": 0.12, "2-1": 0.09, "0-0": 0.08, "2-0": 0.08, "3-0": 0.04},
            "top3": [
                {"score": "1-1", "probability": 0.13},
                {"score": "1-0", "probability": 0.12},
                {"score": "2-1", "probability": 0.09},
            ],
            "top3_mass": 0.34,
        },
        "knockout": {
            "n": 80,
            "pmf": {"1-1": 0.16, "1-0": 0.13, "0-0": 0.1, "2-1": 0.08, "0-1": 0.08},
            "top3": [
                {"score": "1-1", "probability": 0.16},
                {"score": "1-0", "probability": 0.13},
                {"score": "0-0", "probability": 0.1},
            ],
            "top3_mass": 0.39,
        },
    },
    "buckets": {
        "group|strong_gap|no_host": {
            "n": 18,
            "pmf": {"2-0": 0.18, "2-1": 0.14, "1-0": 0.12, "3-0": 0.09, "1-1": 0.08},
            "top3": [
                {"score": "2-0", "probability": 0.18},
                {"score": "2-1", "probability": 0.14},
                {"score": "1-0", "probability": 0.12},
            ],
            "top3_mass": 0.44,
        },
        "knockout|balanced|no_host": {
            "n": 22,
            "pmf": {"1-1": 0.18, "1-0": 0.12, "0-1": 0.11, "0-0": 0.1, "2-1": 0.08},
            "top3": [
                {"score": "1-1", "probability": 0.18},
                {"score": "1-0", "probability": 0.12},
                {"score": "0-1", "probability": 0.11},
            ],
            "top3_mass": 0.41,
        },
        "group|balanced|host_involved": {
            "n": 10,
            "pmf": {"1-0": 0.18, "1-1": 0.15, "2-1": 0.1, "0-0": 0.09},
            "top3": [
                {"score": "1-0", "probability": 0.18},
                {"score": "1-1", "probability": 0.15},
                {"score": "2-1", "probability": 0.1},
            ],
            "top3_mass": 0.43,
        },
        "knockout|mid_gap|no_host": {
            "n": 12,
            "pmf": {"2-2": 0.12, "2-1": 0.11, "1-1": 0.1, "3-2": 0.06},
            "top3": [
                {"score": "2-2", "probability": 0.12},
                {"score": "2-1", "probability": 0.11},
                {"score": "1-1", "probability": 0.1},
            ],
            "top3_mass": 0.33,
        },
    },
}


class WorldCupEnhancerTest(unittest.TestCase):
    @unittest.skipIf(pd is None, "pandas is required")
    def test_reg90_score_rebuild_excludes_extra_time_and_shootout(self) -> None:
        match = pd.Series({"match_id": "m1", "home_team_name": "A", "away_team_name": "B"})
        goals = pd.DataFrame(
            [
                {"match_id": "m1", "team_name": "A", "minute_regulation": 12, "minute_stoppage": 0},
                {"match_id": "m1", "team_name": "B", "minute_regulation": 45, "minute_stoppage": 2},
                {"match_id": "m1", "team_name": "A", "minute_regulation": 90, "minute_stoppage": 5},
                {"match_id": "m1", "team_name": "B", "minute_regulation": 91, "minute_stoppage": 0},
                {"match_id": "m1", "team_name": "B", "minute_regulation": 120, "penalty_shootout": True},
            ]
        )

        self.assertTrue(is_regulation_goal(goals.iloc[1]))
        self.assertFalse(is_regulation_goal(goals.iloc[3]))
        self.assertFalse(is_regulation_goal(goals.iloc[4]))
        self.assertEqual(reconstruct_reg90_score(match, goals), (2, 1))

    def test_bucket_smoothing_uses_parent_distribution(self) -> None:
        smoothed = smooth_pmf({"1-0": 0.5, "0-0": 0.5}, {"1-0": 0.1, "0-1": 0.9}, n=5, lmbda=5)
        self.assertAlmostEqual(sum(smoothed.values()), 1.0)
        self.assertAlmostEqual(smoothed["1-0"], 0.3)
        self.assertAlmostEqual(smoothed["0-0"], 0.25)
        self.assertAlmostEqual(smoothed["0-1"], 0.45)

    def test_implied_probability_is_normalized(self) -> None:
        implied = normalize_implied_prob({"1:0": 6.0, "1:1": 5.0, "2:1": 8.0}, ["1-0", "1-1", "2-1"])
        self.assertAlmostEqual(sum(implied.values()), 1.0)
        self.assertGreater(implied["1-1"], implied["2-1"])

    def test_scenario_span_counts_score_directions(self) -> None:
        self.assertEqual(scenario_span(["1-0", "2-0", "3-1"]), 1)
        self.assertEqual(scenario_span(["1-0", "1-1", "2-1"]), 2)
        self.assertEqual(scenario_span(["1-0", "1-1", "0-1"]), 3)

    def test_extreme_tail_detection(self) -> None:
        values = [5.0, 7.0, 12.0, 90.0]
        self.assertTrue(is_extreme_tail("5-0", hist_prob=0.001, bonus=90.0, panel_bonus_values=values, config=CONFIG))
        self.assertFalse(is_extreme_tail("1-0", hist_prob=0.05, bonus=90.0, panel_bonus_values=values, config=CONFIG))

    @unittest.skipIf(pd is None, "pandas is required")
    def test_hist_priors_builds_required_buckets(self) -> None:
        frame = pd.DataFrame(
            [
                _row("2018", "m1", True, False, "1-0", 20, False, False),
                _row("2018", "m2", True, False, "1-1", 30, False, False),
                _row("2018", "m3", False, True, "0-0", 50, False, False),
                _row("2022", "m4", False, True, "2-1", 170, True, False),
            ]
        )
        priors = build_hist_priors(frame, lmbda=25)
        self.assertIn("group|balanced|no_host", priors["buckets"])
        self.assertIn("knockout|strong_gap|host_involved", priors["buckets"])
        self.assertIn("top3_mass", priors["parents"]["group"])

    @unittest.skipIf(pd is None, "pandas is required")
    def test_host_flag_is_tournament_specific(self) -> None:
        matches = pd.DataFrame(
            [
                {
                    "match_id": "wc1978-m1",
                    "tournament_id": "WC-1978",
                    "match_date": "1978-06-01",
                    "stage_name": "Group stage",
                    "home_team_name": "Argentina",
                    "away_team_name": "France",
                    "extra_time": False,
                    "penalty_shootout": False,
                },
                {
                    "match_id": "wc2022-m1",
                    "tournament_id": "WC-2022",
                    "match_date": "2022-12-18",
                    "stage_name": "Final",
                    "home_team_name": "Argentina",
                    "away_team_name": "France",
                    "extra_time": True,
                    "penalty_shootout": True,
                },
            ]
        )
        hosts = pd.DataFrame(
            [
                {"tournament_id": "WC-1978", "team_name": "Argentina"},
                {"tournament_id": "WC-2022", "team_name": "Qatar"},
            ]
        )
        table = build_reg90_table(matches, pd.DataFrame(), hosts=hosts)
        by_match = table.set_index("match_id")

        self.assertTrue(bool(by_match.loc["wc1978-m1", "host_home"]))
        self.assertFalse(bool(by_match.loc["wc1978-m1", "host_away"]))
        self.assertFalse(bool(by_match.loc["wc2022-m1", "host_home"]))
        self.assertFalse(bool(by_match.loc["wc2022-m1", "host_away"]))

    def test_fixed_examples_return_required_contract(self) -> None:
        examples = [
            _match_input("strong-group", "group", 1730, 1520, False, False, 2.2, 0.8),
            _match_input("balanced-ko", "knockout", 1640, 1620, False, False, 1.2, 1.1),
            _match_input("host-group", "group", 1600, 1580, True, False, 1.6, 1.2),
            _match_input("high-xg", "knockout", 1660, 1580, False, False, 2.1, 1.6),
            _match_input("tail-bonus", "group", 1700, 1510, False, False, 2.5, 0.7, tail=True),
        ]

        for example in examples:
            with self.subTest(example=example["match_id"]):
                result = enhance_match_scores(example, priors_override=PRIORS, config_override=CONFIG)
                self.assertIn("raw_top3", result)
                self.assertIn("adjusted_top3", result)
                self.assertIn("reject_reasons", result)
                self.assertEqual(len(result["adjusted_top3"]), 3)


def _row(
    tournament_id: str,
    match_id: str,
    group_stage: bool,
    knockout_stage: bool,
    score: str,
    abs_elo_diff: float,
    host_home: bool,
    host_away: bool,
) -> dict[str, object]:
    return {
        "tournament_id": tournament_id,
        "match_id": match_id,
        "match_date": f"{tournament_id}-06-01",
        "stage_name": "Group Stage" if group_stage else "Round of 16",
        "group_stage": group_stage,
        "knockout_stage": knockout_stage,
        "home_team_name": "A",
        "away_team_name": "B",
        "extra_time": False,
        "penalty_shootout": False,
        "reg_home_score": int(score.split("-")[0]),
        "reg_away_score": int(score.split("-")[1]),
        "reg_score": score,
        "host_home": host_home,
        "host_away": host_away,
        "pre_home_elo": 1500 + abs_elo_diff,
        "pre_away_elo": 1500,
        "elo_diff_home": abs_elo_diff,
        "abs_elo_diff": abs_elo_diff,
    }


def _match_input(
    match_id: str,
    stage: str,
    elo_home: float,
    elo_away: float,
    is_host_home: bool,
    is_host_away: bool,
    xg_home: float,
    xg_away: float,
    tail: bool = False,
) -> dict[str, object]:
    score_probs = {
        "0:0": 0.06,
        "1:0": 0.14,
        "0:1": 0.06,
        "1:1": 0.13,
        "2:0": 0.12,
        "0:2": 0.04,
        "2:1": 0.15,
        "1:2": 0.05,
        "2:2": 0.08,
        "3:0": 0.07,
        "3:1": 0.06,
    }
    score_bonus = {score: 1 / max(prob, 0.01) for score, prob in score_probs.items()}
    if tail:
        score_probs["5:0"] = 0.07
        score_bonus["5:0"] = 120

    return {
        "match_id": match_id,
        "stage": stage,
        "is_host_home": is_host_home,
        "is_host_away": is_host_away,
        "elo_home": elo_home,
        "elo_away": elo_away,
        "market_p_home": 0.45,
        "market_p_draw": 0.28,
        "market_p_away": 0.27,
        "xg_home": xg_home,
        "xg_away": xg_away,
        "score_probs": score_probs,
        "score_bonus": score_bonus,
    }


if __name__ == "__main__":
    unittest.main()
