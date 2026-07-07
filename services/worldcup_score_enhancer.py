from __future__ import annotations

import json
import math
from pathlib import Path
from statistics import mean
from typing import Any

try:
    import yaml
except Exception:  # pragma: no cover - PyYAML is optional at runtime.
    yaml = None

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "worldcup_enhancer.yaml"
PRIORS_PATH = ROOT / "data" / "worldcup" / "hist_score_priors.json"

DEFAULT_COMMON_PMF = {
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


def load_config(path: str | Path = CONFIG_PATH) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as handle:
        if yaml:
            return yaml.safe_load(handle) or {}
        return _parse_simple_yaml(handle.read())


def _parse_simple_yaml(text: str) -> dict[str, Any]:
    root: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, root)]
    for raw_line in text.splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        key, _, value = raw_line.strip().partition(":")
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if value.strip() == "":
            child: dict[str, Any] = {}
            parent[key] = child
            stack.append((indent, child))
        else:
            parent[key] = _coerce_scalar(value.strip())
    return root


def _coerce_scalar(value: str) -> Any:
    if value.lower() in {"true", "false"}:
        return value.lower() == "true"
    try:
        return int(value)
    except ValueError:
        try:
            return float(value)
        except ValueError:
            return value.strip("\"'")


def load_hist_priors(path: str | Path = PRIORS_PATH) -> dict[str, Any]:
    target = Path(path)
    if target.exists():
        with target.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    return {
        "meta": {"source": "fallback_common_worldcup_shape", "note": "No generated priors file found."},
        "parents": {
            "group": _prior_summary(DEFAULT_COMMON_PMF, 0),
            "knockout": _prior_summary(DEFAULT_COMMON_PMF, 0),
        },
        "buckets": {},
    }


