import type { Match, PostMatchCalibration, Prediction } from "../models.js";
import { matchRepository } from "../repositories/matchRepository.js";
import { buildPredictionEvaluation } from "./predictionEvaluation.js";

type Direction = "home" | "draw" | "away";
type CalibrationPredictionFactory = (match: Match) => Prediction | undefined;

interface CalibrationSample {
  match: Match;
  prediction: Prediction;
  actualDirection: Direction;
  predictedTopDirection: Direction;
  favoriteDirection: "home" | "away" | null;
  favoriteProbability: number;
  top3Missed: boolean;
  directionMissed: boolean;
  favoriteMissed: boolean;
  favoriteWonToNil: boolean;
  favoriteConcededMultiple: boolean;
  favoriteDrawMissed: boolean;
  favoriteMarginOverestimate: number;
  drawProtectedFavoriteWin: boolean;
  favoriteMarginUnderestimate: number;
  drawTrapBreakthrough: boolean;
  drawTrapMarginUnderestimate: number;
  favoriteCleanSheetBust: boolean;
  highTotalMissed: boolean;
  lowTotalMissed: boolean;
  zeroZeroMissed: boolean;
  totalGoalOverestimate: number;
  winnerGoalUnderestimate: number;
  loserGoalOverestimate: number;
  loserGoalUnderestimate: number;
  drawOverweighted: boolean;
  drawUnderweighted: boolean;
}

const CALIBRATION_VERSION = "post-match-causal-calibration-v9";
const MAX_SAMPLE_COUNT = 12;
const MIN_SAMPLE_COUNT = 1;
const RECENCY_DECAY = 0.82;

