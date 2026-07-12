import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ScorePrediction } from "../models.js";

export interface ScoreProbabilityMatrixItem extends ScorePrediction {
  homeGoals: number;
  awayGoals: number;
}

export interface OutcomeProbability {
  home: number;
  draw: number;
  away: number;
}

export interface ScoreSelectionHints {
  lowTotalPressure?: number;
  highTotalPressure?: number;
  cleanSheetPressure?: number;
  zeroZeroPressure?: number;
  strengthEdge?: number;
  strengthFavorite?: Exclude<keyof OutcomeProbability, "draw">;
}

export interface ExactScoreDistribution {
  probabilityMatrix: ScoreProbabilityMatrixItem[];
  top3Scores: ScorePrediction[];
  expectedGoalsHome: number;
  expectedGoalsAway: number;
  outcome: OutcomeProbability;
}

interface ExactScoreInput {
  homeLambda: number;
  awayLambda: number;
  homeElo: number;
  awayElo: number;
  stage: string;
  isHome?: boolean;
  fifaHistoricalPriorFactor?: number;
  calibratedOutcome?: OutcomeProbability;
  poissonOutcome?: OutcomeProbability;
  scoreAdjuster?: (score: ScoreProbabilityMatrixItem) => number;
  selectionHints?: ScoreSelectionHints;
  maxGoals?: number;
}

interface PriorPayload {
  scores?: Record<string, number>;
  pmf?: Record<string, number>;
  global?: {
    pmf?: Record<string, number>;
  };
}

const DEFAULT_MAX_GOALS = 5;
const PRIOR_FLOOR = 0.0001;
const PRIOR_TEMPERATURE = 0.58;
const DIRECTION_RATIO_EXPONENT = 0.66;
const ROOT_CANDIDATES = [
  resolve(process.cwd()),
  resolve(process.cwd(), "../.."),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")
];

let cachedPrior: Record<string, number> | undefined;

export function buildExactScoreDistribution(input: ExactScoreInput): ExactScoreDistribution {
  const maxGoals = input.maxGoals ?? DEFAULT_MAX_GOALS;
  const priors = loadFifaScoreDistribution(maxGoals);
  const stageMultiplier = stageFactor(input.stage);
  const homeLambda = clamp(input.homeLambda * stageMultiplier * homeAdvantage(input.isHome), 0.05, 5.5);
  const awayLambda = clamp(input.awayLambda * stageMultiplier, 0.05, 5.5);
  const eloDiff = input.homeElo - input.awayElo;
  const priorFactor = clamp(input.fifaHistoricalPriorFactor ?? 1, 0.80, 1.20);
  const rawScores: ScoreProbabilityMatrixItem[] = [];

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const score = `${homeGoals}-${awayGoals}`;
      const direction = scoreDirection({ homeGoals, awayGoals });
      const directionRatio =
        input.calibratedOutcome && input.poissonOutcome
          ? Math.pow(input.calibratedOutcome[direction] / Math.max(input.poissonOutcome[direction], 0.001), DIRECTION_RATIO_EXPONENT)
          : 1;
      const adjusted: ScoreProbabilityMatrixItem = {
        score,
        homeGoals,
        awayGoals,
        probability:
          poisson(homeGoals, homeLambda) *
          poisson(awayGoals, awayLambda) *
          priors[score] *
          eloScoreFactor(homeGoals, awayGoals, eloDiff) *
          priorFactor *
          directionRatio *
          directionConsistencyShape(direction, input.calibratedOutcome) *
          strengthDirectionShape(direction, input.selectionHints) *
          stageScoreShape(homeGoals, awayGoals, input.stage)
      };
      adjusted.probability *= input.scoreAdjuster?.(adjusted) ?? 1;
      rawScores.push(adjusted);
    }
  }

  const total = sum(rawScores.map((item) => item.probability));
  const normalized = rawScores
    .map((item) => ({ ...item, probability: total > 0 ? item.probability / total : 0 }))
    .sort((a, b) => b.probability - a.probability);
  const top3Scores = normalized.slice(0, 3).map((item) => ({
    score: item.score,
    probability: round4(item.probability)
  }));
  const matrix = [...normalized]
    .sort((a, b) => a.homeGoals - b.homeGoals || a.awayGoals - b.awayGoals)
    .map((item) => ({ ...item, probability: round6(item.probability) }));

  return {
    probabilityMatrix: matrix,
    top3Scores,
    expectedGoalsHome: sum(matrix.map((item) => item.homeGoals * item.probability)),
    expectedGoalsAway: sum(matrix.map((item) => item.awayGoals * item.probability)),
    outcome: matrixOutcome(matrix)
  };
}

export function poissonOutcomeProbabilities(homeLambda: number, awayLambda: number, maxGoals = DEFAULT_MAX_GOALS): OutcomeProbability {
  const scores: ScoreProbabilityMatrixItem[] = [];

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      scores.push({
        score: `${homeGoals}-${awayGoals}`,
        homeGoals,
        awayGoals,
        probability: poisson(homeGoals, homeLambda) * poisson(awayGoals, awayLambda)
      });
    }
  }

  const total = sum(scores.map((item) => item.probability));
  return matrixOutcome(scores.map((item) => ({ ...item, probability: item.probability / total })));
}

export function scoreDirection(score: Pick<ScoreProbabilityMatrixItem, "homeGoals" | "awayGoals">): keyof OutcomeProbability {
  if (score.homeGoals > score.awayGoals) return "home";
  if (score.homeGoals < score.awayGoals) return "away";
  return "draw";
}

