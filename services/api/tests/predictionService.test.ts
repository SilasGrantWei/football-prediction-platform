import { afterEach, describe, expect, it, vi } from "vitest";

import { config } from "../src/config.js";
import type { Match, MatchEvent, PostMatchCalibration, TeamRecordComparison } from "../src/models.js";
import { matchRepository } from "../src/repositories/matchRepository.js";
import { buildPredictionEvaluation, buildPredictionLiveReview } from "../src/services/predictionEvaluation.js";
import { buildPredictionExplanation } from "../src/services/predictionExplanation.js";
import {
  calculateDixonColesScoreMatrix,
  calculateLocalPrediction,
  isFutureScheduledPredictionTarget,
  PredictionService
} from "../src/services/predictionService.js";
import { buildWorldCupFactors } from "../src/services/worldCupFactors.js";

const match: Match = {
  id: "test-match",
  competition: "Unit Test Cup",
  homeTeam: {
    id: "home",
    name: "Home FC",
    fifaRating: 92,
    recentForm: 84,
    attackAvg: 2.05,
    defenseAvg: 84,
    xga: 0.92
  },
  awayTeam: {
    id: "away",
    name: "Away FC",
    fifaRating: 78,
    recentForm: 72,
    attackAvg: 1.22,
    defenseAvg: 76,
    xga: 1.22
  },
  homeScore: 0,
  awayScore: 0,
  status: "scheduled",
  startTime: new Date().toISOString(),
  minute: 0
};

const originalDemoMode = config.demoMode;
const originalExternalFriendlyRecordsEnabled = config.externalFriendlyRecordsEnabled;

afterEach(() => {
  vi.restoreAllMocks();
  config.demoMode = originalDemoMode;
  config.externalFriendlyRecordsEnabled = originalExternalFriendlyRecordsEnabled;
});