export async function buildPostMatchCalibration(
  targetMatch: Match,
  fallbackPredictionFactory?: CalibrationPredictionFactory
): Promise<PostMatchCalibration | undefined> {
  const targetKickoff = new Date(targetMatch.startTime).getTime();
  if (!Number.isFinite(targetKickoff)) return undefined;

  const matches = await matchRepository.findMatches({ status: "finished" });
  const samples = matches
    .filter((match) => match.id !== targetMatch.id)
    .filter((match) => match.minute < 120)
    .filter((match) => new Date(match.startTime).getTime() < targetKickoff)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .map((match) => ({
      match,
      prediction: predictionForCalibration(match, fallbackPredictionFactory)
    }))
    .filter((item): item is { match: Match; prediction: Prediction } => Boolean(item.prediction))
    .map(({ match, prediction }) => toCalibrationSample(match, prediction))
    .filter((sample): sample is CalibrationSample => Boolean(sample))
    .slice(0, MAX_SAMPLE_COUNT);

  if (samples.length < MIN_SAMPLE_COUNT) return undefined;

  const scoreMissRate = average(samples.map((sample) => (sample.top3Missed ? 1 : 0)));
  const directionMissRate = average(samples.map((sample) => (sample.directionMissed ? 1 : 0)));
  const favoriteCleanSheetRate = average(samples.map((sample) => (sample.favoriteWonToNil && sample.top3Missed ? 1 : 0)));
  const winnerGoalUnderestimate = average(samples.map((sample) => sample.winnerGoalUnderestimate));
  const loserGoalOverestimate = average(samples.map((sample) => sample.loserGoalOverestimate));
  const loserGoalUnderestimate = average(samples.map((sample) => sample.loserGoalUnderestimate));
  const highTotalMissRate = average(samples.map((sample) => (sample.highTotalMissed ? 1 : 0)));
  const drawOverweightRate = average(samples.map((sample) => (sample.drawOverweighted ? 1 : 0)));
  const drawUnderweightRate = average(samples.map((sample) => (sample.drawUnderweighted ? 1 : 0)));
  const favoriteSamples = samples.filter((sample) => sample.favoriteDirection);
  const favoriteMissRate = average(favoriteSamples.map((sample) => (sample.favoriteMissed ? 1 : 0)));
  const favoriteConcededMultipleRate = average(favoriteSamples.map((sample) => (sample.favoriteConcededMultiple ? 1 : 0)));
  const favoriteDrawMissRate = recencyWeightedAverage(
    favoriteSamples.map((sample) => (sample.favoriteDrawMissed ? 1 : 0))
  );
  const favoriteMarginOverestimate = average(favoriteSamples.map((sample) => sample.favoriteMarginOverestimate));
  const drawProtectedFavoriteWinRate = average(favoriteSamples.map((sample) => (sample.drawProtectedFavoriteWin ? 1 : 0)));
  const favoriteMarginUnderestimate = average(favoriteSamples.map((sample) => sample.favoriteMarginUnderestimate));
  const drawTrapBreakthroughRate = average(samples.map((sample) => (sample.drawTrapBreakthrough ? 1 : 0)));
  const drawTrapMarginUnderestimate = average(samples.map((sample) => sample.drawTrapMarginUnderestimate));
  const favoriteCleanSheetBustRate = average(favoriteSamples.map((sample) => (sample.favoriteCleanSheetBust ? 1 : 0)));
  const lowTotalMissRate = average(samples.map((sample) => (sample.lowTotalMissed ? 1 : 0)));
  const zeroZeroMissRate = average(samples.map((sample) => (sample.zeroZeroMissed ? 1 : 0)));
  const totalGoalOverestimate = average(samples.map((sample) => sample.totalGoalOverestimate));
  const overconfidentFavoriteMissRate = average(
    favoriteSamples
      .filter((sample) => sample.favoriteProbability >= 0.54)
      .map((sample) => (sample.favoriteMissed ? 1 : 0))
  );

  const favoriteOverconfidencePenalty = clamp(
    favoriteMissRate * 0.14 +
      overconfidentFavoriteMissRate * 0.08 +
      directionMissRate * 0.05 +
      favoriteConcededMultipleRate * 0.06 +
      favoriteDrawMissRate * 0.11 +
      favoriteMarginOverestimate * 0.035 +
      favoriteCleanSheetBustRate * 0.05 +
      highTotalMissRate * 0.03 -
      drawProtectedFavoriteWinRate * 0.10 -
      drawTrapBreakthroughRate * 0.06 -
      favoriteMarginUnderestimate * 0.025 -
      drawTrapMarginUnderestimate * 0.015 -
      favoriteCleanSheetRate * 0.03,
    0,
    0.30
  );
  const underdogResilienceBoost = clamp(
    favoriteMissRate * 0.10 +
      directionMissRate * 0.04 +
      scoreMissRate * 0.02 +
      loserGoalUnderestimate * 0.06 +
      favoriteConcededMultipleRate * 0.08 +
      favoriteCleanSheetBustRate * 0.09 +
      favoriteDrawMissRate * 0.09 +
      favoriteMarginOverestimate * 0.03 -
      drawProtectedFavoriteWinRate * 0.06 -
      drawTrapBreakthroughRate * 0.04 -
      favoriteMarginUnderestimate * 0.02,
    0,
    0.28
  );
  const drawProtectionBoost = clamp(
    drawUnderweightRate * 0.12 +
      favoriteMissRate * 0.04 +
      favoriteConcededMultipleRate * 0.02 +
      favoriteDrawMissRate * 0.16 +
      favoriteMarginOverestimate * 0.025 -
      drawProtectedFavoriteWinRate * 0.14 -
      drawTrapBreakthroughRate * 0.12 -
      favoriteMarginUnderestimate * 0.035 -
      drawTrapMarginUnderestimate * 0.025 -
      drawOverweightRate * 0.04 +
      zeroZeroMissRate * 0.14 +
      lowTotalMissRate * 0.03,
    0,
    0.22
  );
  const favoriteCleanSheetBoost = clamp(
    favoriteCleanSheetRate * 0.18 +
      loserGoalOverestimate * 0.05 -
      favoriteMissRate * 0.06 -
      favoriteConcededMultipleRate * 0.12 -
      favoriteCleanSheetBustRate * 0.16 -
      loserGoalUnderestimate * 0.06 -
      favoriteDrawMissRate * 0.12 -
      favoriteMarginOverestimate * 0.035 +
      drawProtectedFavoriteWinRate * 0.10 +
      favoriteMarginUnderestimate * 0.025 +
      lowTotalMissRate * 0.08 +
      totalGoalOverestimate * 0.02,
    0,
    0.22
  );
  const favoriteGoalLift = clamp(
    winnerGoalUnderestimate * 0.08 +
      favoriteCleanSheetRate * 0.05 +
      highTotalMissRate * 0.03 -
      lowTotalMissRate * 0.03 -
      favoriteMissRate * 0.04 -
      favoriteDrawMissRate * 0.05 -
      favoriteMarginOverestimate * 0.02 +
      drawProtectedFavoriteWinRate * 0.08 +
      drawTrapBreakthroughRate * 0.07 +
      favoriteMarginUnderestimate * 0.025 +
      drawTrapMarginUnderestimate * 0.018,
    0,
    0.20
  );
  const underdogGoalSuppression = clamp(
    loserGoalOverestimate * 0.10 +
      favoriteCleanSheetRate * 0.08 -
      underdogResilienceBoost * 0.45 -
      loserGoalUnderestimate * 0.09 -
      favoriteConcededMultipleRate * 0.10 -
      favoriteCleanSheetBustRate * 0.08 +
      lowTotalMissRate * 0.04,
    0,
    0.14
  );
  const drawDampener = clamp(
    drawOverweightRate * 0.10 +
      Math.max(0, directionMissRate - favoriteMissRate * 0.7) * 0.035 -
      favoriteDrawMissRate * 0.06 +
      drawProtectedFavoriteWinRate * 0.12 +
      drawTrapBreakthroughRate * 0.14 +
      favoriteMarginUnderestimate * 0.025 +
      drawTrapMarginUnderestimate * 0.022,
    0,
    0.18
  );
  const volatilityLift = clamp(
    directionMissRate * 0.07 +
      scoreMissRate * 0.04 +
      highTotalMissRate * 0.08 +
      Math.max(0, highTotalMissRate - lowTotalMissRate) * 0.03 -
      lowTotalMissRate * 0.02 +
      loserGoalUnderestimate * 0.04 +
      favoriteMarginOverestimate * 0.02 +
      favoriteCleanSheetBustRate * 0.07,
    0,
    0.18
  );

  return {
    version: CALIBRATION_VERSION,
    sampleSignature: samples.map((sample) => `${sample.match.id}:${sample.prediction.generatedAt}`).join("|"),
    learnedMatchCount: samples.length,
    scoreMissRate: round4(scoreMissRate),
    directionMissRate: round4(directionMissRate),
    favoriteMissRate: round4(favoriteMissRate),
    favoriteCleanSheetBoost: round4(favoriteCleanSheetBoost),
    favoriteGoalLift: round4(favoriteGoalLift),
    underdogGoalSuppression: round4(underdogGoalSuppression),
    drawDampener: round4(drawDampener),
    volatilityLift: round4(volatilityLift),
    favoriteOverconfidencePenalty: round4(favoriteOverconfidencePenalty),
    underdogResilienceBoost: round4(underdogResilienceBoost),
    drawProtectionBoost: round4(drawProtectionBoost),
    favoriteDrawMissRate: round4(favoriteDrawMissRate),
    favoriteMarginOverestimate: round4(favoriteMarginOverestimate),
    drawProtectedFavoriteWinRate: round4(drawProtectedFavoriteWinRate),
    favoriteMarginUnderestimate: round4(favoriteMarginUnderestimate),
    drawTrapBreakthroughRate: round4(drawTrapBreakthroughRate),
    drawTrapMarginUnderestimate: round4(drawTrapMarginUnderestimate),
    favoriteCleanSheetBustRate: round4(favoriteCleanSheetBustRate),
    highTotalMissRate: round4(highTotalMissRate),
    lowTotalMissRate: round4(lowTotalMissRate),
    zeroZeroMissRate: round4(zeroZeroMissRate),
    totalGoalOverestimate: round4(totalGoalOverestimate),
    generatedAt: new Date().toISOString(),
    notes: buildCalibrationNotes({
      samples,
      scoreMissRate,
      directionMissRate,
      favoriteCleanSheetRate,
      favoriteMissRate,
      drawUnderweightRate,
      winnerGoalUnderestimate,
      loserGoalOverestimate,
      loserGoalUnderestimate,
      favoriteConcededMultipleRate,
      favoriteDrawMissRate,
      favoriteMarginOverestimate,
      drawProtectedFavoriteWinRate,
      favoriteMarginUnderestimate,
      drawTrapBreakthroughRate,
      drawTrapMarginUnderestimate,
      favoriteCleanSheetBustRate,
      highTotalMissRate,
      lowTotalMissRate,
      zeroZeroMissRate,
      totalGoalOverestimate,
      drawOverweightRate
    })
  };
}

