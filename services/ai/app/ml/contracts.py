from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class MatchRecord:
    home_team: str
    away_team: str
    home_goals: int = 0
    away_goals: int = 0
    home_xg: float = 1.35
    away_xg: float = 1.15
    home_xga: float = 1.15
    away_xga: float = 1.25
    shots_home: int = 11
    shots_away: int = 10
    possession_home: float = 50.0
    possession_away: float = 50.0
    yellow_cards_home: int = 0
    yellow_cards_away: int = 0
    red_cards_home: int = 0
    red_cards_away: int = 0
    rest_days_home: int = 5
    rest_days_away: int = 5
    home_fifa_rating: float = 75.0
    away_fifa_rating: float = 75.0
    home_elo: float = 1500.0
    away_elo: float = 1500.0
    recent5_form_home: float = 0.5
    recent5_form_away: float = 0.5
    home_advantage: float = 1.0
    group_points_home: float = 0.0
    group_points_away: float = 0.0
    group_goal_diff_home: float = 0.0
    group_goal_diff_away: float = 0.0
    travel_fatigue_home: float = 0.35
    travel_fatigue_away: float = 0.35
    knockout_pressure_home: float = 0.35
    knockout_pressure_away: float = 0.35
    squad_availability_home: float = 0.85
    squad_availability_away: float = 0.85
    tactical_transition_home: float = 0.5
    tactical_transition_away: float = 0.5
    set_piece_home: float = 0.4
    set_piece_away: float = 0.4
    volatility_home: float = 0.35
    volatility_away: float = 0.35

    @classmethod
    def from_mapping(cls, data: dict[str, Any]) -> "MatchRecord":
        required = ["home_team", "away_team"]
        missing = [name for name in required if name not in data]
        if missing:
            raise ValueError(f"match record missing required fields: {missing}")

        record = cls(
            home_team=str(data["home_team"]),
            away_team=str(data["away_team"]),
            home_goals=int(data.get("home_goals", data.get("home_score", 0))),
            away_goals=int(data.get("away_goals", data.get("away_score", 0))),
            home_xg=float(data.get("home_xg", data.get("xg_home", 1.35))),
            away_xg=float(data.get("away_xg", data.get("xg_away", 1.15))),
            home_xga=float(data.get("home_xga", data.get("xga_home", 1.15))),
            away_xga=float(data.get("away_xga", data.get("xga_away", 1.25))),
            shots_home=int(data.get("shots_home", data.get("home_shots", 11))),
            shots_away=int(data.get("shots_away", data.get("away_shots", 10))),
            possession_home=float(data.get("possession_home", data.get("home_possession", 50.0))),
            possession_away=float(data.get("possession_away", data.get("away_possession", 50.0))),
            yellow_cards_home=int(data.get("yellow_cards_home", data.get("home_yellow_cards", 0))),
            yellow_cards_away=int(data.get("yellow_cards_away", data.get("away_yellow_cards", 0))),
            red_cards_home=int(data.get("red_cards_home", data.get("home_red_cards", 0))),
            red_cards_away=int(data.get("red_cards_away", data.get("away_red_cards", 0))),
            rest_days_home=int(data.get("rest_days_home", data.get("home_rest_days", 5))),
            rest_days_away=int(data.get("rest_days_away", data.get("away_rest_days", 5))),
            home_fifa_rating=float(data.get("home_fifa_rating", data.get("fifa_rating_home", 75.0))),
            away_fifa_rating=float(data.get("away_fifa_rating", data.get("fifa_rating_away", 75.0))),
            home_elo=float(data.get("home_elo", 1500.0)),
            away_elo=float(data.get("away_elo", 1500.0)),
            recent5_form_home=float(data.get("recent5_form_home", data.get("home_form", 0.5))),
            recent5_form_away=float(data.get("recent5_form_away", data.get("away_form", 0.5))),
            home_advantage=float(data.get("home_advantage", 1.0)),
            group_points_home=float(data.get("group_points_home", 0.0)),
            group_points_away=float(data.get("group_points_away", 0.0)),
            group_goal_diff_home=float(data.get("group_goal_diff_home", 0.0)),
            group_goal_diff_away=float(data.get("group_goal_diff_away", 0.0)),
            travel_fatigue_home=float(data.get("travel_fatigue_home", 0.35)),
            travel_fatigue_away=float(data.get("travel_fatigue_away", 0.35)),
            knockout_pressure_home=float(data.get("knockout_pressure_home", 0.35)),
            knockout_pressure_away=float(data.get("knockout_pressure_away", 0.35)),
            squad_availability_home=float(data.get("squad_availability_home", 0.85)),
            squad_availability_away=float(data.get("squad_availability_away", 0.85)),
            tactical_transition_home=float(data.get("tactical_transition_home", 0.5)),
            tactical_transition_away=float(data.get("tactical_transition_away", 0.5)),
            set_piece_home=float(data.get("set_piece_home", 0.4)),
            set_piece_away=float(data.get("set_piece_away", 0.4)),
            volatility_home=float(data.get("volatility_home", 0.35)),
            volatility_away=float(data.get("volatility_away", 0.35)),
        )
        record.validate()
        return record

    @property
    def label(self) -> int:
        if self.home_goals > self.away_goals:
            return 0
        if self.home_goals == self.away_goals:
            return 1
        return 2

    @property
    def team_strength_diff(self) -> float:
        elo_component = (self.home_elo - self.away_elo) / 400.0
        fifa_component = (self.home_fifa_rating - self.away_fifa_rating) / 25.0
        form_component = (normalized_form(self.recent5_form_home) - normalized_form(self.recent5_form_away)) * 1.2
        xg_component = (self.home_xg - self.away_xg) * 0.35 + (self.away_xga - self.home_xga) * 0.22
        shot_component = (self.shots_home - self.shots_away) / 30.0
        group_component = ((self.group_points_home - self.group_points_away) / 9.0) * 0.45
        group_component += ((self.group_goal_diff_home - self.group_goal_diff_away) / 10.0) * 0.25
        squad_component = (self.squad_availability_home - self.squad_availability_away) * 0.55
        fatigue_component = (self.travel_fatigue_away - self.travel_fatigue_home) * 0.28
        pressure_component = (self.knockout_pressure_away - self.knockout_pressure_home) * 0.18
        tactical_component = (
            self.tactical_transition_home
            + self.set_piece_home
            - self.tactical_transition_away
            - self.set_piece_away
        ) * 0.14
        volatility_component = (self.volatility_away - self.volatility_home) * 0.12
        return (
            elo_component
            + fifa_component
            + form_component
            + xg_component
            + shot_component
            + group_component
            + squad_component
            + fatigue_component
            + pressure_component
            + tactical_component
            + volatility_component
        )

    def validate(self) -> None:
        if not self.home_team or not self.away_team:
            raise ValueError("home_team and away_team are required")
        for name in ("home_xg", "away_xg", "home_xga", "away_xga"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} must be non-negative")
        for name in ("possession_home", "possession_away"):
            value = getattr(self, name)
            if not 0 <= value <= 100:
                raise ValueError(f"{name} must be between 0 and 100")
        for name in ("home_fifa_rating", "away_fifa_rating"):
            value = getattr(self, name)
            if not 0 <= value <= 100:
                raise ValueError(f"{name} must be between 0 and 100")
        for name in (
            "home_goals",
            "away_goals",
            "shots_home",
            "shots_away",
            "yellow_cards_home",
            "yellow_cards_away",
            "red_cards_home",
            "red_cards_away",
            "rest_days_home",
            "rest_days_away",
        ):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} must be non-negative")
        for name in ("recent5_form_home", "recent5_form_away"):
            value = getattr(self, name)
            if value < 0:
                raise ValueError(f"{name} must be non-negative")
        bounded_features = (
            "travel_fatigue_home",
            "travel_fatigue_away",
            "knockout_pressure_home",
            "knockout_pressure_away",
            "squad_availability_home",
            "squad_availability_away",
            "tactical_transition_home",
            "tactical_transition_away",
            "set_piece_home",
            "set_piece_away",
            "volatility_home",
            "volatility_away",
        )
        for name in bounded_features:
            value = getattr(self, name)
            if not 0 <= value <= 1:
                raise ValueError(f"{name} must be between 0 and 1")


