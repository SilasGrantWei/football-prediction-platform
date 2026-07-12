import { config } from "../config.js";
import type { EventType, MatchEvent, TeamRecordLineup, TeamRecordPlayerAppearance, TeamRecordTeamStats } from "../models.js";
import { localizePlayerName, localizePositionName, localizeTeamName } from "./footballLocalization.js";
import type { ExternalDetailFixture, ExternalMatchDetail } from "./espnMatchDetailProvider.js";

type SportmonksFixture = {
  id?: number;
  participants?: SportmonksParticipant[];
  lineups?: SportmonksLineupPlayer[];
  events?: SportmonksEvent[];
  statistics?: SportmonksStatistic[];
};

type SportmonksParticipant = {
  id?: number;
  name?: string;
  meta?: {
    location?: "home" | "away" | string;
  };
};

type SportmonksLineupPlayer = {
  team_id?: number;
  player_name?: string;
  jersey_number?: number;
  number?: number;
  formation_position?: number | string | null;
  position?: {
    name?: string;
  };
  type?: {
    name?: string;
    code?: string;
  };
  player?: {
    display_name?: string;
    name?: string;
  };
};

type SportmonksStatistic = {
  team_id?: number;
  type?: {
    name?: string;
    code?: string;
  };
  value?: string | number | null;
};

type SportmonksEvent = {
  id?: number;
  minute?: number;
  extra_minute?: number | null;
  team_id?: number;
  player_name?: string;
  related_player_name?: string | null;
  result?: string;
  info?: string;
  type?: {
    name?: string;
    code?: string;
  };
};

type SportmonksResponse<T> = {
  data?: T;
};

const sportmonksSourceLabel = "体育数据源官方接口";

export async function fetchSportmonksMatchDetail(fixture: ExternalDetailFixture): Promise<ExternalMatchDetail | null> {
  if (!config.sportmonksApiKey) return null;

  const sportmonksFixture = await resolveSportmonksFixture(fixture);
  if (!sportmonksFixture?.id) return null;

  const detail = await sportmonksGet<SportmonksFixture>(`/fixtures/${sportmonksFixture.id}`, {
    include: "participants;lineups;events;statistics"
  });
  const data = detail?.data ?? sportmonksFixture;
  const participants = data.participants ?? sportmonksFixture.participants ?? [];
  const homeParticipant = participants.find((participant) => participant.meta?.location === "home");
  const awayParticipant = participants.find((participant) => participant.meta?.location === "away");

  const lineups = parseLineups(data, fixture, homeParticipant, awayParticipant);
  const stats = parseStats(data, homeParticipant, awayParticipant);
  const events = parseEvents(data, fixture.id, participants);

  if (!lineups && !stats && !events.length) return null;

  return {
    sourceLabel: sportmonksSourceLabel,
    sourceUrl: `${trimSlash(config.sportmonksBaseUrl)}/fixtures/${encodeURIComponent(String(data.id))}`,
    verifiedAt: new Date().toISOString(),
    stats,
    lineups,
    events
  };
}

async function resolveSportmonksFixture(fixture: ExternalDetailFixture): Promise<SportmonksFixture | null> {
  const date = formatDateOnly(fixture.startTime);
  const body = await sportmonksGet<SportmonksFixture[]>(`/fixtures/date/${date}`, {
    include: "participants"
  });
  const fixtures = body?.data ?? [];

  for (const candidate of fixtures) {
    const participants = candidate.participants ?? [];
    const home = participants.find((participant) => participant.meta?.location === "home");
    const away = participants.find((participant) => participant.meta?.location === "away");
    if (!home || !away) continue;

    if (isSameTeam(fixture.homeTeam, home) && isSameTeam(fixture.awayTeam, away)) return candidate;
  }

  return null;
}

