import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EnhancedScorePrediction, Match, Prediction, WorldCupScoreEnhancement } from "../models.js";

interface RuntimeConfig {
  smoothing: { lambda: number };
  eloBuckets: { balancedMaxAbsDiff: number; midGapMaxAbsDiff: number };
  enhancement: {
    modelPower: number;
    histPower: number;
    edgeWeight: number;
    minProbability: number;
    totalGoalSigma: number;
    goalDiffSigma: number;
  };
  filters: {
    keep: { minMass3: number; minP1: number; maxEntropy3: number; maxScenarioSpan: number };
    reject: {
      minMass3: number;
      scenarioSpanEq: number;
      highXgTotal: number;
      highXgP1: number;
      bonusP85: number;
      histTailProb: number;
    };
  };
}

interface HistBucket {
  n?: number;
  pmf: Record<string, number>;
  top3?: EnhancedScorePrediction[];
  top3_mass?: number;
  top3Mass?: number;
}

interface HistPriors {
  global?: HistBucket;
  parents?: Record<string, HistBucket>;
  buckets?: Record<string, HistBucket>;
}

interface CandidateScore {
  score: string;
  home: number;
  away: number;
  modelProbability: number;
  historicalProbability: number;
  impliedProbability: number;
  edge: number;
  probability: number;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  smoothing: { lambda: 25 },
  eloBuckets: { balancedMaxAbsDiff: 60, midGapMaxAbsDiff: 150 },
  enhancement: {
    modelPower: 0.6,
    histPower: 0.25,
    edgeWeight: 0.15,
    minProbability: 0.000001,
    totalGoalSigma: 1.15,
    goalDiffSigma: 1.1
  },
  filters: {
    keep: { minMass3: 0.44, minP1: 0.16, maxEntropy3: 0.92, maxScenarioSpan: 2 },
    reject: { minMass3: 0.38, scenarioSpanEq: 3, highXgTotal: 3.1, highXgP1: 0.14, bonusP85: 0.85, histTailProb: 0.015 }
  }
};

const FALLBACK_PRIORS: HistPriors = {
  global: {
    n: 0,
    pmf: {
      "1-1": 0.122,
      "1-0": 0.118,
      "2-1": 0.092,
      "0-0": 0.087,
      "2-0": 0.078,
      "0-1": 0.074,
      "2-2": 0.045,
      "3-1": 0.041,
      "1-2": 0.04,
      "3-0": 0.035,
      "0-2": 0.032,
      "3-2": 0.027,
      "2-3": 0.018,
      "4-0": 0.014,
      "0-3": 0.014
    },
    top3: [
      { score: "1-1", probability: 0.122 },
      { score: "1-0", probability: 0.118 },
      { score: "2-1", probability: 0.092 }
    ],
    top3_mass: 0.332
  }
};

const ROOT_CANDIDATES = [
  resolve(process.cwd()),
  resolve(process.cwd(), "../.."),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")
];

export function attachWorldCupScoreEnhancement(match: Match, prediction: Prediction): Prediction {
  const config = loadRuntimeConfig();
  const priors = loadHistPriors();
  const stage = stageBucket(match.competition);
  const eloHome = eloFromTeam(match.homeTeam.fifaRating);
  const eloAway = eloFromTeam(match.awayTeam.fifaRating);
  const histBucket = `${stage}|${eloBucket(Math.abs(eloHome - eloAway), config)}|${hostFlag(match)}`;
  const parentPrior = priors.parents?.[stage] ?? priors.global ?? FALLBACK_PRIORS.global!;
  const bucketPrior = priors.buckets?.[histBucket] ?? parentPrior;
  const globalPrior = priors.global ?? parentPrior ?? FALLBACK_PRIORS.global!;
  const bucketPmf = normalizePmfKeys(bucketPrior.pmf);
  const globalPmf = normalizePmfKeys(globalPrior.pmf);
  const modelPmf = buildModelPmf(prediction);
  const scoreBonus = buildScoreBonus(prediction);
  const impliedPmf = impliedProbabilities(scoreBonus);
  const adjusted = adjustScores(modelPmf, bucketPmf, globalPmf, impliedPmf, scoreBonus, prediction, config);
  const top3 = adjusted.slice(0, 3);
  const mass3 = sum(top3.map((item) => item.probability));
  const entropy3 = normalizedEntropy(top3.map((item) => item.probability));
  const span = scenarioSpan(top3.map((item) => item.score));
  const rejectReasons = rejectReasonsFor(top3, adjusted, scoreBonus, prediction, config, mass3, entropy3, span);

  const enhancement: WorldCupScoreEnhancement = {
    rawTop3: prediction.topScores.map((item) => {
      const key = normalizeScoreKey(item.score);
      return {
        score: key,
        probability: round4(item.probability),
        modelProbability: round4(modelPmf[key] ?? item.probability),
        historicalProbability: round4(bucketPmf[key] ?? globalPmf[key] ?? 0)
      };
    }),
    adjustedTop3: top3.map(toEnhancedScore),
    keep: rejectReasons.length === 0,
    rejectReasons,
    mass3: round4(mass3),
    entropy3: round4(entropy3),
    scenarioSpan: span,
    histBucket,
    histTop3Mass: round4(bucketPrior.top3Mass ?? bucketPrior.top3_mass ?? topMass(bucketPmf, 3)),
    histTop3: histTopScores(bucketPmf),
    matchScore: round4(mass3 * Math.max(0, 1 - entropy3 * 0.35)),
    calibratedTop3Hit: match.status === "finished" ? top3.some((item) => item.score === `${match.homeScore}-${match.awayScore}`) : null
  };

  return {
    ...prediction,
    scoreEnhancement: enhancement
  };
}

