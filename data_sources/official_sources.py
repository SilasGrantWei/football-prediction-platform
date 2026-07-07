from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import pandas as pd


OfficialSource = Literal["fifa", "uefa", "kaggle"]


ROOT = Path(__file__).resolve().parents[1]
OFFICIAL_RAW_DIR = ROOT / "data" / "official" / "raw"


@dataclass(frozen=True)
class DataSourceDefinition:
    name: OfficialSource
    priority: int
    url: str
    fields: tuple[str, ...]
    description: str


@dataclass(frozen=True)
class OfficialMatchRecord:
    match_id: str
    home_team: str
    away_team: str
    score_90min: str
    stage: str
    match_date: datetime
    is_extra_time: bool
    is_penalty: bool
    source: OfficialSource

    def to_dict(self) -> dict[str, object]:
        value = asdict(self)
        value["match_date"] = self.match_date.isoformat()
        return value


FIFA_OFFICIAL_SOURCE = DataSourceDefinition(
    name="fifa",
    priority=3,
    url="https://inside.fifa.com/data-centre/matches",
    fields=(
        "match_id",
        "teams",
        "score_90min",
        "stage",
        "match_date",
        "extra_time",
        "penalty",
    ),
    description="FIFA data centre match records. This is the highest priority truth source.",
)

UEFA_API_SOURCE = DataSourceDefinition(
    name="uefa",
    priority=2,
    url="https://www.uefa.com/insideuefa/about-uefa/administration/competition-data/",
    fields=(
        "match_id",
        "teams",
        "score_90min",
        "stage",
        "match_date",
        "events",
        "lineups",
        "statistics",
    ),
    description="UEFA competition data used as quasi-official enrichment for European records.",
)

KAGGLE_HISTORY_SOURCE = DataSourceDefinition(
    name="kaggle",
    priority=1,
    url="local:kaggle-worldcup-and-international-results",
    fields=(
        "match_id",
        "teams",
        "score_90min",
        "stage",
        "match_date",
        "extra_time",
        "penalty",
    ),
    description="Historical fallback only. Never overrides FIFA or UEFA records.",
)

SOURCE_DEFINITIONS: dict[OfficialSource, DataSourceDefinition] = {
    "fifa": FIFA_OFFICIAL_SOURCE,
    "uefa": UEFA_API_SOURCE,
    "kaggle": KAGGLE_HISTORY_SOURCE,
}

SOURCE_CONFIDENCE: dict[OfficialSource, float] = {
    "fifa": 1.0,
    "uefa": 0.92,
    "kaggle": 0.8,
}

PREDICTION_COLUMN_HINTS = (
    "prediction",
    "predicted",
    "model_",
    "prob",
    "xg_model",
    "score_bonus",
)


def _first_existing_file(stem: Path) -> Path | None:
    for suffix in (".parquet", ".json", ".jsonl", ".csv"):
        candidate = stem.with_suffix(suffix)
        if candidate.exists():
            return candidate
    return None


def _configured_or_default(env_name: str, default_stem: Path) -> Path | None:
    configured = os.environ.get(env_name)
    if configured:
        path = Path(configured)
        return path if path.is_absolute() else ROOT / path
    return _first_existing_file(default_stem)


def load_table(path: Path | None) -> pd.DataFrame:
    if path is None or not path.exists():
        return pd.DataFrame()
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    if path.suffix == ".json":
        return pd.read_json(path)
    if path.suffix == ".jsonl":
        rows = []
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                text = line.strip()
                if text:
                    rows.append(json.loads(text))
        return pd.DataFrame(rows)
    if path.suffix == ".csv":
        return pd.read_csv(path)
    raise ValueError(f"Unsupported official data file type: {path}")


def _pick_column(frame: pd.DataFrame, aliases: tuple[str, ...]) -> pd.Series:
    for alias in aliases:
        if alias in frame.columns:
            return frame[alias]
    return pd.Series([None] * len(frame), index=frame.index)


def _reject_prediction_columns(frame: pd.DataFrame) -> None:
    forbidden = [
        column
        for column in frame.columns
        if any(hint in column.lower() for hint in PREDICTION_COLUMN_HINTS)
    ]
    if forbidden:
        raise ValueError(f"Prediction fields are not allowed in official truth layer: {forbidden}")