describe("calculateLocalPrediction", () => {
  it("applies Dixon-Coles low-score correlation to the Poisson score matrix", () => {
    const homeLambda = 1.2;
    const awayLambda = 1.0;
    const rho = -0.12;
    const matrix = calculateDixonColesScoreMatrix(homeLambda, awayLambda, 3, rho);
    const score = (value: string) => matrix.find((item) => item.score === value)?.probability ?? 0;
    const independent = (homeGoals: number, awayGoals: number) =>
      (Math.pow(homeLambda, homeGoals) * Math.exp(-homeLambda) / factorial(homeGoals)) *
      (Math.pow(awayLambda, awayGoals) * Math.exp(-awayLambda) / factorial(awayGoals));

    expect(score("0-0")).toBeGreaterThan(independent(0, 0));
    expect(score("1-1")).toBeGreaterThan(independent(1, 1));
    expect(score("1-0")).toBeLessThan(independent(1, 0));
    expect(score("0-1")).toBeLessThan(independent(0, 1));
  });

  it("returns normalized probabilities and three scorelines", () => {
    const prediction = calculateLocalPrediction(match);
    const total = prediction.homeWinProb + prediction.drawProb + prediction.awayWinProb;

    expect(total).toBeGreaterThan(0.999);
    expect(total).toBeLessThan(1.001);
    expect(prediction.topScores).toHaveLength(3);
    expect(prediction.scoreProbabilityMatrix).toHaveLength(36);
    const matrixTotal = prediction.scoreProbabilityMatrix?.reduce((sum, item) => sum + item.probability, 0) ?? 0;
    const matrixTopScore = [...(prediction.scoreProbabilityMatrix ?? [])].sort((a, b) => b.probability - a.probability)[0];
    expect(matrixTotal).toBeGreaterThan(0.999);
    expect(matrixTotal).toBeLessThan(1.001);
    expect(prediction.topScores[0].score).toBe(matrixTopScore?.score);
    expect(prediction.topScores[0].probability).toBeGreaterThanOrEqual(prediction.topScores[1].probability);
    expect(prediction.topScores[1].probability).toBeGreaterThanOrEqual(prediction.topScores[2].probability);
    expect(["defensive", "balanced", "open"]).toContain(prediction.gameStyle);
    expect(["low", "medium", "high"]).toContain(prediction.upsetRisk);
    expect(prediction.lineupProjection?.matchId).toBe(match.id);
    expect(prediction.preMatchContext?.inputMode).toBe("pre_match_only");
    expect(prediction.preMatchContext?.weather.temperatureC).toBeGreaterThan(0);
    expect(prediction.preMatchContext?.factors.map((item) => item.name)).toContain("赛前气候/温度");
  });

  it("uses completed pre-match team records to raise the better-supported favorite confidence", () => {
    const recordComparison: TeamRecordComparison = {
      matchId: match.id,
      seasonYear: 2026,
      cutoffTime: "2026-07-01T00:00:00.000Z",
      note: "unit-test causal pre-match records",
      home: {
        teamId: match.homeTeam.id,
        teamName: match.homeTeam.name,
        played: 5,
        wins: 4,
        draws: 1,
        losses: 0,
        goalsFor: 11,
        goalsAgainst: 3,
        goalDifference: 8,
        winRate: 0.8,
        cleanSheets: 3,
        avgGoalsFor: 2.2,
        avgGoalsAgainst: 0.6,
        recentForm: ["win", "win", "draw", "win", "win"],
        recentMatches: []
      },
      away: {
        teamId: match.awayTeam.id,
        teamName: match.awayTeam.name,
        played: 5,
        wins: 1,
        draws: 1,
        losses: 3,
        goalsFor: 4,
        goalsAgainst: 9,
        goalDifference: -5,
        winRate: 0.2,
        cleanSheets: 0,
        avgGoalsFor: 0.8,
        avgGoalsAgainst: 1.8,
        recentForm: ["loss", "draw", "loss", "win", "loss"],
        recentMatches: []
      },
      headToHead: {
        played: 0,
        homeWins: 0,
        draws: 0,
        awayWins: 0,
        matches: []
      }
    };

    const baseline = calculateLocalPrediction(match);
    const calibrated = calculateLocalPrediction(match, recordComparison);
    const total = calibrated.homeWinProb + calibrated.drawProb + calibrated.awayWinProb;

    expect(calibrated.homeWinProb).toBeGreaterThan(baseline.homeWinProb);
    expect(calibrated.awayWinProb).toBeLessThan(baseline.awayWinProb);
    expect(calibrated.expectedHomeGoals).toBeGreaterThan(baseline.expectedHomeGoals);
    expect(total).toBeGreaterThan(0.999);
    expect(total).toBeLessThan(1.001);
  });

  it("does not change output when only final score and finished status change", () => {
    const preMatch: Match = {
      id: "causal-snapshot-test",
      competition: "2026 World Cup 1/16",
      homeTeam: {
        id: "usa",
        name: "USA",
        fifaRating: 79,
        recentForm: 78,
        attackAvg: 1.45,
        defenseAvg: 74,
        xga: 1.18
      },
      awayTeam: {
        id: "bosnia",
        name: "Bosnia",
        fifaRating: 76,
        recentForm: 73,
        attackAvg: 1.29,
        defenseAvg: 72,
        xga: 1.28
      },
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
      startTime: "2026-07-02T00:00:00.000Z",
      minute: 0
    };
    const finishedMatch: Match = {
      ...preMatch,
      homeScore: 6,
      awayScore: 4,
      status: "finished",
      minute: 90
    };

    const beforeKickoffPrediction = comparablePrediction(calculateLocalPrediction(preMatch));
    const afterResultPrediction = comparablePrediction(calculateLocalPrediction(finishedMatch));

    expect(afterResultPrediction).toEqual(beforeKickoffPrediction);
  });

  it("does not change output when only live score, minute and live status change", () => {
    const preMatch: Match = {
      id: "live-score-causal-snapshot-test",
      competition: "2026 World Cup 1/16",
      homeTeam: {
        id: "argentina",
        name: "阿根廷",
        fifaRating: 90,
        recentForm: 87,
        attackAvg: 2.1,
        defenseAvg: 83,
        xga: 0.92
      },
      awayTeam: {
        id: "denmark",
        name: "丹麦",
        fifaRating: 82,
        recentForm: 78,
        attackAvg: 1.42,
        defenseAvg: 78,
        xga: 1.14
      },
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
      startTime: "2026-07-04T01:00:00.000Z",
      minute: 0
    };
    const liveMatch: Match = {
      ...preMatch,
      homeScore: 3,
      awayScore: 2,
      status: "live",
      minute: 70
    };

    const beforeKickoffPrediction = comparablePrediction(calculateLocalPrediction(preMatch));
    const livePrediction = comparablePrediction(calculateLocalPrediction(liveMatch));

    expect(livePrediction).toEqual(beforeKickoffPrediction);
  });

  it("applies causal post-match calibration to future matches without reading their result", () => {
    const postMatchCalibration: PostMatchCalibration = {
      version: "unit-test-calibration",
      sampleSignature: "old-match:2026-07-02T00:00:00.000Z",
      learnedMatchCount: 3,
      scoreMissRate: 0.67,
      directionMissRate: 0.33,
      favoriteCleanSheetBoost: 0.18,
      favoriteGoalLift: 0.08,
      underdogGoalSuppression: 0.12,
      drawDampener: 0.1,
      volatilityLift: 0.04,
      generatedAt: "2026-07-03T00:00:00.000Z",
      notes: ["unit-test causal calibration"]
    };

    const baseline = calculateLocalPrediction(match);
    const calibrated = calculateLocalPrediction(match, undefined, postMatchCalibration);

    expect(calibrated.postMatchCalibration?.sampleSignature).toBe(postMatchCalibration.sampleSignature);
    expect(calibrated.homeWinProb).toBeGreaterThan(baseline.homeWinProb);
    expect(calibrated.drawProb).toBeLessThan(baseline.drawProb);
    expect(calibrated.expectedHomeGoals).toBeGreaterThan(baseline.expectedHomeGoals);
    expect(calibrated.expectedAwayGoals).toBeLessThan(baseline.expectedAwayGoals);
  });

  it("cools overconfident favorites after prior favorite direction misses", () => {
    const postMatchCalibration: PostMatchCalibration = {
      version: "unit-test-overconfidence-calibration",
      sampleSignature: "favorite-miss:2026-07-02T00:00:00.000Z",
      learnedMatchCount: 3,
      scoreMissRate: 0.67,
      directionMissRate: 0.67,
      favoriteMissRate: 1,
      favoriteCleanSheetBoost: 0,
      favoriteGoalLift: 0,
      underdogGoalSuppression: 0,
      drawDampener: 0,
      volatilityLift: 0.08,
      favoriteOverconfidencePenalty: 0.18,
      underdogResilienceBoost: 0.12,
      drawProtectionBoost: 0.08,
      generatedAt: "2026-07-03T00:00:00.000Z",
      notes: ["unit-test favorite overconfidence cooling"]
    };

    const baseline = calculateLocalPrediction(match);
    const calibrated = calculateLocalPrediction(match, undefined, postMatchCalibration);

    expect(calibrated.homeWinProb).toBeLessThan(baseline.homeWinProb);
    expect(calibrated.drawProb + calibrated.awayWinProb).toBeGreaterThan(baseline.drawProb + baseline.awayWinProb);
    expect(calibrated.expectedHomeGoals).toBeLessThan(baseline.expectedHomeGoals);
    expect(calibrated.expectedAwayGoals).toBeGreaterThan(baseline.expectedAwayGoals);
    expect(calibrated.postMatchCalibration?.favoriteMissRate).toBe(1);
  });

  it("lifts both-teams-to-score candidates after prior favorite 3-2 clean-sheet misses", () => {
    const dominantFavorite: Match = {
      ...match,
      id: "dominant-favorite-future",
      homeTeam: {
        ...match.homeTeam,
        fifaRating: 94,
        recentForm: 92,
        attackAvg: 2.45,
        defenseAvg: 88,
        xga: 0.72
      },
      awayTeam: {
        ...match.awayTeam,
        fifaRating: 72,
        recentForm: 68,
        attackAvg: 1.05,
        defenseAvg: 70,
        xga: 1.55
      },
      status: "scheduled",
      minute: 0
    };
    const postMatchCalibration: PostMatchCalibration = {
      version: "unit-test-3-2-calibration",
      sampleSignature: "favorite-won-3-2:2026-07-02T00:00:00.000Z",
      learnedMatchCount: 1,
      scoreMissRate: 1,
      directionMissRate: 0,
      favoriteMissRate: 0,
      favoriteCleanSheetBoost: 0,
      favoriteGoalLift: 0.03,
      underdogGoalSuppression: 0,
      drawDampener: 0,
      volatilityLift: 0.18,
      favoriteOverconfidencePenalty: 0.03,
      underdogResilienceBoost: 0.18,
      drawProtectionBoost: 0.02,
      generatedAt: "2026-07-03T00:00:00.000Z",
      notes: ["unit-test favorite conceded multiple calibration"]
    };

    const baseline = calculateLocalPrediction(dominantFavorite);
    const calibrated = calculateLocalPrediction(dominantFavorite, undefined, postMatchCalibration);
    const loserGoalCandidates = calibrated.topScores.map((item) => Number.parseInt(item.score.split("-")[1] ?? "0", 10));

    expect(calibrated.expectedAwayGoals).toBeGreaterThan(baseline.expectedAwayGoals);
    expect(calibrated.topScores).toHaveLength(3);
    expect(loserGoalCandidates.some((goals) => goals >= 1)).toBe(true);
    expect(calibrated.postMatchCalibration?.sampleSignature).toBe(postMatchCalibration.sampleSignature);
  });

  it("protects 90-minute draw candidates after prior high-confidence favorites were dragged level", () => {
    const dominantFavorite: Match = {
      ...match,
      id: "dominant-favorite-draw-risk",
      homeTeam: {
        ...match.homeTeam,
        fifaRating: 94,
        recentForm: 94,
        attackAvg: 2.7,
        defenseAvg: 90,
        xga: 0.62
      },
      awayTeam: {
        ...match.awayTeam,
        fifaRating: 70,
        recentForm: 66,
        attackAvg: 0.9,
        defenseAvg: 68,
        xga: 1.75
      },
      competition: "2026世界杯淘汰赛",
      status: "scheduled",
      minute: 0
    };
    const postMatchCalibration: PostMatchCalibration = {
      version: "unit-test-favorite-draw-calibration",
      sampleSignature: "favorite-dragged-draw:2026-07-02T00:00:00.000Z",
      learnedMatchCount: 1,
      scoreMissRate: 1,
      directionMissRate: 1,
      favoriteMissRate: 1,
      favoriteDrawMissRate: 1,
      favoriteMarginOverestimate: 4,
      favoriteCleanSheetBoost: 0,
      favoriteGoalLift: 0,
      underdogGoalSuppression: 0,
      drawDampener: 0,
      volatilityLift: 0.08,
      favoriteOverconfidencePenalty: 0.3,
      underdogResilienceBoost: 0.22,
      drawProtectionBoost: 0.2,
      generatedAt: "2026-07-03T00:00:00.000Z",
      notes: ["unit-test high-confidence favorite draw calibration"]
    };

    const baseline = calculateLocalPrediction(dominantFavorite);
    const calibrated = calculateLocalPrediction(dominantFavorite, undefined, postMatchCalibration);
    const drawCandidates = calibrated.topScores.filter((item) => item.score.split("-")[0] === item.score.split("-")[1]);
    const blowoutCandidates = calibrated.topScores.filter((item) => {
      const [homeGoals = 0, awayGoals = 0] = item.score.split("-").map((value) => Number.parseInt(value, 10));
      return homeGoals - awayGoals >= 3 && awayGoals === 0;
    });

    expect(calibrated.homeWinProb).toBeLessThan(baseline.homeWinProb);
    expect(calibrated.drawProb).toBeGreaterThan(baseline.drawProb);
    expect(calibrated.expectedHomeGoals).toBeLessThan(baseline.expectedHomeGoals);
    expect(calibrated.expectedAwayGoals).toBeGreaterThan(baseline.expectedAwayGoals);
    expect(drawCandidates.length).toBeGreaterThan(0);
    expect(blowoutCandidates.length).toBe(0);
    expect(calibrated.postMatchCalibration?.favoriteDrawMissRate).toBe(1);
  });

  it("raises favorite breakthrough candidates after prior draw protection misses", () => {
    const awayFavorite: Match = {
      ...match,
      id: "away-favorite-breakthrough-future",
      homeTeam: {
        ...match.homeTeam,
        fifaRating: 82,
        recentForm: 76,
        attackAvg: 1.35,
        defenseAvg: 76,
        xga: 1.15
      },
      awayTeam: {
        ...match.awayTeam,
        fifaRating: 86,
        recentForm: 82,
        attackAvg: 1.7,
        defenseAvg: 82,
        xga: 0.98
      },
      status: "scheduled",
      minute: 0
    };
    const postMatchCalibration: PostMatchCalibration = {
      version: "unit-test-breakthrough-calibration",
      sampleSignature: "draw-protected-favorite-win:2026-07-02T00:00:00.000Z",
      learnedMatchCount: 1,
      scoreMissRate: 1,
      directionMissRate: 1,
      favoriteMissRate: 0,
      favoriteCleanSheetBoost: 0.14,
      favoriteGoalLift: 0.14,
      underdogGoalSuppression: 0.08,
      drawDampener: 0.16,
      volatilityLift: 0.04,
      favoriteOverconfidencePenalty: 0,
      underdogResilienceBoost: 0,
      drawProtectionBoost: 0,
      favoriteDrawMissRate: 0,
      favoriteMarginOverestimate: 0,
      drawProtectedFavoriteWinRate: 1,
      favoriteMarginUnderestimate: 3,
      generatedAt: "2026-07-03T00:00:00.000Z",
      notes: ["unit-test favorite breakthrough calibration"]
    };

    const baseline = calculateLocalPrediction(awayFavorite);
    const calibrated = calculateLocalPrediction(awayFavorite, undefined, postMatchCalibration);
    const awayMarginCandidates = calibrated.topScores.filter((item) => {
      const [homeGoals = 0, awayGoals = 0] = item.score.split("-").map((value) => Number.parseInt(value, 10));
      return awayGoals - homeGoals >= 2;
    });

    expect(calibrated.awayWinProb).toBeGreaterThan(baseline.awayWinProb);
    expect(calibrated.drawProb).toBeLessThan(baseline.drawProb);
    expect(calibrated.expectedAwayGoals).toBeGreaterThan(baseline.expectedAwayGoals);
    expect(awayMarginCandidates.length).toBeGreaterThan(0);
    expect(calibrated.postMatchCalibration?.drawProtectedFavoriteWinRate).toBe(1);
  });

  it("does not let a learned draw-trap breakthrough collapse future candidates into draw", () => {
    const nearEvenAwayFavorite: Match = {
      ...match,
      id: "near-even-draw-trap-future",
      homeTeam: {
        ...match.homeTeam,
        fifaRating: 80,
        recentForm: 73,
        attackAvg: 1.28,
        defenseAvg: 76,
        xga: 1.18
      },
      awayTeam: {
        ...match.awayTeam,
        fifaRating: 84,
        recentForm: 82,
        attackAvg: 1.72,
        defenseAvg: 81,
        xga: 0.96
      },
      competition: "2026世界杯淘汰赛",
      status: "scheduled",
      minute: 0
    };
    const postMatchCalibration: PostMatchCalibration = {
      version: "unit-test-draw-trap-breakthrough",
      sampleSignature: "near-even-draw-trap-away-win:2026-07-02T00:00:00.000Z",
      learnedMatchCount: 1,
      scoreMissRate: 1,
      directionMissRate: 1,
      favoriteMissRate: 0,
      favoriteCleanSheetBoost: 0,
      favoriteGoalLift: 0.14,
      underdogGoalSuppression: 0,
      drawDampener: 0.16,
      volatilityLift: 0.04,
      favoriteOverconfidencePenalty: 0,
      underdogResilienceBoost: 0,
      drawProtectionBoost: 0,
      favoriteDrawMissRate: 0,
      favoriteMarginOverestimate: 0,
      drawProtectedFavoriteWinRate: 0,
      favoriteMarginUnderestimate: 0,
      drawTrapBreakthroughRate: 1,
      drawTrapMarginUnderestimate: 3,
      favoriteCleanSheetBustRate: 0,
      generatedAt: "2026-07-03T00:00:00.000Z",
      notes: ["unit-test draw trap breakthrough calibration"]
    };

    const baseline = calculateLocalPrediction(nearEvenAwayFavorite);
    const calibrated = calculateLocalPrediction(nearEvenAwayFavorite, undefined, postMatchCalibration);
    const awayCandidates = calibrated.topScores.filter((item) => {
      const [homeGoals = 0, awayGoals = 0] = item.score.split("-").map((value) => Number.parseInt(value, 10));
      return awayGoals > homeGoals;
    });

    expect(calibrated.drawProb).toBeLessThan(baseline.drawProb);
    expect(calibrated.awayWinProb).toBeGreaterThan(baseline.awayWinProb);
    expect(calibrated.topScores).toHaveLength(3);
    expect(awayCandidates.length).toBeGreaterThan(0);
    expect(calibrated.topScores.some((item) => item.score === "1-1")).toBe(false);
    expect(calibrated.postMatchCalibration?.drawTrapBreakthroughRate).toBe(1);
  });

  it("moves close one-goal draw-trap learning into non-draw score candidates", () => {
    const nearEvenAwayFavorite: Match = {
      ...match,
      id: "close-draw-trap-future",
      homeTeam: {
        ...match.homeTeam,
        fifaRating: 88,
        recentForm: 80,
        attackAvg: 1.48,
        defenseAvg: 80,
        xga: 1.02
      },
      awayTeam: {
        ...match.awayTeam,
        fifaRating: 89,
        recentForm: 83,
        attackAvg: 1.62,
        defenseAvg: 82,
        xga: 0.98
      },
      competition: "2026涓栫晫鏉窐姹拌禌",
      status: "scheduled",
      minute: 0
    };
    const postMatchCalibration: PostMatchCalibration = {
      version: "unit-test-close-draw-trap-breakthrough",
      sampleSignature: "close-draw-trap-away-win:2026-07-02T00:00:00.000Z",
      learnedMatchCount: 1,
      scoreMissRate: 1,
      directionMissRate: 1,
      favoriteMissRate: 0,
      favoriteCleanSheetBoost: 0,
      favoriteGoalLift: 0.08,
      underdogGoalSuppression: 0,
      drawDampener: 0.13,
      volatilityLift: 0.02,
      favoriteOverconfidencePenalty: 0,
      underdogResilienceBoost: 0,
      drawProtectionBoost: 0,
      favoriteDrawMissRate: 0,
      favoriteMarginOverestimate: 0,
      drawProtectedFavoriteWinRate: 0,
      favoriteMarginUnderestimate: 0,
      drawTrapBreakthroughRate: 1,
      drawTrapMarginUnderestimate: 1,
      favoriteCleanSheetBustRate: 0,
      generatedAt: "2026-07-03T00:00:00.000Z",
      notes: ["unit-test close draw trap breakthrough calibration"]
    };

    const baseline = calculateLocalPrediction(nearEvenAwayFavorite);
    const calibrated = calculateLocalPrediction(nearEvenAwayFavorite, undefined, postMatchCalibration);
    const [topHomeGoals = 0, topAwayGoals = 0] = calibrated.topScores[0]?.score
      .split("-")
      .map((value) => Number.parseInt(value, 10)) ?? [0, 0];
    const drawCandidates = calibrated.topScores.filter((item) => {
      const [homeGoals = 0, awayGoals = 0] = item.score.split("-").map((value) => Number.parseInt(value, 10));
      return homeGoals === awayGoals;
    });

    expect(calibrated.drawProb).toBeLessThan(baseline.drawProb);
    expect(calibrated.awayWinProb).toBeGreaterThan(calibrated.homeWinProb);
    expect(calibrated.topScores).toHaveLength(3);
    expect(drawCandidates.length).toBeLessThan(2);
    expect(calibrated.topScores[0]?.score).not.toBe("1-1");
    expect(topAwayGoals).toBeGreaterThan(topHomeGoals);
    expect(calibrated.postMatchCalibration?.drawTrapMarginUnderestimate).toBe(1);
  });

  it("returns score-specific rationale instead of repeated template text", () => {
    const prediction = calculateLocalPrediction(match);
    const explanation = buildPredictionExplanation(match, prediction);
    const rationales = explanation.scoreRationales;

    expect(rationales).toHaveLength(3);
    expect(rationales[0]?.reasons.join("\n")).not.toEqual(rationales[1]?.reasons.join("\n"));
    expect(rationales[1]?.reasons.join("\n")).not.toEqual(rationales[2]?.reasons.join("\n"));

    for (const [index, rationale] of rationales.entries()) {
      const text = rationale.reasons.join("\n");
      expect(text).toContain(`排序第 ${index + 1}`);
      expect(text).toContain("泊松+方向校准矩阵概率");
      expect(text).toContain("预期进球");
      expect(text).toContain("总进球解释");
      expect(text).toContain("主胜/平/客胜");
    }
  });

  it("does not use final group-stage points before a group match kicks off", () => {
    const groupStageMatch: Match = {
      ...match,
      id: "group-stage-leakage-guard",
      competition: "2026世界杯小组赛 H组",
      homeTeam: {
        id: "spain",
        name: "西班牙",
        fifaRating: 89,
        recentForm: 86,
        attackAvg: 1.78,
        defenseAvg: 86,
        xga: 0.82
      },
      awayTeam: {
        id: "uruguay",
        name: "乌拉圭",
        fifaRating: 84,
        recentForm: 80,
        attackAvg: 1.45,
        defenseAvg: 82,
        xga: 1.05
      },
      startTime: "2026-06-16T00:00:00.000Z"
    };

    const factors = buildWorldCupFactors(groupStageMatch);

    expect(factors.isGroupStage).toBe(true);
    expect(factors.home.groupPoints).toBe(0);
    expect(factors.home.groupGoalDiff).toBe(0);
    expect(factors.away.groupPoints).toBe(0);
    expect(factors.away.groupGoalDiff).toBe(0);
    expect(factors.home.qualifierType).toBe("赛前因果快照");
  });

  it("allows completed group-stage data before a knockout match", () => {
    const knockoutMatch: Match = {
      ...match,
      id: "knockout-causal-context",
      competition: "2026世界杯淘汰赛 · 1/16决赛",
      homeTeam: {
        id: "spain",
        name: "西班牙",
        fifaRating: 89,
        recentForm: 86,
        attackAvg: 1.78,
        defenseAvg: 86,
        xga: 0.82
      },
      awayTeam: {
        id: "austria",
        name: "奥地利",
        fifaRating: 81,
        recentForm: 77,
        attackAvg: 1.55,
        defenseAvg: 78,
        xga: 1.14
      },
      startTime: "2026-07-03T00:00:00.000Z"
    };

    const factors = buildWorldCupFactors(knockoutMatch);

    expect(factors.isKnockout).toBe(true);
    expect(factors.home.groupPoints).toBeGreaterThan(0);
    expect(factors.home.qualifierType).not.toBe("赛前因果快照");
  });

});

