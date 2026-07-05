from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from statistics import mean
from typing import Any

from db import db_connection
from espn_worldcup import resolve_team_id


DEFAULT_ODDS_URL = "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds"


@dataclass(frozen=True)
class OddsSnapshot:
    external_id: str
    home_team_id: str
    away_team_id: str
    commence_time: datetime
    home_odds: float
    draw_odds: float
    away_odds: float
    provider: str
    bookmaker_count: int
    raw: dict[str, Any]


def sync_odds() -> dict[str, int | str]:
    api_key = os.environ.get("ODDS_API_KEY")
    if not api_key:
        return {"status": "skipped", "reason": "ODDS_API_KEY is not set", "fetched": 0, "inserted": 0}

    events = fetch_odds(api_key)
    snapshots = [snapshot for item in events for snapshot in [parse_odds_event(item)] if snapshot]

    inserted = 0
    unmatched = 0
    with db_connection() as conn:
        for snapshot in snapshots:
            match_id = find_match_id(conn, snapshot)
            if not match_id:
                unmatched += 1
                continue

            implied = implied_probabilities(snapshot.home_odds, snapshot.draw_odds, snapshot.away_odds)
            conn.execute(
                """
                INSERT INTO odds_snapshots (
                  match_id,
                  provider,
                  bookmaker,
                  home_odds,
                  draw_odds,
                  away_odds,
                  home_implied_prob,
                  draw_implied_prob,
                  away_implied_prob,
                  overround,
                  timestamp,
                  raw
                )
                VALUES (%s, %s, 'consensus', %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    match_id,
                    snapshot.provider,
                    snapshot.home_odds,
                    snapshot.draw_odds,
                    snapshot.away_odds,
                    implied["home"],
                    implied["draw"],
                    implied["away"],
                    implied["overround"],
                    datetime.now(UTC),
                    json.dumps({"bookmaker_count": snapshot.bookmaker_count, "external_id": snapshot.external_id}),
                ),
            )
            inserted += 1

    return {"status": "ok", "fetched": len(snapshots), "inserted": inserted, "unmatched": unmatched}


def fetch_odds(api_key: str) -> list[dict[str, Any]]:
    base_url = os.environ.get("ODDS_API_URL", DEFAULT_ODDS_URL)
    params = {
        "apiKey": api_key,
        "regions": os.environ.get("ODDS_REGIONS", "us,uk,eu"),
        "markets": os.environ.get("ODDS_MARKETS", "h2h"),
        "oddsFormat": os.environ.get("ODDS_FORMAT", "decimal"),
        "dateFormat": "iso",
    }
    bookmakers = os.environ.get("ODDS_BOOKMAKERS")
    if bookmakers:
        params["bookmakers"] = bookmakers

    url = f"{base_url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "football-prediction-platform/1.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError(f"Unexpected odds response shape: {type(payload).__name__}")
    return payload


def parse_odds_event(event: dict[str, Any]) -> OddsSnapshot | None:
    home_name = str(event.get("home_team") or "")
    away_name = str(event.get("away_team") or "")
    home_id = resolve_team_id([home_name])
    away_id = resolve_team_id([away_name])
    if not home_id or not away_id:
        return None

    prices: dict[str, list[float]] = {"home": [], "draw": [], "away": []}
    for bookmaker in event.get("bookmakers") or []:
        for market in bookmaker.get("markets") or []:
            if market.get("key") != "h2h":
                continue
            for outcome in market.get("outcomes") or []:
                name = str(outcome.get("name") or "")
                price = float(outcome.get("price") or 0)
                if price <= 1:
                    continue
                if normalize_market_name(name) == normalize_market_name(home_name):
                    prices["home"].append(price)
                elif normalize_market_name(name) == normalize_market_name(away_name):
                    prices["away"].append(price)
                elif normalize_market_name(name) == "draw":
                    prices["draw"].append(price)

    if not prices["home"] or not prices["draw"] or not prices["away"]:
        return None

    return OddsSnapshot(
        external_id=str(event.get("id") or ""),
        home_team_id=home_id,
        away_team_id=away_id,
        commence_time=datetime.fromisoformat(str(event["commence_time"]).replace("Z", "+00:00")).astimezone(UTC),
        home_odds=round(mean(prices["home"]), 3),
        draw_odds=round(mean(prices["draw"]), 3),
        away_odds=round(mean(prices["away"]), 3),
        provider="the-odds-api",
        bookmaker_count=max(len(prices["home"]), len(prices["draw"]), len(prices["away"])),
        raw=event,
    )


def find_match_id(conn, snapshot: OddsSnapshot) -> str | None:
    row = conn.execute(
        """
        SELECT id
        FROM matches
        WHERE home_team_id = %s
          AND away_team_id = %s
          AND ABS(EXTRACT(EPOCH FROM (COALESCE(kickoff_time, start_time) - %s::timestamptz))) <= 129600
        ORDER BY ABS(EXTRACT(EPOCH FROM (COALESCE(kickoff_time, start_time) - %s::timestamptz))) ASC
        LIMIT 1
        """,
        (snapshot.home_team_id, snapshot.away_team_id, snapshot.commence_time, snapshot.commence_time),
    ).fetchone()
    return row[0] if row else None


def implied_probabilities(home_odds: float, draw_odds: float, away_odds: float) -> dict[str, float]:
    home = 1.0 / home_odds
    draw = 1.0 / draw_odds
    away = 1.0 / away_odds
    overround = home + draw + away
    return {
        "home": round(home / overround, 5),
        "draw": round(draw / overround, 5),
        "away": round(away / overround, 5),
        "overround": round(overround, 5),
    }


def normalize_market_name(value: str) -> str:
    return value.strip().lower().replace("&", "and")


if __name__ == "__main__":
    print(sync_odds())