function loadRuntimeConfig(): RuntimeConfig {
  const path = findRepoFile("config/worldcup_enhancer.yaml");
  if (!path) return DEFAULT_CONFIG;
  const text = readFileSync(path, "utf8");

  return {
    smoothing: { lambda: readNumber(text, "lambda", DEFAULT_CONFIG.smoothing.lambda) },
    eloBuckets: {
      balancedMaxAbsDiff: readNumber(text, "balanced_max_abs_diff", DEFAULT_CONFIG.eloBuckets.balancedMaxAbsDiff),
      midGapMaxAbsDiff: readNumber(text, "mid_gap_max_abs_diff", DEFAULT_CONFIG.eloBuckets.midGapMaxAbsDiff)
    },
    enhancement: {
      modelPower: readNumber(text, "model_power", DEFAULT_CONFIG.enhancement.modelPower),
      histPower: readNumber(text, "hist_power", DEFAULT_CONFIG.enhancement.histPower),
      edgeWeight: readNumber(text, "edge_weight", DEFAULT_CONFIG.enhancement.edgeWeight),
      minProbability: readNumber(text, "min_probability", DEFAULT_CONFIG.enhancement.minProbability),
      totalGoalSigma: readNumber(text, "total_goal_sigma", DEFAULT_CONFIG.enhancement.totalGoalSigma),
      goalDiffSigma: readNumber(text, "goal_diff_sigma", DEFAULT_CONFIG.enhancement.goalDiffSigma)
    },
    filters: {
      keep: {
        minMass3: readNumber(text, "min_mass3", DEFAULT_CONFIG.filters.keep.minMass3, "keep"),
        minP1: readNumber(text, "min_p1", DEFAULT_CONFIG.filters.keep.minP1, "keep"),
        maxEntropy3: readNumber(text, "max_entropy3", DEFAULT_CONFIG.filters.keep.maxEntropy3, "keep"),
        maxScenarioSpan: readNumber(text, "max_scenario_span", DEFAULT_CONFIG.filters.keep.maxScenarioSpan, "keep")
      },
      reject: {
        minMass3: readNumber(text, "min_mass3", DEFAULT_CONFIG.filters.reject.minMass3, "reject"),
        scenarioSpanEq: readNumber(text, "scenario_span_eq", DEFAULT_CONFIG.filters.reject.scenarioSpanEq),
        highXgTotal: readNumber(text, "high_xg_total", DEFAULT_CONFIG.filters.reject.highXgTotal),
        highXgP1: readNumber(text, "high_xg_p1", DEFAULT_CONFIG.filters.reject.highXgP1),
        bonusP85: readNumber(text, "bonus_p85", DEFAULT_CONFIG.filters.reject.bonusP85),
        histTailProb: readNumber(text, "hist_tail_prob", DEFAULT_CONFIG.filters.reject.histTailProb)
      }
    }
  };
}

function loadHistPriors(): HistPriors {
  const path = findRepoFile("data/worldcup/hist_score_priors.json");
  if (!path) return FALLBACK_PRIORS;

  try {
    return JSON.parse(readFileSync(path, "utf8")) as HistPriors;
  } catch {
    return FALLBACK_PRIORS;
  }
}

