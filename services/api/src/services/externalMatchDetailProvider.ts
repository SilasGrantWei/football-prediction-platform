import { config } from "../config.js";
import type { LineupValidationProviderAttempt } from "../models.js";
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

export async function fetchExternalMatchDetail(
  fixture: ExternalDetailFixture
): Promise<ExternalMatchDetail | null> {
  const diagnostics = await fetchExternalMatchDetailWithDiagnostics(fixture);
  return diagnostics.detail;
}

export async function fetchExternalMatchDetailWithDiagnostics(
  fixture: ExternalDetailFixture
): Promise<ExternalMatchDetailDiagnostics> {
  const verifiedAt = new Date().toISOString();
  const attempts: LineupValidationProviderAttempt[] = [];

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
        attempts.push({
          provider: normalizedProvider,
          label: providerLabel(normalizedProvider),
          status: "success",
          reason: hasLineups(detail)
            ? "已返回真实首发/替补名单，可用于逐人验证。"
            : "已匹配到比赛详情，但该数据源没有返回可验证的真实首发名单。",
          sourceUrl: detail.sourceUrl,
          verifiedAt: detail.verifiedAt
        });
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

function hasLineups(detail: ExternalMatchDetail): boolean {
  return Boolean(detail.lineups && (detail.lineups.home.starters.length >= 11 || detail.lineups.away.starters.length >= 11));
}
