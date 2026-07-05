from __future__ import annotations

from db import db_connection
from espn_worldcup import fetch_recent_worldcup_events, parse_events
from ingestion.fixtures_sync import upsert_fixtures


def sync_live_scores() -> dict[str, int]:
    events = fetch_recent_worldcup_events()
    snapshots = parse_events(events)

    with db_connection() as conn:
        result = upsert_fixtures(conn, snapshots)

    return {
        **result,
        "live_or_recent": sum(1 for item in snapshots if item.status in {"live", "halftime", "finished"}),
    }


if __name__ == "__main__":
    print(sync_live_scores())