function loadFifaScoreDistribution(maxGoals: number): Record<string, number> {
  if (cachedPrior) return cachedPrior;

  const path = findRepoFile("data/worldcup/fifa_score_distribution.json") ?? findRepoFile("data/worldcup/hist_score_priors.json");
  const payload = path ? safeReadPrior(path) : undefined;
  const rawPmf = extractPmf(payload);
  const priors: Record<string, number> = {};

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const score = `${homeGoals}-${awayGoals}`;
      priors[score] = Math.max(Number(rawPmf[score] ?? 0), PRIOR_FLOOR);
    }
  }

  cachedPrior = normalizePmf(priors);
  return cachedPrior;
}

function safeReadPrior(path: string): PriorPayload | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PriorPayload;
  } catch {
    return undefined;
  }
}

function extractPmf(payload: PriorPayload | undefined): Record<string, number> {
  return payload?.scores ?? payload?.pmf ?? payload?.global?.pmf ?? fallbackPrior();
}

function fallbackPrior(): Record<string, number> {
  return {
    "0-0": 0.086,
    "1-0": 0.112,
    "0-1": 0.075,
    "1-1": 0.112,
    "2-0": 0.076,
    "0-2": 0.043,
    "2-1": 0.102,
    "1-2": 0.05,
    "2-2": 0.042,
    "3-0": 0.042,
    "3-1": 0.052
  };
}

function findRepoFile(relativePath: string): string | null {
  for (const root of ROOT_CANDIDATES) {
    const candidate = resolve(root, relativePath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function stageFactor(stage: string): number {
  const text = stage.toLowerCase();
  if (text.includes("final") || text.includes("决赛") || text.includes("鍐宠禌")) return 0.98;
  if (text.includes("knockout") || text.includes("round") || text.includes("1/") || text.includes("淘汰") || text.includes("娣樻卑")) {
    return 0.99;
  }
  return 1;
}

function stageScoreShape(homeGoals: number, awayGoals: number, stage: string): number {
  const text = stage.toLowerCase();
  const knockout =
    text.includes("knockout") || text.includes("round") || text.includes("1/") || text.includes("淘汰") || text.includes("娣樻卑");
  if (!knockout) return 1;

  const totalGoals = homeGoals + awayGoals;
  let factor = 1;
  if (homeGoals === awayGoals) factor *= totalGoals <= 2 ? 0.96 : 0.99;
  if (totalGoals >= 5) factor *= 0.98;
  if (Math.abs(homeGoals - awayGoals) >= 3) factor *= 0.98;
  return factor;
}

function eloScoreFactor(homeGoals: number, awayGoals: number, eloDiff: number): number {
  const edge = clamp(eloDiff, -450, 450) / 400;
  if (homeGoals > awayGoals) return Math.exp(edge * 0.22);
  if (homeGoals < awayGoals) return Math.exp(-edge * 0.22);
  return Math.exp(-Math.abs(edge) * 0.05);
}

function directionConsistencyShape(direction: keyof OutcomeProbability, outcome?: OutcomeProbability): number {
  if (!outcome) return 1;

  const ranked = (Object.entries(outcome) as Array<[keyof OutcomeProbability, number]>).sort((a, b) => b[1] - a[1]);
  const [topDirection, topProbability] = ranked[0] ?? ["draw", 0];
  const [, runnerUpProbability] = ranked[1] ?? ["draw", 0];
  const edge = clamp(topProbability - runnerUpProbability, 0, 0.20);
  if (edge < 0.015) return 1;

  if (direction === topDirection) return 1 + clamp(edge * 4.8, 0, 0.20);
  return 1 - clamp(edge * 3.2, 0, 0.16);
}

function strengthDirectionShape(direction: keyof OutcomeProbability, hints?: ScoreSelectionHints): number {
  const favorite = hints?.strengthFavorite;
  if (!favorite) return 1;

  const strengthEdge = Math.abs(hints.strengthEdge ?? 0);
  const lowTotalProtection = clamp(
    Math.max(hints.lowTotalPressure ?? 0, hints.zeroZeroPressure ?? 0) - (hints.highTotalPressure ?? 0) * 0.45,
    0,
    1
  );
  const bias = clamp((strengthEdge - 2.5) / 12, 0, 0.18) * (1 - lowTotalProtection * 0.82);
  if (bias <= 0) return 1;

  if (direction === favorite) return 1 + bias;
  if (direction === "draw") return 1 - bias * 0.58;
  return 1 - bias * 0.24;
}

function homeAdvantage(isHome?: boolean): number {
  return isHome ? 1.03 : 1;
}

function poisson(goals: number, lambda: number): number {
  return (Math.pow(lambda, goals) * Math.exp(-lambda)) / factorial(goals);
}

function factorial(value: number): number {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function matrixOutcome(matrix: ScoreProbabilityMatrixItem[]): OutcomeProbability {
  const home = sum(matrix.filter((item) => item.homeGoals > item.awayGoals).map((item) => item.probability));
  const draw = sum(matrix.filter((item) => item.homeGoals === item.awayGoals).map((item) => item.probability));
  const away = sum(matrix.filter((item) => item.homeGoals < item.awayGoals).map((item) => item.probability));
  const [normalizedHome, normalizedDraw, normalizedAway] = normalize([home, draw, away]);
  return { home: normalizedHome, draw: normalizedDraw, away: normalizedAway };
}

function normalizePmf(pmf: Record<string, number>): Record<string, number> {
  const tempered = Object.fromEntries(
    Object.entries(pmf).map(([score, value]) => [score, Math.pow(Math.max(value, PRIOR_FLOOR), PRIOR_TEMPERATURE)])
  );
  const total = sum(Object.values(tempered));
  if (total <= 0) return pmf;
  return Object.fromEntries(Object.entries(tempered).map(([score, value]) => [score, value / total]));
}

function normalize(values: number[]): number[] {
  const total = sum(values);
  return values.map((value) => (total > 0 ? value / total : 0));
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
