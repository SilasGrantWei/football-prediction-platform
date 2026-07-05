from __future__ import annotations

import argparse
import json
import logging
from datetime import UTC, datetime
from typing import Any, Callable

from ingestion.fixtures_engine import sync_fixtures_engine
from ingestion.live_sync import sync_live
from ingestion.odds_sync import sync_odds
from ingestion.results_sync import sync_results
from ml.train_pipeline import daily_retrain


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("worldcup-ingestion")


SyncFn = Callable[[], dict[str, Any]]


def run_job(name: str, fn: SyncFn) -> dict[str, Any]:
    started_at = datetime.now(UTC).isoformat()
    logger.info("starting %s", name)
    result = fn()
    logger.info("finished %s: %s", name, result)
    return {"job": name, "started_at": started_at, **result}


def run_all_once() -> dict[str, object]:
    return {
        "fixtures": run_job("fixtures_engine", sync_fixtures_engine),
        "live_scores": run_job("live_sync", sync_live),
        "odds": run_job("odds_sync", sync_odds),
        "results": run_job("results_sync", sync_results),
    }


def start_scheduler() -> None:
    from apscheduler.schedulers.blocking import BlockingScheduler

    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(
        lambda: run_job("fixtures_engine", sync_fixtures_engine),
        "interval",
        minutes=10,
        id="fixtures_engine",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(UTC),
    )
    scheduler.add_job(
        lambda: run_job("live_sync", sync_live),
        "interval",
        seconds=3,
        id="live_sync",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(UTC),
    )
    scheduler.add_job(
        lambda: run_job("odds_sync", sync_odds),
        "interval",
        seconds=30,
        id="odds_sync",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(UTC),
    )
    scheduler.add_job(
        lambda: run_job("results_sync", sync_results),
        "interval",
        minutes=5,
        id="results_sync",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(UTC),
    )
    scheduler.add_job(
        lambda: run_job("daily_retrain", daily_retrain),
        "cron",
        hour=3,
        minute=0,
        id="daily_retrain",
        max_instances=1,
        coalesce=True,
    )
    logger.info("scheduler started: fixtures=10m live=3s odds=30s results=5m train=03:00")
    scheduler.start()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="World Cup fixture/live-score ingestion scheduler")
    parser.add_argument(
        "--run-once",
        choices=("all", "fixtures", "live", "odds", "results", "train"),
        help="Run one sync job and exit. Without this flag the APScheduler loop starts.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.run_once == "all":
        payload = run_all_once()
    elif args.run_once == "fixtures":
        payload = run_job("fixtures_engine", sync_fixtures_engine)
    elif args.run_once == "live":
        payload = run_job("live_sync", sync_live)
    elif args.run_once == "odds":
        payload = run_job("odds_sync", sync_odds)
    elif args.run_once == "results":
        payload = run_job("results_sync", sync_results)
    elif args.run_once == "train":
        payload = run_job("daily_retrain", daily_retrain)
    else:
        start_scheduler()
        return

    print(json.dumps(payload, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