@dataclass(frozen=True)
class TeamSequenceFrame:
    xg: float
    shots: float
    possession: float
    yellow_cards: float
    red_cards: float
    fifa_rating: float
    rest_days: float
    goals_for: float
    goals_against: float

    @classmethod
    def from_mapping(cls, data: dict[str, Any]) -> "TeamSequenceFrame":
        return cls(
            xg=float(data.get("xg", 0.0)),
            shots=float(data.get("shots", 0.0)),
            possession=float(data.get("possession", 50.0)),
            yellow_cards=float(data.get("yellow_cards", 0.0)),
            red_cards=float(data.get("red_cards", 0.0)),
            fifa_rating=float(data.get("fifa_rating", 75.0)),
            rest_days=float(data.get("rest_days", 5.0)),
            goals_for=float(data.get("goals_for", 0.0)),
            goals_against=float(data.get("goals_against", 0.0)),
        )

    @classmethod
    def from_match_record(cls, record: MatchRecord, side: str) -> "TeamSequenceFrame":
        if side == "home":
            return cls(
                xg=record.home_xg,
                shots=record.shots_home,
                possession=record.possession_home,
                yellow_cards=record.yellow_cards_home,
                red_cards=record.red_cards_home,
                fifa_rating=record.home_fifa_rating,
                rest_days=record.rest_days_home,
                goals_for=record.home_goals,
                goals_against=record.away_goals,
            )
        if side == "away":
            return cls(
                xg=record.away_xg,
                shots=record.shots_away,
                possession=record.possession_away,
                yellow_cards=record.yellow_cards_away,
                red_cards=record.red_cards_away,
                fifa_rating=record.away_fifa_rating,
                rest_days=record.rest_days_away,
                goals_for=record.away_goals,
                goals_against=record.home_goals,
            )
        raise ValueError("side must be home or away")

    def to_feature_vector(self) -> list[float]:
        return [
            self.xg,
            self.shots,
            self.possession,
            self.yellow_cards,
            self.red_cards,
            self.fifa_rating,
            self.rest_days,
            self.goals_for,
            self.goals_against,
        ]


FEATURE_NAMES = [
    "xg",
    "shots",
    "possession",
    "yellow_cards",
    "red_cards",
    "fifa_rating",
    "rest_days",
    "goals_for",
    "goals_against",
]


def normalized_form(value: float) -> float:
    return value / 100.0 if value > 1.0 else value