function toCalibrationSample(match: Match, prediction: Prediction): CalibrationSample | undefined {
  if (!prediction?.topScores[0]) return undefined;

  const evaluation = buildPredictionEvaluation(match, prediction);
  if (!evaluation) return undefined;
  const scoreDistributionTop3Hit = isScoreDistributionTop3Hit(match, prediction, evaluation.top3ScoreHit);

  const [predictedHomeGoals, predictedAwayGoals] = parseScore(prediction.topScores[0].score);
  const actualDirection = resultDirection(match.homeScore, match.awayScore);
  const predictedTopDirection = resultDirection(predictedHomeGoals, predictedAwayGoals);
  const favoriteDirection = favoriteFromProbabilities(prediction);
  const favoriteProbability = favoriteDirection ? probabilityForDirection(prediction, favoriteDirection) : 0;
  const favoriteMissed = Boolean(favoriteDirection && actualDirection !== favoriteDirection);
  const favoriteWonToNil =
    favoriteDirection === "home"
      ? match.homeScore > match.awayScore && match.awayScore === 0
      : favoriteDirection === "away"
        ? match.awayScore > match.homeScore && match.homeScore === 0
        : false;
  const favoriteConcededMultiple = favoriteConcededAtLeast(match, favoriteDirection, 2);
  const favoriteDrawMissed =
    Boolean(favoriteDirection) && actualDirection === "draw" && predictedTopDirection === favoriteDirection && favoriteProbability >= 0.52;
  const favoriteMarginOverestimate = favoritePredictedMarginOverestimate(match, predictedHomeGoals, predictedAwayGoals, favoriteDirection);
  const drawProtectedFavoriteWin =
    Boolean(favoriteDirection) &&
    predictedTopDirection === "draw" &&
    actualDirection === favoriteDirection &&
    favoriteProbability >= 0.36 &&
    actualFavoriteMargin(match, favoriteDirection) >= 2;
  const favoriteMarginUnderestimate = favoritePredictedMarginUnderestimate(match, predictedHomeGoals, predictedAwayGoals, favoriteDirection);
  const actualMargin = Math.abs(match.homeScore - match.awayScore);
  const predictedMargin = Math.abs(predictedHomeGoals - predictedAwayGoals);
  const actualWinnerProbability =
    actualDirection === "home" ? prediction.homeWinProb : actualDirection === "away" ? prediction.awayWinProb : prediction.drawProb;
  const strongDrawSignal = predictedTopDirection === "draw" || prediction.drawProb >= 0.27;
  const winnerWasLive = actualWinnerProbability >= (actualMargin === 1 ? 0.30 : 0.25);
  const drawTrapBreakthrough =
    actualDirection !== "draw" && strongDrawSignal && actualMargin >= 1 && winnerWasLive;
  const drawTrapMarginUnderestimate = drawTrapBreakthrough ? Math.max(0.5, actualMargin - predictedMargin) : 0;
  const favoriteCleanSheetBust =
    Boolean(favoriteDirection) &&
    predictedTopDirection === favoriteDirection &&
    (favoriteDirection === "home" ? predictedAwayGoals === 0 : predictedHomeGoals === 0) &&
    favoriteConcededAtLeast(match, favoriteDirection, 1);
  const winnerGoalUnderestimate = winningSideGoalUnderestimate(match, prediction);
  const loserGoalOverestimate = losingSideGoalOverestimate(match, prediction);
  const loserGoalUnderestimate = losingSideGoalUnderestimate(match, prediction);
  const actualTotalGoals = match.homeScore + match.awayScore;
  const predictedTotalGoals = predictedHomeGoals + predictedAwayGoals;
  const highTotalMissed = actualTotalGoals >= 5 && predictedTotalGoals <= actualTotalGoals - 2;
  const lowTotalMissed = !scoreDistributionTop3Hit && actualTotalGoals <= 1 && predictedTotalGoals >= actualTotalGoals + 2;
  const zeroZeroMissed =
    !scoreDistributionTop3Hit &&
    actualTotalGoals === 0 &&
    !prediction.topScores.slice(0, 3).some((score) => score.score === "0-0");
  const totalGoalOverestimate = Math.max(0, predictedTotalGoals - actualTotalGoals);
  const drawOverweighted = prediction.drawProb >= 0.25 && actualDirection !== "draw";
  const drawUnderweighted = prediction.drawProb <= 0.21 && actualDirection === "draw";

  return {
    match,
    prediction,
    actualDirection,
    predictedTopDirection,
    favoriteDirection,
    favoriteProbability,
    top3Missed: !scoreDistributionTop3Hit,
    directionMissed: !evaluation.resultHit,
    favoriteMissed,
    favoriteWonToNil,
    favoriteConcededMultiple,
    favoriteDrawMissed,
    favoriteMarginOverestimate,
    drawProtectedFavoriteWin,
    favoriteMarginUnderestimate,
    drawTrapBreakthrough,
    drawTrapMarginUnderestimate,
    favoriteCleanSheetBust,
    highTotalMissed,
    lowTotalMissed,
    zeroZeroMissed,
    totalGoalOverestimate,
    winnerGoalUnderestimate,
    loserGoalOverestimate,
    loserGoalUnderestimate,
    drawOverweighted,
    drawUnderweighted
  };
}

