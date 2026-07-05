from __future__ import annotations

from ingestion.live_scores_sync import sync_live_scores


def sync_live() -> dict[str, int]:
    return sync_live_scores()


if __name__ == "__main__":
    print(sync_live())
