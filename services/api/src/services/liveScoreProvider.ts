import { config } from "../config.js";
import type { MatchDecision, MatchStatus } from "../models.js";

export interface ExternalScoreSnapshot {
  provider: "espn";
  externalId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  fullMatchHomeScore?: number;
  fullMatchAwayScore?: number;
  penaltyShootoutHomeScore?: number;
  penaltyShootoutAwayScore?: number;
  resultDecision?: MatchDecision;
  score90Verified?: boolean;
  minute: number;
  status: MatchStatus;
  winnerTeamId?: string;
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
  score?: string | number;
  shootoutScore?: string | number;
  winner?: boolean;
  linescores?: Array<{
    displayValue?: string;
  }>;
  team?: {
    displayName?: string;
    shortDisplayName?: string;
    name?: string;
    abbreviation?: string;
  };
}

interface EspnSummaryResponse {
  header?: {
    competitions?: Array<{
      competitors?: EspnCompetitor[];
    }>;
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
  const snapshots = parseEspnScoreboard(payload, url);
  return enrichRegulationScores(payload, snapshots);
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

  const status = parseStatus(event.status);
  const winnerTeamId = status === "finished" ? (home.winner ? homeTeamId : away.winner ? awayTeamId : undefined) : undefined;
  const parsedHomeScore = parseScore(home.score);
  const parsedAwayScore = parseScore(away.score);
  const hasVerifiedScorePair = parsedHomeScore !== null && parsedAwayScore !== null;
  if (status !== "scheduled" && !hasVerifiedScorePair) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "Public score source returned an incomplete or invalid score pair",
        provider: "espn",
        eventId: event.id,
        homeScore: home.score,
        awayScore: away.score
      })
    );
    return null;
  }

  const aggregateHomeScore = parsedHomeScore ?? 0;
  const aggregateAwayScore = parsedAwayScore ?? 0;
  const shootoutHomeScore = parseScore(home.shootoutScore);
  const shootoutAwayScore = parseScore(away.shootoutScore);
  const hasVerifiedShootoutScore = shootoutHomeScore !== null && shootoutAwayScore !== null;
  const score90Verified = hasVerifiedScorePair && !isDecidedAfterRegulation(event.status);
  const resultDecision = status === "finished" ? parseResultDecision(event.status, hasVerifiedShootoutScore) : undefined;

  return {
    provider: "espn",
    externalId: event.id,
    homeTeamId,
    awayTeamId,
    homeScore: aggregateHomeScore,
    awayScore: aggregateAwayScore,
    ...(status === "finished"
      ? {
          fullMatchHomeScore: aggregateHomeScore,
          fullMatchAwayScore: aggregateAwayScore,
          resultDecision
        }
      : {}),
    ...(status === "finished" && hasVerifiedShootoutScore
      ? {
          penaltyShootoutHomeScore: shootoutHomeScore,
          penaltyShootoutAwayScore: shootoutAwayScore
        }
      : {}),
    score90Verified,
    minute: parseMinute(event.status),
    status,
    winnerTeamId,
    startTime: new Date(event.date).toISOString(),
    source
  };
}

async function enrichRegulationScores(
  payload: EspnScoreboardResponse,
  snapshots: ExternalScoreSnapshot[]
): Promise<ExternalScoreSnapshot[]> {
  const eventsById = new Map((payload.events ?? []).flatMap((event) => (event.id ? [[event.id, event] as const] : [])));

  return Promise.all(
    snapshots.map(async (snapshot) => {
      const event = eventsById.get(snapshot.externalId);
      if (!event || snapshot.score90Verified !== false) return snapshot;

      const regulationResult = await fetchRegulationResult(snapshot.externalId);
      if (!regulationResult) return snapshot;
      return {
        ...snapshot,
        homeScore: regulationResult.homeScore,
        awayScore: regulationResult.awayScore,
        winnerTeamId: regulationResult.winnerTeamId ?? snapshot.winnerTeamId,
        score90Verified: true
      };
    })
  );
}

async function fetchRegulationResult(
  eventId: string
): Promise<{ homeScore: number; awayScore: number; winnerTeamId?: string } | null> {
  const url = buildSummaryUrl(eventId);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        accept: "application/json,text/plain,*/*"
      },
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return null;

    const summary = (await response.json()) as EspnSummaryResponse;
    const competitors = summary.header?.competitions?.[0]?.competitors ?? [];
    const home = competitors.find((item) => item.homeAway === "home");
    const away = competitors.find((item) => item.homeAway === "away");
    if (!home || !away) return null;

    const homeScore = regulationScore(home);
    const awayScore = regulationScore(away);
    if (homeScore === null || awayScore === null) return null;

    const homeTeamId = resolveTeamId(home);
    const awayTeamId = resolveTeamId(away);
    const winnerTeamId = home.winner ? homeTeamId ?? undefined : away.winner ? awayTeamId ?? undefined : undefined;
    return { homeScore, awayScore, winnerTeamId };
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "Regulation-time score lookup failed",
        provider: "espn",
        eventId,
        error: String(error)
      })
    );
    return null;
  }
}

function regulationScore(competitor: EspnCompetitor): number | null {
  const regulationPeriods = competitor.linescores?.slice(0, 2) ?? [];
  if (regulationPeriods.length !== 2) return null;
  const values = regulationPeriods.map((period) => Number(period.displayValue));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return values[0] + values[1];
}

function parseScore(value?: string | number): number | null {
  if (value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseResultDecision(status: EspnEvent["status"], hasVerifiedShootoutScore: boolean): MatchDecision {
  if (hasVerifiedShootoutScore) return "penalties";
  const type = status?.type;
  const detail = `${type?.description ?? ""} ${type?.detail ?? ""} ${type?.shortDetail ?? ""}`.toLowerCase();
  if (/\b(pen|pens|penalties)\b/.test(detail)) return "penalties";
  if ((status?.period ?? 0) > 2 || detail.includes("extra time") || /\baet\b/.test(detail)) return "extra_time";
  return "regulation";
}

function isDecidedAfterRegulation(status: EspnEvent["status"]): boolean {
  const type = status?.type;
  const detail = `${type?.description ?? ""} ${type?.detail ?? ""} ${type?.shortDetail ?? ""}`.toLowerCase();
  return (status?.period ?? 0) > 2 || detail.includes("extra time") || /\b(aet|pen|pens|penalties)\b/.test(detail);
}

function buildSummaryUrl(eventId: string): string {
  const scoreboardUrl = config.espnWorldCupScoreboardUrl.split("?")[0].replace(/\/$/, "");
  const summaryUrl = scoreboardUrl.replace(/\/scoreboard$/i, "/summary");
  return `${summaryUrl}?event=${encodeURIComponent(eventId)}`;
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
