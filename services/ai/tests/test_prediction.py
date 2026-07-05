from app.schemas import PredictionRequest, TeamInput
from app.services.prediction import predict_match, team_strength


def test_team_strength_uses_required_formula() -> None:
    team = TeamInput(name="Formula FC", rating=90, form=80, attack_avg=1.8, defense_avg=70, xga=1.1)
    assert team_strength(team) == 90 * 0.34 + 80 * 0.24 + 70 * 0.16 + 1.8 * 8.5 + (2.1 - 1.1) * 5.5


def test_predict_match_returns_probabilities_and_top_scores() -> None:
    payload = PredictionRequest(
        match_id="unit",
        home_team=TeamInput(name="Home", rating=92, form=84, attack_avg=2.0, defense_avg=84, xga=0.9),
        away_team=TeamInput(name="Away", rating=78, form=73, attack_avg=1.2, defense_avg=75, xga=1.3),
    )

    prediction = predict_match(payload)
    total = prediction.home_win_prob + prediction.draw_prob + prediction.away_win_prob

    assert 0.999 <= total <= 1.001
    assert len(prediction.top_scores) == 3
    assert prediction.top_scores[0].probability >= prediction.top_scores[1].probability
    assert prediction.top_scores[1].probability >= prediction.top_scores[2].probability
    assert prediction.game_style in {"defensive", "balanced", "open"}
    assert prediction.upset_risk in {"low", "medium", "high"}
    assert prediction.model_version == "fastapi-poisson-rule-v2"
