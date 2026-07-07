import type {
  AnalyticsOverview,
  BacktestResult,
  Match,
  MatchEvent,
  MatchLineupProjection,
  MatchLineupValidation,
  Prediction,
  TeamRecordComparison,
  TrendPoint,
  WorldCupSimulation
} from "./types";
import { filterDisplayableMatches } from "./matchDisplayPolicy";

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

const serverBaseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";
const fallbackServerBaseUrls = unique([
  serverBaseUrl,
  process.env.NEXT_PUBLIC_API_BASE_URL,
  "http://127.0.0.1:4000",
  "http://localhost:4000"
]);
const dataApiBaseUrl = process.env.DATA_API_BASE_URL ?? process.env.NEXT_PUBLIC_DATA_API_BASE_URL ?? "http://localhost:8000";
const serverRequestTimeoutMs = Number(process.env.API_REQUEST_TIMEOUT_MS ?? 8_000);
const dataRequestTimeoutMs = Number(process.env.DATA_API_REQUEST_TIMEOUT_MS ?? 1_800);

export function publicApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";
}

export function publicWsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:4000/ws/live";
}

export function publicDataWsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_DATA_WS_URL ?? "ws://localhost:8000";
}

export async function getMatches(params: Record<string, string | undefined> = {}): Promise<Match[]> {
  return filterDisplayableMatches(await request<Match[]>(`/api/matches${toQuery(params)}`));
}

export async function getLiveMatches(): Promise<Match[]> {
  return filterDisplayableMatches(await request<Match[]>("/api/matches/live"));
}

export async function getMatch(id: string): Promise<Match> {
  return request<Match>(`/api/matches/${id}`);
}

export async function getMatchEvents(id: string): Promise<MatchEvent[]> {
  return request<MatchEvent[]>(`/api/matches/${id}/events`);
}

export async function getMatchTrend(id: string): Promise<TrendPoint[]> {
  return request<TrendPoint[]>(`/api/matches/${id}/trend`);
}

export async function getMatchTeamRecords(id: string): Promise<TeamRecordComparison> {
  return request<TeamRecordComparison>(`/api/matches/${id}/team-records`);
}

export async function getMatchProjectedLineup(id: string): Promise<MatchLineupProjection> {
  return request<MatchLineupProjection>(`/api/matches/${id}/projected-lineup`);
}

export async function getMatchLineupValidation(id: string): Promise<MatchLineupValidation> {
  return request<MatchLineupValidation>(`/api/matches/${id}/lineup-validation`);
}

export async function refreshMatchLineupValidation(id: string): Promise<MatchLineupValidation> {
  return mutationRequest<MatchLineupValidation>(`/api/matches/${id}/lineup-validation/refresh`, { method: "POST" });
}

export async function recalculateMatchPrediction(id: string): Promise<Prediction | null> {
  return mutationRequest<Prediction | null>(`/api/matches/${id}/recalculate`, { method: "POST" });
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  return request<AnalyticsOverview>("/api/analytics/overview");
}

export async function getLiveMatchesClient(): Promise<Match[]> {
  const response = await fetch(`${publicApiBaseUrl()}/api/matches/live`, {
    cache: "no-store",
    signal: AbortSignal.timeout(serverRequestTimeoutMs)
  });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  const payload = (await response.json()) as ApiEnvelope<Match[]>;
  return filterDisplayableMatches(payload.data);
}

export async function getWorldCupSimulation(iterations = 10_000): Promise<WorldCupSimulation> {
  return requestDataApi<WorldCupSimulation>(`/simulate/worldcup?iterations=${iterations}`).catch(() =>
    request<WorldCupSimulation>(`/api/simulation/worldcup?iterations=${iterations}`)
  );
}

export async function getBacktest(): Promise<BacktestResult> {
  return requestDataApi<BacktestResult>("/backtest").catch(() => request<BacktestResult>("/api/simulation/backtest"));
}

async function request<T>(path: string): Promise<T> {
  const errors: string[] = [];

  for (const baseUrl of fallbackServerBaseUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(serverRequestTimeoutMs)
      });
      if (!response.ok) {
        errors.push(`${baseUrl} returned ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as ApiEnvelope<T>;
      return payload.data;
    } catch (error) {
      errors.push(`${baseUrl} ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  throw new Error(`API ${path} unavailable: ${errors.join("; ")}`);
}

async function requestDataApi<T>(path: string): Promise<T> {
  const response = await fetch(`${dataApiBaseUrl}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(dataRequestTimeoutMs)
  });
  if (!response.ok) {
    throw new Error(`Data API ${path} returned ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

async function mutationRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${publicApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(serverRequestTimeoutMs)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorEnvelope;
    throw new Error(payload.error?.message ?? `API ${path} returned ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

function toQuery(params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
