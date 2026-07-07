from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

try:
    import pandas as pd
except Exception:  # pragma: no cover - script reports this when executed.
    pd = None  # type: ignore[assignment]

try:
    import yaml
except Exception:  # pragma: no cover - PyYAML is optional.
    yaml = None


ROOT = Path(__file__).resolve().parents[2]
INPUT_PATH = ROOT / "data" / "worldcup" / "worldcup_reg90_matches.parquet"
CONFIG_PATH = ROOT / "config" / "worldcup_enhancer.yaml"
OUTPUT_PATH = ROOT / "data" / "worldcup" / "hist_score_priors.json"

COMMON_SCORES = ["0-0", "1-0", "0-1", "1-1", "2-0", "0-2", "2-1", "1-2", "2-2", "3-0", "0-3"]


def elo_bucket(abs_elo_diff: float, balanced_max: float = 60, strong_min: float = 150) -> str:
    if abs_elo_diff <= balanced_max:
        return "balanced"
    if abs_elo_diff < strong_min:
        return "mid_gap"
    return "strong_gap"


def stage_bucket(row: Any) -> str:
    if bool(_get(row, "knockout_stage", False)):
        return "knockout"
    text = str(_get(row, "stage_name", "")).lower()
    return "group" if "group" in text or "小组" in text else "knockout"


def host_flag(row: Any) -> str:
    return "host_involved" if bool(_get(row, "host_home", False)) or bool(_get(row, "host_away", False)) else "no_host"


def score_pmf(scores: list[str]) -> dict[str, float]:
    if not scores:
        return {}
    counts = Counter(normalize_score(score) for score in scores)
    total = sum(counts.values()) or 1
    return {score: count / total for score, count in sorted(counts.items())}


def smooth_pmf(bucket_pmf: dict[str, float], parent_pmf: dict[str, float], n: int, lmbda: float) -> dict[str, float]:
    all_scores = set(bucket_pmf) | set(parent_pmf)
    if not all_scores:
        return {}
    smoothed = {
        score: (n * float(bucket_pmf.get(score, 0.0)) + lmbda * float(parent_pmf.get(score, 0.0))) / (n + lmbda)
        for score in all_scores
    }
    total = sum(smoothed.values()) or 1.0
    return {score: value / total for score, value in sorted(smoothed.items())}


def build_hist_priors(frame: Any, lmbda: float = 25, balanced_max: float = 60, strong_min: float = 150) -> dict[str, Any]:
    if pd is None:
        raise RuntimeError("pandas is required to build historical priors")
    if frame.empty:
        return fallback_priors("empty_worldcup_reg90_table")

    data = frame.copy()
    data["reg_score"] = data["reg_score"].map(normalize_score)
    data = data.dropna(subset=["reg_score"])
    if data.empty:
        return fallback_priors("no_reg90_scores")

    global_pmf = score_pmf(data["reg_score"].tolist())
    parents: dict[str, dict[str, Any]] = {}
    for parent in ["group", "knockout"]:
        subset = data[data.apply(lambda row: stage_bucket(row) == parent, axis=1)]
        parents[parent] = prior_summary(score_pmf(subset["reg_score"].tolist()), int(len(subset)))

    buckets: dict[str, dict[str, Any]] = {}
    for stage in ["group", "knockout"]:
        stage_subset = data[data.apply(lambda row: stage_bucket(row) == stage, axis=1)]
        parent_pmf = parents.get(stage, {}).get("pmf", global_pmf) or global_pmf
        for elo_name in ["balanced", "mid_gap", "strong_gap"]:
            for host_name in ["host_involved", "no_host"]:
                subset = stage_subset[
                    (stage_subset["abs_elo_diff"].map(lambda value: elo_bucket(float(value), balanced_max, strong_min)) == elo_name)
                    & (stage_subset.apply(lambda row: host_flag(row) == host_name, axis=1))
                ]
                raw = score_pmf(subset["reg_score"].tolist())
                pmf = smooth_pmf(raw, parent_pmf, int(len(subset)), lmbda)
                buckets[f"{stage}|{elo_name}|{host_name}"] = prior_summary(pmf, int(len(subset)), smoothed_from_parent=True)

    return {
        "meta": {
            "source": "fjelstul_worldcup_goals_rebuilt_reg90",
            "note": "Scores are reconstructed from goal events. Extra time and shootouts are excluded.",
            "lambda": lmbda,
            "rows": int(len(data)),
        },
        "global": prior_summary(global_pmf, int(len(data))),
        "parents": parents,
        "buckets": buckets,
    }


