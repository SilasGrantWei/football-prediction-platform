import type { Match, Prediction } from "../models.js";
import { teamStrength } from "./predictionService.js";

export type ModelQualityGateStatus = "pass" | "fail" | "insufficient_data";
export type ModelResultDirection = "home" | "draw" | "away";

export interface ModelQualityThresholds {
  minSamples: number;
  minResultAccuracy: number;
  minTop3ScoreAccuracy: number;
  maxBrierScore: number;
  maxLogLoss: number;
  maxFavoriteMissRate: number;
  baselineTolerance: number;
}

export interface ModelQualitySample {
  matchId: string;
  title: string;
  kickoffTime: string;
  generatedAt: string;
  actualScore: string;
  predictedScore: string;
  actualResult: ModelResultDirection;
  predictedResult: ModelResultDirection;
  baselineResult: ModelResultDirection;
  probabilityOfActualResult: number;
  brierScore: number;
  logLoss: number;
  resultHit: boolean;
  baselineHit: boolean;
  top1ScoreHit: boolean;
  top3ScoreHit: boolean;
  favoriteDirection: ModelResultDirection | null;
  favoriteMissed: boolean;
}

export interface ModelQualityGate {
  status: ModelQualityGateStatus;
  promotionAllowed: boolean;
  evaluatedFinishedMatches: number;
  sampleCount: number;
  excludedNoCausalSnapshot: number;
  excludedExtraTimeOrPenalty: number;
  leakageBlockedCount: number;
  resultAccuracy: number | null;
  baselineAccuracy: number | null;
  top1ScoreAccuracy: number | null;
  top3ScoreAccuracy: number | null;
  averageBrierScore: number | null;
  averageLogLoss: number | null;
  favoriteMissRate: number | null;
  thresholds: ModelQualityThresholds;
  gateFailures: string[];
  learningActions: string[];
  summary: string;
  samples: ModelQualitySample[];
}

export const DEFAULT_MODEL_QUALITY_THRESHOLDS: ModelQualityThresholds = {
  minSamples: 8,
  minResultAccuracy: 0.45,
  minTop3ScoreAccuracy: 0.28,
  maxBrierScore: 0.72,
  maxLogLoss: 1.18,
  maxFavoriteMissRate: 0.45,
  baselineTolerance: 0.02
};

export function buildModelQualityGate(
  matches: Match[],
  thresholdOverrides: Partial<ModelQualityThresholds> = {}
): ModelQualityGate {
  const thresholds = { ...DEFAULT_MODEL_QUALITY_THRESHOLDS, ...thresholdOverrides };
  const finishedMatches = matches.filter((match) => match.status === "finished");
  const extraTimeOrPenaltyMatches = finishedMatches.filter((match) => match.minute >= 120);
  const finishedNinetyMinuteMatches = finishedMatches.filter((match) => match.minute < 120);
  const samples: ModelQualitySample[] = [];
  let leakageBlockedCount = 0;
  let excludedNoCausalSnapshot = 0;

  for (const match of finishedNinetyMinuteMatches) {
    const prediction = match.prediction;
    if (!prediction?.topScores[0]) {
      excludedNoCausalSnapshot += 1;
      continue;
    }

    if (!isCausalPredictionSnapshot(match, prediction)) {
      leakageBlockedCount += 1;
      excludedNoCausalSnapshot += 1;
      continue;
    }

    samples.push(toQualitySample(match, prediction));
  }

  const sampleCount = samples.length;
  const metrics = sampleCount ? buildMetrics(samples) : emptyMetrics();
  const gateFailures = buildGateFailures(sampleCount, metrics, thresholds);
  const status = sampleCount < thresholds.minSamples ? "insufficient_data" : gateFailures.length ? "fail" : "pass";
  const learningActions = buildLearningActions({
    status,
    metrics,
    thresholds,
    sampleCount,
    excludedNoCausalSnapshot,
    leakageBlockedCount,
    excludedExtraTimeOrPenalty: extraTimeOrPenaltyMatches.length
  });

  return {
    status,
    promotionAllowed: status === "pass",
    evaluatedFinishedMatches: finishedNinetyMinuteMatches.length,
    sampleCount,
    excludedNoCausalSnapshot,
    excludedExtraTimeOrPenalty: extraTimeOrPenaltyMatches.length,
    leakageBlockedCount,
    resultAccuracy: metrics.resultAccuracy,
    baselineAccuracy: metrics.baselineAccuracy,
    top1ScoreAccuracy: metrics.top1ScoreAccuracy,
    top3ScoreAccuracy: metrics.top3ScoreAccuracy,
    averageBrierScore: metrics.averageBrierScore,
    averageLogLoss: metrics.averageLogLoss,
    favoriteMissRate: metrics.favoriteMissRate,
    thresholds,
    gateFailures,
    learningActions,
    summary: buildSummary(status, sampleCount, metrics, gateFailures),
    samples
  };
}

