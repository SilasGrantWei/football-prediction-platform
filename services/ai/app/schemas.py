from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

GameStyle = Literal["defensive", "balanced", "open"]
UpsetRisk = Literal["low", "medium", "high"]


class TeamInput(BaseModel):
    name: str = Field(min_length=1)
    rating: float = Field(ge=0, le=100)
    form: float = Field(ge=0, le=100)
    attack_avg: float = Field(ge=0)
    defense_avg: float = Field(ge=0, le=100)
    xga: float = Field(ge=0)


class PredictionRequest(BaseModel):
    match_id: str = Field(min_length=1)
    home_team: TeamInput
    away_team: TeamInput


class ScorePrediction(BaseModel):
    score: str
    probability: float = Field(ge=0, le=1)


class PredictionResponse(BaseModel):
    match_id: str
    model_version: str
    home_win_prob: float
    draw_prob: float
    away_win_prob: float
    top_scores: list[ScorePrediction]
    game_style: GameStyle
    upset_risk: UpsetRisk
    expected_home_goals: float
    expected_away_goals: float
    generated_at: datetime


class MatchFeatureInput(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    match_id: str | None = None
    home_team: str = Field(min_length=1)
    away_team: str = Field(min_length=1)
    home_goals: int = Field(default=0, ge=0)
    away_goals: int = Field(default=0, ge=0)
    home_xg: float = Field(default=1.35, ge=0)
    away_xg: float = Field(default=1.15, ge=0)
    home_xga: float = Field(default=1.15, ge=0)
    away_xga: float = Field(default=1.25, ge=0)
    shots_home: int = Field(default=11, ge=0)
    shots_away: int = Field(default=10, ge=0)
    possession_home: float = Field(default=50.0, ge=0, le=100)
    possession_away: float = Field(default=50.0, ge=0, le=100)
    yellow_cards_home: int = Field(default=0, ge=0)
    yellow_cards_away: int = Field(default=0, ge=0)
    red_cards_home: int = Field(default=0, ge=0)
    red_cards_away: int = Field(default=0, ge=0)
    rest_days_home: int = Field(default=5, ge=0)
    rest_days_away: int = Field(default=5, ge=0)
    home_fifa_rating: float = Field(default=75.0, ge=0, le=100)
    away_fifa_rating: float = Field(default=75.0, ge=0, le=100)
    home_elo: float = Field(default=1500.0, ge=0)
    away_elo: float = Field(default=1500.0, ge=0)
    recent5_form_home: float = Field(default=0.5, ge=0)
    recent5_form_away: float = Field(default=0.5, ge=0)
    home_advantage: float = Field(default=1.0, ge=0, le=1.5)
    group_points_home: float = Field(default=0.0, ge=0)
    group_points_away: float = Field(default=0.0, ge=0)
    group_goal_diff_home: float = 0.0
    group_goal_diff_away: float = 0.0
    travel_fatigue_home: float = Field(default=0.35, ge=0, le=1)
    travel_fatigue_away: float = Field(default=0.35, ge=0, le=1)
    knockout_pressure_home: float = Field(default=0.35, ge=0, le=1)
    knockout_pressure_away: float = Field(default=0.35, ge=0, le=1)
    squad_availability_home: float = Field(default=0.85, ge=0, le=1)
    squad_availability_away: float = Field(default=0.85, ge=0, le=1)
    tactical_transition_home: float = Field(default=0.5, ge=0, le=1)
    tactical_transition_away: float = Field(default=0.5, ge=0, le=1)
    set_piece_home: float = Field(default=0.4, ge=0, le=1)
    set_piece_away: float = Field(default=0.4, ge=0, le=1)
    volatility_home: float = Field(default=0.35, ge=0, le=1)
    volatility_away: float = Field(default=0.35, ge=0, le=1)


class IndustrialPredictionResponse(BaseModel):
    model_version: str
    win_prob: float = Field(ge=0, le=1)
    draw_prob: float = Field(ge=0, le=1)
    lose_prob: float = Field(ge=0, le=1)
    home_win_prob: float = Field(ge=0, le=1)
    away_win_prob: float = Field(ge=0, le=1)
    score_prediction: str | None
    top_scores: list[ScorePrediction]
    game_style: GameStyle
    upset_risk: UpsetRisk
    expected_home_goals: float
    expected_away_goals: float
    trend: list[dict[str, int]]
    model_breakdown: dict


class TrainModelRequest(BaseModel):
    dataset: list[MatchFeatureInput] | None = None
    dataset_path: str | None = None
    output_dir: str = "artifacts/worldcup_lightgbm"
    preferred_engine: Literal["lightgbm", "xgboost"] = "lightgbm"
    use_gpu: bool = False


class TrainModelResponse(BaseModel):
    model_version: str
    artifact_path: str
    training_rows: int
    engine: str
    metrics: dict[str, float]
