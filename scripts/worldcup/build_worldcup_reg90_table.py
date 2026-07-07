from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

try:
    import pandas as pd
except Exception:  # pragma: no cover - script reports this when executed.
    pd = None  # type: ignore[assignment]


ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "worldcup" / "raw" / "fjelstul"
ELO_PATH = ROOT / "data" / "worldcup" / "international_elo_backfill.parquet"
OUTPUT_PATH = ROOT / "data" / "worldcup" / "worldcup_reg90_matches.parquet"


REQUIRED_COLUMNS = [
    "tournament_id",
    "match_id",
    "match_date",
    "stage_name",
    "group_stage",
    "knockout_stage",
    "home_team_name",
    "away_team_name",
    "extra_time",
    "penalty_shootout",
    "reg_home_score",
    "reg_away_score",
    "reg_score",
    "host_home",
    "host_away",
    "pre_home_elo",
    "pre_away_elo",
    "elo_diff_home",
    "abs_elo_diff",
]


def is_regulation_goal(row: Any) -> bool:
    """Return True for 90-minute goals, including 45+/90+ stoppage, excluding ET and shootouts."""

    if _truthy(_get(row, ["penalty_shootout", "shootout", "is_penalty_shootout"])):
        return False
    minute = _minute_value(_get(row, ["minute_regulation", "match_minute", "minute"]))
    stoppage = _minute_value(_get(row, ["minute_stoppage", "stoppage_minute", "minute_extra"]))
    if minute is None:
        return False
    if minute >= 91:
        return False
    if stoppage and minute not in {45, 90}:
        return False
    return 0 <= minute <= 90


def reconstruct_reg90_score(match_row: Any, goals: Any, home_col: str = "home_team_name", away_col: str = "away_team_name", match_id_col: str = "match_id") -> tuple[int, int]:
    if pd is None:
        raise RuntimeError("pandas is required to reconstruct scores")

    match_id = _get(match_row, [match_id_col, "match_id", "key_id", "id"])
    home_team = str(_get(match_row, [home_col, "home_team_name", "home_team", "home"]) or "").strip()
    away_team = str(_get(match_row, [away_col, "away_team_name", "away_team", "away"]) or "").strip()
    if goals.empty or not match_id:
        return 0, 0

    goal_match_col = _column(goals, ["match_id", "key_id", "id_match", "match"])
    team_col = _column(goals, ["team_name", "scoring_team_name", "team", "team_name_goal", "own_team_name"], required=False)
    own_goal_col = _column(goals, ["own_goal", "is_own_goal"], required=False)

    home_score = 0
    away_score = 0
    match_goals = goals[goals[goal_match_col].astype(str) == str(match_id)]
    for _, goal in match_goals.iterrows():
        if not is_regulation_goal(goal):
            continue
        scoring_team = str(goal.get(team_col, "")).strip() if team_col else ""
        own_goal = _truthy(goal.get(own_goal_col, False)) if own_goal_col else False
        if own_goal:
            if scoring_team == home_team:
                away_score += 1
            elif scoring_team == away_team:
                home_score += 1
            continue
        if scoring_team == home_team:
            home_score += 1
        elif scoring_team == away_team:
            away_score += 1
    return home_score, away_score


