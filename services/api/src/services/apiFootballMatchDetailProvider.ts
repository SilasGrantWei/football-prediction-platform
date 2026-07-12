import { config } from "../config.js";
import type { EventType, MatchEvent, TeamRecordLineup, TeamRecordPlayerAppearance, TeamRecordTeamStats } from "../models.js";
import { localizeFootballText, localizePlayerName, localizePositionName, localizeTeamName } from "./footballLocalization.js";
import type { ExternalDetailFixture, ExternalMatchDetail } from "./espnMatchDetailProvider.js";

type ApiFootballFixture = {
  fixture?: { id?: number };
  teams?: {
    home?: ApiFootballTeam;
    away?: ApiFootballTeam;
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
};

type ApiFootballTeam = {
  id?: number;
  name?: string;
  code?: string;
};

type ApiFootballLineupSide = {
  team?: ApiFootballTeam;
  formation?: string;
  startXI?: ApiFootballLineupPlayer[];
  substitutes?: ApiFootballLineupPlayer[];
};

type ApiFootballLineupPlayer = {
  player?: {
    id?: number;
    name?: string;
    number?: number;
    pos?: string;
  };
};

type ApiFootballStatisticSide = {
  team?: ApiFootballTeam;
  statistics?: Array<{
    type?: string;
    value?: string | number | null;
  }>;
};

type ApiFootballEvent = {
  time?: {
    elapsed?: number;
    extra?: number | null;
  };
  team?: ApiFootballTeam;
  player?: {
    name?: string;
  };
  assist?: {
    name?: string | null;
  };
  type?: string;
  detail?: string;
  comments?: string | null;
};

type ApiFootballResponse<T> = {
  response?: T;
};

const apiFootballSourceLabel = "接口足球数据源官方接口";

export async function fetchApiFootballMatchDetail(fixture: ExternalDetailFixture): Promise<ExternalMatchDetail | null> {
  if (!config.apiFootballKey) return null;

  const fixtureId = await resolveApiFootballFixtureId(fixture);
  if (!fixtureId) return null;

  const [lineups, stats, events] = await Promise.all([
    fetchApiFootballLineups(fixture, fixtureId),
    fetchApiFootballStats(fixture, fixtureId),
    fetchApiFootballEvents(fixture, fixtureId)
  ]);

  if (!lineups && !stats && !events.length) return null;

  return {
    sourceLabel: apiFootballSourceLabel,
    sourceUrl: `${trimSlash(config.apiFootballBaseUrl)}/fixtures?id=${encodeURIComponent(String(fixtureId))}`,
    verifiedAt: new Date().toISOString(),
    stats,
    lineups,
    events
  };
}

async function resolveApiFootballFixtureId(fixture: ExternalDetailFixture): Promise<number | null> {
  const date = formatDateOnly(fixture.startTime);
  const body = await apiFootballGet<ApiFootballFixture[]>("/fixtures", { date });
  const fixtures = body?.response ?? [];

  for (const candidate of fixtures) {
    const home = candidate.teams?.home;
    const away = candidate.teams?.away;
    if (!candidate.fixture?.id || !home || !away) continue;

    const teamsMatch = isSameTeam(fixture.homeTeam, home) && isSameTeam(fixture.awayTeam, away);
    if (!teamsMatch) continue;

    const homeGoals = candidate.goals?.home;
    const awayGoals = candidate.goals?.away;
    const scoreKnown = typeof homeGoals === "number" && typeof awayGoals === "number";
    const scoreMatches = !scoreKnown || (homeGoals === fixture.homeScore && awayGoals === fixture.awayScore);
    if (scoreMatches) return candidate.fixture.id;
  }

  return null;
}

async function fetchApiFootballLineups(
  fixture: ExternalDetailFixture,
  fixtureId: number
): Promise<ExternalMatchDetail["lineups"]> {
  const body = await apiFootballGet<ApiFootballLineupSide[]>("/fixtures/lineups", { fixture: fixtureId });
  const sides = body?.response ?? [];
  const home = sides.find((side) => isSameTeam(fixture.homeTeam, side.team));
  const away = sides.find((side) => isSameTeam(fixture.awayTeam, side.team));
  if (!home || !away) return null;

  const homeLineup = toLineup(home, fixture.homeTeam.id, fixture.homeTeam.name);
  const awayLineup = toLineup(away, fixture.awayTeam.id, fixture.awayTeam.name);
  if (!homeLineup.starters.length || !awayLineup.starters.length) return null;

  return {
    home: homeLineup,
    away: awayLineup
  };
}

async function fetchApiFootballStats(
  fixture: ExternalDetailFixture,
  fixtureId: number
): Promise<ExternalMatchDetail["stats"]> {
  const body = await apiFootballGet<ApiFootballStatisticSide[]>("/fixtures/statistics", { fixture: fixtureId });
  const sides = body?.response ?? [];
  const home = sides.find((side) => isSameTeam(fixture.homeTeam, side.team));
  const away = sides.find((side) => isSameTeam(fixture.awayTeam, side.team));
  if (!home || !away) return null;

  return {
    home: toStats(home),
    away: toStats(away)
  };
}

async function fetchApiFootballEvents(fixture: ExternalDetailFixture, fixtureId: number): Promise<MatchEvent[]> {
  const body = await apiFootballGet<ApiFootballEvent[]>("/fixtures/events", { fixture: fixtureId });
  const events = body?.response ?? [];
  const parsed = events
    .map((event, index) => toMatchEvent(event, fixture.id, index))
    .filter((event): event is MatchEvent => Boolean(event));

  return parsed.sort((a, b) => a.minute - b.minute || a.id - b.id);
}

async function apiFootballGet<T>(
  path: string,
  params: Record<string, string | number>
): Promise<ApiFootballResponse<T> | null> {
  const url = new URL(`${trimSlash(config.apiFootballBaseUrl)}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": config.apiFootballKey ?? "",
      "user-agent": "football-prediction-platform/0.1"
    }
  });
  if (!response.ok) return null;

  return (await response.json()) as ApiFootballResponse<T>;
}

function toLineup(side: ApiFootballLineupSide, teamId: string, fallbackName: string): TeamRecordLineup {
  return {
    teamId,
    teamName: localizeTeamName(side.team?.name, fallbackName),
    formation: side.formation ?? "-",
    starters: (side.startXI ?? []).map((item) => toAppearance(item, "starter")),
    substitutes: (side.substitutes ?? []).map((item) => toAppearance(item, "substitute")),
    confidence: "reported"
  };
}

function toAppearance(item: ApiFootballLineupPlayer, role: "starter" | "substitute"): TeamRecordPlayerAppearance {
  const sourceName = item.player?.name?.trim();
  return {
    number: Number(item.player?.number) || 0,
    name: localizePlayerName(sourceName, sourceName ?? "未知球员"),
    position: localizePositionName(positionFromApiFootball(item.player?.pos)),
    role,
    minutesPlayed: null
  };
}

function positionFromApiFootball(value: string | undefined): string {
  if (value === "G") return "GK";
  return value ?? "-";
}

function toStats(side: ApiFootballStatisticSide): TeamRecordTeamStats {
  const stats = new Map((side.statistics ?? []).map((item) => [normalizeStatName(item.type), item.value]));

  return {
    possession: numberStat(stats, "ball possession"),
    shots: numberStat(stats, "total shots"),
    shotsOnTarget: numberStat(stats, "shots on goal"),
    corners: numberStat(stats, "corner kicks"),
    fouls: numberStat(stats, "fouls"),
    yellowCards: numberStat(stats, "yellow cards"),
    redCards: numberStat(stats, "red cards"),
    xg: optionalNumberStat(stats, "expected goals")
  };
}

function toMatchEvent(event: ApiFootballEvent, matchId: string, index: number): MatchEvent | null {
  const type = toEventType(event.type, event.detail);
  if (!type) return null;

  const team = localizeTeamName(event.team?.name, "");
  const player = buildEventPlayer(event, type);
  if (!team || !player) return null;

  const minute = Number(event.time?.elapsed ?? 0) + Number(event.time?.extra ?? 0);
  return {
    id: Math.abs(hash(`${matchId}:${minute}:${type}:${team}:${player}:${index}`)),
    matchId,
    minute,
    type,
    team,
    player,
    description: localizeFootballText([event.detail, event.comments].filter(Boolean).join(" · "), undefined),
    createdAt: new Date(0).toISOString()
  };
}

function toEventType(type: string | undefined, detail: string | undefined): EventType | null {
  const normalizedType = normalizeStatName(type);
  const normalizedDetail = normalizeStatName(detail);

  if (normalizedType.includes("var") || normalizedDetail.includes("var")) return "var_review";
  if (normalizedType === "goal" && normalizedDetail.includes("penalty")) return "penalty";
  if (normalizedType === "goal") return "goal";
  if (normalizedType === "card" && normalizedDetail.includes("red")) return "red_card";
  if (normalizedType === "card" && normalizedDetail.includes("yellow")) return "yellow_card";
  if (normalizedType === "subst") return "substitution";
  if (normalizedDetail.includes("offside")) return "offside";
  if (normalizedDetail.includes("foul")) return "foul";
  if (normalizedDetail.includes("corner")) return "corner";
  if (normalizedDetail.includes("free kick")) return "free_kick";
  return null;
}

function buildEventPlayer(event: ApiFootballEvent, type: EventType): string {
  const sourcePlayer = event.player?.name?.trim();
  const sourceAssist = event.assist?.name?.trim();
  const player = localizePlayerName(sourcePlayer, sourcePlayer ?? "");
  const assist = localizePlayerName(sourceAssist, sourceAssist ?? "");
  if (type === "substitution" && assist && player) return `${assist} 替换 ${player}`;
  if (player) return player;
  if (type === "offside") return "越位";
  if (type === "foul") return "犯规";
  if (type === "corner") return "角球";
  if (type === "free_kick") return "任意球";
  if (type === "var_review") return "视频助理裁判判定";
  if (type === "penalty") return "点球";
  return "";
}

function isSameTeam(
  expected: { id: string; name: string },
  candidate: { name?: string; code?: string } | undefined
): boolean {
  const candidateValues = [candidate?.name, candidate?.code, localizeTeamName(candidate?.name, "")]
    .filter((value): value is string => Boolean(value))
    .map(normalizeName);
  const expectedValues = [
    expected.id.replaceAll("_", " "),
    expected.name,
    ...teamAliases(expected.id)
  ].map(normalizeName);

  return expectedValues.some((expectedValue) => candidateValues.includes(expectedValue));
}

function teamAliases(teamId: string): string[] {
  const aliases: Record<string, string[]> = {
    dr_congo: ["dr congo", "congo dr", "democratic republic of congo", "democratic republic of the congo"],
    saudi_arabia: ["saudi arabia", "ksa"],
    cape_verde: ["cape verde", "cabo verde"],
    united_states: ["united states", "usa", "united states of america"],
    congo_dr: ["congo dr", "dr congo"],
    south_korea: ["south korea", "korea republic"],
    ivory_coast: ["ivory coast", "cote d ivoire"]
  };
  return aliases[teamId] ?? [];
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function normalizeStatName(value: string | undefined): string {
  return normalizeName(value ?? "");
}

function numberStat(stats: Map<string, string | number | null | undefined>, key: string): number {
  return parseNumber(stats.get(key)) ?? 0;
}

function optionalNumberStat(stats: Map<string, string | number | null | undefined>, key: string): number | null {
  return parseNumber(stats.get(key));
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateOnly(value: string): string {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function hash(value: string): number {
  return value.split("").reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 0);
}