function isScoreDistributionTop3Hit(match: Match, prediction: Prediction, fallback: boolean): boolean {
  const matrix = prediction.scoreProbabilityMatrix;
  if (!matrix || matrix.length < 3) return fallback;

  const actualScore = `${match.homeScore}-${match.awayScore}`;
  return [...matrix]
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 3)
    .some((item) => item.score === actualScore);
}

function isCausalPredictionSnapshot(match: Match, prediction: Prediction | undefined | null): prediction is Prediction {
  if (!prediction) return false;
  const generatedAt = new Date(prediction.generatedAt).getTime();
  const kickoffAt = new Date(match.startTime).getTime();
  return Number.isFinite(generatedAt) && Number.isFinite(kickoffAt) && generatedAt <= kickoffAt;
}

function predictionForCalibration(
  match: Match,
  fallbackPredictionFactory?: CalibrationPredictionFactory
): Prediction | undefined {
  if (isCausalPredictionSnapshot(match, match.prediction)) return match.prediction;

  const fallback = fallbackPredictionFactory?.(match);
  return isCausalPredictionSnapshot(match, fallback) ? fallback : undefined;
}

function favoriteFromProbabilities(prediction: Prediction): "home" | "away" | null {
  const favoriteProb = Math.max(prediction.homeWinProb, prediction.awayWinProb);
  if (favoriteProb < 0.36 || Math.abs(prediction.homeWinProb - prediction.awayWinProb) < 0.06) return null;
  return prediction.homeWinProb >= prediction.awayWinProb ? "home" : "away";
}