def prior_summary(pmf: dict[str, float], n: int, smoothed_from_parent: bool = False) -> dict[str, Any]:
    normalised = _normalize_pmf(pmf)
    top3 = [{"score": score, "probability": probability} for score, probability in top_scores(normalised, 3)]
    return {
        "n": n,
        "pmf": normalised,
        "top3": top3,
        "top3_mass": sum(item["probability"] for item in top3),
        "common_scores": {score: normalised.get(score, 0.0) for score in COMMON_SCORES},
        "smoothed_from_parent": smoothed_from_parent,
    }


def fallback_priors(reason: str) -> dict[str, Any]:
    fallback_pmf = {
        "0-0": 0.078,
        "1-0": 0.118,
        "0-1": 0.086,
        "1-1": 0.125,
        "2-0": 0.084,
        "0-2": 0.058,
        "2-1": 0.096,
        "1-2": 0.071,
        "2-2": 0.041,
        "3-0": 0.041,
        "0-3": 0.027,
        "3-1": 0.044,
        "1-3": 0.031,
    }
    summary = prior_summary(fallback_pmf, 0)
    return {
        "meta": {"source": "fallback_common_worldcup_shape", "reason": reason},
        "global": summary,
        "parents": {"group": summary, "knockout": summary},
        "buckets": {},
    }


def read_table(path: Path) -> Any:
    if pd is None:
        raise RuntimeError("pandas is required")
    if not path.exists():
        csv_path = path.with_suffix(".csv")
        if csv_path.exists():
            return pd.read_csv(csv_path)
        return pd.DataFrame()
    if path.suffix.lower() == ".parquet":
        return pd.read_parquet(path)
    return pd.read_csv(path)


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    if yaml:
        return yaml.safe_load(text) or {}
    return {}


def write_json(payload: dict[str, Any], output_path: Path = OUTPUT_PATH) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def top_scores(pmf: dict[str, float], count: int) -> list[tuple[str, float]]:
    return sorted(pmf.items(), key=lambda item: item[1], reverse=True)[:count]


def normalize_score(score: Any) -> str:
    return str(score).strip().replace(":", "-")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build World Cup historical 90-minute exact-score priors")
    parser.add_argument("--input", default=str(INPUT_PATH))
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    parser.add_argument("--lambda", dest="smooth_lambda", type=float, default=None)
    args = parser.parse_args()

    if pd is None:
        raise SystemExit("pandas is required: pip install pandas pyarrow")

    config = load_config()
    lmbda = args.smooth_lambda or float(config.get("smoothing", {}).get("lambda", 25))
    balanced_max = float(config.get("elo_buckets", {}).get("balanced_max_abs_diff", 60))
    strong_min = float(config.get("elo_buckets", {}).get("mid_gap_max_abs_diff", 150))
    priors = build_hist_priors(read_table(Path(args.input)), lmbda, balanced_max, strong_min)
    write_json(priors, Path(args.output))
    print(f"Wrote World Cup historical score priors: {args.output}")


def _normalize_pmf(pmf: dict[str, float]) -> dict[str, float]:
    total = sum(float(value) for value in pmf.values())
    if total <= 0:
        return {}
    return {score: float(value) / total for score, value in sorted(pmf.items())}


def _get(row: Any, key: str, default: Any = None) -> Any:
    if hasattr(row, "get"):
        return row.get(key, default)
    return default


if __name__ == "__main__":
    main()
