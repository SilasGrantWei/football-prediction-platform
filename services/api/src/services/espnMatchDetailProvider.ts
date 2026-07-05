import type { EventType, MatchEvent, TeamRecordLineup, TeamRecordTeamStats } from "../models.js";
import { config } from "../config.js";
import { localizeFootballText, localizePlayerName, localizePositionName, localizeTeamName } from "./footballLocalization.js";

export type ExternalDetailFixture = {
  id: string;
  startTime: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  homeScore: number;
  awayScore: number;
  externalEventId?: string;
  externalLeague?: "fifa.world" | "fifa.friendly";
};

export type ExternalMatchDetail = {
  sourceLabel: string;
  sourceUrl: string;
  verifiedAt: string;
  stats: {
    home: TeamRecordTeamStats;
    away: TeamRecordTeamStats;
  } | null;
  lineups: {
    home: TeamRecordLineup;
    away: TeamRecordLineup;
  } | null;
  events: MatchEvent[];
};

type EspnLeague = "fifa.world" | "fifa.friendly";

type ResolvedEspnEvent = {
  eventId: string;
  league: EspnLeague;
  homeAwaySwapped: boolean;
};

type EspnSummary = {
  boxscore?: {
    teams?: EspnBoxscoreTeam[];
  };
  rosters?: EspnRosterSide[];
  keyEvents?: EspnPlay[];
  commentary?: EspnCommentary[];
};

type EspnBoxscoreTeam = {
  homeAway?: "home" | "away";
  statistics?: Array<{
    name?: string;
    displayValue?: string;
  }>;
};

type EspnRosterSide = {
  homeAway?: "home" | "away";
  formation?: string;
  team?: {
    displayName?: string;
  };
  roster?: EspnRosterPlayer[];
};

type EspnRosterPlayer = {
  starter?: boolean;
  subbedIn?: boolean;
  jersey?: string;
  athlete?: {
    displayName?: string;
  };
  position?: {
    displayName?: string;
    abbreviation?: string;
  };
  stats?: Array<{
    name?: string;
    value?: number;
  }>;
};

type EspnPlay = {
  id?: string;
  type?: {
    type?: string;
    text?: string;
  };
  clock?: {
    displayValue?: string;
    value?: number;
  };
  time?: {
    displayValue?: string;
    value?: number;
  };
  team?: {
    displayName?: string;
  };
  participants?: Array<{
    athlete?: {
      displayName?: string;
    };
  }>;
  text?: string;
  play?: EspnPlay;
};

type EspnCommentary = {
  play?: EspnPlay;
};

const knownEspnEventIds: Record<string, string> = {
  "g-h-006": "760479"
};

const teamAliases: Record<string, string[]> = {
  uruguay: ["uruguay", "uru"],
  spain: ["spain", "esp"],
  austria: ["austria", "aut"],
  portugal: ["portugal", "por"],
  croatia: ["croatia", "cro"],
  colombia: ["colombia", "col"],
  england: ["england", "eng"],
  ghana: ["ghana", "gha"],
  panama: ["panama", "pan"],
  algeria: ["algeria", "alg"],
  argentina: ["argentina", "arg"],
  jordan: ["jordan", "jor"],
  saudi_arabia: ["saudi arabia", "ksa"],
  cape_verde: ["cape verde", "cpv"],
  uzbekistan: ["uzbekistan", "uzb"],
  dr_congo: ["dr congo", "congo dr", "democratic republic of the congo", "cod"]
};