function probabilityForDirection(prediction: Prediction, direction: "home" | "away"): number {
  return direction === "home" ? prediction.homeWinProb : prediction.awayWinProb;
}

function winningSideGoalUnderestimate(match: Match, prediction: Prediction): number {
  if (match.homeScore > match.awayScore) return Math.max(0, match.homeScore - prediction.expectedHomeGoals);
  if (match.awayScore > match.homeScore) return Math.max(0, match.awayScore - prediction.expectedAwayGoals);
  return 0;
}

function losingSideGoalOverestimate(match: Match, prediction: Prediction): number {
  if (match.homeScore > match.awayScore) return Math.max(0, prediction.expectedAwayGoals - match.awayScore);
  if (match.awayScore > match.homeScore) return Math.max(0, prediction.expectedHomeGoals - match.homeScore);
  return 0;
}

function losingSideGoalUnderestimate(match: Match, prediction: Prediction): number {
  if (match.homeScore > match.awayScore) return Math.max(0, match.awayScore - prediction.expectedAwayGoals);
  if (match.awayScore > match.homeScore) return Math.max(0, match.homeScore - prediction.expectedHomeGoals);
  return Math.max(0, Math.min(match.homeScore - prediction.expectedHomeGoals, match.awayScore - prediction.expectedAwayGoals));
}

