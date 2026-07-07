function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listFromEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (!value) return fallback;

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: numberFromEnv("API_PORT", 4000),
  demoMode: process.env.DEMO_MODE === "true",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://football:football@localhost:5432/football_predictions",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://localhost:8000",
  corsOrigin: listFromEnv("CORS_ORIGIN", ["http://localhost:3000", "http://127.0.0.1:3000"]),
  liveRefreshMs: numberFromEnv("LIVE_REFRESH_MS", 10_000),
  fullScoreboardRefreshMs: numberFromEnv("FULL_SCOREBOARD_REFRESH_MS", 5 * 60_000),
  worldCupTournamentStart: process.env.WORLD_CUP_TOURNAMENT_START ?? "20260611",
  worldCupTournamentEnd: process.env.WORLD_CUP_TOURNAMENT_END ?? "20260719",
  espnWorldCupScoreboardUrl:
    process.env.ESPN_WORLD_CUP_SCOREBOARD_URL ??
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
  externalMatchDetailsEnabled: process.env.EXTERNAL_MATCH_DETAILS !== "false",
  externalFriendlyRecordsEnabled: process.env.EXTERNAL_FRIENDLY_RECORDS !== "false",
  matchDetailProviderPriority: listFromEnv("MATCH_DETAIL_PROVIDER_PRIORITY", [
    "espn",
    "api-football",
    "sportmonks"
  ]),
  espnWorldCupSummaryUrl:
    process.env.ESPN_WORLD_CUP_SUMMARY_URL ??
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary",
  espnMatchPageBaseUrl:
    process.env.ESPN_MATCH_PAGE_BASE_URL ??
    "https://www.espn.com/soccer/match/_/gameId",
  espnFriendlyScoreboardUrl:
    process.env.ESPN_FRIENDLY_SCOREBOARD_URL ??
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/scoreboard",
  espnFriendlySummaryUrl:
    process.env.ESPN_FRIENDLY_SUMMARY_URL ??
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/summary",
  apiFootballKey: process.env.API_FOOTBALL_KEY,
  apiFootballBaseUrl: process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io",
  sportmonksApiKey: process.env.SPORTMONKS_API_KEY,
  sportmonksBaseUrl:
    process.env.SPORTMONKS_BASE_URL ?? "https://api.sportmonks.com/v3/football",
  officialMatchesJson: process.env.OFFICIAL_MATCHES_JSON,
  liveScoreBelgiumSenegalUrl:
    process.env.LIVE_SCORE_BELGIUM_SENEGAL_URL ??
    "https://www.livescore.com/en/football/international/world-cup-2026/belgium-vs-senegal/1691875/",
  liveScoreBelgiumSenegalFinalUrl:
    process.env.LIVE_SCORE_BELGIUM_SENEGAL_FINAL_URL ??
    "https://www.thesun.ie/sport/17218888/senegal-belgium-world-cup/"
};
