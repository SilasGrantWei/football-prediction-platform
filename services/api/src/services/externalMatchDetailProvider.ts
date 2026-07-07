import { config } from "../config.js";
import type { LineupValidationProviderAttempt, Match, MatchEvent } from "../models.js";
import { fetchApiFootballMatchDetail } from "./apiFootballMatchDetailProvider.js";
import {
  fetchEspnMatchDetail,
  type ExternalDetailFixture,
  type ExternalMatchDetail
} from "./espnMatchDetailProvider.js";
import { fetchSportmonksMatchDetail } from "./sportmonksMatchDetailProvider.js";

type MatchDetailProvider = "espn" | "api-football" | "sportmonks";

export interface ExternalMatchDetailDiagnostics {
  detail: ExternalMatchDetail | null;
  attempts: LineupValidationProviderAttempt[];
}

export interface ExternalMatchDetailDiagnosticsOptions {
  requireCredibleLineup?: boolean;
}

export async function fetchExternalMatchDetail(
  fixture: ExternalDetailFixture
): Promise<ExternalMatchDetail | null> {
  const diagnostics = await fetchExternalMatchDetailWithDiagnostics(fixture, {
    requireCredibleLineup: false
  });
  return diagnostics.detail;
}

export function buildExternalFixtureFromMatch(match: Match): ExternalDetailFixture {
  return {
    id: match.id,
    startTime: match.startTime,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    externalLeague: "fifa.world"
  };
}

export function mergeExternalMatchEvents(storedEvents: MatchEvent[], externalEvents: MatchEvent[]): MatchEvent[] {
  const byKey = new Map<string, MatchEvent>();
  for (const event of [...storedEvents, ...externalEvents]) {
    byKey.set(`${event.minute}:${event.type}:${event.team}:${event.player}`, event);
  }
  return Array.from(byKey.values()).sort((a, b) => a.minute - b.minute || a.id - b.id);
}

export async function fetchExternalMatchDetailWithDiagnostics(
  fixture: ExternalDetailFixture,
  options: ExternalMatchDetailDiagnosticsOptions = {}
): Promise<ExternalMatchDetailDiagnostics> {
  const verifiedAt = new Date().toISOString();
  const attempts: LineupValidationProviderAttempt[] = [];
  const requireCredibleLineup = options.requireCredibleLineup ?? false;

  if (!config.externalMatchDetailsEnabled) {
    attempts.push({
      provider: "disabled",
      label: "真实比赛详情同步",
      status: "skipped",
      reason: "真实比赛详情同步已关闭。",
      verifiedAt
    });
    return { detail: null, attempts };
  }

  for (const provider of config.matchDetailProviderPriority) {
    const normalizedProvider = provider.toLowerCase() as MatchDetailProvider;
    const skippedReason = providerSkipReason(normalizedProvider);
    if (skippedReason) {
      attempts.push({
        provider: normalizedProvider,
        label: providerLabel(normalizedProvider),
        status: "skipped",
        reason: skippedReason,
        verifiedAt
      });
      continue;
    }

    try {
      const detail = await fetchFromProvider(normalizedProvider, fixture);
      if (detail) {
        const lineupQuality = describeLineupQuality(detail);
        attempts.push({
          provider: normalizedProvider,
          label: providerLabel(normalizedProvider),
          status: lineupQuality.credible ? "success" : "no_data",
          reason: lineupQuality.reason,
          sourceUrl: detail.sourceUrl,
          verifiedAt: detail.verifiedAt
        });
        if (requireCredibleLineup && !lineupQuality.credible) {
          continue;
        }
        return { detail, attempts };
      }

      attempts.push({
        provider: normalizedProvider,
        label: providerLabel(normalizedProvider),
        status: "no_data",
        reason: providerNoDataReason(normalizedProvider),
        verifiedAt
      });
    } catch (error) {
      attempts.push({
        provider: normalizedProvider,
        label: providerLabel(normalizedProvider),
        status: "error",
        reason: `请求失败：${error instanceof Error ? error.message : "未知错误"}`,
        verifiedAt
      });
    }
  }

  return { detail: null, attempts };
}

