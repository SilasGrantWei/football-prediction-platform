import { config } from "../config.js";
import type { Team } from "../models.js";
import { localizeTeamName } from "./footballLocalization.js";

export type ExternalRecordFixture = {
  id: string;
  competition: string;
  startTime: string;
  homeTeam: {
    id: string;
    name: string;
  };
  awayTeam: {
    id: string;
    name: string;
  };
  homeScore: number;
  awayScore: number;
  source: "external";
  sourceLabel: string;
  sourceUrl: string;
  externalEventId: string;
  externalLeague: "fifa.friendly";
};

type EspnScoreboard = {
  events?: EspnFriendlyEvent[];
};

type EspnFriendlyEvent = {
  id?: string;
  date?: string;
  name?: string;
  status?: {
    type?: {
      completed?: boolean;
      name?: string;
    };
  };
  competitions?: Array<{
    competitors?: EspnCompetitor[];
  }>;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string;
  team?: {
    displayName?: string;
    shortDisplayName?: string;
    abbreviation?: string;
  };
};

type FriendlyCache = {
  key: string;
  expiresAt: number;
  fixtures: ExternalRecordFixture[];
};

const teamAliases: Record<string, string[]> = {
  mexico: ["mexico", "mex"],
  south_africa: ["south africa", "rsa"],
  south_korea: ["south korea", "kor", "korea republic"],
  czechia: ["czechia", "czech republic", "cze"],
  canada: ["canada", "can"],
  bosnia: ["bosnia", "bosnia and herzegovina", "bih"],
  usa: ["united states", "usa", "usmnt"],
  paraguay: ["paraguay", "par"],
  qatar: ["qatar", "qat"],
  switzerland: ["switzerland", "sui"],
  brazil: ["brazil", "bra"],
  morocco: ["morocco", "mar"],
  haiti: ["haiti", "hai"],
  scotland: ["scotland", "sco"],
  australia: ["australia", "aus"],
  turkey: ["turkey", "turkiye", "tur"],
  germany: ["germany", "ger"],
  curacao: ["curacao", "cuw"],
  netherlands: ["netherlands", "holland", "ned"],
  japan: ["japan", "jpn"],
  ivory_coast: ["ivory coast", "cote d ivoire", "civ"],
  ecuador: ["ecuador", "ecu"],
  sweden: ["sweden", "swe"],
  tunisia: ["tunisia", "tun"],
  spain: ["spain", "esp"],
  cape_verde: ["cape verde", "cpv"],
  saudi_arabia: ["saudi arabia", "ksa"],
  uruguay: ["uruguay", "uru"],
  belgium: ["belgium", "bel"],
  egypt: ["egypt", "egy"],
  iran: ["iran", "irn"],
  new_zealand: ["new zealand", "nzl"],
  france: ["france", "fra"],
  senegal: ["senegal", "sen"],
  iraq: ["iraq", "irq"],
  norway: ["norway", "nor"],
  argentina: ["argentina", "arg"],
  algeria: ["algeria", "alg"],
  austria: ["austria", "aut"],
  jordan: ["jordan", "jor"],
  portugal: ["portugal", "por"],
  dr_congo: ["dr congo", "congo dr", "democratic republic of the congo", "cod"],
  uzbekistan: ["uzbekistan", "uzb"],
  colombia: ["colombia", "col"],
  england: ["england", "eng"],
  croatia: ["croatia", "cro"],
  ghana: ["ghana", "gha"],
  panama: ["panama", "pan"]
};

let cache: FriendlyCache | null = null;

export async function fetchEspnFriendlyRecordFixtures(
  seasonYear: number,
  cutoffTime: number,
  teams: Team[]
): Promise<ExternalRecordFixture[]> {
  if (!config.externalFriendlyRecordsEnabled) return [];

  const dateRange = `${seasonYear}0101-${formatDateKey(new Date(cutoffTime))}`;
  const fixtures = await fetchFriendlyFixturesForRange(dateRange, teams);

  return fixtures
    .filter((fixture) => new Date(fixture.startTime).getUTCFullYear() === seasonYear)
    .filter((fixture) => new Date(fixture.startTime).getTime() < cutoffTime)
    .filter((fixture) => teams.some((team) => hasTeam(fixture, team.id)));
}

