from __future__ import annotations

from typing import Iterable

from db import db_connection
from espn_worldcup import MatchSnapshot, fetch_complete_worldcup_events, parse_events


def sync_fixtures() -> dict[str, int]:
    events = fetch_complete_worldcup_events()
    snapshots = parse_events(events)

    with db_connection() as conn:
        return upsert_fixtures(conn, snapshots)


def upsert_fixtures(conn, snapshots: Iterable[MatchSnapshot]) -> dict[str, int]:
    snapshots = list(snapshots)
    inserted = 0
    updated = 0
    skipped_unverified = 0

    for snapshot in snapshots:
        if not snapshot.score90_verified:
            skipped_unverified += 1
            continue
        ensure_team(conn, snapshot.home_team)
        ensure_team(conn, snapshot.away_team)
        existing_id = existing_match_id(conn, snapshot)
        match_id = existing_id or snapshot.match_id
        existed = existing_id is not None

        conn.execute(
            """
            INSERT INTO matches (
              id,
              match_id,
              external_id,
              source,
              competition,
              home_team_id,
              away_team_id,
              home_score,
              away_score,
              status,
              start_time,
              kickoff_time,
              stage,
              minute,
              winner_team_id,
              updated_at
            )
            VALUES (
              %(id)s,
              %(match_id)s,
              %(external_id)s,
              %(source)s,
              %(competition)s,
              %(home_team_id)s,
              %(away_team_id)s,
              %(home_score)s,
              %(away_score)s,
              %(status)s,
              %(start_time)s,
              %(kickoff_time)s,
              %(stage)s,
              %(minute)s,
              %(winner_team_id)s,
              NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              match_id = EXCLUDED.match_id,
              external_id = EXCLUDED.external_id,
              source = EXCLUDED.source,
              competition = EXCLUDED.competition,
              home_team_id = EXCLUDED.home_team_id,
              away_team_id = EXCLUDED.away_team_id,
              home_score = CASE WHEN EXCLUDED.minute >= 120 THEN matches.home_score ELSE EXCLUDED.home_score END,
              away_score = CASE WHEN EXCLUDED.minute >= 120 THEN matches.away_score ELSE EXCLUDED.away_score END,
              status = CASE WHEN EXCLUDED.minute >= 120 THEN matches.status ELSE EXCLUDED.status END,
              start_time = EXCLUDED.start_time,
              kickoff_time = EXCLUDED.kickoff_time,
              stage = EXCLUDED.stage,
              minute = CASE WHEN EXCLUDED.minute >= 120 THEN matches.minute ELSE EXCLUDED.minute END,
              winner_team_id = COALESCE(EXCLUDED.winner_team_id, matches.winner_team_id),
              updated_at = NOW()
            """,
            match_params(match_id, snapshot),
        )

        if existed:
            updated += 1
        else:
            inserted += 1

    return {
        "fetched": len(snapshots),
        "inserted": inserted,
        "updated": updated,
        "skipped_unverified": skipped_unverified,
    }


def ensure_team(conn, team) -> None:
    conn.execute(
        """
        INSERT INTO teams (id, name, fifa_rating, recent_form, attack_avg, defense_avg, xga)
        VALUES (%s, %s, 75, 70, 1.25, 72, 1.25)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
        """,
        (team.id, team.name),
    )


def existing_match_id(conn, snapshot: MatchSnapshot) -> str | None:
    by_external = conn.execute(
        """
        SELECT id
        FROM matches
        WHERE source = %s AND external_id = %s
        LIMIT 1
        """,
        (snapshot.source, snapshot.external_id),
    ).fetchone()
    if by_external:
        return by_external[0]

    by_fixture = conn.execute(
        """
        SELECT id
        FROM matches
        WHERE home_team_id = %s
          AND away_team_id = %s
          AND ABS(EXTRACT(EPOCH FROM (start_time - %s::timestamptz))) <= 10800
        ORDER BY ABS(EXTRACT(EPOCH FROM (start_time - %s::timestamptz))) ASC
        LIMIT 1
        """,
        (snapshot.home_team.id, snapshot.away_team.id, snapshot.kickoff_time, snapshot.kickoff_time),
    ).fetchone()
    return by_fixture[0] if by_fixture else None


def match_params(match_id: str, snapshot: MatchSnapshot) -> dict:
    return {
        "id": match_id,
        "match_id": match_id,
        "external_id": snapshot.external_id,
        "source": snapshot.source,
        "competition": snapshot.competition,
        "home_team_id": snapshot.home_team.id,
        "away_team_id": snapshot.away_team.id,
        "home_score": snapshot.home_score,
        "away_score": snapshot.away_score,
        "status": snapshot.status,
        "start_time": snapshot.kickoff_time,
        "kickoff_time": snapshot.kickoff_time,
        "stage": snapshot.stage,
        "minute": snapshot.minute,
        "winner_team_id": snapshot.winner_team_id,
    }


if __name__ == "__main__":
    print(sync_fixtures())