function favoriteConcededAtLeast(match: Match, favoriteDirection: "home" | "away" | null, goals: number): boolean {
  if (favoriteDirection === "home") return match.homeScore > match.awayScore && match.awayScore >= goals;
  if (favoriteDirection === "away") return match.awayScore > match.homeScore && match.homeScore >= goals;
  return false;
}

function favoritePredictedMarginOverestimate(
  match: Match,
  predictedHomeGoals: number,
  predictedAwayGoals: number,
  favoriteDirection: "home" | "away" | null
): number {
  if (!favoriteDirection) return 0;
  const predictedDirection = resultDirection(predictedHomeGoals, predictedAwayGoals);
  if (predictedDirection !== favoriteDirection) return 0;

  const predictedMargin = Math.abs(predictedHomeGoals - predictedAwayGoals);
  const actualMargin = Math.abs(match.homeScore - match.awayScore);
  return Math.max(0, predictedMargin - actualMargin);
}

function favoritePredictedMarginUnderestimate(
  match: Match,
  predictedHomeGoals: number,
  predictedAwayGoals: number,
  favoriteDirection: "home" | "away" | null
): number {
  if (!favoriteDirection) return 0;
  const actualMargin = actualFavoriteMargin(match, favoriteDirection);
  if (actualMargin <= 0) return 0;

  const predictedDirection = resultDirection(predictedHomeGoals, predictedAwayGoals);
  const predictedMargin = predictedDirection === favoriteDirection ? Math.abs(predictedHomeGoals - predictedAwayGoals) : 0;
  return Math.max(0, actualMargin - predictedMargin);
}

function actualFavoriteMargin(match: Match, favoriteDirection: "home" | "away" | null): number {
  if (favoriteDirection === "home") return match.homeScore - match.awayScore;
  if (favoriteDirection === "away") return match.awayScore - match.homeScore;
  return 0;
}

function resultDirection(homeGoals: number, awayGoals: number): Direction {
  if (homeGoals > awayGoals) return "home";
  if (homeGoals < awayGoals) return "away";
  return "draw";
}

function parseScore(score: string): [number, number] {
  const [home, away] = score.split("-").map((value) => Number.parseInt(value, 10));
  return [Number.isFinite(home) ? home : 0, Number.isFinite(away) ? away : 0];
}