export function clearEspnFriendlyRecordCache(): void {
  cache = null;
}

async function fetchFriendlyFixturesForRange(dateRange: string, teams: Team[]): Promise<ExternalRecordFixture[]> {
  const cacheKey = `${dateRange}:${teams.map((team) => team.id).sort().join(",")}`;
  if (cache && cache.key === cacheKey && cache.expiresAt > Date.now()) return cache.fixtures;

  const url = `${config.espnFriendlyScoreboardUrl}?limit=500&dates=${dateRange}`;
  const response = await fetch(url, {
    headers: { "user-agent": "football-prediction-platform/0.1" }
  });
  if (!response.ok) return [];

  const scoreboard = (await response.json()) as EspnScoreboard;
  const teamLookup = buildTeamLookup(teams);
  const fixtures = (scoreboard.events ?? [])
    .map((event) => toExternalFixture(event, teamLookup))
    .filter((fixture): fixture is ExternalRecordFixture => Boolean(fixture));

  cache = {
    key: cacheKey,
    expiresAt: Date.now() + 5 * 60_000,
    fixtures
  };

  return fixtures;
}

function toExternalFixture(
  event: EspnFriendlyEvent,
  teamLookup: Map<string, Team>
): ExternalRecordFixture | null {
  if (!event.id || !event.date) return null;
  if (!isFullTime(event)) return null;

  const competitors = event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((candidate) => candidate.homeAway === "home");
  const away = competitors.find((candidate) => candidate.homeAway === "away");
  if (!home?.team || !away?.team) return null;

  const homeScore = Number(home.score);
  const awayScore = Number(away.score);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  return {
    id: `espn-friendly-${event.id}`,
    competition: "2026世界杯备战友谊赛",
    startTime: new Date(event.date).toISOString(),
    homeTeam: toFixtureTeam(home.team, teamLookup),
    awayTeam: toFixtureTeam(away.team, teamLookup),
    homeScore,
    awayScore,
    source: "external",
    sourceLabel: "公开赛事数据源国际友谊赛",
    sourceUrl: `${config.espnMatchPageBaseUrl}/${encodeURIComponent(event.id)}`,
    externalEventId: event.id,
    externalLeague: "fifa.friendly"
  };
}

function isFullTime(event: EspnFriendlyEvent): boolean {
  return event.status?.type?.completed === true || event.status?.type?.name === "STATUS_FULL_TIME";
}

function toFixtureTeam(team: NonNullable<EspnCompetitor["team"]>, teamLookup: Map<string, Team>) {
  const values = [team.displayName, team.shortDisplayName, team.abbreviation].filter((value): value is string => Boolean(value));
  const mappedTeam = values.map(normalize).map((value) => teamLookup.get(value)).find(Boolean);
  const displayName = team.displayName ?? team.shortDisplayName ?? team.abbreviation ?? "Unknown Team";

  return {
    id: mappedTeam?.id ?? `external-${normalize(displayName).replaceAll(" ", "_")}`,
    name: mappedTeam?.name ?? localizeTeamName(displayName, displayName)
  };
}

function buildTeamLookup(teams: Team[]): Map<string, Team> {
  const lookup = new Map<string, Team>();
  for (const team of teams) {
    lookup.set(normalize(team.id.replaceAll("_", " ")), team);
    for (const alias of teamAliases[team.id] ?? []) {
      lookup.set(normalize(alias), team);
    }
  }
  return lookup;
}

function hasTeam(fixture: ExternalRecordFixture, teamId: string): boolean {
  return fixture.homeTeam.id === teamId || fixture.awayTeam.id === teamId;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatDateKey(value: Date): string {
  return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`;
}
