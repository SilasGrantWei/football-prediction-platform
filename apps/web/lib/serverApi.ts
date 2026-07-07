import type { Match, MatchEvent, MatchLineupValidation, TeamRecordComparison, TrendPoint } from "./types";

interface ApiEnvelope<T> {
  data: T;
}

const SERVER_REQUEST_TIMEOUT_MS = Number(process.env.API_REQUEST_TIMEOUT_MS ?? 8_000);

export async function getMatch(id: string): Promise<Match> {
  return requestServerApi<Match>(`/api/matches/${id}`);
}

export async function getMatchEvents(id: string): Promise<MatchEvent[]> {
  return requestServerApi<MatchEvent[]>(`/api/matches/${id}/events`);
}

export async function getMatchTrend(id: string): Promise<TrendPoint[]> {
  return requestServerApi<TrendPoint[]>(`/api/matches/${id}/trend`);
}

export async function getMatchTeamRecords(id: string): Promise<TeamRecordComparison> {
  return requestServerApi<TeamRecordComparison>(`/api/matches/${id}/team-records`);
}

export async function getMatchLineupValidation(id: string): Promise<MatchLineupValidation> {
  return requestServerApi<MatchLineupValidation>(`/api/matches/${id}/lineup-validation`);
}

async function requestServerApi<T>(path: string): Promise<T> {
  const errors: string[] = [];

  for (const baseUrl of serverApiBaseUrls()) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(SERVER_REQUEST_TIMEOUT_MS)
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

  throw new Error(`Server API ${path} unavailable: ${errors.join("; ")}`);
}

function serverApiBaseUrls(): string[] {
  return Array.from(
    new Set(
      [process.env.API_BASE_URL, process.env.NEXT_PUBLIC_API_BASE_URL, "http://127.0.0.1:4000", "http://localhost:4000"].filter(
        (value): value is string => Boolean(value)
      )
    )
  );
}