export async function fetchEspnMatchDetail(fixture: ExternalDetailFixture): Promise<ExternalMatchDetail | null> {
  const resolved = await resolveEspnEvent(fixture);
  if (!resolved) return null;

  const url = `${getSummaryUrl(resolved.league)}?event=${encodeURIComponent(resolved.eventId)}`;
  const response = await fetch(url, {
    headers: { "user-agent": "football-prediction-platform/0.1" }
  });
  if (!response.ok) return null;

  const summary = (await response.json()) as EspnSummary;
  const stats = parseTeamStats(summary, resolved.homeAwaySwapped);
  const lineups = parseLineups(summary, fixture, resolved.homeAwaySwapped);
  const events = parseEvents(summary, fixture.id);

  if (!stats && !lineups && !events.length) return null;

  return {
    sourceLabel: resolved.league === "fifa.friendly" ? "公开赛事数据源国际友谊赛数据" : "公开赛事数据源世界杯数据",
    sourceUrl: `${config.espnMatchPageBaseUrl}/${encodeURIComponent(resolved.eventId)}`,
    verifiedAt: new Date().toISOString(),
    stats,
    lineups,
    events
  };
}

async function resolveEspnEvent(fixture: ExternalDetailFixture): Promise<ResolvedEspnEvent | null> {
  if (fixture.externalEventId) {
    return {
      eventId: fixture.externalEventId,
      league: fixture.externalLeague ?? "fifa.world",
      homeAwaySwapped: false
    };
  }

  const known = knownEspnEventIds[fixture.id];
  if (known) {
    return {
      eventId: known,
      league: fixture.externalLeague ?? "fifa.world",
      homeAwaySwapped: false
    };
  }

  const leagues: EspnLeague[] = fixture.externalLeague ? [fixture.externalLeague] : ["fifa.world", "fifa.friendly"];

  for (const dateKey of formatDateWindowKeys(fixture.startTime)) {
    for (const league of leagues) {
      const resolved = await findEspnScoreboardEvent(fixture, league, dateKey);
      if (resolved) return resolved;
    }
  }

  return null;
}