function findRepoFile(relativePath: string): string | null {
  for (const root of ROOT_CANDIDATES) {
    const candidate = resolve(root, relativePath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function readNumber(text: string, key: string, fallback: number, section?: string): number {
  const scopedText = section ? text.slice(Math.max(0, text.indexOf(`${section}:`))) : text;
  const match = new RegExp(`^\\s*${key}:\\s*([0-9.]+)`, "m").exec(scopedText);
  if (!match) return fallback;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : fallback;
}

function buildModelPmf(prediction: Prediction): Record<string, number> {
  if (prediction.scoreProbabilityMatrix?.length) {
    return normalizePmf(
      Object.fromEntries(
        prediction.scoreProbabilityMatrix.map((item) => [normalizeScoreKey(item.score), Math.max(item.probability, 0)])
      )
    );
  }

  const homeLambda = clamp(prediction.expectedHomeGoals, 0.05, 6.5);
  const awayLambda = clamp(prediction.expectedAwayGoals, 0.05, 6.5);
  const pmf: Record<string, number> = {};

  for (let home = 0; home <= 6; home += 1) {
    for (let away = 0; away <= 6; away += 1) {
      pmf[`${home}-${away}`] = poisson(home, homeLambda) * poisson(away, awayLambda);
    }
  }

  for (const item of prediction.topScores) {
    const key = normalizeScoreKey(item.score);
    pmf[key] = Math.max(pmf[key] ?? 0, item.probability);
  }

  return normalizePmf(pmf);
}

function buildScoreBonus(prediction: Prediction): Record<string, number> {
  const bonus: Record<string, number> = {};
  const xgTotal = prediction.expectedHomeGoals + prediction.expectedAwayGoals;
  const homeBias = prediction.homeWinProb - prediction.awayWinProb;

  for (let home = 0; home <= 6; home += 1) {
    for (let away = 0; away <= 6; away += 1) {
      const total = home + away;
      const diff = home - away;
      const rarity = 6 + total * 1.45 + Math.abs(diff) * 1.35;
      const marketBias = diff > 0 ? 1 - homeBias * 0.18 : diff < 0 ? 1 + homeBias * 0.18 : 1;
      const tempoBias = xgTotal > 3 ? 0.92 : 1.05;
      bonus[`${home}-${away}`] = clamp(rarity * marketBias * tempoBias, 3, 80);
    }
  }

  return bonus;
}

function adjustScores(
  modelPmf: Record<string, number>,
  histPmf: Record<string, number>,
  parentPmf: Record<string, number>,
  impliedPmf: Record<string, number>,
  scoreBonus: Record<string, number>,
  prediction: Prediction,
  config: RuntimeConfig
): CandidateScore[] {
  const raw: CandidateScore[] = [];
  const expectedTotal = prediction.expectedHomeGoals + prediction.expectedAwayGoals;
  const expectedDiff = prediction.expectedHomeGoals - prediction.expectedAwayGoals;

  for (const [score, modelProbability] of Object.entries(modelPmf)) {
    const [home, away] = parseScore(score);
    const historicalProbability = Math.max(
      histPmf[score] ?? parentPmf[score] ?? config.enhancement.minProbability,
      config.enhancement.minProbability
    );
    const impliedProbability = Math.max(impliedPmf[score] ?? config.enhancement.minProbability, config.enhancement.minProbability);
    const edge = Math.log(Math.max(modelProbability, config.enhancement.minProbability) / impliedProbability);
    const totalGoalKernel = gaussianKernel(home + away, expectedTotal, config.enhancement.totalGoalSigma);
    const goalDiffKernel = gaussianKernel(home - away, expectedDiff, config.enhancement.goalDiffSigma);
    const probability =
      Math.pow(Math.max(modelProbability, config.enhancement.minProbability), config.enhancement.modelPower) *
      Math.pow(historicalProbability, config.enhancement.histPower) *
      Math.exp(config.enhancement.edgeWeight * edge) *
      totalGoalKernel *
      goalDiffKernel;

    raw.push({
      score,
      home,
      away,
      modelProbability,
      historicalProbability,
      impliedProbability,
      edge,
      probability
    });
  }

  const total = sum(raw.map((item) => item.probability));
  return raw
    .map((item) => ({ ...item, probability: total > 0 ? item.probability / total : 0 }))
    .sort((a, b) => b.probability - a.probability || scoreBonus[a.score] - scoreBonus[b.score]);
}

function rejectReasonsFor(
  top3: CandidateScore[],
  adjusted: CandidateScore[],
  scoreBonus: Record<string, number>,
  prediction: Prediction,
  config: RuntimeConfig,
  mass3: number,
  entropy3: number,
  span: number
): string[] {
  const reasons: string[] = [];
  const p1 = top3[0]?.probability ?? 0;
  const xgTotal = prediction.expectedHomeGoals + prediction.expectedAwayGoals;

  if (mass3 < config.filters.reject.minMass3) reasons.push("mass3_below_reject");
  if (span === config.filters.reject.scenarioSpanEq) reasons.push("scenario_span_eq_reject");
  if (xgTotal > config.filters.reject.highXgTotal && p1 < config.filters.reject.highXgP1) reasons.push("high_xg_low_p1");
  if (top3.some((item) => isExtremeTail(item, adjusted, scoreBonus, config))) reasons.push("extreme_tail");

  if (reasons.length === 0) {
    if (mass3 < config.filters.keep.minMass3) reasons.push("mass3_below_keep");
    if (p1 < config.filters.keep.minP1) reasons.push("p1_below_keep");
    if (entropy3 > config.filters.keep.maxEntropy3) reasons.push("entropy_above_keep");
    if (span > config.filters.keep.maxScenarioSpan) reasons.push("scenario_span_above_keep");
  }

  return reasons;
}

function isExtremeTail(item: CandidateScore, adjusted: CandidateScore[], scoreBonus: Record<string, number>, config: RuntimeConfig): boolean {
  const bonuses = adjusted.map((candidate) => scoreBonus[candidate.score] ?? 0).sort((a, b) => a - b);
  const p85Index = Math.min(bonuses.length - 1, Math.max(0, Math.floor(config.filters.reject.bonusP85 * (bonuses.length - 1))));
  return (scoreBonus[item.score] ?? 0) >= bonuses[p85Index] && item.historicalProbability < config.filters.reject.histTailProb;
}

function histTopScores(pmf: Record<string, number>): EnhancedScorePrediction[] {
  return Object.entries(pmf)
    .map(([score, probability]) => ({ score, probability: round4(probability) }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);
}

function topMass(pmf: Record<string, number>, count: number): number {
  return Object.values(pmf)
    .sort((a, b) => b - a)
    .slice(0, count)
    .reduce((acc, item) => acc + item, 0);
}

function toEnhancedScore(item: CandidateScore): EnhancedScorePrediction {
  return {
    score: item.score,
    probability: round4(item.probability),
    modelProbability: round4(item.modelProbability),
    historicalProbability: round4(item.historicalProbability),
    impliedProbability: round4(item.impliedProbability),
    edge: round4(item.edge)
  };
}

function stageBucket(competition: string): "group" | "knockout" {
  const text = competition.toLowerCase();
  const knockoutMarkers = [
    "淘汰",
    "决赛",
    "1/",
    "八分之一",
    "四分之一",
    "半决赛",
    "世界杯决赛",
    "knockout",
    "round",
    "quarter",
    "semi",
    "final"
  ];
  return knockoutMarkers.some((marker) => text.includes(marker.toLowerCase())) ? "knockout" : "group";
}

function eloBucket(absDiff: number, config: RuntimeConfig): "balanced" | "mid_gap" | "strong_gap" {
  if (absDiff <= config.eloBuckets.balancedMaxAbsDiff) return "balanced";
  if (absDiff < config.eloBuckets.midGapMaxAbsDiff) return "mid_gap";
  return "strong_gap";
}

function hostFlag(match: Match): "host_involved" | "no_host" {
  const hosts = ["美国", "加拿大", "墨西哥", "USA", "United States", "Canada", "Mexico"];
  return hosts.some((host) => match.homeTeam.name.includes(host) || match.awayTeam.name.includes(host)) ? "host_involved" : "no_host";
}

function eloFromTeam(fifaRating: number): number {
  return 1350 + fifaRating * 6.3;
}

function impliedProbabilities(scoreBonus: Record<string, number>): Record<string, number> {
  return normalizePmf(Object.fromEntries(Object.entries(scoreBonus).map(([score, bonus]) => [score, bonus > 0 ? 1 / bonus : 0])));
}

function scenarioSpan(scores: string[]): number {
  return new Set(scores.map(scoreDirection)).size;
}

function scoreDirection(score: string): "home" | "draw" | "away" {
  const [home, away] = parseScore(score);
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function normalizedEntropy(values: number[]): number {
  const total = sum(values);
  if (total <= 0 || values.length <= 1) return 0;
  const entropy = values.reduce((acc, value) => {
    const p = value / total;
    return p > 0 ? acc - p * Math.log(p) : acc;
  }, 0);
  return entropy / Math.log(values.length);
}

function normalizePmf(pmf: Record<string, number>): Record<string, number> {
  const total = sum(Object.values(pmf));
  if (total <= 0) return pmf;
  return Object.fromEntries(Object.entries(pmf).map(([score, probability]) => [score, probability / total]));
}

function normalizePmfKeys(pmf: Record<string, number> = {}): Record<string, number> {
  return Object.fromEntries(Object.entries(pmf).map(([score, probability]) => [normalizeScoreKey(score), probability]));
}

function normalizeScoreKey(score: string): string {
  return score.trim().replace(":", "-");
}

function parseScore(score: string): [number, number] {
  const [home, away] = normalizeScoreKey(score)
    .split("-")
    .map((item) => Number.parseInt(item, 10));
  return [Number.isFinite(home) ? home : 0, Number.isFinite(away) ? away : 0];
}

function poisson(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function factorial(value: number): number {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function gaussianKernel(value: number, expected: number, sigma: number): number {
  const safeSigma = Math.max(sigma, 0.1);
  return Math.exp(-Math.pow(value - expected, 2) / (2 * safeSigma * safeSigma));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