async function sportmonksGet<T>(
  path: string,
  params: Record<string, string>
): Promise<SportmonksResponse<T> | null> {
  const url = new URL(`${trimSlash(config.sportmonksBaseUrl)}${path}`);
  url.searchParams.set("api_token", config.sportmonksApiKey ?? "");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { "user-agent": "football-prediction-platform/0.1" }
  });
  if (!response.ok) return null;

  return (await response.json()) as SportmonksResponse<T>;
}

function parseLineups(
  fixture: SportmonksFixture,
  sourceFixture: ExternalDetailFixture,
  homeParticipant: SportmonksParticipant | undefined,
  awayParticipant: SportmonksParticipant | undefined
): ExternalMatchDetail["lineups"] {
  if (!homeParticipant?.id || !awayParticipant?.id) return null;

  const home = toLineup(fixture.lineups ?? [], homeParticipant.id, sourceFixture.homeTeam.id, sourceFixture.homeTeam.name);
  const away = toLineup(fixture.lineups ?? [], awayParticipant.id, sourceFixture.awayTeam.id, sourceFixture.awayTeam.name);
  if (!home.starters.length || !away.starters.length) return null;

  return { home, away };
}

function toLineup(lineups: SportmonksLineupPlayer[], providerTeamId: number, teamId: string, fallbackName: string): TeamRecordLineup {
  const teamPlayers = lineups.filter((player) => player.team_id === providerTeamId);
  const starters = teamPlayers.filter(isStarterLineupPlayer).map((player) => toAppearance(player, "starter"));
  const substitutes = teamPlayers.filter(isSubstituteLineupPlayer).map((player) => toAppearance(player, "substitute"));

  return {
    teamId,
    teamName: fallbackName,
    formation: "-",
    starters,
    substitutes,
    confidence: "reported"
  };
}

function isStarterLineupPlayer(player: SportmonksLineupPlayer): boolean {
  const role = normalizeName(`${player.type?.name ?? ""} ${player.type?.code ?? ""}`);
  if (role.includes("sub")) return false;
  return role.includes("lineup") || role.includes("starter") || (player.formation_position !== null && player.formation_position !== undefined);
}

function isSubstituteLineupPlayer(player: SportmonksLineupPlayer): boolean {
  const role = normalizeName(`${player.type?.name ?? ""} ${player.type?.code ?? ""}`);
  return role.includes("sub");
}

function toAppearance(player: SportmonksLineupPlayer, role: "starter" | "substitute"): TeamRecordPlayerAppearance {
  const sourceName = (player.player_name ?? player.player?.display_name ?? player.player?.name)?.trim();
  return {
    number: Number(player.jersey_number ?? player.number) || 0,
    name: localizePlayerName(sourceName, sourceName ?? "未知球员"),
    position: localizePositionName(player.position?.name),
    role,
    minutesPlayed: null
  };
}

function parseStats(
  fixture: SportmonksFixture,
  homeParticipant: SportmonksParticipant | undefined,
  awayParticipant: SportmonksParticipant | undefined
): ExternalMatchDetail["stats"] {
  if (!homeParticipant?.id || !awayParticipant?.id) return null;

  const home = toStats(fixture.statistics ?? [], homeParticipant.id);
  const away = toStats(fixture.statistics ?? [], awayParticipant.id);
  return { home, away };
}

function toStats(statistics: SportmonksStatistic[], teamId: number): TeamRecordTeamStats {
  const stats = new Map(
    statistics
      .filter((item) => item.team_id === teamId)
      .map((item) => [normalizeName(item.type?.code ?? item.type?.name ?? ""), item.value])
  );

  return {
    possession: findNumber(stats, ["ball possession", "possession", "possession percentage"]),
    shots: findNumber(stats, ["total shots", "shots"]),
    shotsOnTarget: findNumber(stats, ["shots on target", "shots on goal"]),
    corners: findNumber(stats, ["corners", "corner kicks"]),
    fouls: findNumber(stats, ["fouls"]),
    yellowCards: findNumber(stats, ["yellow cards", "yellowcards"]),
    redCards: findNumber(stats, ["red cards", "redcards"]),
    xg: findOptionalNumber(stats, ["expected goals", "xg"])
  };
}

