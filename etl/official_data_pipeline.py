from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from data_sources.official_sources import (  # noqa: E402
    PREDICTION_COLUMN_HINTS,
    load_fifa_official_records,
    load_kaggle_history_records,
    load_uefa_records,
)


OFFICIAL_COLUMNS = [
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

def _drop_untrusted_columns(frame: pd.DataFrame) -> pd.DataFrame:
    allowed = [column for column in OFFICIAL_COLUMNS if column in frame.columns]
    return frame.loc[:, allowed].copy()


def _clean_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame(columns=OFFICIAL_COLUMNS)

    cleaned = _drop_untrusted_columns(frame)
    for column in OFFICIAL_COLUMNS:
        if column not in cleaned.columns:
            cleaned[column] = None

    cleaned = cleaned[OFFICIAL_COLUMNS]
    cleaned = cleaned.dropna(subset=["match_id", "home_team", "away_team"], how="any")
    cleaned = cleaned[cleaned["match_id"].astype(str).str.len() > 0]
    cleaned["score_90min"] = cleaned["score_90min"].fillna("")
    cleaned["stage"] = cleaned["stage"].fillna("unknown")
    cleaned["match_date"] = pd.to_datetime(cleaned["match_date"], errors="coerce", utc=True)
    cleaned["is_extra_time"] = cleaned["is_extra_time"].fillna(False).astype(bool)
    cleaned["is_penalty"] = cleaned["is_penalty"].fillna(False).astype(bool)
    cleaned["source_priority"] = pd.to_numeric(cleaned["source_priority"], errors="coerce").fillna(0).astype(int)
    cleaned["confidence"] = pd.to_numeric(cleaned["confidence"], errors="coerce").fillna(0.0)

    forbidden = [
        column
        for column in frame.columns
        if any(hint in column.lower() for hint in PREDICTION_COLUMN_HINTS)
    ]
    if forbidden:
        raise ValueError(f"Prediction fields are not allowed in official truth layer: {forbidden}")

    return cleaned


def build_official_matches(
    fifa: pd.DataFrame | None = None,
    uefa: pd.DataFrame | None = None,
    kaggle: pd.DataFrame | None = None,
) -> pd.DataFrame:
    frames = [
        fifa if fifa is not None else load_fifa_official_records(),
        uefa if uefa is not None else load_uefa_records(),
        kaggle if kaggle is not None else load_kaggle_history_records(),
    ]
    non_empty = [_clean_frame(frame) for frame in frames if frame is not None and not frame.empty]
    if not non_empty:
        return pd.DataFrame(columns=OFFICIAL_COLUMNS)

    merged = pd.concat(non_empty, ignore_index=True)
    merged = merged.sort_values(
        by=["match_id", "source_priority", "match_date"],
        ascending=[True, False, False],
        na_position="last",
    )
    merged = merged.drop_duplicates(subset=["match_id"], keep="first")
    merged = merged.sort_values(by=["match_date", "match_id"], na_position="last").reset_index(drop=True)
    return merged[OFFICIAL_COLUMNS]


def _json_safe_rows(frame: pd.DataFrame) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for row in frame.to_dict(orient="records"):
        clean: dict[str, object] = {}
        for key, value in row.items():
            if pd.isna(value):
                clean[key] = None
            elif hasattr(value, "isoformat"):
                clean[key] = value.isoformat()
            else:
                clean[key] = value
        rows.append(clean)
    return rows


def write_official_matches(frame: pd.DataFrame, output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = {
        "json": output_dir / "official_matches.json",
        "csv": output_dir / "official_matches.csv",
    }

    rows = _json_safe_rows(frame)
    outputs["json"].write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    frame.to_csv(outputs["csv"], index=False, encoding="utf-8")

    parquet_path = output_dir / "official_matches.parquet"
    try:
        frame.to_parquet(parquet_path, index=False)
        outputs["parquet"] = parquet_path
    except Exception as exc:  # pragma: no cover - depends on optional parquet engine
        warning_path = output_dir / "official_matches.parquet.warning.txt"
        warning_path.write_text(
            f"Parquet export skipped because pandas has no parquet engine or export failed: {exc}\n",
            encoding="utf-8",
        )
        outputs["parquet_warning"] = warning_path

    return outputs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Official Football Truth Layer.")
    parser.add_argument("--output-dir", default=str(ROOT / "data" / "official"))
    parser.add_argument("--fifa-file", default=None)
    parser.add_argument("--uefa-file", default=None)
    parser.add_argument("--kaggle-file", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    fifa = load_fifa_official_records(Path(args.fifa_file)) if args.fifa_file else None
    uefa = load_uefa_records(Path(args.uefa_file)) if args.uefa_file else None
    kaggle = load_kaggle_history_records(Path(args.kaggle_file)) if args.kaggle_file else None
    official = build_official_matches(fifa=fifa, uefa=uefa, kaggle=kaggle)
    outputs = write_official_matches(official, Path(args.output_dir))
    source_counts = official["source"].value_counts().to_dict() if not official.empty else {}
    print(
        json.dumps(
            {
                "record_count": int(len(official)),
                "source_counts": source_counts,
                "outputs": {key: str(value) for key, value in outputs.items()},
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