async function findEspnScoreboardEvent(
  fixture: ExternalDetailFixture,
  league: EspnLeague,
  dateKey: string
): Promise<ResolvedEspnEvent | null> {
  const response = await fetch(buildScoreboardUrl(league, dateKey), {
    headers: { "user-agent": "football-prediction-platform/0.1" }
  });
  if (!response.ok) return null;

  const scoreboard = (await response.json()) as {
    events?: Array<{
      id?: string;
      competitions?: Array<{
        competitors?: Array<{
          homeAway?: "home" | "away";
          score?: string;
          team?: {
            displayName?: string;
            shortDisplayName?: string;
            abbreviation?: string;
          };
        }>;
      }>;
    }>;
  };

  for (const event of scoreboard.events ?? []) {
    const competitors = event.competitions?.[0]?.competitors ?? [];
    const home = competitors.find((candidate) => candidate.homeAway === "home");
    const away = competitors.find((candidate) => candidate.homeAway === "away");
    if (!home || !away || !event.id) continue;

    const homeScore = Number(home.score);
    const awayScore = Number(away.score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

    const directMatch =
      isSameTeam(fixture.homeTeam.id, home.team) &&
      isSameTeam(fixture.awayTeam.id, away.team) &&
      homeScore === fixture.homeScore &&
      awayScore === fixture.awayScore;

    if (directMatch) return { eventId: event.id, league, homeAwaySwapped: false };

    const swappedMatch =
      isSameTeam(fixture.homeTeam.id, away.team) &&
      isSameTeam(fixture.awayTeam.id, home.team) &&
      awayScore === fixture.homeScore &&
      homeScore === fixture.awayScore;

    if (swappedMatch) return { eventId: event.id, league, homeAwaySwapped: true };
  }

  return null;
}

function buildScoreboardUrl(league: EspnLeague, dateKey: string): string {
  const baseUrl = league === "fifa.friendly" ? config.espnFriendlyScoreboardUrl : config.espnWorldCupScoreboardUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}limit=500&dates=${dateKey}`;
}

function getSummaryUrl(league: EspnLeague): string {
  return league === "fifa.friendly" ? config.espnFriendlySummaryUrl : config.espnWorldCupSummaryUrl;
}

function parseTeamStats(summary: EspnSummary, homeAwaySwapped: boolean): ExternalMatchDetail["stats"] {
  const espnHome = summary.boxscore?.teams?.find((team) => team.homeAway === "home");
  const espnAway = summary.boxscore?.teams?.find((team) => team.homeAway === "away");
  const home = homeAwaySwapped ? espnAway : espnHome;
  const away = homeAwaySwapped ? espnHome : espnAway;
  if (!home || !away) return null;

  return {
    home: toTeamStats(home),
    away: toTeamStats(away)
  };
}

function toTeamStats(team: EspnBoxscoreTeam): TeamRecordTeamStats {
  const stats = new Map((team.statistics ?? []).map((item) => [item.name ?? "", item.displayValue ?? "0"]));

  return {
    possession: numberStat(stats, "possessionPct"),
    shots: numberStat(stats, "totalShots"),
    shotsOnTarget: numberStat(stats, "shotsOnTarget"),
    corners: numberStat(stats, "wonCorners"),
    fouls: numberStat(stats, "foulsCommitted"),
    yellowCards: numberStat(stats, "yellowCards"),
    redCards: numberStat(stats, "redCards"),
    xg: null
  };
}

function parseLineups(
  summary: EspnSummary,
  fixture: ExternalDetailFixture,
  homeAwaySwapped: boolean
): ExternalMatchDetail["lineups"] {
  const espnHome = summary.rosters?.find((side) => side.homeAway === "home");
  const espnAway = summary.rosters?.find((side) => side.homeAway === "away");
  const home = homeAwaySwapped ? espnAway : espnHome;
  const away = homeAwaySwapped ? espnHome : espnAway;
  if (!home || !away) return null;

  return {
    home: toLineup(home, fixture.homeTeam.id, fixture.homeTeam.name),
    away: toLineup(away, fixture.awayTeam.id, fixture.awayTeam.name)
  };
}

function toLineup(side: EspnRosterSide, teamId: string, fallbackName: string): TeamRecordLineup {
  const roster = side.roster ?? [];
  const starters = roster.filter((player) => player.starter).map((player) => toPlayer(player, "starter"));
  const substitutes = roster
    .filter((player) => !player.starter && (player.subbedIn || hasAppearance(player)))
    .map((player) => toPlayer(player, "substitute"));

  return {
    teamId,
    teamName: localizeTeamName(side.team?.displayName, fallbackName),
    formation: side.formation ?? "-",
    starters,
    substitutes,
    confidence: "reported"
  };
}

function toPlayer(player: EspnRosterPlayer, role: "starter" | "substitute") {
  const sourceName = player.athlete?.displayName?.trim();
  return {
    number: Number(player.jersey) || 0,
    name: localizePlayerName(sourceName, sourceName ?? "未知球员"),
    position: localizePositionName(player.position?.displayName ?? player.position?.abbreviation),
    role,
    minutesPlayed: null
  };
}

function parseEvents(summary: EspnSummary, matchId: string): MatchEvent[] {
  const rawEvents = [
    ...(summary.keyEvents ?? []),
    ...(summary.commentary ?? []).map((item) => item.play).filter((item): item is EspnPlay => Boolean(item))
  ];
  const byKey = new Map<string, MatchEvent>();

  for (const rawEvent of rawEvents) {
    const event = toMatchEvent(rawEvent.play ?? rawEvent, matchId);
    if (!event) continue;
    byKey.set(`${event.minute}:${event.type}:${event.team}:${event.player}`, event);
  }

  return Array.from(byKey.values()).sort((a, b) => a.minute - b.minute || a.id - b.id);
}

function toMatchEvent(event: EspnPlay, matchId: string): MatchEvent | null {
  const description = event.text ? localizeEventText(event.text) : localizeEventText(event.type?.text ?? "", "");
  const type = toEventType(event.type?.type) ?? toEventType(event.type?.text) ?? inferEventTypeFromText(description);
  if (!type) return null;

  const player = buildEventPlayer(event, type, description);
  const team = localizeTeamName(event.team?.displayName, type === "kickoff" || type === "halftime" ? "比赛" : "");
  if (!player || !team) return null;

  return {
    id: Number(event.id) || Math.abs(hash(`${matchId}:${event.clock?.displayValue}:${type}:${team}:${player}`)),
    matchId,
    minute: parseMinute(event.clock?.displayValue ?? event.time?.displayValue, event.clock?.value ?? event.time?.value),
    type,
    team,
    player,
    description: description || undefined,
    createdAt: new Date(0).toISOString()
  };
}

function toEventType(type: string | undefined): EventType | null {
  if (!type) return null;
  const normalized = type.toLowerCase();
  if (normalized === "goal") return "goal";
  if (normalized.includes("own goal")) return "goal";
  if (normalized.includes("penalty")) return "penalty";
  if (normalized === "yellow-card" || normalized === "yellow card") return "yellow_card";
  if (normalized === "red-card" || normalized === "red card") return "red_card";
  if (normalized === "substitution") return "substitution";
  if (normalized === "foul") return "foul";
  if (normalized.includes("offside")) return "offside";
  if (normalized === "corner-awarded" || normalized.includes("corner")) return "corner";
  if (normalized === "shot-on-target" || normalized === "shot on target") return "shot_on_target";
  if (normalized === "shot-off-target" || normalized === "shot off target") return "shot_off_target";
  if (normalized.includes("woodwork")) return "shot_off_target";
  if (normalized === "shot-blocked" || normalized === "shot blocked") return "shot_blocked";
  if (normalized.includes("var")) return "var_review";
  if (normalized.includes("free-kick") || normalized.includes("free kick")) return "free_kick";
  if (normalized === "kickoff") return "kickoff";
  if (normalized === "halftime") return "halftime";
  return null;
}

function inferEventTypeFromText(value: string): EventType | null {
  const text = value.toLowerCase();
  if (!text) return null;
  if (text.includes("var") || text.includes("视频助理裁判")) return "var_review";
  if (text.includes("进球")) return "goal";
  if (text.includes("点球")) return "penalty";
  if (text.includes("黄牌")) return "yellow_card";
  if (text.includes("红牌")) return "red_card";
  if (text.includes("换人") || text.includes("替换")) return "substitution";
  if (text.includes("越位")) return "offside";
  if (text.includes("犯规")) return "foul";
  if (text.includes("角球")) return "corner";
  if (text.includes("任意球")) return "free_kick";
  if (text.includes("射门被封堵") || text.includes("封堵")) return "shot_blocked";
  if (text.includes("射门被扑") || text.includes("射正")) return "shot_on_target";
  if (text.includes("射门偏") || text.includes("偏出") || text.includes("打高") || text.includes("击中横梁") || text.includes("击中门柱")) return "shot_off_target";
  if (text.includes("上半场开始")) return "kickoff";
  if (text.includes("上半场结束")) return "halftime";
  return null;
}

function buildEventPlayer(event: EspnPlay, type: EventType, description = ""): string {
  const textPlayer = extractPlayerFromDescription(description, type);
  if (textPlayer) return textPlayer;

  const participants = (event.participants ?? [])
    .map((participant) => localizePlayerName(participant.athlete?.displayName, ""))
    .filter(Boolean);

  if (type === "substitution" && participants.length >= 2) return `${participants[0]} 替换 ${participants[1]}`;
  if (type === "foul" && /wins a free kick/i.test(event.text ?? "") && participants.length >= 2) {
    return `${participants[0]} 犯规，${participants[1]} 赢得任意球`;
  }
  if (participants[0]) return participants[0];
  if (type === "corner") return "角球";
  if (type === "foul") return "犯规";
  if (type === "offside") return "越位";
  if (type === "shot_on_target") return "射正";
  if (type === "shot_off_target") return "射偏";
  if (type === "shot_blocked") return "射门被封堵";
  if (type === "var_review") return "视频助理裁判判定";
  if (type === "free_kick") return "任意球";
  if (type === "penalty") return "点球";
  if (type === "kickoff") return "开场";
  if (type === "halftime") return "半场结束";
  return localizeEventText(event.text ?? event.type?.text ?? "");
}

function extractPlayerFromDescription(description: string, type: EventType): string {
  if (!description) return "";

  if (type === "corner") {
    const match = description.match(/造成者：\s*([^.。]+)[.。]?/);
    return match?.[1]?.trim() ? `造成角球：${match[1].trim()}` : "";
  }

  if (type === "offside") {
    const match = description.match(/[.。]\s*([^,.，。()（）]+?)\s+越位/);
    return match?.[1]?.trim() ?? "";
  }

  if (type === "foul") {
    const match = description.match(/^犯规[，,]\s*([^()（）.。]+?)(?:\s*[（(]|[.。]|$)/);
    return match?.[1]?.trim() ?? "";
  }

  if (type === "free_kick") {
    const match = description.match(/^([^()（）.。]+?)\s*[（(][^)）]+[)）]\s*在.+任意球/);
    return match?.[1]?.trim() ?? "";
  }

  return "";
}

function localizeEventText(value: string | undefined, fallback = ""): string {
  if (!value) return fallback;
  return localizeFootballText(value)
    .replace(/\bGoal\b/gi, "进球")
    .replace(/\bPenalty\b/gi, "点球")
    .replace(/\bFoul\b/gi, "犯规")
    .replace(/\bOffside\b/gi, "越位")
    .replace(/\bCorner\b/gi, "角球")
    .replace(/\bSubstitution\b/gi, "换人")
    .replace(/\bYellow Card\b/gi, "黄牌")
    .replace(/\bRed Card\b/gi, "红牌")
    .replace(/\bVAR Decision\b/gi, "视频助理裁判判定")
    .replace(/\bFree Kick\b/gi, "任意球")
    .replace(/\bShot On Target\b/gi, "射正")
    .replace(/\bShot Off Target\b/gi, "射偏")
    .replace(/\bShot Blocked\b/gi, "射门被封堵");
}

function hasAppearance(player: EspnRosterPlayer): boolean {
  return Boolean(player.stats?.some((stat) => stat.name === "appearances" && Number(stat.value) > 0));
}

function numberStat(stats: Map<string, string>, key: string): number {
  const value = stats.get(key) ?? "0";
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSameTeam(
  teamId: string,
  team: { displayName?: string; shortDisplayName?: string; abbreviation?: string } | undefined
): boolean {
  const aliases = teamAliases[teamId] ?? [teamId.replaceAll("_", " ")];
  const values = [team?.displayName, team?.shortDisplayName, team?.abbreviation]
    .filter((value): value is string => Boolean(value))
    .map(normalize);
  return aliases.map(normalize).some((alias) => values.includes(alias));
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatDateWindowKeys(value: string): string[] {
  const date = new Date(value);
  const oneDayMs = 24 * 60 * 60 * 1000;
  return [date, new Date(date.getTime() - oneDayMs), new Date(date.getTime() + oneDayMs)].map((item) =>
    `${item.getUTCFullYear()}${String(item.getUTCMonth() + 1).padStart(2, "0")}${String(item.getUTCDate()).padStart(2, "0")}`
  );
}

function parseMinute(displayValue: string | undefined, seconds: number | undefined): number {
  if (displayValue) {
    const match = displayValue.match(/(\d+)(?:'\+(\d+))?/);
    if (match) return Number(match[1]) + Number(match[2] ?? 0);
  }

  if (typeof seconds === "number" && Number.isFinite(seconds)) return Math.floor(seconds / 60);
  return 0;
}

function hash(value: string): number {
  return value.split("").reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 0);
}
