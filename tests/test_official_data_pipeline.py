import unittest

import pandas as pd

from data_sources.official_sources import normalize_fifa_frame, normalize_kaggle_frame, normalize_uefa_frame
from etl.official_data_pipeline import build_official_matches


class OfficialDataPipelineTest(unittest.TestCase):
    def test_fifa_overrides_kaggle_for_same_match_id(self):
        fifa = normalize_fifa_frame(
            pd.DataFrame(
                [
                    {
                        "match_id": "wc-final",
                        "home_team": "Argentina",
                        "away_team": "France",
                        "score_90min": "2-2",
                        "stage": "final",
                        "match_date": "2022-12-18",
                    }
                ]
            )
        )
        kaggle = normalize_kaggle_frame(
            pd.DataFrame(
                [
                    {
                        "match_id": "wc-final",
                        "home_team": "Argentina",
                        "away_team": "France",
                        "reg_score": "1-1",
                        "stage_name": "final",
                        "match_date": "2022-12-18",
                    }
                ]
            )
        )

        official = build_official_matches(fifa=fifa, uefa=pd.DataFrame(), kaggle=kaggle)

        self.assertEqual(len(official), 1)
        self.assertEqual(official.iloc[0]["score_90min"], "2-2")
        self.assertEqual(official.iloc[0]["source"], "fifa")
        self.assertEqual(float(official.iloc[0]["confidence"]), 1.0)

    def test_uefa_overrides_kaggle_when_fifa_missing(self):
        uefa = normalize_uefa_frame(
            pd.DataFrame(
                [
                    {
                        "fixture_id": "euro-1",
                        "homeTeam": "Spain",
                        "awayTeam": "Italy",
                        "home_score": 1,
                        "away_score": 0,
                        "round": "semi-final",
                        "date": "2024-07-09",
                    }
                ]
            )
        )
        kaggle = normalize_kaggle_frame(
            pd.DataFrame(
                [
                    {
                        "match_id": "euro-1",
                        "home_team": "Spain",
                        "away_team": "Italy",
                        "reg_home_score": 0,
                        "reg_away_score": 0,
                        "stage": "semi-final",
                        "date": "2024-07-09",
                    }
                ]
            )
        )

        official = build_official_matches(fifa=pd.DataFrame(), uefa=uefa, kaggle=kaggle)

        self.assertEqual(official.iloc[0]["score_90min"], "1-0")
        self.assertEqual(official.iloc[0]["source"], "uefa")

    def test_kaggle_reg90_columns_create_score_90min(self):
        kaggle = normalize_kaggle_frame(
            pd.DataFrame(
                [
                    {
                        "match_id": "hist-1",
                        "home_team_name": "Brazil",
                        "away_team_name": "Germany",
                        "reg_home_score": 1,
                        "reg_away_score": 7,
                        "stage_name": "semi-final",
                        "match_date": "2014-07-08",
                    }
                ]
            )
        )

        official = build_official_matches(fifa=pd.DataFrame(), uefa=pd.DataFrame(), kaggle=kaggle)

        self.assertEqual(official.iloc[0]["score_90min"], "1-7")
        self.assertEqual(official.iloc[0]["source"], "kaggle")

    def test_prediction_columns_do_not_leak_into_output(self):
        with self.assertRaises(ValueError):
            normalize_fifa_frame(
                pd.DataFrame(
                    [
                        {
                            "match_id": "fifa-1",
                            "home_team": "A",
                            "away_team": "B",
                            "score_90min": "0-0",
                            "stage": "group",
                            "match_date": "2026-06-11",
                            "predicted_score": "2-1",
                            "model_prob": 0.4,
                        }
                    ]
                )
            )

    def test_kaggle_history_without_match_id_gets_stable_id(self):
        kaggle = normalize_kaggle_frame(
            pd.DataFrame(
                [
                    {
                        "date": "1930-07-13",
                        "home_team": "France",
                        "away_team": "Mexico",
                        "home_score": 4,
                        "away_score": 1,
                        "tournament": "FIFA World Cup",
                    }
                ]
            )
        )

        official = build_official_matches(fifa=pd.DataFrame(), uefa=pd.DataFrame(), kaggle=kaggle)

        self.assertEqual(len(official), 1)
        self.assertEqual(official.iloc[0]["match_id"], "kaggle-19300713-france-mexico-unknown")
        self.assertEqual(official.iloc[0]["source"], "kaggle")

    def test_teams_field_can_define_home_and_away(self):
        fifa = normalize_fifa_frame(
            pd.DataFrame(
                [
                    {
                        "match_id": "fifa-teams",
                        "teams": ["Argentina", "France"],
                        "score_90min": "2-2",
                        "stage": "final",
                        "match_date": "2022-12-18",
                    }
                ]
            )
        )

        official = build_official_matches(fifa=fifa, uefa=pd.DataFrame(), kaggle=pd.DataFrame())

        self.assertEqual(official.iloc[0]["home_team"], "Argentina")
        self.assertEqual(official.iloc[0]["away_team"], "France")


if __name__ == "__main__":
    unittest.main()
