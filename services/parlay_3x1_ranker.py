from __future__ import annotations

from itertools import combinations
from typing import Any


def rank_3x1_combinations(enhanced_matches: list[dict[str, Any]], top_n: int = 10) -> list[dict[str, Any]]:
    """Rank three-match exact-score combinations with top-1 probability product."""
    candidates = [item for item in enhanced_matches if item.get("enhancement", item).get("keep") is True]
    ranked: list[dict[str, Any]] = []

    for combo in combinations(candidates, 3):
        enhancements = [item.get("enhancement", item) for item in combo]
        top1_scores = [_top1_score(enhancement) for enhancement in enhancements]
        top1_product = 1.0
        for score in top1_scores:
            top1_product *= float(score.get("probability", 0.0))

        rho, penalty_reasons = _correlation_penalty(combo, top1_scores)
        combo_score = top1_product * (1 - rho)

        ranked.append(
            {
                "match_ids": [item.get("match_id") or item.get("match_input", {}).get("match_id") for item in combo],
                "combo_score": combo_score,
                "estimated_hit_rate": combo_score,
                "rho": rho,
                "top1_product": top1_product,
                "penalty_reasons": penalty_reasons,
                "risk_tags": _risk_tags(penalty_reasons),
                "legs": [
                    {
                        "match_id": item.get("match_id") or item.get("match_input", {}).get("match_id"),
                        "hist_bucket": item.get("enhancement", item).get("hist_bucket"),
                        "adjusted_top3": item.get("enhancement", item).get("adjusted_top3", []),
                    }
                    for item in combo
                ],
            }
        )

    return sorted(ranked, key=lambda item: item["combo_score"], reverse=True)[:top_n]


def _top1_score(enhancement: dict[str, Any]) -> dict[str, Any]:
    scores = enhancement.get("adjusted_top3") or enhancement.get("top3_scores") or enhancement.get("top_scores") or []
    if not scores:
        return {"score": "0-0", "probability": 0.0}
    return dict(scores[0])


def _correlation_penalty(combo: tuple[dict[str, Any], ...], top1_scores: list[dict[str, Any]]) -> tuple[float, list[str]]:
    rho = 0.0
    reasons: list[str] = []

    if _has_duplicate(_score_family(str(score.get("score", "0-0"))) for score in top1_scores):
        rho += 0.05
        reasons.append("same_score_family")
    if _has_duplicate(_goal_band(str(score.get("score", "0-0"))) for score in top1_scores):
        rho += 0.05
        reasons.append("same_goal_band")
    if _has_duplicate(_elo_bucket(item) for item in combo):
        rho += 0.03
        reasons.append("same_elo_bucket")

    return min(max(rho, 0.0), 0.30), reasons


def _risk_tags(reasons: list[str]) -> list[str]:
    labels = {
        "same_score_family": "same score family penalty",
        "same_goal_band": "same goal band penalty",
        "same_elo_bucket": "same Elo bucket penalty",
    }
    return [labels[reason] for reason in reasons] or ["normal correlation"]


def _score_family(score: str) -> str:
    home, away = _parse_score(score)
    if home > away:
        return "home"
    if home < away:
        return "away"
    return "draw"


def _goal_band(score: str) -> str:
    home, away = _parse_score(score)
    total = home + away
    if total <= 1:
        return "low"
    if total <= 3:
        return "medium"
    return "high"


def _elo_bucket(item: dict[str, Any]) -> str:
    source = item.get("match_input", item)
    if source.get("elo_bucket"):
        return str(source["elo_bucket"])

    home = source.get("elo_home") or source.get("home_elo")
    away = source.get("elo_away") or source.get("away_elo")
    if home is None or away is None:
        return "unknown"

    diff = abs(float(home) - float(away))
    if diff <= 60:
        return "balanced"
    if diff < 150:
        return "mid_gap"
    return "strong_gap"


def _has_duplicate(values: Any) -> bool:
    items = list(values)
    return len(set(items)) < len(items)


def _parse_score(score: str) -> tuple[int, int]:
    home, away = score.replace(":", "-").split("-", 1)
    return int(home), int(away)
