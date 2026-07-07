from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    import pandas as pd
except Exception:  # pragma: no cover - reports a skipped backtest when pandas is unavailable.
    pd = None  # type: ignore[assignment]

from scripts.worldcup.build_worldcup_hist_priors import build_hist_priors
from services.parlay_3x1_ranker import rank_3x1_combinations
from services.worldcup_score_enhancer import enhance_match_scores, load_config

DATA_PATH = ROOT / "data" / "worldcup" / "worldcup_reg90_matches.parquet"
OUTPUT_PATH = ROOT / "artifacts" / "worldcup_enhancer_report.json"


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if pd is None:
        _write_skipped("pandas_not_installed")
        return

    frame = _read_dataset(DATA_PATH)
    if frame.empty:
        _write_skipped("worldcup_reg90_matches_not_found")
        return

    frame = frame.copy()
    frame["tournament_year"] = frame.apply(_tournament_year, axis=1)
    folds = [
        {"train_lte": 2014, "test": 2018},
        {"train_lte": 2018, "test": 2022},
    ]
    config = load_config()
    fold_reports = []
    for fold in folds:
        train = frame[frame["tournament_year"] <= fold["train_lte"]]
        test = frame[frame["tournament_year"] == fold["test"]]
        if train.empty or test.empty:
            fold_reports.append({"fold": fold, "status": "skipped", "reason": "missing_train_or_test_rows"})
            continue
        priors = build_hist_priors(train, lmbda=float(config.get("smoothing", {}).get("lambda", 25)))
        fold_reports.append(_evaluate_fold(test, priors, config, fold))

    aggregate = _aggregate(fold_reports)
    promotion_gate = _promotion_gate(fold_reports, aggregate, config)
    payload = {
        "status": "ok",
        "folds": fold_reports,
        "aggregate": aggregate,
        "promotion_gate": promotion_gate,
        "data_contract": {
            "score_target": "90-minute regulation result including stoppage time; extra time and penalties excluded",
            "split_policy": "rolling leave-one-tournament-out: train <= 2014 test 2018, train <= 2018 test 2022",
            "leakage_guard": "historical priors are rebuilt from train folds only; test tournament rows are not used in priors",
            "backtest_baseline_note": "Backtest uses an Elo-derived Poisson proxy PMF when the production exact-score model output is unavailable.",
        },
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote World Cup enhancer backtest report: {OUTPUT_PATH}")


def _read_dataset(path: Path) -> Any:
    if path.exists():
        return pd.read_parquet(path)
    csv_path = path.with_suffix(".csv")
    if csv_path.exists():
        return pd.read_csv(csv_path)
    return pd.DataFrame()


def _evaluate_fold(test: Any, priors: dict[str, Any], config: dict[str, Any], fold: dict[str, int]) -> dict[str, Any]:
    base_hits = 0
    filtered_hits = 0
    filtered_total = 0
    total = 0
    enhanced_matches: list[dict[str, Any]] = []
    calibration_bins: dict[str, dict[str, float]] = {}

    for _, row in test.iterrows():
        actual = str(row["reg_score"]).replace(":", "-")
        match_input = _row_to_match_input(row)
        base_top3 = _top3_from_pmf(match_input["score_probs"])
        total += 1
        if actual in base_top3:
            base_hits += 1

        enhancement = enhance_match_scores(match_input, priors_override=priors, config_override=config)
        adjusted_scores = {item["score"] for item in enhancement["adjusted_top3"]}
        if enhancement["keep"]:
            filtered_total += 1
            if actual in adjusted_scores:
                filtered_hits += 1
            enhanced_matches.append({"match_id": match_input["match_id"], "match_input": match_input, "enhancement": enhancement})
        _record_calibration(calibration_bins, enhancement["mass3"], actual in adjusted_scores)

    combos = rank_3x1_combinations(enhanced_matches, top_n=250)
    actual_by_match = {str(row["match_id"]): str(row["reg_score"]).replace(":", "-") for _, row in test.iterrows()}
    combo_hits = 0
    for combo in combos:
        if all(actual_by_match.get(str(leg["match_id"])) in {item["score"] for item in leg["adjusted_top3"]} for leg in combo["legs"]):
            combo_hits += 1

    base_hit_rate = base_hits / total if total else None
    filtered_hit_rate = filtered_hits / filtered_total if filtered_total else None
    return {
        "fold": fold,
        "status": "ok",
        "matches": total,
        "kept_matches": filtered_total,
        "base_top3_hit": base_hit_rate,
        "filtered_top3_hit": filtered_hit_rate,
        "lift": (filtered_hit_rate - base_hit_rate) if filtered_hit_rate is not None and base_hit_rate is not None else None,
        "coverage": filtered_total / total if total else None,
        "combo_3x1_hit": combo_hits / len(combos) if combos else None,
        "combo_count": len(combos),
        "promotion_ready": (filtered_hit_rate is not None and base_hit_rate is not None and filtered_hit_rate >= base_hit_rate),
        "calibration_table": _calibration_table(calibration_bins),
    }


def _row_to_match_input(row: Any) -> dict[str, Any]:
    elo_home = float(_get(row, "pre_home_elo", 1500) or 1500)
    elo_away = float(_get(row, "pre_away_elo", 1500) or 1500)
    elo_diff = elo_home - elo_away
    expected_home = _clamp(1.24 + elo_diff / 550 + (0.15 if bool(_get(row, "host_home", False)) else 0), 0.35, 3.2)
    expected_away = _clamp(1.05 - elo_diff / 650 + (0.15 if bool(_get(row, "host_away", False)) else 0), 0.25, 3.0)
    score_probs = _poisson_score_probs(expected_home, expected_away)
    return {
        "match_id": str(_get(row, "match_id", "")),
        "stage": "knockout" if bool(_get(row, "knockout_stage", False)) else "group",
        "is_host_home": bool(_get(row, "host_home", False)),
        "is_host_away": bool(_get(row, "host_away", False)),
        "elo_home": elo_home,
        "elo_away": elo_away,
        "market_p_home": None,
        "market_p_draw": None,
        "market_p_away": None,
        "xg_home": expected_home,
        "xg_away": expected_away,
        "score_probs": score_probs,
        "score_bonus": _synthetic_bonus(score_probs),
        "actual_score": str(_get(row, "reg_score", "")).replace(":", "-"),
    }


def _poisson_score_probs(home_lambda: float, away_lambda: float) -> dict[str, float]:
    pmf = {}
    for home in range(7):
        for away in range(7):
            pmf[f"{home}-{away}"] = _poisson(home, home_lambda) * _poisson(away, away_lambda)
    total = sum(pmf.values()) or 1.0
    return {score: value / total for score, value in pmf.items()}


def _synthetic_bonus(score_probs: dict[str, float]) -> dict[str, float]:
    return {score: _clamp(1 / max(prob, 0.001), 2.0, 80.0) for score, prob in score_probs.items()}


def _top3_from_pmf(pmf: dict[str, float]) -> set[str]:
    return {score for score, _ in sorted(pmf.items(), key=lambda item: item[1], reverse=True)[:3]}


def _record_calibration(bins: dict[str, dict[str, float]], mass3: float, hit: bool) -> None:
    if mass3 < 0.38:
        key = "<0.38"
    elif mass3 < 0.44:
        key = "0.38-0.44"
    elif mass3 < 0.55:
        key = "0.44-0.55"
    else:
        key = ">=0.55"
    bucket = bins.setdefault(key, {"n": 0, "hits": 0})
    bucket["n"] += 1
    bucket["hits"] += 1 if hit else 0


def _calibration_table(bins: dict[str, dict[str, float]]) -> list[dict[str, float | str]]:
    rows = []
    for key, value in sorted(bins.items()):
        n = value["n"]
        rows.append({"bucket": key, "n": n, "hit_rate": value["hits"] / n if n else 0})
    return rows


def _aggregate(folds: list[dict[str, Any]]) -> dict[str, Any]:
    ok = [fold for fold in folds if fold.get("status") == "ok"]
    if not ok:
        return {"status": "skipped", "reason": "no_completed_folds"}
    aggregate = {
        "base_top3_hit": _weighted(ok, "base_top3_hit", "matches"),
        "filtered_top3_hit": _weighted(ok, "filtered_top3_hit", "kept_matches"),
        "coverage": _weighted(ok, "coverage", "matches"),
        "combo_3x1_hit": _mean([fold["combo_3x1_hit"] for fold in ok if fold.get("combo_3x1_hit") is not None]),
    }
    if aggregate["base_top3_hit"] is not None and aggregate["filtered_top3_hit"] is not None:
        aggregate["lift"] = aggregate["filtered_top3_hit"] - aggregate["base_top3_hit"]
    else:
        aggregate["lift"] = None
    return aggregate


def _promotion_gate(folds: list[dict[str, Any]], aggregate: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    ok = [fold for fold in folds if fold.get("status") == "ok"]
    min_lift = float(_cfg(config, "promotion.min_lift", 0.0))
    min_coverage = float(_cfg(config, "promotion.min_coverage", 0.15))
    require_all_fold_lift_nonnegative = bool(_cfg(config, "promotion.require_all_fold_lift_nonnegative", True))

    aggregate_lift = aggregate.get("lift")
    coverage = aggregate.get("coverage")
    fold_lifts = [fold.get("lift") for fold in ok if fold.get("lift") is not None]
    failures: list[str] = []

    if aggregate_lift is None or float(aggregate_lift) < min_lift:
        failures.append("aggregate_lift_below_gate")
    if coverage is None or float(coverage) < min_coverage:
        failures.append("coverage_below_gate")
    if require_all_fold_lift_nonnegative and any(float(lift) < 0 for lift in fold_lifts):
        failures.append("one_or_more_folds_negative_lift")

    decision = "promotion_ready" if not failures else "advisory_only"
    return {
        "decision": decision,
        "can_affect_recommendations": not failures,
        "failures": failures,
        "thresholds": {
            "min_lift": min_lift,
            "min_coverage": min_coverage,
            "require_all_fold_lift_nonnegative": require_all_fold_lift_nonnegative,
        },
        "reason": (
            "World Cup historical enhancer passed rolling backtest gates."
            if not failures
            else "World Cup historical enhancer did not beat the baseline in rolling backtest, so it must stay as an explanation and analysis layer."
        ),
    }


def _weighted(rows: list[dict[str, Any]], metric: str, weight_key: str) -> float | None:
    pairs = [(row.get(metric), row.get(weight_key, 0)) for row in rows if row.get(metric) is not None]
    total_weight = sum(float(weight) for _, weight in pairs)
    if total_weight <= 0:
        return None
    return sum(float(value) * float(weight) for value, weight in pairs) / total_weight


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _tournament_year(row: Any) -> int:
    raw = str(_get(row, "tournament_id", "") or "")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) >= 4:
        return int(digits[:4])
    return int(str(_get(row, "match_date", "0"))[:4])


def _write_skipped(reason: str) -> None:
    payload = {
        "status": "skipped",
        "reason": reason,
        "promotion_gate": {
            "decision": "advisory_only",
            "can_affect_recommendations": False,
            "failures": [reason],
        },
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Skipped World Cup enhancer backtest: {reason}")


def _get(row: Any, key: str, default: Any = None) -> Any:
    return row.get(key, default) if hasattr(row, "get") else default


def _poisson(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam**k) / math.factorial(k)


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def _cfg(config: dict[str, Any], dotted_path: str, default: Any) -> Any:
    current: Any = config
    for part in dotted_path.split("."):
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


if __name__ == "__main__":
    main()
