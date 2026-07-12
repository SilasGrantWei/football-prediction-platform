from __future__ import annotations

import sys
import types
from datetime import UTC, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

sys.modules.setdefault("db", types.SimpleNamespace(db_connection=lambda: None))

from espn_worldcup import MatchSnapshot, TeamRef, parse_event
from ingestion.fixtures_sync import upsert_fixtures


def test_period_four_final_without_regulation_detail_is_not_verified() -> None:
    snapshot = parse_event(_extra_time_event())

    assert snapshot is not None
    assert snapshot.home_score == 3
    assert snapshot.away_score == 2
    assert snapshot.score90_verified is False


def test_enriched_extra_time_event_uses_regulation_score_and_winner() -> None:
    event = _extra_time_event()
    event["_regulationScore"] = {"home": 2, "away": 2}

    snapshot = parse_event(event)

    assert snapshot is not None
    assert (snapshot.home_score, snapshot.away_score) == (2, 2)
    assert snapshot.score90_verified is True
    assert snapshot.winner_team_id == "belgium"
    assert snapshot.minute == 90


def test_new_unverified_extended_time_match_is_not_inserted() -> None:
    snapshot = MatchSnapshot(
        match_id="espn-new-extra-time",
        external_id="new-extra-time",
        competition="World Cup knockout",
        home_team=TeamRef(id="belgium", name="Belgium", external_id="1"),
        away_team=TeamRef(id="senegal", name="Senegal", external_id="2"),
        home_score=3,
        away_score=2,
        status="finished",
        kickoff_time=datetime(2026, 7, 1, 20, 0, tzinfo=UTC),
        stage="r32",
        minute=120,
        source="espn",
        raw={},
        score90_verified=False,
        winner_team_id="belgium",
    )
    conn = RecordingConnection()

    result = upsert_fixtures(conn, [snapshot])

    assert result == {"fetched": 1, "inserted": 0, "updated": 0, "skipped_unverified": 1}
    assert not any("INSERT INTO matches" in sql for sql, _params in conn.calls)


class RecordingConnection:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def execute(self, sql: str, params=None):
        self.calls.append((sql, params))
        return self

    def fetchone(self):
        return None


def _extra_time_event() -> dict:
    return {
        "id": "760493",
        "date": "2026-07-01T20:00:00.000Z",
        "status": {
            "period": 4,
            "type": {"state": "post", "completed": True, "description": "Final"},
        },
        "season": {"slug": "round-of-32"},
        "competitions": [
            {
                "competitors": [
                    {
                        "homeAway": "home",
                        "score": "3",
                        "winner": True,
                        "team": {"id": "1", "displayName": "Belgium"},
                    },
                    {
                        "homeAway": "away",
                        "score": "2",
                        "winner": False,
                        "team": {"id": "2", "displayName": "Senegal"},
                    },
                ]
            }
        ],
    }
