import { Router } from "express";

import type { GameStyle, Match, MatchStatus, UpsetRisk } from "../models.js";
import { matchRepository } from "../repositories/matchRepository.js";
import { buildFailureClusterAnalysis } from "../services/failureClusterAnalysis.js";
import { buildModelQualityGate, type ModelQualityGate } from "../services/modelQualityService.js";
import { PREDICTION_MODEL_INFO, predictionService, teamStrength } from "../services/predictionService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const analyticsRouter = Router();

analyticsRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const matches = await predictionService.enrichMatches(await matchRepository.findMatches());
    const statusCounts = countBy(matches, (match) => match.status, ["scheduled", "live", "halftime", "finished"]);
    const styleCounts = countBy(
      matches,
      (match) => match.prediction?.gameStyle ?? "balanced",
      ["defensive", "balanced", "open"]
    );
    const upsetCounts = countBy(matches, (match) => match.prediction?.upsetRisk ?? "low", ["low", "medium", "high"]);
    const competitionCounts = countBy(matches, (match) => match.competition, unique(matches.map((match) => match.competition)));

    const probabilityAverages = matches.reduce(
      (sum, match) => {
        sum.homeWin += match.prediction?.homeWinProb ?? 0;
        sum.draw += match.prediction?.drawProb ?? 0;
        sum.awayWin += match.prediction?.awayWinProb ?? 0;
        return sum;
      },
      { homeWin: 0, draw: 0, awayWin: 0 }
    );

    const divisor = Math.max(matches.length, 1);
    const qualityGate = buildModelQualityGate(matches);
    const evaluationSummary = buildEvaluationSummary(matches, qualityGate);
    const topUpsets = [...matches]
      .sort((a, b) => riskWeight(b.prediction?.upsetRisk) - riskWeight(a.prediction?.upsetRisk))
      .slice(0, 5)
      .map((match) => ({
        id: match.id,
        title: `${match.homeTeam.name} 对 ${match.awayTeam.name}`,
        competition: match.competition,
        upsetRisk: match.prediction?.upsetRisk ?? "low",
        strongerTeam: strongerTeamName(match)
      }));

    res.json({
      data: {
        totalMatches: matches.length,
        statusCounts,
        styleCounts,
        upsetCounts,
        competitionCounts,
        probabilityAverages: {
          homeWin: round4(probabilityAverages.homeWin / divisor),
          draw: round4(probabilityAverages.draw / divisor),
          awayWin: round4(probabilityAverages.awayWin / divisor)
        },
        evaluationSummary,
        qualityGate: toPublicQualityGate(qualityGate),
        modelInfo: PREDICTION_MODEL_INFO,
        failureReview: buildFailureReview(matches, new Set(qualityGate.samples.map((sample) => sample.matchId))),
        topUpsets
      }
    });
  })
);

function countBy<T, K extends string>(items: T[], getKey: (item: T) => K, keys: readonly K[]) {
  const counts = new Map<K, number>(keys.map((key) => [key, 0]));
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts, ([name, value]) => ({ name, value }));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function riskWeight(risk?: UpsetRisk): number {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  return 1;
}

function strongerTeamName(match: Match): string {
  const homeStrength = teamStrength(match.homeTeam);
  const awayStrength = teamStrength(match.awayTeam);
  return homeStrength >= awayStrength ? match.homeTeam.name : match.awayTeam.name;
}

function buildEvaluationSummary(matches: Match[], qualityGate: ModelQualityGate) {
  const finishedMatches = matches.filter((match) => match.status === "finished" && match.prediction?.evaluation);
  const finishedCount = qualityGate.sampleCount;
  const divisor = Math.max(finishedCount, 1);
  const top1Hits = qualityGate.samples.filter((sample) => sample.top1ScoreHit).length;
  const top3Hits = qualityGate.samples.filter((sample) => sample.top3ScoreHit).length;
  const resultHits = qualityGate.samples.filter((sample) => sample.resultHit).length;
  const failures = qualityGate.samples.filter((sample) => !sample.top3ScoreHit).length;

  return {
    finishedCount,
    top1Hits,
    top3Hits,
    resultHits,
    failures,
    top1HitRate: round4(top1Hits / divisor),
    top3HitRate: round4(top3Hits / divisor),
    resultHitRate: round4(resultHits / divisor),
    excludedWithoutCausalSnapshot: qualityGate.excludedNoCausalSnapshot,
    leakageBlockedCount: qualityGate.leakageBlockedCount,
    extraTimeExcluded: qualityGate.excludedExtraTimeOrPenalty,
    rawFinishedWithEvaluation: finishedMatches.length
  };
}

function buildFailureReview(matches: Match[], causalSampleIds: Set<string>) {
  const failedMatches = matches.filter(
    (match) => causalSampleIds.has(match.id) && match.prediction?.evaluation?.status === "failed"
  );
  const directionFailures = failedMatches.filter((match) => !match.prediction?.evaluation?.resultHit).length;
  const scoreOnlyFailures = failedMatches.length - directionFailures;
  const reasonCounts = countStrings(
    failedMatches.flatMap((match) => match.prediction?.evaluation?.failureReasons ?? [])
  );
  const actionCounts = countStrings(
    failedMatches.flatMap((match) => match.prediction?.evaluation?.learningActions ?? [])
  );
  const failureCluster = buildFailureClusterAnalysis(matches, causalSampleIds);

  return {
    summary: buildFailureReviewSummary(failedMatches.length, directionFailures, scoreOnlyFailures),
    directionFailures,
    scoreOnlyFailures,
    topReasons: reasonCounts.slice(0, 6).map(([reason, count]) => ({ reason, count })),
    recommendedActions: actionCounts.slice(0, 6).map(([action]) => action),
    failureCluster,
    failedMatches: failedMatches.slice(0, 8).map((match) => {
      const evaluation = match.prediction?.evaluation;
      return {
        id: match.id,
        title: `${match.homeTeam.name} 对 ${match.awayTeam.name}`,
        competition: match.competition,
        actualScore: evaluation?.actualScore ?? `${match.homeScore}-${match.awayScore}`,
        predictedScore: evaluation?.predictedScore ?? match.prediction?.topScores[0]?.score ?? "-",
        resultHit: Boolean(evaluation?.resultHit),
        primaryReason: evaluation?.failureReasons[0] ?? "比分偏差超过前三候选覆盖范围。"
      };
    })
  };
}

function buildFailureReviewSummary(failedCount: number, directionFailures: number, scoreOnlyFailures: number): string {
  if (failedCount === 0) {
    return "当前没有可复盘的赛前推算失败样本；后续只会用90分钟真实结果做赛后校准，不把加时赛和点球大战写入胜平负命中率。";
  }

  return `已复盘 ${failedCount} 场赛前推算失败：${directionFailures} 场胜平负方向错误，${scoreOnlyFailures} 场方向命中但比分偏差。现在按比赛事件链解释失败原因：先看进球时间、被封堵射门、越位、角球、犯规、黄红牌和换人窗口，再判断是进攻转化被高估、弱队抗压被低估、比分状态改变节奏，还是数据源缺少首发/技术统计导致不确定。`;
}

function toPublicQualityGate(qualityGate: ModelQualityGate): ModelQualityGate {
  return {
    ...qualityGate,
    samples: qualityGate.samples.slice(0, 12)
  };
}

function countStrings(items: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