export function describeExternalMatchDetailSources(): string {
  if (!config.externalMatchDetailsEnabled) return "真实比赛详情同步已关闭。";

  return config.matchDetailProviderPriority
    .map((provider) => {
      const normalizedProvider = provider.toLowerCase() as MatchDetailProvider;
      if (normalizedProvider === "espn") return "公开赛事数据源已启用";
      if (normalizedProvider === "api-football") {
        return config.apiFootballKey ? "接口足球数据源已配置" : "接口足球数据源未配置密钥";
      }
      if (normalizedProvider === "sportmonks") {
        return config.sportmonksApiKey ? "体育数据源已配置" : "体育数据源未配置密钥";
      }

      return `${provider} 不是已支持的数据源`;
    })
    .join("；");
}

async function fetchFromProvider(
  provider: MatchDetailProvider,
  fixture: ExternalDetailFixture
): Promise<ExternalMatchDetail | null> {
  if (provider === "espn") return fetchEspnMatchDetail(fixture);

  if (provider === "api-football" && config.apiFootballKey) {
    return fetchApiFootballMatchDetail(fixture);
  }

  if (provider === "sportmonks" && config.sportmonksApiKey) {
    return fetchSportmonksMatchDetail(fixture);
  }

  return null;
}

function providerLabel(provider: MatchDetailProvider): string {
  if (provider === "espn") return "公开赛事数据源";
  if (provider === "api-football") return "接口足球数据源";
  return "体育数据源";
}

function providerSkipReason(provider: MatchDetailProvider): string | null {
  if (provider === "api-football" && !config.apiFootballKey) return "未配置接口足球数据源密钥，无法调用真实首发接口。";
  if (provider === "sportmonks" && !config.sportmonksApiKey) return "未配置体育数据源密钥，无法调用真实首发接口。";
  return null;
}

function providerNoDataReason(provider: MatchDetailProvider): string {
  if (provider === "espn") return "公开赛事数据源没有匹配到本场比赛，或没有返回可验证的真实首发名单。";
  if (provider === "api-football") return "接口足球数据源已配置，但没有匹配到本场比赛，或没有返回阵容详情。";
  return "体育数据源已配置，但没有匹配到本场比赛，或没有返回阵容详情。";
}

export function describeLineupQuality(detail: ExternalMatchDetail): { credible: boolean; reason: string } {
  if (!detail.lineups) {
    return {
      credible: false,
      reason: "已匹配到比赛详情，但该数据源没有返回首发阵容字段。"
    };
  }

  const homeUsable = countUsablePlayers(detail.lineups.home.starters);
  const awayUsable = countUsablePlayers(detail.lineups.away.starters);
  if (homeUsable >= 11 && awayUsable >= 11) {
    return {
      credible: true,
      reason: "已返回双方真实首发/替补名单，可用于逐人验证。"
    };
  }

  if (homeUsable >= 11 || awayUsable >= 11) {
    return {
      credible: true,
      reason: `已返回部分真实首发名单：主队 ${homeUsable} 人，客队 ${awayUsable} 人，可用于单队验证。`
    };
  }

  if (homeUsable >= 5 && awayUsable >= 5) {
    return {
      credible: true,
      reason: `已返回部分真实首发姓名：主队可用 ${homeUsable} 人，客队可用 ${awayUsable} 人；系统会按已返回姓名验证，空位不会算命中也不会算失败。`
    };
  }

  return {
    credible: false,
    reason: `已匹配到比赛详情，但首发姓名为空或为占位数据：主队可用姓名 ${homeUsable} 人，客队可用姓名 ${awayUsable} 人，不能作为验证真值。`
  };
}

function countUsablePlayers(players: NonNullable<ExternalMatchDetail["lineups"]>["home"]["starters"]): number {
  return players.filter((player) => hasUsablePlayerName(player.name)).length;
}

function hasUsablePlayerName(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "-" || normalized === "n/a") return false;
  return ![
    "未知球员",
    "待补中文球员",
    "未接入中文名",
    "未知球员",
    "待补中文球员",
    "未接入中文名",
    "数据源未返回姓名",
    "数据源重复姓名",
    "占位",
    "unknown",
    "unknown player",
    "placeholder",
    "tbd",
    "待定球员"
  ].some((placeholder) => normalized.includes(placeholder));
}