function buildCalibrationNotes({
  samples,
  scoreMissRate,
  directionMissRate,
  favoriteCleanSheetRate,
  favoriteMissRate,
  drawUnderweightRate,
  winnerGoalUnderestimate,
  loserGoalOverestimate,
  loserGoalUnderestimate,
  favoriteConcededMultipleRate,
  favoriteDrawMissRate,
  favoriteMarginOverestimate,
  drawProtectedFavoriteWinRate,
  favoriteMarginUnderestimate,
  drawTrapBreakthroughRate,
  drawTrapMarginUnderestimate,
  favoriteCleanSheetBustRate,
  highTotalMissRate,
  lowTotalMissRate,
  zeroZeroMissRate,
  totalGoalOverestimate,
  drawOverweightRate
}: {
  samples: CalibrationSample[];
  scoreMissRate: number;
  directionMissRate: number;
  favoriteCleanSheetRate: number;
  favoriteMissRate: number;
  drawUnderweightRate: number;
  winnerGoalUnderestimate: number;
  loserGoalOverestimate: number;
  loserGoalUnderestimate: number;
  favoriteConcededMultipleRate: number;
  favoriteDrawMissRate: number;
  favoriteMarginOverestimate: number;
  drawProtectedFavoriteWinRate: number;
  favoriteMarginUnderestimate: number;
  drawTrapBreakthroughRate: number;
  drawTrapMarginUnderestimate: number;
  favoriteCleanSheetBustRate: number;
  highTotalMissRate: number;
  lowTotalMissRate: number;
  zeroZeroMissRate: number;
  totalGoalOverestimate: number;
  drawOverweightRate: number;
}): string[] {
  return [
    `只使用目标比赛开赛前已经结束、且已有赛前推算快照的 ${samples.length} 场比赛，不读取目标比赛赛果。`,
    `近期前三候选比分漏判率 ${formatPercent(scoreMissRate)}，胜平负方向漏判率 ${formatPercent(directionMissRate)}。`,
    `热门方向失误率 ${formatPercent(favoriteMissRate)}；如果强队连续没打出，后续会降低强队大胜和高置信主胜/客胜权重。`,
    `强队零封胜但比分未覆盖比例 ${formatPercent(favoriteCleanSheetRate)}；只有在强队方向稳定时才提高 2-0/3-0 这类零封比分权重。`,
    `高置信热门被90分钟拖平样本 ${formatPercent(favoriteDrawMissRate)}，热门大胜幅度平均高估 ${favoriteMarginOverestimate.toFixed(2)} 球；后续会压低单边大胜置信度，并把 1-1/2-2 等平局候选提前。`,
    `平局陷阱被打穿样本 ${formatPercent(drawTrapBreakthroughRate)}，打穿时平均少估 ${drawTrapMarginUnderestimate.toFixed(2)} 球；后续不会机械保护 1-1，而会检查哪一方具备二次进球能力。`,
    `强队零封预测被打破样本 ${formatPercent(favoriteCleanSheetBustRate)}；后续会降低 3-0/4-0 这类零封比分，并提高 2-1/3-1/3-2 这类双方进球候选。`,
    `热门方赢球但丢两球以上样本 ${formatPercent(favoriteConcededMultipleRate)}，高总进球漏判样本 ${formatPercent(highTotalMissRate)}；后续降低零封/大胜权重，提高双方进球和高比分尾部候选。`,
    `低总进球漏判样本 ${formatPercent(lowTotalMissRate)}，0-0 漏判样本 ${formatPercent(zeroZeroMissRate)}，首选比分总进球平均高估 ${totalGoalOverestimate.toFixed(2)} 球；后续把 0-0、一球零封和两球零封放入候选保护。`,
    `胜方进球平均低估 ${winnerGoalUnderestimate.toFixed(2)} 球，负方进球平均高估 ${loserGoalOverestimate.toFixed(2)} 球，负方进球平均低估 ${loserGoalUnderestimate.toFixed(2)} 球。`,
    `平局权重偏高样本 ${formatPercent(drawOverweightRate)}，平局被低估样本 ${formatPercent(drawUnderweightRate)}；后续会分别处理，不再把所有方向错误都当成强队该加强。`
  ];
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function recencyWeightedAverage(values: number[]): number {
  if (!values.length) return 0;

  let weightedTotal = 0;
  let weightTotal = 0;
  values.forEach((value, index) => {
    const weight = Math.pow(RECENCY_DECAY, index);
    weightedTotal += value * weight;
    weightTotal += weight;
  });

  return weightedTotal / weightTotal;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
