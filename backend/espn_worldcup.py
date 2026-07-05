from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any


SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
TOURNAMENT_START = datetime(2026, 6, 11, tzinfo=UTC)
TOURNAMENT_END = datetime(2026, 7, 19, tzinfo=UTC)


@dataclass(frozen=True)
class TeamRef:
    id: str
    name: str
    external_id: str | None


@dataclass(frozen=True)
class MatchSnapshot:
    match_id: str
    external_id: str
    competition: str
    home_team: TeamRef
    away_team: TeamRef
    home_score: int
    away_score: int
    status: str
    kickoff_time: datetime
    stage: str
    minute: int
    source: str
    raw: dict[str, Any]


TEAM_ALIASES: dict[str, list[str]] = {
    "mexico": ["mexico", "mex"],
    "south_africa": ["south africa", "rsa"],
    "south_korea": ["south korea", "korea republic", "republic of korea", "kor"],
    "czechia": ["czechia", "czech republic", "cze"],
    "canada": ["canada", "can"],
    "bosnia": ["bosnia-herzegovina", "bosnia and herzegovina", "bosnia", "bih"],
    "usa": ["united states", "usa", "u.s.", "us"],
    "paraguay": ["paraguay", "par"],
    "qatar": ["qatar", "qat"],
    "switzerland": ["switzerland", "sui", "swiss"],
    "brazil": ["brazil", "bra"],
    "morocco": ["morocco", "mar"],
    "haiti": ["haiti", "hai"],
    "scotland": ["scotland", "sco"],
    "australia": ["australia", "aus"],
    "turkey": ["turkey", "turkiye", "tur"],
    "germany": ["germany", "ger"],
    "curacao": ["curacao", "cuw"],
    "netherlands": ["netherlands", "holland", "ned"],
    "japan": ["japan", "jpn"],
    "ivory_coast": ["ivory coast", "cote d'ivoire", "civ"],
    "ecuador": ["ecuador", "ecu"],
    "sweden": ["sweden", "swe"],
    "tunisia": ["tunisia", "tun"],
    "spain": ["spain", "esp"],
    "cape_verde": ["cape verde", "cpv"],
    "saudi_arabia": ["saudi arabia", "ksa"],
    "uruguay": ["uruguay", "uru"],
    "belgium": ["belgium", "bel"],
    "egypt": ["egypt", "egy"],
    "iran": ["iran", "irn"],
    "new_zealand": ["new zealand", "nzl"],
    "france": ["france", "fra"],
    "senegal": ["senegal", "sen"],
    "iraq": ["iraq", "irq"],
    "norway": ["norway", "nor"],
    "argentina": ["argentina", "arg"],
    "algeria": ["algeria", "alg"],
    "austria": ["austria", "aut"],
    "jordan": ["jordan", "jor"],
    "portugal": ["portugal", "por"],
    "dr_congo": ["congo dr", "dr congo", "congo, dr", "democratic republic of congo", "cod"],
    "uzbekistan": ["uzbekistan", "uzb"],
    "colombia": ["colombia", "col"],
    "england": ["england", "eng"],
    "croatia": ["croatia", "cro"],
    "ghana": ["ghana", "gha"],
    "panama": ["panama", "pan"],
}

TEAM_DISPLAY_NAMES_ZH: dict[str, str] = {
    "mexico": "墨西哥",
    "south_africa": "南非",
    "south_korea": "韩国",
    "czechia": "捷克",
    "canada": "加拿大",
    "bosnia": "波黑",
    "usa": "美国",
    "paraguay": "巴拉圭",
    "qatar": "卡塔尔",
    "switzerland": "瑞士",
    "brazil": "巴西",
    "morocco": "摩洛哥",
    "haiti": "海地",
    "scotland": "苏格兰",
    "australia": "澳大利亚",
    "turkey": "土耳其",
    "germany": "德国",
    "curacao": "库拉索",
    "netherlands": "荷兰",
    "japan": "日本",
    "ivory_coast": "科特迪瓦",
    "ecuador": "厄瓜多尔",
    "sweden": "瑞典",
    "tunisia": "突尼斯",
    "spain": "西班牙",
    "cape_verde": "佛得角",
    "saudi_arabia": "沙特阿拉伯",
    "uruguay": "乌拉圭",
    "belgium": "比利时",
    "egypt": "埃及",
    "iran": "伊朗",
    "new_zealand": "新西兰",
    "france": "法国",
    "senegal": "塞内加尔",
    "iraq": "伊拉克",
    "norway": "挪威",
    "argentina": "阿根廷",
    "algeria": "阿尔及利亚",
    "austria": "奥地利",
    "jordan": "约旦",
    "portugal": "葡萄牙",
    "dr_congo": "民主刚果",
    "uzbekistan": "乌兹别克斯坦",
    "colombia": "哥伦比亚",
    "england": "英格兰",
    "croatia": "克罗地亚",
    "ghana": "加纳",
    "panama": "巴拿马",
}

ALIAS_TO_ID: dict[str, str] = {}


def fetch_complete_worldcup_events() -> list[dict[str, Any]]:
    return fetch_scoreboard_events(TOURNAMENT_START, TOURNAMENT_END)


def fetch_recent_worldcup_events(now: datetime | None = None) -> list[dict[str, Any]]:
    current = now or datetime.now(UTC)
    return fetch_scoreboard_events(current - timedelta(days=1), current + timedelta(days=2))


def fetch_scoreboard_events(start: datetime, end: datetime) -> list[dict[str, Any]]:
    dates = f"{espn_date(start)}-{espn_date(end)}"
    url = f"{SCOREBOARD_URL}?limit=200&dates={dates}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return list(payload.get("events") or [])


