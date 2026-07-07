from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import pandas as pd
except Exception:  # pragma: no cover - script reports this when executed.
    pd = None  # type: ignore[assignment]


ROOT = Path(__file__).resolve().parents[2]
RAW_PATH = ROOT / "data" / "worldcup" / "raw" / "martj42" / "results.csv"
SHOOTOUTS_PATH = ROOT / "data" / "worldcup" / "raw" / "martj42" / "shootouts.csv"
OUTPUT_PATH = ROOT / "data" / "worldcup" / "international_elo_backfill.parquet"


@dataclass(frozen=True)
class EloConfig:
    base_elo: float = 1500.0
    home_advantage: float = 60.0
    k_factor: float = 32.0


def expected_score(elo_a: float, elo_b: float) -> float:
    return 1.0 / (1.0 + math.pow(10.0, (elo_b - elo_a) / 400.0))


def actual_score(home_goals: int, away_goals: int) -> float:
    if home_goals > away_goals:
        return 1.0
    if home_goals < away_goals:
        return 0.0
    return 0.5


def build_elo_backfill(results: Any, shootouts: Any | None = None, config: EloConfig | None = None) -> Any:
    if pd is None:
        raise RuntimeError("pandas is required to build the Elo backfill table")

    cfg = config or EloConfig()
    if results.empty:
        return _empty_output()

    frame = results.copy()
    frame.columns = [str(column).strip() for column in frame.columns]
    date_col = _first_existing(frame, ["date", "match_date"])
    home_col = _first_existing(frame, ["home_team", "home_team_name", "home"])
    away_col = _first_existing(frame, ["away_team", "away_team_name", "away"])
    home_score_col = _first_existing(frame, ["home_score", "home_goals", "home_score_ft"])
    away_score_col = _first_existing(frame, ["away_score", "away_goals", "away_score_ft"])
    neutral_col = _first_existing(frame, ["neutral"], required=False)
    shootout_lookup = _shootout_lookup(shootouts)

    frame[date_col] = pd.to_datetime(frame[date_col], errors="coerce")
    frame = frame.dropna(subset=[date_col, home_col, away_col]).sort_values(date_col)

    ratings: dict[str, float] = {}
    rows: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        home = str(row[home_col]).strip()
        away = str(row[away_col]).strip()
        if not home or not away:
            continue
        try:
            home_goals = int(row[home_score_col])
            away_goals = int(row[away_score_col])
        except (TypeError, ValueError):
            continue

        home_elo = ratings.get(home, cfg.base_elo)
        away_elo = ratings.get(away, cfg.base_elo)
        neutral = bool(row.get(neutral_col, False)) if neutral_col else False
        adjusted_home_elo = home_elo + (0 if neutral else cfg.home_advantage)
        expected_home = expected_score(adjusted_home_elo, away_elo)
        actual_home = actual_score(home_goals, away_goals)

        rows.append(
            {
                "match_date": row[date_col],
                "home_team_name": home,
                "away_team_name": away,
                "penalty_shootout": _has_shootout(row[date_col], home, away, shootout_lookup),
                "pre_home_elo": round(home_elo, 3),
                "pre_away_elo": round(away_elo, 3),
                "elo_diff_home": round(home_elo - away_elo, 3),
                "abs_elo_diff": round(abs(home_elo - away_elo), 3),
            }
        )

        change = cfg.k_factor * (actual_home - expected_home)
        ratings[home] = home_elo + change
        ratings[away] = away_elo - change

    return pd.DataFrame(rows)


def write_table(frame: Any, output_path: Path = OUTPUT_PATH) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        frame.to_parquet(output_path, index=False)
        return output_path
    except Exception:
        csv_path = output_path.with_suffix(".csv")
        frame.to_csv(csv_path, index=False)
        return csv_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build point-in-time international Elo table from martj42 results.csv")
    parser.add_argument("--input", default=str(RAW_PATH))
    parser.add_argument("--shootouts", default=str(SHOOTOUTS_PATH))
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    args = parser.parse_args()

    if pd is None:
        raise SystemExit("pandas is required: pip install pandas pyarrow")

    input_path = Path(args.input)
    if not input_path.exists():
        output = write_table(_empty_output(), Path(args.output))
        print(f"No martj42 results.csv found. Wrote empty Elo table: {output}")
        return

    frame = pd.read_csv(input_path)
    shootouts_path = Path(args.shootouts)
    shootouts = pd.read_csv(shootouts_path) if shootouts_path.exists() else pd.DataFrame()
    output = write_table(build_elo_backfill(frame, shootouts), Path(args.output))
    print(f"Wrote Elo backfill table: {output}")


def _first_existing(frame: Any, candidates: list[str], required: bool = True) -> str:
    lower = {str(column).lower(): str(column) for column in frame.columns}
    for candidate in candidates:
        if candidate.lower() in lower:
            return lower[candidate.lower()]
    if required:
        raise ValueError(f"Missing required column. Tried: {', '.join(candidates)}")
    return ""


def _shootout_lookup(shootouts: Any | None) -> set[tuple[str, str, str]]:
    if pd is None or shootouts is None or shootouts.empty:
        return set()
    frame = shootouts.copy()
    frame.columns = [str(column).strip() for column in frame.columns]
    date_col = _first_existing(frame, ["date", "match_date"], required=False)
    home_col = _first_existing(frame, ["home_team", "home_team_name", "home"], required=False)
    away_col = _first_existing(frame, ["away_team", "away_team_name", "away"], required=False)
    if not all([date_col, home_col, away_col]):
        return set()

    frame[date_col] = pd.to_datetime(frame[date_col], errors="coerce").dt.strftime("%Y-%m-%d")
    lookup: set[tuple[str, str, str]] = set()
    for _, row in frame.dropna(subset=[date_col, home_col, away_col]).iterrows():
        home = _norm_team(row[home_col])
        away = _norm_team(row[away_col])
        date = str(row[date_col])
        lookup.add((date, home, away))
        lookup.add((date, away, home))
    return lookup


def _has_shootout(date_value: Any, home: str, away: str, lookup: set[tuple[str, str, str]]) -> bool:
    if not lookup or pd is None:
        return False
    date = pd.to_datetime(date_value, errors="coerce").strftime("%Y-%m-%d")
    return (date, _norm_team(home), _norm_team(away)) in lookup


def _norm_team(value: Any) -> str:
    return str(value).strip().casefold()


def _empty_output() -> Any:
    if pd is None:
        return []
    return pd.DataFrame(
        columns=[
            "match_date",
            "home_team_name",
            "away_team_name",
            "penalty_shootout",
            "pre_home_elo",
            "pre_away_elo",
            "elo_diff_home",
            "abs_elo_diff",
        ]
    )


if __name__ == "__main__":
    main()
