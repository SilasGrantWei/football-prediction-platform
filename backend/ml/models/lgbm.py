from __future__ import annotations

from typing import Any


def build_lightgbm_classifier(random_state: int = 42) -> Any:
    try:
        from lightgbm import LGBMClassifier

        return LGBMClassifier(
            objective="multiclass",
            n_estimators=300,
            learning_rate=0.04,
            num_leaves=31,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=random_state,
        )
    except Exception:
        from sklearn.ensemble import HistGradientBoostingClassifier

        return HistGradientBoostingClassifier(random_state=random_state, max_iter=180, learning_rate=0.05)