def _slug(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    return normalized or "unknown"


def _split_team_pair(value: Any) -> tuple[str | None, str | None]:
    if isinstance(value, dict):
        home = value.get("home") or value.get("home_team") or value.get("homeTeam")
        away = value.get("away") or value.get("away_team") or value.get("awayTeam")
        return (str(home) if home else None, str(away) if away else None)

    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return str(value[0]), str(value[1])

    text = str(value or "").strip()
    if not text:
        return None, None

    for separator in (" vs ", " v ", " - ", "–", "—"):
        if separator in text:
            home, away = text.split(separator, 1)
            return home.strip() or None, away.strip() or None

    return None, None


def _teams_from_column(frame: pd.DataFrame, side: Literal["home", "away"]) -> pd.Series:
    teams = _pick_column(frame, ("teams", "team_pair", "fixture"))
    if teams.isna().all():
        return pd.Series([None] * len(frame), index=frame.index)

    index = 0 if side == "home" else 1
    return teams.map(lambda value: _split_team_pair(value)[index])


def _bool_series(value: pd.Series) -> pd.Series:
    if value.empty:
        return value
    if value.isna().all():
        return pd.Series([False] * len(value), index=value.index, dtype=bool)
    normalized = value.astype("object").where(value.notna(), False)
    if normalized.dtype == bool:
        return normalized.astype(bool)
    return normalized.astype(str).str.lower().isin(("true", "1", "yes", "y", "pen", "et"))


def _score_from_columns(frame: pd.DataFrame) -> pd.Series:
    direct = _pick_column(frame, ("score_90min", "reg_score", "score", "full_time_score"))
    if direct.notna().any():
        return direct.astype(str).str.replace(":", "-", regex=False)

    home_score = _pick_column(frame, ("reg_home_score", "home_score", "home_goals", "home_team_score"))
    away_score = _pick_column(frame, ("reg_away_score", "away_score", "away_goals", "away_team_score"))
    if home_score.notna().any() and away_score.notna().any():
        return home_score.fillna("").astype(str).str.replace(".0", "", regex=False) + "-" + away_score.fillna("").astype(str).str.replace(".0", "", regex=False)
    return pd.Series([None] * len(frame), index=frame.index)


def _stable_match_ids(frame: pd.DataFrame, source: OfficialSource, normalized: pd.DataFrame) -> pd.Series:
    direct = _pick_column(frame, ("match_id", "id", "fixture_id", "game_id")).astype("string")
    missing = direct.isna() | (direct.str.strip().fillna("") == "")
    if not missing.any():
        return direct

    fallback = (
        source
        + "-"
        + pd.to_datetime(normalized["match_date"], errors="coerce", utc=True).dt.strftime("%Y%m%d").fillna("unknown-date")
        + "-"
        + normalized["home_team"].map(_slug)
        + "-"
        + normalized["away_team"].map(_slug)
        + "-"
        + normalized["stage"].map(_slug)
    )
    direct = direct.copy()
    direct[missing] = fallback[missing]
    return direct


def normalize_official_frame(frame: pd.DataFrame, source: OfficialSource) -> pd.DataFrame:
    _reject_prediction_columns(frame)

    if frame.empty:
        return pd.DataFrame(
            columns=[
                "match_id",
                "home_team",
                "away_team",
                "score_90min",
                "stage",
                "match_date",
                "is_extra_time",
                "is_penalty",
                "source",
                "source_priority",
                "source_url",
                "confidence",
            ]
        )

    definition = SOURCE_DEFINITIONS[source]
    normalized = pd.DataFrame(index=frame.index)
    normalized["home_team"] = _pick_column(
        frame,
        ("home_team", "home_team_name", "homeTeam", "home", "team_home"),
    ).astype("string")
    home_from_teams = _teams_from_column(frame, "home").astype("string")
    normalized["home_team"] = normalized["home_team"].where(normalized["home_team"].notna(), home_from_teams)
    normalized["away_team"] = _pick_column(
        frame,
        ("away_team", "away_team_name", "awayTeam", "away", "team_away"),
    ).astype("string")
    away_from_teams = _teams_from_column(frame, "away").astype("string")
    normalized["away_team"] = normalized["away_team"].where(normalized["away_team"].notna(), away_from_teams)
    normalized["score_90min"] = _score_from_columns(frame).astype("string")
    normalized["stage"] = _pick_column(frame, ("stage", "stage_name", "round", "competition_stage")).fillna("unknown").astype("string")
    normalized["match_date"] = pd.to_datetime(
        _pick_column(frame, ("match_date", "date", "kickoff_time", "start_time")),
        errors="coerce",
        utc=True,
    )
    normalized["match_id"] = _stable_match_ids(frame, source, normalized)
    normalized["is_extra_time"] = _bool_series(_pick_column(frame, ("is_extra_time", "extra_time")))
    normalized["is_penalty"] = _bool_series(_pick_column(frame, ("is_penalty", "penalty", "penalty_shootout")))
    normalized["source"] = source
    normalized["source_priority"] = definition.priority
    normalized["source_url"] = definition.url
    normalized["confidence"] = SOURCE_CONFIDENCE[source]

    return normalized


def normalize_fifa_frame(frame: pd.DataFrame) -> pd.DataFrame:
    return normalize_official_frame(frame, "fifa")


def normalize_uefa_frame(frame: pd.DataFrame) -> pd.DataFrame:
    return normalize_official_frame(frame, "uefa")


def normalize_kaggle_frame(frame: pd.DataFrame) -> pd.DataFrame:
    return normalize_official_frame(frame, "kaggle")


def load_fifa_official_records(path: Path | None = None) -> pd.DataFrame:
    source_path = path or _configured_or_default("FIFA_OFFICIAL_MATCHES_FILE", OFFICIAL_RAW_DIR / "fifa_matches")
    return normalize_fifa_frame(load_table(source_path))


def load_uefa_records(path: Path | None = None) -> pd.DataFrame:
    source_path = path or _configured_or_default("UEFA_OFFICIAL_MATCHES_FILE", OFFICIAL_RAW_DIR / "uefa_matches")
    return normalize_uefa_frame(load_table(source_path))


def load_kaggle_history_records(path: Path | None = None) -> pd.DataFrame:
    source_path = path or _configured_or_default("KAGGLE_HISTORY_MATCHES_FILE", OFFICIAL_RAW_DIR / "kaggle_matches")
    if source_path is None:
        fallback = ROOT / "data" / "worldcup" / "worldcup_reg90_matches.parquet"
        source_path = fallback if fallback.exists() else None
    return normalize_kaggle_frame(load_table(source_path))