def parse_events(events: list[dict[str, Any]], source: str = "espn") -> list[MatchSnapshot]:
    snapshots: list[MatchSnapshot] = []
    for event in events:
        parsed = parse_event(event, source)
        if parsed:
            snapshots.append(parsed)
    return snapshots


def parse_event(event: dict[str, Any], source: str = "espn") -> MatchSnapshot | None:
    external_id = str(event.get("id") or "")
    if not external_id:
        return None
    competition = (event.get("competitions") or [{}])[0]
    competitors = competition.get("competitors") or []
    home = next((item for item in competitors if item.get("homeAway") == "home"), None)
    away = next((item for item in competitors if item.get("homeAway") == "away"), None)
    if not home or not away:
        return None

    home_team = parse_team(home)
    away_team = parse_team(away)
    kickoff_time = parse_datetime(event.get("date") or competition.get("date") or competition.get("startDate"))
    stage = parse_stage(event, competition)
    status = parse_status(event.get("status") or competition.get("status"))
    minute = parse_minute(event.get("status") or competition.get("status"), status)
    alt_note = str(competition.get("altGameNote") or "")
    competition_name = f"2026世界杯 · {stage_label(stage, alt_note)}"

    return MatchSnapshot(
        match_id=f"espn-{external_id}",
        external_id=external_id,
        competition=competition_name,
        home_team=home_team,
        away_team=away_team,
        home_score=int(home.get("score") or 0),
        away_score=int(away.get("score") or 0),
        status=status,
        kickoff_time=kickoff_time,
        stage=stage,
        minute=minute,
        source=source,
        raw=event,
    )


def parse_team(competitor: dict[str, Any]) -> TeamRef:
    team = competitor.get("team") or {}
    external_id = str(team.get("id") or competitor.get("id") or "")
    names = [
        team.get("displayName"),
        team.get("shortDisplayName"),
        team.get("name"),
        team.get("abbreviation"),
    ]
    team_id = resolve_team_id([str(name) for name in names if name])
    provider_name = str(team.get("displayName") or team.get("name") or team.get("shortDisplayName") or f"Team {external_id}")
    if not team_id:
        team_id = f"espn_team_{external_id}" if external_id else slugify(provider_name)
    name = TEAM_DISPLAY_NAMES_ZH.get(team_id, provider_name)
    return TeamRef(id=team_id, name=name, external_id=external_id or None)


def resolve_team_id(names: list[str]) -> str | None:
    for name in names:
        normalized = normalize(name)
        if normalized in ALIAS_TO_ID:
            return ALIAS_TO_ID[normalized]
    return None


def parse_status(status: dict[str, Any] | None) -> str:
    status_type = (status or {}).get("type") or {}
    text = " ".join(
        str(status_type.get(key) or "")
        for key in ("name", "description", "detail", "shortDetail")
    ).lower()
    state = str(status_type.get("state") or "").lower()
    if "half" in text:
        return "halftime"
    if bool(status_type.get("completed")) or state == "post":
        return "finished"
    if state == "in":
        return "live"
    return "scheduled"


def parse_minute(status: dict[str, Any] | None, normalized_status: str) -> int:
    status = status or {}
    display_clock = str(status.get("displayClock") or "")
    match = re.search(r"(\d+)", display_clock)
    display_minute = int(match.group(1)) if match else 0
    if normalized_status == "finished":
        clock = float(status.get("clock") or 0)
        period = int(status.get("period") or 0)
        return max(display_minute, 120 if period >= 4 or clock >= 7200 else 90)
    if normalized_status == "halftime":
        return max(display_minute, 45)
    if normalized_status == "live":
        clock = float(status.get("clock") or 0)
        return max(display_minute, int(clock // 60) if clock > 0 else 1)
    return 0


def parse_stage(event: dict[str, Any], competition: dict[str, Any]) -> str:
    slug = str((event.get("season") or {}).get("slug") or "").lower()
    note = str(competition.get("altGameNote") or "").lower()
    text = f"{slug} {note}"
    if "group" in text:
        return "group"
    if "round-of-32" in text or "round of 32" in text:
        return "r32"
    if "round-of-16" in text or "round of 16" in text:
        return "r16"
    if "quarter" in text:
        return "qf"
    if "semi" in text and "third" not in text:
        return "sf"
    if "third" in text or "3rd-place" in text or "3rd place" in text:
        return "third_place"
    if "final" in text:
        return "final"
    return "group"


def stage_label(stage: str, note: str) -> str:
    if note:
        return note.replace("FIFA World Cup, ", "")
    labels = {
        "group": "小组赛",
        "r32": "1/16决赛",
        "r16": "1/8决赛",
        "qf": "1/4决赛",
        "sf": "半决赛",
        "third_place": "三四名决赛",
        "final": "决赛",
    }
    return labels.get(stage, stage)


def parse_datetime(value: str | None) -> datetime:
    if not value:
        raise ValueError("missing kickoff time from provider")
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def espn_date(value: datetime) -> str:
    utc_value = value.astimezone(UTC)
    return utc_value.strftime("%Y%m%d")


def normalize(value: str) -> str:
    return (
        unicodedata.normalize("NFD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
        .replace("&", "and")
        .lower()
        .strip()
    )


ALIAS_TO_ID = {normalize(alias): team_id for team_id, aliases in TEAM_ALIASES.items() for alias in aliases}


def slugify(value: str) -> str:
    normalized = normalize(value)
    slug = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return slug or "unknown_team"