def build_reg90_table(matches: Any, goals: Any, stages: Any | None = None, hosts: Any | None = None, elo: Any | None = None) -> Any:
    if pd is None:
        raise RuntimeError("pandas is required to build the World Cup 90-minute table")
    if matches.empty:
        return _empty_output()

    frame = matches.copy()
    frame.columns = [str(column).strip() for column in frame.columns]
    goals = goals.copy() if goals is not None else pd.DataFrame()

    match_id_col = _column(frame, ["match_id", "key_id", "id"])
    tournament_col = _column(frame, ["tournament_id", "tournament", "year"], required=False)
    date_col = _column(frame, ["match_date", "date", "datetime", "kickoff_time"])
    stage_col = _column(frame, ["stage_name", "tournament_stage_name", "stage", "round"], required=False)
    home_col = _column(frame, ["home_team_name", "home_team", "team_name_home", "home"])
    away_col = _column(frame, ["away_team_name", "away_team", "team_name_away", "away"])
    extra_time_col = _column(frame, ["extra_time", "went_to_extra_time"], required=False)
    shootout_col = _column(frame, ["penalty_shootout", "shootout", "went_to_penalties"], required=False)

    stage_lookup = _stage_lookup(stages)
    host_lookup = _host_lookup(hosts)
    elo_lookup = _elo_lookup(elo)

    rows: list[dict[str, Any]] = []
    for _, match in frame.iterrows():
        match_id = str(match[match_id_col])
        tournament_id = str(match.get(tournament_col, "")).strip() if tournament_col else _year_from_date(match.get(date_col))
        home_team = str(match[home_col]).strip()
        away_team = str(match[away_col]).strip()
        stage_name = _resolve_stage(match, stage_col, stage_lookup)
        reg_home, reg_away = reconstruct_reg90_score(match, goals, home_col, away_col, match_id_col)
        pre_home_elo, pre_away_elo = _resolve_elo(match, home_team, away_team, elo_lookup)
        group_stage = _is_group_stage(stage_name)
        tournament_hosts = host_lookup.get(tournament_id, set())

        rows.append(
            {
                "tournament_id": tournament_id,
                "match_id": match_id,
                "match_date": match.get(date_col),
                "stage_name": stage_name,
                "group_stage": group_stage,
                "knockout_stage": not group_stage,
                "home_team_name": home_team,
                "away_team_name": away_team,
                "extra_time": _truthy(match.get(extra_time_col, False)) if extra_time_col else False,
                "penalty_shootout": _truthy(match.get(shootout_col, False)) if shootout_col else False,
                "reg_home_score": int(reg_home),
                "reg_away_score": int(reg_away),
                "reg_score": f"{int(reg_home)}-{int(reg_away)}",
                "host_home": home_team in tournament_hosts,
                "host_away": away_team in tournament_hosts,
                "pre_home_elo": pre_home_elo,
                "pre_away_elo": pre_away_elo,
                "elo_diff_home": pre_home_elo - pre_away_elo,
                "abs_elo_diff": abs(pre_home_elo - pre_away_elo),
            }
        )

    out = pd.DataFrame(rows)
    out["match_date"] = pd.to_datetime(out["match_date"], errors="coerce")
    return out[REQUIRED_COLUMNS]


def read_optional_table(path: Path) -> Any:
    if pd is None:
        raise RuntimeError("pandas is required")
    if not path.exists():
        return pd.DataFrame()
    if path.suffix.lower() == ".parquet":
        return pd.read_parquet(path)
    return pd.read_csv(path)


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
    parser = argparse.ArgumentParser(description="Build World Cup 90-minute match table from Fjelstul event-level data")
    parser.add_argument("--raw-dir", default=str(RAW_DIR))
    parser.add_argument("--elo", default=str(ELO_PATH))
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    args = parser.parse_args()

    if pd is None:
        raise SystemExit("pandas is required: pip install pandas pyarrow")

    raw_dir = Path(args.raw_dir)
    matches_path = raw_dir / "matches.csv"
    goals_path = raw_dir / "goals.csv"
    if not matches_path.exists() or not goals_path.exists():
        output = write_table(_empty_output(), Path(args.output))
        print(f"Missing Fjelstul matches.csv or goals.csv. Wrote empty 90-minute table: {output}")
        return

    matches = pd.read_csv(matches_path)
    goals = pd.read_csv(goals_path)
    stages = read_optional_table(raw_dir / "tournament_stages.csv")
    hosts = read_optional_table(raw_dir / "host_countries.csv")
    elo = read_optional_table(Path(args.elo))
    output = write_table(build_reg90_table(matches, goals, stages, hosts, elo), Path(args.output))
    print(f"Wrote World Cup 90-minute table: {output}")


def _column(frame: Any, candidates: list[str], required: bool = True) -> str:
    lower = {str(column).lower(): str(column) for column in frame.columns}
    for candidate in candidates:
        if candidate.lower() in lower:
            return lower[candidate.lower()]
    if required:
        raise ValueError(f"Missing required column. Tried: {', '.join(candidates)}")
    return ""