function toQualitySample(match: Match, prediction: Prediction): ModelQualitySample {
  const predictedScore = prediction.topScores[0]?.score ?? "0-0";
  const [predictedHome, predictedAway] = parseScore(predictedScore);
  const actualScore = `${match.homeScore}-${match.awayScore}`;
  const actualResult = resultOf(match.homeScore, match.awayScore);
  const predictedResult = resultOf(predictedHome, predictedAway);
  const baselineResult = baselineResultOf(match);
  const probabilityOfActualResult = probabilityForResult(prediction, actualResult);
  const favoriteDirection = favoriteFromPrediction(prediction);

  return {
    matchId: match.id,
    title: `${match.homeTeam.name} 对 ${match.awayTeam.name}`,
    kickoffTime: match.startTime,
    generatedAt: prediction.generatedAt,
    actualScore,
    predictedScore,
    actualResult,
    predictedResult,
    baselineResult,
    probabilityOfActualResult,
    brierScore: round6(brierScore(prediction, actualResult)),
    logLoss: round6(-Math.log(Math.max(probabilityOfActualResult, 0.001))),
    resultHit: actualResult === predictedResult,
    baselineHit: actualResult === baselineResult,
    top1ScoreHit: actualScore === predictedScore,
    top3ScoreHit: prediction.topScores.slice(0, 3).some((score) => score.score === actualScore),
    favoriteDirection,
    favoriteMissed: Boolean(favoriteDirection && favoriteDirection !== actualResult)
  };
}

function buildMetrics(samples: ModelQualitySample[]) {
  const favoriteSamples = samples.filter((sample) => sample.favoriteDirection);

  return {
    resultAccuracy: round4(average(samples.map((sample) => (sample.resultHit ? 1 : 0)))),
    baselineAccuracy: round4(average(samples.map((sample) => (sample.baselineHit ? 1 : 0)))),
    top1ScoreAccuracy: round4(average(samples.map((sample) => (sample.top1ScoreHit ? 1 : 0)))),
    top3ScoreAccuracy: round4(average(samples.map((sample) => (sample.top3ScoreHit ? 1 : 0)))),
    averageBrierScore: round6(average(samples.map((sample) => sample.brierScore))),
    averageLogLoss: round6(average(samples.map((sample) => sample.logLoss))),
    favoriteMissRate: favoriteSamples.length
      ? round4(average(favoriteSamples.map((sample) => (sample.favoriteMissed ? 1 : 0))))
      : null
  };
}

function emptyMetrics() {
  return {
    resultAccuracy: null,
    baselineAccuracy: null,
    top1ScoreAccuracy: null,
    top3ScoreAccuracy: null,
    averageBrierScore: null,
    averageLogLoss: null,
    favoriteMissRate: null
  };
}

