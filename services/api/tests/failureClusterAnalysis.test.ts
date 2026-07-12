import { describe, expect, it } from "vitest";

import type { Match, Prediction, PredictionEvaluation, Team } from "../src/models.js";
import { buildFailureClusterAnalysis } from "../src/services/failureClusterAnalysis.js";

const homeTeam: Team = {
  id: "home",
  name: "主队",
  fifaRating: 82,
  recentForm: 80,
  attackAvg: 1.6,
  defenseAvg: 79,
  xga: 1.1
};

const awayTeam: Team = {
  id: "away",
  name: "客队强队",
  fifaRating: 88,
  recentForm: 85,
  attackAvg: 1.9,
  defenseAvg: 86,
  xga: 0.9
};

describe("buildFailureClusterAnalysis", () => {
  it("clusters recent score failures into actionable root causes", () => {
    const matches = [
      makeMatch("m1", "2026-07-07T12:00:00.000Z", "1-1", 1, 4, 0.3, 0.26, 0.44),
      makeMatch("m2", "2026-07-07T08:00:00.000Z", "1-1", 2, 3, 0.21, 0.25, 0.54),
      makeMatch("m3", "2026-07-06T12:00:00.000Z", "1-2", 0, 1, 0.35, 0.24, 0.42),
      makeMatch("m4", "2026-07-06T08:00:00.000Z", "2-1", 1, 2, 0.71, 0.18, 0.11)
    ];

    const analysis = buildFailureClusterAnalysis(matches, new Set(matches.map((match) => match.id)), 8);
    const labels = analysis.tags.map((tag) => tag.label);

    expect(analysis.inspectedFailureCount).toBe(4);
    expect(analysis.summary).toContain("最近 4 个失败样本");
    expect(labels).toContain("平局/低比分锚定过强");
    expect(labels).toContain("客胜打穿未进首选");
    expect(labels).toContain("胜平负层和比分层脱节");
    expect(analysis.recommendedActions.join(" ")).toContain("Top3必须直接取概率矩阵前三");
  });
});

function makeMatch(
  id: string,
  startTime: string,
  predictedScore: string,
  homeScore: number,
  awayScore: number,
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number
): Match {
  return {
    id,
    competition: "2026世界杯测试赛",
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    status: "finished",
    startTime,
    minute: 90,
    prediction: makePrediction(id, predictedScore, homeScore, awayScore, homeWinProb, drawProb, awayWinProb)
  };
}

function makePrediction(
  matchId: string,
  predictedScore: string,
  homeScore: number,
  awayScore: number,
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number
): Prediction {
  const actualScore = `${homeScore}-${awayScore}`;
  const predictedResult = resultOfScore(predictedScore);
  const actualResult = resultOf(homeScore, awayScore);
  const evaluation: PredictionEvaluation = {
    status: "failed",
    actualScore,
    predictedScore,
    predictedProbability: 0.16,
    exactScoreHit: false,
    top3ScoreHit: false,
    resultHit: predictedResult === actualResult,
    conclusion: "测试失败样本",
    goalError: {
      home: parseScore(predictedScore)[0] - homeScore,
      away: parseScore(predictedScore)[1] - awayScore,
      total: parseScore(predictedScore)[0] + parseScore(predictedScore)[1] - homeScore - awayScore
    },
    failureReasons: ["测试失败原因"],
    learningActions: ["测试学习动作"],
    reviewedAt: "2026-07-07T00:00:00.000Z"
  };

  return {
    matchId,
    modelVersion: "unit-test-model",
    homeWinProb,
    drawProb,
    awayWinProb,
    topScores: [
      { score: predictedScore, probability: 0.16 },
      { score: "1-0", probability: 0.11 },
      { score: "0-1", probability: 0.1 }
    ],
    gameStyle: "balanced",
    upsetRisk: "medium",
    expectedHomeGoals: 1.5,
    expectedAwayGoals: 1.2,
    generatedAt: "2026-07-06T00:00:00.000Z",
    evaluation
  };
}

function resultOfScore(score: string): "home" | "draw" | "away" {
  const [home, away] = parseScore(score);
  return resultOf(home, away);
}

function resultOf(home: number, away: number): "home" | "draw" | "away" {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function parseScore(score: string): [number, number] {
  const [home, away] = score.split("-").map((value) => Number.parseInt(value, 10));
  return [home, away];
}
