from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Iterable

from db import db_connection
from espn_worldcup import MatchSnapshot, TeamRef, fetch_complete_worldcup_events, parse_events
from ingestion.fixtures_sync import upsert_fixtures


TOTAL_WORLD_CUP_MATCHES = 104
STAGE_SLOT_COUNTS = [
    ("group", 72),
    ("r32", 16),
    ("r16", 8),
    ("qf", 4),
    ("sf", 2),
    ("third_place", 1),
    ("final", 1),
]

STAGE_LABELS = {
    "group": "2026世界杯 · 小组赛",
    "r32": "2026世界杯 · 1/16决赛",
    "r16": "2026世界杯 · 1/8决赛",
    "qf": "2026世界杯 · 1/4决赛",
    "sf": "2026世界杯 · 半决赛",
    "third_place": "2026世界杯 · 三四名决赛",
    "final": "2026世界杯 · 决赛",
}


def sync_fixtures_engine() -> dict[str, int]:
    provider_events = fetch_complete_worldcup_events()
    provider_snapshots = parse_events(provider_events)

    with db_connection() as conn:
        provider_result = upsert_fixtures(conn, provider_snapshots)
        official_count = count_official_worldcup_matches(conn)
        deleted_templates = cleanup_template_fixtures(conn, official_count)
        inserted_templates = ensure_structural_fixtures(conn, provider_snapshots, official_count)

    return {
        "provider_fetched": provider_result["fetched"],
        "provider_inserted": provider_result["inserted"],
        "provider_updated": provider_result["updated"],
        "official_count": official_count,
        "template_inserted": inserted_templates,
        "template_deleted": deleted_templates,
    }


def count_official_worldcup_matches(conn) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*)
        FROM matches
        WHERE source <> 'template'
          AND (
            competition ILIKE '%World Cup%'
            OR competition LIKE '%世界杯%'
            OR source = 'espn'
          )
        """
    ).fetchone()
    return int(row[0] if row else 0)


def cleanup_template_fixtures(conn, official_count: int) -> int:
    if official_count < TOTAL_WORLD_CUP_MATCHES:
        return 0
    row = conn.execute("DELETE FROM matches WHERE source = 'template' RETURNING id").fetchall()
    return len(row)


def ensure_structural_fixtures(conn, provider_snapshots: Iterable[MatchSnapshot], official_count: int) -> int:
    missing = max(0, TOTAL_WORLD_CUP_MATCHES - official_count)
    if missing == 0:
        return 0

    provider_count = len(list(provider_snapshots)) if not isinstance(provider_snapshots, list) else len(provider_snapshots)
    slots = build_fixture_slots()
    start_index = min(provider_count, len(slots))
    template_snapshots = slots[start_index : start_index + missing]
    if not template_snapshots:
        return 0

    result = upsert_fixtures(conn, template_snapshots)
    return result["inserted"] + result["updated"]


def build_fixture_slots() -> list[MatchSnapshot]:
    slots: list[MatchSnapshot] = []
    slot_number = 1
    stage_start = datetime(2026, 6, 11, 18, 0, tzinfo=UTC)

    for stage, count in STAGE_SLOT_COUNTS:
        for index in range(count):
            match_id = f"wc2026-slot-{slot_number:03d}"
            kickoff = stage_start + timedelta(hours=4 * index)
            slots.append(
                MatchSnapshot(
                    match_id=match_id,
                    external_id=match_id,
                    competition=STAGE_LABELS[stage],
                    home_team=TeamRef(id=f"tbd_home_{slot_number:03d}", name=f"待定主队 {slot_number:03d}", external_id=None),
                    away_team=TeamRef(id=f"tbd_away_{slot_number:03d}", name=f"待定客队 {slot_number:03d}", external_id=None),
                    home_score=0,
                    away_score=0,
                    status="scheduled",
                    kickoff_time=kickoff,
                    stage=stage,
                    minute=0,
                    source="template",
                    raw={"reason": "structural_fixture_backfill", "slot": slot_number, "stage": stage},
                )
            )
            slot_number += 1

        stage_start = next_stage_start(stage)

    return slots


def next_stage_start(stage: str) -> datetime:
    starts = {
        "group": datetime(2026, 6, 28, 16, 0, tzinfo=UTC),
        "r32": datetime(2026, 7, 4, 16, 0, tzinfo=UTC),
        "r16": datetime(2026, 7, 9, 16, 0, tzinfo=UTC),
        "qf": datetime(2026, 7, 14, 0, 0, tzinfo=UTC),
        "sf": datetime(2026, 7, 18, 21, 0, tzinfo=UTC),
        "third_place": datetime(2026, 7, 19, 19, 0, tzinfo=UTC),
        "final": datetime(2026, 7, 19, 19, 0, tzinfo=UTC),
    }
    return starts.get(stage, datetime(2026, 6, 11, 18, 0, tzinfo=UTC))


if __name__ == "__main__":
    print(sync_fixtures_engine())