function buildGateFailures(
  sampleCount: number,
  metrics: ReturnType<typeof buildMetrics> | ReturnType<typeof emptyMetrics>,
  thresholds: ModelQualityThresholds
): string[] {
  const failures: string[] = [];

  if (sampleCount < thresholds.minSamples) {
    failures.push(`赛前快照样本不足：当前 ${sampleCount} 场，至少需要 ${thresholds.minSamples} 场才允许推广新权重。`);
    return failures;
  }

  if (metrics.resultAccuracy !== null && metrics.resultAccuracy < thresholds.minResultAccuracy) {
    failures.push(
      `胜平负方向命中率 ${formatPercent(metrics.resultAccuracy)} 低于门槛 ${formatPercent(thresholds.minResultAccuracy)}。`
    );
  }

  if (metrics.top3ScoreAccuracy !== null && metrics.top3ScoreAccuracy < thresholds.minTop3ScoreAccuracy) {
    failures.push(
      `比分前三候选命中率 ${formatPercent(metrics.top3ScoreAccuracy)} 低于门槛 ${formatPercent(thresholds.minTop3ScoreAccuracy)}。`
    );
  }

  if (metrics.averageBrierScore !== null && metrics.averageBrierScore > thresholds.maxBrierScore) {
    failures.push(`布赖尔分数 ${metrics.averageBrierScore.toFixed(4)} 高于上限 ${thresholds.maxBrierScore.toFixed(4)}。`);
  }

  if (metrics.averageLogLoss !== null && metrics.averageLogLoss > thresholds.maxLogLoss) {
    failures.push(`对数损失 ${metrics.averageLogLoss.toFixed(4)} 高于上限 ${thresholds.maxLogLoss.toFixed(4)}。`);
  }

  if (metrics.favoriteMissRate !== null && metrics.favoriteMissRate > thresholds.maxFavoriteMissRate) {
    failures.push(
      `热门方向失误率 ${formatPercent(metrics.favoriteMissRate)} 高于上限 ${formatPercent(thresholds.maxFavoriteMissRate)}。`
    );
  }

  if (
    metrics.resultAccuracy !== null &&
    metrics.baselineAccuracy !== null &&
    metrics.resultAccuracy + thresholds.baselineTolerance < metrics.baselineAccuracy
  ) {
    failures.push(
      `模型胜平负命中率 ${formatPercent(metrics.resultAccuracy)} 低于基础强弱基线 ${formatPercent(metrics.baselineAccuracy)}。`
    );
  }

  return failures;
}

function buildLearningActions({
  status,
  metrics,
  thresholds,
  sampleCount,
  excludedNoCausalSnapshot,
  leakageBlockedCount,
  excludedExtraTimeOrPenalty
}: {
  status: ModelQualityGateStatus;
  metrics: ReturnType<typeof buildMetrics> | ReturnType<typeof emptyMetrics>;
  thresholds: ModelQualityThresholds;
  sampleCount: number;
  excludedNoCausalSnapshot: number;
  leakageBlockedCount: number;
  excludedExtraTimeOrPenalty: number;
}): string[] {
  const actions: string[] = [];

  if (status !== "pass") {
    actions.push("不能推广当前候选权重；只记录误差原因，下一场推算仍使用已通过门槛的稳定版本。");
  } else {
    actions.push("当前候选权重通过赛前快照回测门槛，可以进入灰度验证，但仍不能回填修改已结束比赛推算。");
  }

  if (sampleCount < thresholds.minSamples) {
    actions.push("优先补齐每场开赛前的 prediction snapshot；没有冻结快照的比赛不能作为模型胜率依据。");
  }

  if (excludedNoCausalSnapshot > 0) {
    actions.push(`已排除 ${excludedNoCausalSnapshot} 场没有赛前因果快照的已结束比赛，避免赛后比分污染评估。`);
  }

  if (leakageBlockedCount > 0) {
    actions.push(`已拦截 ${leakageBlockedCount} 场开赛后生成的推算，禁止把赛后数据当作赛前推算。`);
  }

  if (excludedExtraTimeOrPenalty > 0) {
    actions.push(`已排除 ${excludedExtraTimeOrPenalty} 场加时或点球样本；网站只评估90分钟含伤停补时结果。`);
  }

  if (metrics.resultAccuracy !== null && metrics.baselineAccuracy !== null && metrics.resultAccuracy < metrics.baselineAccuracy) {
    actions.push("方向命中落后基础强弱基线时，先降低阵容估算、纸面控球和热门大胜权重，回到等级分、国际足联评分和赛前状态基线。");
  }

  if (metrics.favoriteMissRate !== null && metrics.favoriteMissRate > 0.35) {
    actions.push("热门失误偏高，后续样本应提高平局/小负/弱队不败候选概率，不直接加大强队比分。");
  }

  if (metrics.averageLogLoss !== null && metrics.averageLogLoss > thresholds.maxLogLoss) {
    actions.push("对数损失偏高说明概率过度自信；下一轮需要做温度缩放或等距校准，先把极端胜率压回可解释区间。");
  }

  if (metrics.top3ScoreAccuracy !== null && metrics.top3ScoreAccuracy < thresholds.minTop3ScoreAccuracy) {
    actions.push("比分前三候选覆盖不足时，优先校准泊松修正比分矩阵，而不是只调胜平负方向。");
  }

  return actions;
}