function parseEvents(fixture: SportmonksFixture, matchId: string, participants: SportmonksParticipant[]): MatchEvent[] {
  const parsed = (fixture.events ?? [])
    .map((event, index) => toMatchEvent(event, matchId, participants, index))
    .filter((event): event is MatchEvent => Boolean(event));

  return parsed.sort((a, b) => a.minute - b.minute || a.id - b.id);
}

function toMatchEvent(
  event: SportmonksEvent,
  matchId: string,
  participants: SportmonksParticipant[],
  index: number
): MatchEvent | null {
  const type = toEventType(event.type?.code ?? event.type?.name ?? event.info);
  if (!type) return null;

  const team = localizeTeamName(participants.find((participant) => participant.id === event.team_id)?.name, "");
  const player = buildEventPlayer(event, type);
  if (!team || !player) return null;

  const minute = Number(event.minute ?? 0) + Number(event.extra_minute ?? 0);
  return {
    id: Number(event.id) || Math.abs(hash(`${matchId}:${minute}:${type}:${team}:${player}:${index}`)),
    matchId,
    minute,
    type,
    team,
    player,
    description: [event.info, event.result].filter(Boolean).join(" · "),
    createdAt: new Date(0).toISOString()
  };
}

function toEventType(value: string | undefined): EventType | null {
  const text = normalizeName(value ?? "");
  if (text.includes("goal") && text.includes("penalty")) return "penalty";
  if (text.includes("penalty")) return "penalty";
  if (text.includes("goal")) return "goal";
  if (text.includes("yellow")) return "yellow_card";
  if (text.includes("red")) return "red_card";
  if (text.includes("substitution") || text.includes("subst")) return "substitution";
  if (text.includes("var")) return "var_review";
  if (text.includes("offside")) return "offside";
  if (text.includes("foul")) return "foul";
  if (text.includes("corner")) return "corner";
  if (text.includes("free kick")) return "free_kick";
  return null;
}

function buildEventPlayer(event: SportmonksEvent, type: EventType): string {
  const sourcePlayer = event.player_name?.trim();
  const sourceRelated = event.related_player_name?.trim();
  const player = localizePlayerName(sourcePlayer, sourcePlayer ?? "");
  const related = localizePlayerName(sourceRelated, sourceRelated ?? "");
  if (type === "substitution" && player && related) return `${player} 替换 ${related}`;
  if (player) return player;
  if (type === "offside") return "越位";
  if (type === "foul") return "犯规";
  if (type === "corner") return "角球";
  if (type === "free_kick") return "任意球";
  if (type === "var_review") return "视频助理裁判判定";
  if (type === "penalty") return "点球";
  return "";
}

function isSameTeam(expected: { id: string; name: string }, candidate: SportmonksParticipant): boolean {
  const candidateValues = [candidate.name, localizeTeamName(candidate.name, "")]
    .filter((value): value is string => Boolean(value))
    .map(normalizeName);
  const expectedValues = [expected.name, expected.id.replaceAll("_", " "), ...teamAliases(expected.id)].map(normalizeName);
  return expectedValues.some((value) => candidateValues.includes(value));
}

function teamAliases(teamId: string): string[] {
  const aliases: Record<string, string[]> = {
    dr_congo: ["dr congo", "congo dr", "democratic republic of congo"],
    united_states: ["united states", "usa"],
    saudi_arabia: ["saudi arabia", "ksa"],
    ivory_coast: ["ivory coast", "cote d ivoire"]
  };
  return aliases[teamId] ?? [];
}

function findNumber(stats: Map<string, string | number | null | undefined>, keys: string[]): number {
  return findOptionalNumber(stats, keys) ?? 0;
}

function findOptionalNumber(stats: Map<string, string | number | null | undefined>, keys: string[]): number | null {
  for (const key of keys.map(normalizeName)) {
    const parsed = parseNumber(stats.get(key));
    if (parsed !== null) return parsed;
  }

  return null;
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
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