def enhance_match_scores(
    match_input: dict[str, Any],
    priors_override: dict[str, Any] | None = None,
    config_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    config = config_override or load_config()
    priors = priors_override or load_hist_priors()
    hist_bucket = bucket_for_match(match_input, config)

    model_pmf = _normalise_pmf(match_input.get("score_probs", {}))
    if not model_pmf:
        raise ValueError("match_input.score_probs must contain at least one score probability")

    raw_top3 = _top_scores(model_pmf, 3)
    scores = sorted(model_pmf)
    implied = normalize_implied_prob(match_input.get("score_bonus", {}), scores)
    hist_pmf = _hist_pmf_for_bucket(priors, hist_bucket["key"])

    adjusted_raw: dict[str, dict[str, float]] = {}
    min_prob = _cfg(config, "enhancement.min_probability", 0.000001)
    model_power = _cfg(config, "enhancement.model_power", 0.60)
    hist_power = _cfg(config, "enhancement.hist_power", 0.25)
    edge_weight = _cfg(config, "enhancement.edge_weight", 0.15)

    target_total = float(match_input.get("xg_home", 0) or 0) + float(match_input.get("xg_away", 0) or 0)
    target_diff = float(match_input.get("xg_home", 0) or 0) - float(match_input.get("xg_away", 0) or 0)

    for score, model_prob in model_pmf.items():
        home_goals, away_goals = parse_score(score)
        hist_prob = max(float(hist_pmf.get(score, min_prob)), min_prob)
        implied_prob = max(implied.get(score, min_prob), min_prob)
        edge = math.log(max(model_prob, min_prob) / implied_prob)
        k_total = _gaussian_kernel(home_goals + away_goals, target_total, _cfg(config, "enhancement.total_goal_sigma", 1.15))
        k_diff = _gaussian_kernel(home_goals - away_goals, target_diff, _cfg(config, "enhancement.goal_diff_sigma", 1.10))
        raw = (
            (max(model_prob, min_prob) ** model_power)
            * (hist_prob ** hist_power)
            * math.exp(edge_weight * edge)
            * k_total
            * k_diff
        )
        adjusted_raw[score] = {
            "raw": raw,
            "modelProbability": model_prob,
            "historicalProbability": hist_prob,
            "impliedProbability": implied_prob,
            "edge": edge,
        }

    raw_total = sum(item["raw"] for item in adjusted_raw.values()) or 1.0
    adjusted_pmf = {score: item["raw"] / raw_total for score, item in adjusted_raw.items()}
    adjusted_top3 = [
        {
            "score": score,
            "probability": adjusted_pmf[score],
            "modelProbability": adjusted_raw[score]["modelProbability"],
            "historicalProbability": adjusted_raw[score]["historicalProbability"],
            "impliedProbability": adjusted_raw[score]["impliedProbability"],
            "edge": adjusted_raw[score]["edge"],
        }
        for score in sorted(adjusted_pmf, key=adjusted_pmf.get, reverse=True)[:3]
    ]

    p1 = adjusted_top3[0]["probability"] if adjusted_top3 else 0.0
    mass3 = sum(item["probability"] for item in adjusted_top3)
    entropy3 = _entropy3([item["probability"] for item in adjusted_top3])
    span = scenario_span([item["score"] for item in adjusted_top3])
    extreme_tail = _has_extreme_tail(adjusted_top3, match_input.get("score_bonus", {}), config)
    reject_reasons = _reject_reasons(match_input, p1, mass3, entropy3, span, extreme_tail, config)
    keep = not reject_reasons and _passes_keep(p1, mass3, entropy3, span, config)

    actual_score = match_input.get("actual_score")
    calibrated_hit = None
    if isinstance(actual_score, str):
        calibrated_hit = normalize_score_key(actual_score) in {item["score"] for item in adjusted_top3}

    hist_summary = _hist_summary_for_bucket(priors, hist_bucket["key"], hist_bucket["parent"])

    return {
        "raw_top3": raw_top3,
        "adjusted_top3": adjusted_top3,
        "keep": keep,
        "reject_reasons": reject_reasons,
        "mass3": mass3,
        "entropy3": entropy3,
        "scenario_span": span,
        "hist_bucket": hist_bucket["key"],
        "hist_top3_mass": hist_summary.get("top3_mass", 0.0),
        "hist_top3": hist_summary.get("top3", []),
        "match_score": round(100 * p1 * mass3 * max(0.0, 1.0 - entropy3), 4),
        "calibrated_top3_hit": calibrated_hit,
    }


def bucket_for_match(match_input: dict[str, Any], config: dict[str, Any] | None = None) -> dict[str, str]:
    cfg = config or load_config()
    stage = str(match_input.get("stage", "group")).lower()
    stage_bucket = "knockout" if stage.startswith("knockout") or stage in {"r16", "qf", "sf", "final"} else "group"
    elo_home = float(match_input.get("elo_home", 1500) or 1500)
    elo_away = float(match_input.get("elo_away", 1500) or 1500)
    abs_diff = abs(elo_home - elo_away)
    if abs_diff <= _cfg(cfg, "elo_buckets.balanced_max_abs_diff", 60):
        elo_bucket = "balanced"
    elif abs_diff < _cfg(cfg, "elo_buckets.mid_gap_max_abs_diff", 150):
        elo_bucket = "mid_gap"
    else:
        elo_bucket = "strong_gap"
    host_flag = "host_involved" if match_input.get("is_host_home") or match_input.get("is_host_away") else "no_host"
    return {
        "stage_bucket": stage_bucket,
        "elo_bucket": elo_bucket,
        "host_flag": host_flag,
        "parent": stage_bucket,
        "key": f"{stage_bucket}|{elo_bucket}|{host_flag}",
    }


def normalize_implied_prob(score_bonus: dict[str, Any], scores: list[str]) -> dict[str, float]:
    odds_by_score: dict[str, float] = {}
    for raw_score, raw_bonus in (score_bonus or {}).items():
        try:
            bonus = float(raw_bonus)
        except (TypeError, ValueError):
            continue
        if bonus > 0:
            odds_by_score[normalize_score_key(raw_score)] = bonus

    implied = {score: 1.0 / odds_by_score[score] for score in scores if score in odds_by_score}
    total = sum(implied.values())
    if total <= 0:
        return {score: 1.0 / len(scores) for score in scores}
    floor = 0.05 * min(implied.values())
    with_floor = {score: implied.get(score, floor) for score in scores}
    total = sum(with_floor.values()) or 1.0
    return {score: value / total for score, value in with_floor.items()}


def scenario_span(scores: list[str]) -> int:
    directions = set()
    for score in scores:
        home, away = parse_score(score)
        directions.add("home" if home > away else "away" if away > home else "draw")
    return len(directions)


def is_extreme_tail(score: str, hist_prob: float, bonus: float, panel_bonus_values: list[float], config: dict[str, Any] | None = None) -> bool:
    cfg = config or load_config()
    if not panel_bonus_values:
        return False
    p85 = _percentile(panel_bonus_values, _cfg(cfg, "filters.reject.bonus_p85", 0.85))
    return bonus >= p85 and hist_prob < _cfg(cfg, "filters.reject.hist_tail_prob", 0.015)


def parse_score(score: str) -> tuple[int, int]:
    normalised = normalize_score_key(score)
    home, away = normalised.split("-", 1)
    return int(home), int(away)


def normalize_score_key(score: str) -> str:
    return str(score).strip().replace(":", "-")


def _hist_pmf_for_bucket(priors: dict[str, Any], bucket_key: str) -> dict[str, float]:
    bucket = priors.get("buckets", {}).get(bucket_key)
    if bucket and bucket.get("pmf"):
        return {normalize_score_key(k): float(v) for k, v in bucket["pmf"].items()}
    parent = bucket_key.split("|", 1)[0]
    parent_bucket = priors.get("parents", {}).get(parent, {})
    if parent_bucket.get("pmf"):
        return {normalize_score_key(k): float(v) for k, v in parent_bucket["pmf"].items()}
    return dict(DEFAULT_COMMON_PMF)


def _hist_summary_for_bucket(priors: dict[str, Any], bucket_key: str, parent: str) -> dict[str, Any]:
    bucket = priors.get("buckets", {}).get(bucket_key)
    if bucket:
        return bucket
    return priors.get("parents", {}).get(parent, _prior_summary(DEFAULT_COMMON_PMF, 0))


def _normalise_pmf(pmf: dict[str, Any]) -> dict[str, float]:
    values: dict[str, float] = {}
    for raw_score, raw_value in (pmf or {}).items():
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            continue
        if value > 0:
            values[normalize_score_key(raw_score)] = value
    total = sum(values.values())
    if total <= 0:
        return {}
    return {score: value / total for score, value in values.items()}


def _top_scores(pmf: dict[str, float], n: int) -> list[dict[str, float | str]]:
    return [{"score": score, "probability": pmf[score]} for score in sorted(pmf, key=pmf.get, reverse=True)[:n]]


def _prior_summary(pmf: dict[str, float], n: int) -> dict[str, Any]:
    normalised = _normalise_pmf(pmf)
    top3 = _top_scores(normalised, 3)
    return {
        "n": n,
        "pmf": normalised,
        "top3": top3,
        "top3_mass": sum(float(item["probability"]) for item in top3),
        "common_scores": {score: normalised.get(score, 0.0) for score in ["0-0", "1-0", "0-1", "1-1", "2-1", "1-2", "2-0", "0-2"]},
    }


def _gaussian_kernel(value: float, target: float, sigma: float) -> float:
    sigma = max(float(sigma), 0.1)
    return math.exp(-((value - target) ** 2) / (2 * sigma * sigma))


def _entropy3(probs: list[float]) -> float:
    total = sum(probs)
    if total <= 0:
        return 1.0
    norm = [p / total for p in probs if p > 0]
    if len(norm) <= 1:
        return 0.0
    return -sum(p * math.log(p) for p in norm) / math.log(3)


def _has_extreme_tail(top3: list[dict[str, Any]], score_bonus: dict[str, Any], config: dict[str, Any]) -> bool:
    bonus_values = []
    bonus_map: dict[str, float] = {}
    for score, raw_bonus in (score_bonus or {}).items():
        try:
            value = float(raw_bonus)
        except (TypeError, ValueError):
            continue
        if value > 0:
            bonus_values.append(value)
            bonus_map[normalize_score_key(score)] = value
    for item in top3:
        score = str(item["score"])
        bonus = bonus_map.get(score)
        if bonus is not None and is_extreme_tail(score, float(item.get("historicalProbability", 0.0)), bonus, bonus_values, config):
            return True
    return False


def _reject_reasons(
    match_input: dict[str, Any],
    p1: float,
    mass3: float,
    entropy3: float,
    span: int,
    extreme_tail: bool,
    config: dict[str, Any],
) -> list[str]:
    reasons: list[str] = []
    xg_total = float(match_input.get("xg_home", 0) or 0) + float(match_input.get("xg_away", 0) or 0)
    if mass3 < _cfg(config, "filters.reject.min_mass3", 0.38):
        reasons.append("mass3_below_reject")
    if span == int(_cfg(config, "filters.reject.scenario_span_eq", 3)):
        reasons.append("scenario_span_eq_reject")
    if xg_total > _cfg(config, "filters.reject.high_xg_total", 3.1) and p1 < _cfg(config, "filters.reject.high_xg_p1", 0.14):
        reasons.append("high_xg_low_p1")
    if extreme_tail:
        reasons.append("extreme_tail")
    if mass3 < _cfg(config, "filters.keep.min_mass3", 0.44):
        reasons.append("mass3_below_keep")
    if p1 < _cfg(config, "filters.keep.min_p1", 0.16):
        reasons.append("p1_below_keep")
    if entropy3 > _cfg(config, "filters.keep.max_entropy3", 0.92):
        reasons.append("entropy_above_keep")
    if span > int(_cfg(config, "filters.keep.max_scenario_span", 2)):
        reasons.append("scenario_span_above_keep")
    return list(dict.fromkeys(reasons))


def _passes_keep(p1: float, mass3: float, entropy3: float, span: int, config: dict[str, Any]) -> bool:
    return (
        mass3 >= _cfg(config, "filters.keep.min_mass3", 0.44)
        and p1 >= _cfg(config, "filters.keep.min_p1", 0.16)
        and entropy3 <= _cfg(config, "filters.keep.max_entropy3", 0.92)
        and span <= int(_cfg(config, "filters.keep.max_scenario_span", 2))
    )


def _percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = min(len(sorted_values) - 1, max(0, math.ceil(q * (len(sorted_values) - 1))))
    return sorted_values[index]


def _cfg(config: dict[str, Any], dotted_path: str, default: Any) -> Any:
    current: Any = config
    for part in dotted_path.split("."):
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


def archetype_for_match(match_input: dict[str, Any], enhanced: dict[str, Any] | None = None) -> str:
    xg_total = float(match_input.get("xg_home", 0) or 0) + float(match_input.get("xg_away", 0) or 0)
    draw_prob = float(match_input.get("market_p_draw", 0) or 0)
    if xg_total >= 3.1:
        return "high_xg_open"
    if draw_prob >= 0.31 or any(parse_score(item["score"])[0] == parse_score(item["score"])[1] for item in (enhanced or {}).get("adjusted_top3", [])[:2]):
        return "draw_heavy"
    return "standard"


def positive_edge_mean(enhanced: dict[str, Any]) -> float:
    edges = [float(item.get("edge", 0.0)) for item in enhanced.get("adjusted_top3", [])]
    positives = [edge for edge in edges if edge > 0]
    return mean(positives) if positives else 0.0