describe("PredictionService causal snapshots", () => {
  it("does not create a prediction for a finished match without a pre-match snapshot", async () => {
    config.demoMode = false;
    const service = new PredictionService();
    const upsertSpy = vi.spyOn(matchRepository, "upsertPrediction");
    const finishedMatch: Match = {
      ...match,
      id: "finished-without-prematch-snapshot",
      homeScore: 2,
      awayScore: 0,
      status: "finished",
      startTime: "2026-01-01T00:00:00.000Z",
      minute: 90
    };

    const prediction = await service.getPrediction(finishedMatch);

    expect(prediction).toBeUndefined();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("reconstructs demo finished-match predictions from pre-match inputs only", async () => {
    config.demoMode = true;
    const service = new PredictionService();
    const upsertSpy = vi.spyOn(matchRepository, "upsertPrediction");
    const finishedMatch: Match = {
      ...match,
      id: "demo-finished-causal-reconstruction",
      homeScore: 6,
      awayScore: 4,
      status: "finished",
      startTime: "2026-01-01T00:00:00.000Z",
      minute: 90
    };
    const preMatchInput: Match = {
      ...finishedMatch,
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
      minute: 0,
      prediction: undefined
    };
    const causalBaseline = comparablePrediction(calculateLocalPrediction(preMatchInput));

    const prediction = await service.getPrediction(finishedMatch);

    expect(comparablePrediction(prediction!)).toEqual(causalBaseline);
    expect(new Date(prediction!.generatedAt).getTime()).toBeLessThanOrEqual(new Date(finishedMatch.startTime).getTime());
    expect(prediction?.evaluation?.actualScore).toBe("6-4");
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("adds post-match evaluation to demo finished matches in list enrichment", async () => {
    config.demoMode = true;
    const service = new PredictionService();
    const upsertSpy = vi.spyOn(matchRepository, "upsertPrediction");
    const finishedMatch: Match = {
      ...match,
      id: "demo-finished-list-reconstruction",
      homeScore: 3,
      awayScore: 0,
      status: "finished",
      startTime: "2026-01-01T00:00:00.000Z",
      minute: 90
    };

    const [enriched] = await service.enrichMatches([finishedMatch]);

    expect(enriched?.prediction).toBeDefined();
    expect(enriched?.prediction?.evaluation?.actualScore).toBe("3-0");
    expect(enriched?.prediction?.evaluation?.status).toMatch(/success|failed/);
    expect(new Date(enriched!.prediction!.generatedAt).getTime()).toBeLessThanOrEqual(new Date(finishedMatch.startTime).getTime());
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("stores scheduled list predictions as causal pre-match snapshots", async () => {
    config.demoMode = true;
    const service = new PredictionService();
    const upsertSpy = vi.spyOn(matchRepository, "upsertPrediction");
    const scheduledMatch: Match = {
      ...match,
      id: "scheduled-list-snapshot",
      status: "scheduled",
      startTime: "2099-01-01T00:00:00.000Z",
      minute: 0
    };

    const [enriched] = await service.enrichMatches([scheduledMatch], { detail: false, force: true });

    expect(enriched?.prediction).toBeDefined();
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ matchId: "scheduled-list-snapshot" }));
    expect(new Date(enriched!.prediction!.generatedAt).getTime()).toBeLessThanOrEqual(new Date(scheduledMatch.startTime).getTime());
  });

  it("uses the same pre-match record context for list and detail predictions", async () => {
    config.demoMode = true;
    config.externalFriendlyRecordsEnabled = false;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ai offline"));
    const liveMatch: Match = {
      ...match,
      id: "list-detail-consistency",
      status: "halftime",
      startTime: "2026-07-04T09:00:00.000Z",
      homeScore: 1,
      awayScore: 0,
      minute: 45,
      prediction: undefined
    };
    const recordOpponent = (id: string): Match["homeTeam"] => ({
      id,
      name: id,
      fifaRating: 70,
      recentForm: 70,
      attackAvg: 1,
      defenseAvg: 70,
      xga: 1.4
    });
    const records: Match[] = [
      {
        ...match,
        id: "home-record-1",
        homeTeam: liveMatch.homeTeam,
        awayTeam: recordOpponent("home-opponent-1"),
        homeScore: 4,
        awayScore: 0,
        status: "finished",
        startTime: "2026-06-01T09:00:00.000Z",
        minute: 90,
        prediction: undefined
      },
      {
        ...match,
        id: "home-record-2",
        homeTeam: liveMatch.homeTeam,
        awayTeam: recordOpponent("home-opponent-2"),
        homeScore: 3,
        awayScore: 1,
        status: "finished",
        startTime: "2026-06-08T09:00:00.000Z",
        minute: 90,
        prediction: undefined
      },
      {
        ...match,
        id: "away-record-1",
        homeTeam: liveMatch.awayTeam,
        awayTeam: recordOpponent("away-opponent-1"),
        homeScore: 0,
        awayScore: 2,
        status: "finished",
        startTime: "2026-06-01T12:00:00.000Z",
        minute: 90,
        prediction: undefined
      },
      {
        ...match,
        id: "away-record-2",
        homeTeam: recordOpponent("away-opponent-2"),
        awayTeam: liveMatch.awayTeam,
        homeScore: 2,
        awayScore: 0,
        status: "finished",
        startTime: "2026-06-08T12:00:00.000Z",
        minute: 90,
        prediction: undefined
      }
    ];
    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([liveMatch, ...records]);

    const service = new PredictionService();
    const listPrediction = await service.getPrediction(liveMatch, { detail: false, force: true });
    const detailPrediction = await service.getPrediction(liveMatch, { detail: true, force: true });

    expect(comparablePrediction(listPrediction!)).toEqual(comparablePrediction(detailPrediction!));
  });

  it("keeps the frozen pre-match prediction during live matches and only records live review", async () => {
    config.demoMode = true;
    config.externalFriendlyRecordsEnabled = false;
    const scheduledFavorite: Match = {
      ...match,
      id: "in-play-favorite",
      homeTeam: {
        ...match.homeTeam,
        id: "argentina",
        name: "阿根廷",
        fifaRating: 94,
        recentForm: 94,
        attackAvg: 2.85,
        defenseAvg: 92,
        xga: 0.55
      },
      awayTeam: {
        ...match.awayTeam,
        id: "cape-verde",
        name: "佛得角",
        fifaRating: 72,
        recentForm: 66,
        attackAvg: 0.92,
        defenseAvg: 68,
        xga: 1.8
      },
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
      startTime: "2026-07-04T06:00:00.000Z",
      minute: 0,
      prediction: undefined
    };
    const preMatchPrediction = calculateLocalPrediction(scheduledFavorite);
    const liveMatch: Match = {
      ...scheduledFavorite,
      homeScore: 1,
      awayScore: 1,
      status: "live",
      minute: 66,
      prediction: preMatchPrediction
    };
    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([liveMatch]);

    const prediction = await new PredictionService().getPrediction(liveMatch, { detail: false });

    expect(comparablePrediction(prediction!)).toEqual(comparablePrediction(preMatchPrediction));
    expect(prediction!.topScores).toEqual(preMatchPrediction.topScores);
    expect(prediction!.homeWinProb).toBe(preMatchPrediction.homeWinProb);
    expect(prediction!.modelVersion).not.toContain("-live");
    expect(prediction!.liveReview?.currentScore).toBe("1-1");
    expect(prediction!.liveReview?.predictedScore).toBe(preMatchPrediction.topScores[0]?.score);
    expect(prediction!.liveReview?.status).toMatch(/drifting|off_track/);
  });

  it("does not collapse stoppage-time live scores into a realtime prediction", async () => {
    config.demoMode = true;
    config.externalFriendlyRecordsEnabled = false;
    const scheduledFavorite: Match = {
      ...match,
      id: "stoppage-time-favorite",
      homeTeam: {
        ...match.homeTeam,
        id: "argentina",
        name: "阿根廷",
        fifaRating: 94,
        recentForm: 94,
        attackAvg: 2.85,
        defenseAvg: 92,
        xga: 0.55
      },
      awayTeam: {
        ...match.awayTeam,
        id: "cape-verde",
        name: "佛得角",
        fifaRating: 72,
        recentForm: 66,
        attackAvg: 0.92,
        defenseAvg: 68,
        xga: 1.8
      },
      homeScore: 0,
      awayScore: 0,
      status: "scheduled",
      startTime: "2026-07-04T06:00:00.000Z",
      minute: 0,
      prediction: undefined
    };
    const preMatchPrediction = {
      ...calculateLocalPrediction(scheduledFavorite),
      homeWinProb: 0.87,
      drawProb: 0.1,
      awayWinProb: 0.03,
      topScores: [
        { score: "4-0", probability: 0.12 },
        { score: "3-0", probability: 0.11 },
        { score: "2-0", probability: 0.09 }
      ],
      expectedHomeGoals: 3.65,
      expectedAwayGoals: 0.52
    };
    const liveMatch: Match = {
      ...scheduledFavorite,
      homeScore: 2,
      awayScore: 1,
      status: "live",
      minute: 93,
      prediction: preMatchPrediction
    };
    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([liveMatch]);

    const prediction = await new PredictionService().getPrediction(liveMatch, { detail: false });

    expect(comparablePrediction(prediction!)).toEqual(comparablePrediction(preMatchPrediction));
    expect(prediction!.topScores[0].score).toBe("4-0");
    expect(prediction!.topScores.map((item) => item.score)).not.toEqual(["2-1"]);
    expect(prediction!.drawProb).toBe(0.1);
    expect(prediction!.modelVersion).not.toContain("-live");
    expect(prediction!.liveReview?.currentScore).toBe("2-1");
  });

  it("keeps an existing pre-match snapshot frozen after the match finishes", async () => {
    const service = new PredictionService();
    const upsertSpy = vi.spyOn(matchRepository, "upsertPrediction");
    const preMatchPrediction = {
      ...calculateLocalPrediction(match),
      generatedAt: "2025-12-31T00:00:00.000Z",
      modelVersion: "historical-prematch-model"
    };
    const finishedMatch: Match = {
      ...match,
      homeScore: 0,
      awayScore: 1,
      status: "finished",
      startTime: "2026-01-01T00:00:00.000Z",
      minute: 90,
      prediction: preMatchPrediction
    };

    const prediction = await service.getPrediction(finishedMatch);

    expect(prediction?.topScores).toEqual(preMatchPrediction.topScores);
    expect(prediction?.modelVersion).toBe("historical-prematch-model");
    expect(prediction?.evaluation?.status).toBe("failed");
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("refreshes only future scheduled predictions after post-match learning", async () => {
    config.demoMode = true;
    const now = new Date("2099-01-01T12:00:00.000Z");
    const futureScheduled: Match = {
      ...match,
      id: "future-scheduled-refresh",
      status: "scheduled",
      startTime: "2099-01-02T00:00:00.000Z",
      minute: 0,
      prediction: undefined
    };
    const staleScheduled: Match = {
      ...match,
      id: "stale-scheduled-no-refresh",
      status: "scheduled",
      startTime: "2099-01-01T10:00:00.000Z",
      minute: 0
    };
    const liveMatch: Match = {
      ...match,
      id: "live-no-refresh",
      status: "live",
      startTime: "2099-01-01T11:00:00.000Z",
      minute: 35
    };
    const finishedMatch: Match = {
      ...match,
      id: "finished-locked-no-refresh",
      status: "finished",
      startTime: "2098-12-31T00:00:00.000Z",
      homeScore: 2,
      awayScore: 0,
      minute: 90
    };

    vi.spyOn(matchRepository, "findMatches").mockImplementation(async (filters = {}) => {
      if (filters.status === "finished") return [finishedMatch];
      return [futureScheduled, staleScheduled, liveMatch, finishedMatch];
    });
    const upsertSpy = vi.spyOn(matchRepository, "upsertPrediction").mockResolvedValue(undefined);

    const result = await new PredictionService().refreshUpcomingPredictions(now);

    expect(isFutureScheduledPredictionTarget(futureScheduled, now)).toBe(true);
    expect(isFutureScheduledPredictionTarget(staleScheduled, now)).toBe(false);
    expect(isFutureScheduledPredictionTarget(liveMatch, now)).toBe(false);
    expect(isFutureScheduledPredictionTarget(finishedMatch, now)).toBe(false);
    expect(result.considered).toBe(4);
    expect(result.recalculated).toBe(1);
    expect(result.skipped.alreadyStarted).toBe(2);
    expect(result.skipped.finishedLocked).toBe(1);
    expect(result.matches).toEqual([
      expect.objectContaining({
        matchId: "future-scheduled-refresh",
        predictedScore: expect.stringMatching(/^\d+-\d+$/)
      })
    ]);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ matchId: "future-scheduled-refresh" }));
  });
});

describe("buildPredictionEvaluation", () => {
  it("marks a finished match as successful when the actual score is in Top 3", () => {
    const finishedMatch: Match = {
      ...match,
      homeScore: 1,
      awayScore: 0,
      status: "finished",
      minute: 90
    };
    const prediction = {
      ...calculateLocalPrediction(finishedMatch),
      topScores: [
        { score: "2-0", probability: 0.16 },
        { score: "1-0", probability: 0.14 },
        { score: "2-1", probability: 0.11 }
      ]
    };

    const evaluation = buildPredictionEvaluation(finishedMatch, prediction);

    expect(evaluation?.status).toBe("success");
    expect(evaluation?.top3ScoreHit).toBe(true);
    expect(evaluation?.top3Rank).toBe(2);
    expect(evaluation?.learningActions.length).toBeGreaterThan(0);
  });

  it("returns detailed match context, failure reasons, and learning actions when the 90-minute score is missed", () => {
    const finishedMatch: Match = {
      ...match,
      homeScore: 0,
      awayScore: 1,
      status: "finished",
      minute: 90
    };
    const prediction = {
      ...calculateLocalPrediction(finishedMatch),
      topScores: [
        { score: "2-0", probability: 0.16 },
        { score: "1-0", probability: 0.14 },
        { score: "2-1", probability: 0.11 }
      ]
    };
    const events: MatchEvent[] = [
      {
        id: 1,
        matchId: finishedMatch.id,
        minute: 12,
        type: "offside",
        team: finishedMatch.homeTeam.name,
        player: "主队前锋",
        description: "前插越位，进攻回合被切断",
        createdAt: "2026-07-01T00:00:00.000Z"
      },
      {
        id: 2,
        matchId: finishedMatch.id,
        minute: 18,
        type: "corner",
        team: finishedMatch.homeTeam.name,
        player: "主队边锋",
        description: "边路传中被解围形成角球，但二点球没有形成射正",
        createdAt: "2026-07-01T00:01:00.000Z"
      },
      {
        id: 3,
        matchId: finishedMatch.id,
        minute: 33,
        type: "shot_blocked",
        team: finishedMatch.homeTeam.name,
        player: "主队前锋",
        description: "禁区前沿射门被封堵",
        createdAt: "2026-07-01T00:02:00.000Z"
      },
      {
        id: 4,
        matchId: finishedMatch.id,
        minute: 67,
        type: "goal",
        team: finishedMatch.awayTeam.name,
        player: "客队前锋",
        description: "反击破门",
        createdAt: "2026-07-01T00:03:00.000Z"
      }
    ];

    const evaluation = buildPredictionEvaluation(finishedMatch, prediction, events, {
      sourceLabel: "单元测试真实事件源",
      stats: {
        home: {
          possession: 58,
          shots: 14,
          shotsOnTarget: 2,
          corners: 7,
          fouls: 15,
          yellowCards: 2,
          redCards: 0,
          xg: 1.1
        },
        away: {
          possession: 42,
          shots: 7,
          shotsOnTarget: 4,
          corners: 3,
          fouls: 13,
          yellowCards: 1,
          redCards: 0,
          xg: 1.4
        }
      }
    });

    expect(evaluation?.status).toBe("failed");
    expect(evaluation?.top3ScoreHit).toBe(false);
    expect(evaluation?.resultHit).toBe(false);
    expect(evaluation?.failureReasons.length).toBeGreaterThan(0);
    expect(evaluation?.learningActions.length).toBeGreaterThan(0);
    expect(evaluation?.matchSummary?.join(" ")).toContain("事件链概览");
    const failureTitles = evaluation?.failureBreakdown?.map((item) => item.title) ?? [];
    expect(failureTitles).toContain("事件链根因");
    expect(failureTitles).toContain("技术统计根因");
    const failureText = evaluation?.failureBreakdown?.flatMap((item) => [item.detail, ...item.evidence]).join(" ") ?? "";
    expect(failureText).toContain("越位");
    expect(failureText).toContain("角球");
    expect(failureText).toContain("封堵");
    expect(failureText).toContain("事件时间段");
    expect(failureText).toContain("射正转化");
    expect(failureText).toContain("定位球");
    expect(failureText).toContain("反击");
    expect(failureText).toContain("机会质量");
    expect(failureText).toContain("转化链条");
    expect(evaluation?.dataGaps?.join(" ")).not.toContain("缺少真实事件时间线");
    expect(evaluation?.dataGaps?.join(" ")).not.toContain("缺少真实技术统计");
  });

  it("evaluates the stored 90-minute score even when the feed later records extra-time metadata", () => {
    const extraTimeMatch: Match = {
      ...match,
      homeScore: 2,
      awayScore: 2,
      status: "finished",
      minute: 120
    };
    const prediction = {
      ...calculateLocalPrediction(extraTimeMatch),
      topScores: [
        { score: "2-2", probability: 0.16 },
        { score: "1-1", probability: 0.14 },
        { score: "2-1", probability: 0.11 }
      ]
    };

    const evaluation = buildPredictionEvaluation(extraTimeMatch, prediction);

    expect(evaluation?.status).toBe("success");
    expect(evaluation?.actualScore).toBe("2-2");
    expect(evaluation?.conclusion).toContain("不含加时赛和点球大战");
  });
});

describe("buildPredictionLiveReview", () => {
  it("tracks an in-play match without converting it into a final evaluation", () => {
    const liveMatch: Match = {
      ...match,
      homeScore: 0,
      awayScore: 0,
      status: "live",
      minute: 6
    };
    const prediction = {
      ...calculateLocalPrediction({ ...match, status: "scheduled", minute: 0 }),
      topScores: [
        { score: "2-1", probability: 0.12 },
        { score: "1-1", probability: 0.11 },
        { score: "3-1", probability: 0.1 }
      ],
      expectedHomeGoals: 2.2,
      expectedAwayGoals: 1.1
    };

    const review = buildPredictionLiveReview(liveMatch, prediction);

    expect(review?.status).toBe("pending");
    expect(review?.currentScore).toBe("0-0");
    expect(review?.predictedScore).toBe("2-1");
    expect(review?.top3StillPlausible).toBe(true);
    expect(review?.optimizationActions.join(" ")).toContain("禁止把赛中比分回填为赛前推算");
    expect(buildPredictionEvaluation(liveMatch, prediction)).toBeUndefined();
  });

  it("flags a late live match as off track when the score direction is no longer plausible", () => {
    const liveMatch: Match = {
      ...match,
      homeScore: 0,
      awayScore: 2,
      status: "live",
      minute: 70
    };
    const prediction = {
      ...calculateLocalPrediction({ ...match, status: "scheduled", minute: 0 }),
      topScores: [
        { score: "2-0", probability: 0.14 },
        { score: "2-1", probability: 0.11 },
        { score: "1-0", probability: 0.1 }
      ],
      expectedHomeGoals: 2.1,
      expectedAwayGoals: 0.8
    };
    const frozenTopScores = structuredClone(prediction.topScores);

    const review = buildPredictionLiveReview(liveMatch, prediction);

    expect(review?.status).toBe("off_track");
    expect(review?.resultDirectionNow).toBe("away");
    expect(review?.predictedDirection).toBe("home");
    expect(review?.top3StillPlausible).toBe(false);
    expect(review?.optimizationActions.length).toBeGreaterThan(0);
    expect(prediction.topScores).toEqual(frozenTopScores);
  });

  it("does not create live review for scheduled or finished matches", () => {
    const prediction = calculateLocalPrediction(match);

    expect(buildPredictionLiveReview(match, prediction)).toBeUndefined();
    expect(buildPredictionLiveReview({ ...match, status: "finished", minute: 90 }, prediction)).toBeUndefined();
  });
});

function comparablePrediction(prediction: ReturnType<typeof calculateLocalPrediction>) {
  return {
    homeWinProb: prediction.homeWinProb,
    drawProb: prediction.drawProb,
    awayWinProb: prediction.awayWinProb,
    topScores: prediction.topScores,
    gameStyle: prediction.gameStyle,
    upsetRisk: prediction.upsetRisk,
    expectedHomeGoals: prediction.expectedHomeGoals,
    expectedAwayGoals: prediction.expectedAwayGoals,
    modelVersion: prediction.modelVersion
  };
}

function factorial(n: number): number {
  let value = 1;
  for (let i = 2; i <= n; i += 1) value *= i;
  return value;
}
