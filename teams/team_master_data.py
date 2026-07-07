from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _first_existing(stem: Path) -> Path | None:
    for suffix in (".parquet", ".json", ".csv"):
        candidate = stem.with_suffix(suffix)
        if candidate.exists():
            return candidate
    return None


def _read_table(path: Path | None) -> pd.DataFrame:
    if path is None or not path.exists():
        return pd.DataFrame()
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    if path.suffix == ".json":
        return pd.read_json(path)
    if path.suffix == ".csv":
        return pd.read_csv(path)
    return pd.DataFrame()


def _team_id(name: str) -> str:
    value = name.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or re.sub(r"\s+", "-", name.strip())


def _latest_elo_by_team() -> dict[str, float]:
    frame = _read_table(ROOT / "data" / "worldcup" / "international_elo_backfill.parquet")
    if frame.empty:
        return {}

    team_column = next((column for column in ("team", "team_name", "country", "home_team_name") if column in frame.columns), None)
    elo_column = next((column for column in ("elo", "elo_rating", "rating", "pre_home_elo") if column in frame.columns), None)
    date_column = next((column for column in ("date", "match_date") if column in frame.columns), None)
    if team_column is None or elo_column is None:
        return {}

    usable = frame[[team_column, elo_column] + ([date_column] if date_column else [])].dropna(subset=[team_column, elo_column])
    if date_column:
        usable[date_column] = pd.to_datetime(usable[date_column], errors="coerce")
        usable = usable.sort_values(date_column)
    latest = usable.groupby(team_column, as_index=False).tail(1)
    return {str(row[team_column]): float(row[elo_column]) for _, row in latest.iterrows()}


def build_team_master_data() -> pd.DataFrame:
    official_path = _first_existing(ROOT / "data" / "official" / "official_matches")
    official = _read_table(official_path)
    if official.empty:
        return pd.DataFrame(columns=["team_id", "team_name", "fifa_rank", "elo_rating", "confederation"])

    teams = sorted(
        {
            str(value)
            for column in ("home_team", "away_team")
            if column in official.columns
            for value in official[column].dropna().tolist()
            if str(value).strip()
        }
    )
    elo_by_team = _latest_elo_by_team()
    rows = [
        {
            "team_id": _team_id(name),
            "team_name": name,
            "fifa_rank": None,
            "elo_rating": elo_by_team.get(name),
            "confederation": None,
        }
        for name in teams
    ]
    return pd.DataFrame(rows)


def write_team_master_data(frame: pd.DataFrame, output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = {
        "json": output_dir / "team_master.json",
        "csv": output_dir / "team_master.csv",
    }
    rows = frame.where(pd.notna(frame), None).to_dict(orient="records")
    outputs["json"].write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    frame.to_csv(outputs["csv"], index=False, encoding="utf-8")
    parquet_path = output_dir / "team_master.parquet"
    try:
        frame.to_parquet(parquet_path, index=False)
        outputs["parquet"] = parquet_path
    except Exception as exc:  # pragma: no cover
        warning_path = output_dir / "team_master.parquet.warning.txt"
        warning_path.write_text(f"Parquet export skipped: {exc}\n", encoding="utf-8")
        outputs["parquet_warning"] = warning_path
    return outputs


def main() -> None:
    output_dir = ROOT / "data" / "official"
    frame = build_team_master_data()
    outputs = write_team_master_data(frame, output_dir)
    print(
        json.dumps(
            {
                "team_count": int(len(frame)),
                "outputs": {key: str(value) for key, value in outputs.items()},
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

