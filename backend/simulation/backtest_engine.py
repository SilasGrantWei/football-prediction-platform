from __future__ import annotations

import numpy as np

from ml.feature_store import load_feature_rows
from ml.train_pipeline import multiclass_brier_score, safe_log_loss


def run_backtest() -> dict:
    rows = [row for row in load_feature_rows(include_unfinished=False) if row.label is not None]
    if not rows:
        return {"matches": 0, "log_loss": None, "brier_score": None, "roi": 0.0}

    labels = np.array([row.label for row in rows], dtype=int)
    probs = np.array(
        [
            normalize(
                [
                    0.5 * row.features["poisson_home"] + 0.25 * row.features["elo_home"] + 0.25 * row.features["market_home"],
                    0.5 * row.features["poisson_draw"] + 0.25 * row.features["elo_draw"] + 0.25 * row.features["market_draw"],
                    0.5 * row.features["poisson_away"] + 0.25 * row.features["elo_away"] + 0.25 * row.features["market_away"],
                ]
            )
            for row in rows
        ],
        dtype=float,
    )
    roi = value_betting_roi(rows, probs)
    return {
        "matches": len(rows),
        "log_loss": round(safe_log_loss(labels, probs), 6),
        "brier_score": round(multiclass_brier_score(labels, probs), 6),
        "roi": roi,
    }


def value_betting_roi(rows, probs: np.ndarray) -> dict:
    profit = 0.0
    bets = 0
    for row, prob in zip(rows, probs):
        market = np.array([row.features["market_home"], row.features["market_draw"], row.features["market_away"]], dtype=float)
        if market.sum() <= 0:
            continue
        market = market / market.sum()
        value = prob - market
        pick = int(value.argmax())
        if value[pick] <= 0.05:
            continue
        odds = 1.0 / max(market[pick], 1e-6)
        profit += odds - 1.0 if pick == row.label else -1.0
        bets += 1
    return {"bets": bets, "profit_units": round(profit, 4), "roi": round(profit / bets, 4) if bets else 0.0}


def normalize(values: list[float]) -> list[float]:
    total = sum(max(value, 0.0) for value in values)
    if total <= 0:
        return [1 / 3, 1 / 3, 1 / 3]
    return [max(value, 0.0) / total for value in values]


if __name__ == "__main__":
    print(run_backtest())