def _get(row: Any, candidates: list[str]) -> Any:
    for candidate in candidates:
        try:
            if candidate in row:
                return row[candidate]
        except TypeError:
            pass
        if hasattr(row, "get"):
            value = row.get(candidate)
            if value is not None:
                return value
    return None


def _minute_value(value: Any) -> int | None:
    if value is None:
        return None
    try:
        if pd is not None and pd.isna(value):
            return None
    except TypeError:
        pass
    text = str(value).strip().replace("+", " ")
    if not text:
        return None
    try:
        return int(float(text.split()[0]))
    except ValueError:
        return None


def _truthy(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "y", "t"}


def _stage_lookup(stages: Any | None) -> dict[str, str]:
    if pd is None or stages is None or stages.empty:
        return {}
    key_col = _column(stages, ["stage_id", "tournament_stage_id", "key_id", "id"], required=False)
    name_col = _column(stages, ["stage_name", "tournament_stage_name", "name"], required=False)
    if not key_col or not name_col:
        return {}
    return {str(row[key_col]): str(row[name_col]) for _, row in stages.iterrows()}


def _resolve_stage(match: Any, stage_col: str, stage_lookup: dict[str, str]) -> str:
    if stage_col:
        raw = str(match.get(stage_col, "")).strip()
        if raw in stage_lookup:
            return stage_lookup[raw]
        if raw:
            return raw
    stage_id = _get(match, ["stage_id", "tournament_stage_id"])
    return stage_lookup.get(str(stage_id), "Unknown")


def _host_lookup(hosts: Any | None) -> dict[str, set[str]]:
    if pd is None or hosts is None or hosts.empty:
        return {}
    tournament_col = _column(hosts, ["tournament_id", "tournament", "year"], required=False)
    name_col = _column(hosts, ["host_country_name", "country_name", "team_name", "host_name", "name"], required=False)
    if not name_col:
        return {}
    lookup: dict[str, set[str]] = {}
    for _, row in hosts.iterrows():
        raw_name = row.get(name_col)
        if pd.isna(raw_name):
            continue
        team_name = str(raw_name).strip()
        if not team_name:
            continue
        tournament_id = str(row.get(tournament_col, "")).strip() if tournament_col else ""
        lookup.setdefault(tournament_id, set()).add(team_name)
    return lookup


def _elo_lookup(elo: Any | None) -> dict[tuple[str, str, str], tuple[float, float]]:
    if pd is None or elo is None or elo.empty:
        return {}
    home_col = _column(elo, ["home_team_name", "home_team", "home"], required=False)
    away_col = _column(elo, ["away_team_name", "away_team", "away"], required=False)
    date_col = _column(elo, ["match_date", "date"], required=False)
    home_elo_col = _column(elo, ["pre_home_elo"], required=False)
    away_elo_col = _column(elo, ["pre_away_elo"], required=False)
    if not all([home_col, away_col, date_col, home_elo_col, away_elo_col]):
        return {}
    frame = elo.copy()
    frame[date_col] = pd.to_datetime(frame[date_col], errors="coerce").dt.strftime("%Y-%m-%d")
    return {
        (str(row[date_col]), str(row[home_col]).strip(), str(row[away_col]).strip()): (float(row[home_elo_col]), float(row[away_elo_col]))
        for _, row in frame.dropna(subset=[date_col, home_col, away_col]).iterrows()
    }


def _resolve_elo(match: Any, home_team: str, away_team: str, lookup: dict[tuple[str, str, str], tuple[float, float]]) -> tuple[float, float]:
    match_date = _get(match, ["match_date", "date", "datetime", "kickoff_time"])
    key_date = ""
    if pd is not None:
        key_date = pd.to_datetime(match_date, errors="coerce").strftime("%Y-%m-%d")
    return lookup.get((key_date, home_team, away_team), (1500.0, 1500.0))


def _is_group_stage(stage_name: str) -> bool:
    text = str(stage_name).lower()
    return "group" in text or "小组" in text


def _year_from_date(value: Any) -> str:
    if pd is None:
        return ""
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return ""
    return str(parsed.year)


def _empty_output() -> Any:
    if pd is None:
        return []
    return pd.DataFrame(columns=REQUIRED_COLUMNS)


if __name__ == "__main__":
    main()