function buildSummary(
  status: ModelQualityGateStatus,
  sampleCount: number,
  metrics: ReturnType<typeof buildMetrics> | ReturnType<typeof emptyMetrics>,
  gateFailures: string[]
): string {
  if (status === "insufficient_data") {
    return `当前只有 ${sampleCount} 场可用赛前快照，样本不足，不能声明模型胜率已经提高。`;
  }

  if (status === "fail") {
    return `模型质量门槛未通过：${gateFailures[0] ?? "核心指标未达标"} 赛后复盘只会影响未来比赛，不会改写已结束推算。`;
  }

  return `模型质量门槛通过：胜平负命中率 ${formatPercent(metrics.resultAccuracy ?? 0)}，前三候选比分命中率 ${formatPercent(
    metrics.top3ScoreAccuracy ?? 0
  )}。仍只允许用于未来比赛灰度。`;
}

function isCausalPredictionSnapshot(match: Match, prediction: Prediction): boolean {
  const generatedAt = new Date(prediction.generatedAt).getTime();
  const kickoffAt = new Date(match.startTime).getTime();
  return Number.isFinite(generatedAt) && Number.isFinite(kickoffAt) && generatedAt <= kickoffAt;
}

function favoriteFromPrediction(prediction: Prediction): ModelResultDirection | null {
  const values: Array<[ModelResultDirection, number]> = [
    ["home", prediction.homeWinProb],
    ["draw", prediction.drawProb],
    ["away", prediction.awayWinProb]
  ];
  const sorted = values.sort((a, b) => b[1] - a[1]);
  const [favoriteDirection, favoriteProbability] = sorted[0];
  const secondProbability = sorted[1][1];
  if (favoriteProbability < 0.42 || favoriteProbability - secondProbability < 0.06) return null;
  return favoriteDirection;
}

function baselineResultOf(match: Match): ModelResultDirection {
  const gap = teamStrength(match.homeTeam) - teamStrength(match.awayTeam);
  if (Math.abs(gap) < 2.5) return "draw";
  return gap > 0 ? "home" : "away";
}

function probabilityForResult(prediction: Prediction, result: ModelResultDirection): number {
  if (result === "home") return prediction.homeWinProb;
  if (result === "away") return prediction.awayWinProb;
  return prediction.drawProb;
}

function brierScore(prediction: Prediction, actualResult: ModelResultDirection): number {
  return (
    square(prediction.homeWinProb - (actualResult === "home" ? 1 : 0)) +
    square(prediction.drawProb - (actualResult === "draw" ? 1 : 0)) +
    square(prediction.awayWinProb - (actualResult === "away" ? 1 : 0))
  );
}

function resultOf(homeGoals: number, awayGoals: number): ModelResultDirection {
  if (homeGoals > awayGoals) return "home";
  if (homeGoals < awayGoals) return "away";
  return "draw";
}

function parseScore(score: string): [number, number] {
  const [home, away] = score.split("-").map((value) => Number.parseInt(value, 10));
  return [Number.isFinite(home) ? home : 0, Number.isFinite(away) ? away : 0];
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function square(value: number): number {
  return value * value;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
