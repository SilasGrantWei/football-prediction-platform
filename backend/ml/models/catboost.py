from __future__ import annotations

from typing import Any


def build_catboost_classifier(random_state: int = 42) -> Any:
    try:
        from catboost import CatBoostClassifier

        return CatBoostClassifier(
            iterations=350,
            depth=6,
            learning_rate=0.035,
            loss_function="MultiClass",
            verbose=False,
            random_seed=random_state,
        )
    except Exception:
        from sklearn.ensemble import RandomForestClassifier

        return RandomForestClassifier(n_estimators=260, max_depth=8, random_state=random_state, class_weight="balanced")
