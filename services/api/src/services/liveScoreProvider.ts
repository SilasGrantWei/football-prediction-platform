import { config } from "../config.js";
import type { MatchStatus } from "../models.js";

export interface ExternalScoreSnapshot {
  provider: "espn";
  externalId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: MatchStatus;
  startTime: string;
  source: string;
}

interface EspnScoreboardResponse {
  events?: EspnEvent[];
}

interface EspnEvent {
  id?: string;
  name?: string;
  date?: string;
  status?: {
    clock?: number;
    displayClock?: string;
    period?: number;
    type?: {
      state?: "pre" | "in" | "post";
      completed?: boolean;
      shortDetail?: string;
      detail?: string;
      description?: string;
    };
  };
  competitions?: Array<{
    competitors?: EspnCompetitor[];
  }>;
}

interface EspnCompetitor {
  homeAway?: "home" | "away";
  score?: string;
  team?: {
    displayName?: string;
    shortDisplayName?: string;
    name?: string;
    abbreviation?: string;
  };
}

const teamAliases: Record<string, string[]> = {
  mexico: ["mexico"],
  south_africa: ["south africa"],
  south_korea: ["south korea", "korea republic", "republic of korea"],
  czechia: ["czechia", "czech republic"],
  canada: ["canada"],
  bosnia: ["bosnia-herzegovina", "bosnia and herzegovina", "bosnia"],
  usa: ["united states", "usa", "u.s.", "us"],
  paraguay: ["paraguay"],
  qatar: ["qatar"],
  switzerland: ["switzerland"],
  brazil: ["brazil"],
  morocco: ["morocco"],
  haiti: ["haiti"],
  scotland: ["scotland"],
  australia: ["australia"],
  turkey: ["turkey", "turkiye"],
  germany: ["germany"],
  curacao: ["curacao"],
  netherlands: ["netherlands", "holland"],
  japan: ["japan"],
  ivory_coast: ["ivory coast", "cote d'ivoire"],
  ecuador: ["ecuador"],
  sweden: ["sweden"],
  tunisia: ["tunisia"],
  spain: ["spain"],
  cape_verde: ["cape verde"],
  saudi_arabia: ["saudi arabia"],
  uruguay: ["uruguay"],
  belgium: ["belgium"],
  egypt: ["egypt"],
  iran: ["iran"],
  new_zealand: ["new zealand"],
  france: ["france"],
  senegal: ["senegal"],
  iraq: ["iraq"],
  norway: ["norway"],
  argentina: ["argentina"],
  algeria: ["algeria"],
  austria: ["austria"],
  jordan: ["jordan"],
  portugal: ["portugal"],
  dr_congo: ["congo dr", "dr congo", "congo, dr", "democratic republic of congo"],
  uzbekistan: ["uzbekistan"],
  colombia: ["colombia"],
  england: ["england"],
  croatia: ["croatia"],
  ghana: ["ghana"],
  panama: ["panama"]
};

const normalizedAliasToId = new Map<string, string>(
  Object.entries(teamAliases).flatMap(([teamId, aliases]) => aliases.map((alias) => [normalizeTeamName(alias), teamId]))
);

export async function fetchWorldCupScoreboardScores(now = new Date()): Promise<ExternalScoreSnapshot[]> {
  const url = buildScoreboardUrl(now);
  return fetchScoreboardUrl(url);
}

export async function fetchWorldCupTournamentScoreboardScores(): Promise<ExternalScoreSnapshot[]> {
  const url = buildTournamentScoreboardUrl();
  return fetchScoreboardUrl(url);
}

async function fetchScoreboardUrl(url: string): Promise<ExternalScoreSnapshot[]> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      accept: "application/json,text/plain,*/*"
    },
    signal: AbortSignal.timeout(8_000)
  });

  if (!response.ok) {
    throw new Error(`公开赛事数据源比分接口返回异常状态 ${response.status}`);
  }

  const payload = (await response.json()) as EspnScoreboardResponse;
  return parseEspnScoreboard(payload, url);
}

export function parseEspnScoreboard(payload: EspnScoreboardResponse, source: string): ExternalScoreSnapshot[] {
  return (payload.events ?? [])
    .map((event) => parseEspnEvent(event, source))
    .filter((item): item is ExternalScoreSnapshot => item !== null);
}

function parseEspnEvent(event: EspnEvent, source: string): ExternalScoreSnapshot | null {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((item) => item.homeAway === "home");
  const away = competitors.find((item) => item.homeAway === "away");
  if (!event.id || !event.date || !home || !away) return null;

  const homeTeamId = resolveTeamId(home);
  const awayTeamId = resolveTeamId(away);
  if (!homeTeamId || !awayTeamId) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "公开赛事数据源球队无法映射",
        eventId: event.id,
        eventName: event.name,
        home: home.team?.displayName,
        away: away.team?.displayName
      })
    );
    return null;
  }

  return {
    provider: "espn",
    externalId: event.id,
    homeTeamId,
    awayTeamId,
    homeScore: Number(home.score ?? 0),
    awayScore: Number(away.score ?? 0),
    minute: parseMinute(event.status),
    status: parseStatus(event.status),
    startTime: new Date(event.date).toISOString(),
    source
  };
}

function resolveTeamId(competitor: EspnCompetitor): string | null {
  const candidates = [
    competitor.team?.displayName,
    competitor.team?.shortDisplayName,
    competitor.team?.name,
    competitor.team?.abbreviation
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalized = normalizeTeamName(candidate);
    const direct = normalizedAliasToId.get(normalized);
    if (direct) return direct;
  }

  return null;
}

function parseStatus(status: EspnEvent["status"]): MatchStatus {
  const type = status?.type;
  const detail = `${type?.description ?? ""} ${type?.detail ?? ""} ${type?.shortDetail ?? ""}`.toLowerCase();
  if (type?.completed || type?.state === "post") return "finished";
  if (detail.includes("half")) return "halftime";
  if (type?.state === "in") return "live";
  return "scheduled";
}

function parseMinute(status: EspnEvent["status"]): number {
  const parsedDisplayClock = parseDisplayClock(status?.displayClock);
  if (status?.type?.completed || status?.type?.state === "post") {
    return 90;
  }

  if (status?.type?.state === "in") {
    if (parsedDisplayClock > 0) return parsedDisplayClock;
    if (typeof status.clock === "number" && status.clock > 0) return Math.max(1, Math.floor(status.clock / 60));
  }

  const detail = `${status?.type?.description ?? ""} ${status?.type?.detail ?? ""} ${status?.type?.shortDetail ?? ""}`.toLowerCase();
  if (detail.includes("half")) return Math.max(parsedDisplayClock, 45);

  return 0;
}

function parseDisplayClock(value?: string): number {
  if (!value) return 0;
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function buildScoreboardUrl(now: Date): string {
  const dates = `${formatEspnDate(addDays(now, -1))}-${formatEspnDate(addDays(now, 2))}`;
  const separator = config.espnWorldCupScoreboardUrl.includes("?") ? "&" : "?";
  return `${config.espnWorldCupScoreboardUrl}${separator}limit=200&dates=${dates}`;
}

function buildTournamentScoreboardUrl(): string {
  const separator = config.espnWorldCupScoreboardUrl.includes("?") ? "&" : "?";
  return `${config.espnWorldCupScoreboardUrl}${separator}limit=300&dates=${config.worldCupTournamentStart}-${config.worldCupTournamentEnd}`;
}

function formatEspnDate(value: Date): string {
  return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeTeamName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}
