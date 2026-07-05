from fastapi.testclient import TestClient

from app.main import create_app
from app.ml.contracts import MatchRecord
from app.ml.elo import EloRatingModel
from app.ml.pipeline import IndustrialFootballPredictor
from app.ml.poisson import PoissonGoalModel


def sample_match() -> MatchRecord:
    return MatchRecord(
        home_team="Brazil",
        away_team="France",
        home_xg=1.85,
        away_xg=1.42,
        home_xga=0.95,
        away_xga=1.05,
        shots_home=15,
        shots_away=12,
        possession_home=54,
        possession_away=46,
        rest_days_home=6,
        rest_days_away=5,
        home_fifa_rating=88,
        away_fifa_rating=90,
        home_elo=1880,
        away_elo=1900,
        recent5_form_home=0.72,
        recent5_form_away=0.70,
    )


def test_elo_formula_uses_standard_logistic_curve() -> None:
    assert round(EloRatingModel.win_probability(1600, 1500), 4) == 0.6401


def test_poisson_model_returns_top5_score_matrix() -> None:
    prediction = PoissonGoalModel(max_goals=7, top_n=5).predict(sample_match())
    total = prediction.home_win_prob + prediction.draw_prob + prediction.away_win_prob

    assert 0.999 <= total <= 1.001
    assert len(prediction.top_scores) == 5
    assert len(prediction.distribution_matrix) == 64
    assert prediction.top_scores[0].probability >= prediction.top_scores[1].probability


def test_industrial_predictor_fallback_outputs_normalized_probabilities() -> None:
    prediction = IndustrialFootballPredictor().predict(sample_match())
    total = prediction.home_win_prob + prediction.draw_prob + prediction.away_win_prob

    assert 0.999 <= total <= 1.001
    assert len(prediction.top_scores) == 5
    assert prediction.upset_risk in {"low", "medium", "high"}
    assert prediction.model_breakdown["gradient_engine"] == "rule-fallback"


def test_predict_match_endpoint_returns_product_schema() -> None:
    client = TestClient(create_app())
    response = client.post(
        "/predict_match",
        json={
            "home_team": "Brazil",
            "away_team": "France",
            "home_xg": 1.85,
            "away_xg": 1.42,
            "home_xga": 0.95,
            "away_xga": 1.05,
            "shots_home": 15,
            "shots_away": 12,
            "possession_home": 54,
            "possession_away": 46,
            "rest_days_home": 6,
            "rest_days_away": 5,
            "home_fifa_rating": 88,
            "away_fifa_rating": 90,
            "home_elo": 1880,
            "away_elo": 1900,
            "recent5_form_home": 0.72,
            "recent5_form_away": 0.70,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert {"win_prob", "draw_prob", "lose_prob", "top_scores", "upset_risk"} <= payload.keys()
    assert len(payload["top_scores"]) == 5
    assert 0.999 <= payload["win_prob"] + payload["draw_prob"] + payload["lose_prob"] <= 1.001
