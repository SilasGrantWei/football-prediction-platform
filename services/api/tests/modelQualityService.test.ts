import { describe, expect, it } from "vitest";

import type { Match, Prediction, Team } from "../src/models.js";
import { buildModelQualityGate } from "../src/services/modelQualityService.js";

const strongHome: Team = {
  id: "strong-home",
  name: "强队",
  fifaRating: 88,
  recentForm: 84,
  attackAvg: 1.9,
  defenseAvg: 84,
  xga: 0.95
};

const weakAway: Team = {
  id: "weak-away",
  name: "弱队",
  fifaRating: 74,
  recentForm: 70,
  attackAvg: 1.1,
  defenseAvg: 70,
  xga: 1.45
};

const weakHome: Team = {
  ...weakAway,
  id: "weak-home",
  name: "主队弱队"
};

const strongAway: Team = {
  ...strongHome,
  id: "strong-away",
  name: "客队强队"
};

describe("buildModelQualityGate", () => {
  it("only evaluates causal pre-kickoff prediction snapshots and blocks leaky finished-match predictions", () => {
    const valid = makeMatch({
      id: "valid-causal",
      homeScore: 2,
      awayScore: 1,
      prediction: makePrediction("valid-causal", "2026-07-02T10:00:00.000Z", 0.58, 0.24, 0.18, "2-1")
    });
    const leaky = makeMatch({
      id: "leaky-after-kickoff",
      homeScore: 3,
      awayScore: 0,
      prediction: makePrediction("leaky-after-kickoff", "2026-07-02T13:05:00.000Z", 0.95, 0.03, 0.02, "3-0")
    });
    const missing = makeMatch({
      id: "missing-snapshot",
      homeScore: 1,
      awayScore: 1,
      prediction: undefined
    });
    const extraTime = makeMatch({
      id: "extra-time-result",
      homeScore: 2,
      awayScore: 1,
      minute: 120,
      prediction: makePrediction("extra-time-result", "2026-07-02T10:00:00.000Z", 0.5, 0.3, 0.2, "1-1")
    });

    const gate = buildModelQualityGate([valid, leaky, missing, extraTime], { minSamples: 1 });

    expect(gate.sampleCount).toBe(1);
    expect(gate.excludedNoCausalSnapshot).toBe(2);
    expect(gate.excludedExtraTimeOrPenalty).toBe(1);
    expect(gate.leakageBlockedCount).toBe(1);
    expect(gate.samples.map((sample) => sample.matchId)).toEqual(["valid-causal"]);
    expect(gate.resultAccuracy).toBe(1);
    expect(gate.top1ScoreAccuracy).toBe(1);
  });

  it("does not promote a model when the causal sample size is too small", () => {
    const gate = buildModelQualityGate([
      makeMatch({
        id: "single-match",
        homeScore: 2,
        awayScore: 0,
        prediction: makePrediction("single-match", "2026-07-02T10:00:00.000Z", 0.62, 0.22, 0.16, "2-0")
      })
    ]);

    expect(gate.status).toBe("insufficient_data");
    expect(gate.promotionAllowed).toBe(false);
    expect(gate.gateFailures.join("\n")).toContain("赛前快照样本不足");
  });

  it("fails the gate when the model performs worse than a simple causal strength baseline", () => {
    const matches = Array.from({ length: 8 }, (_, index) =>
      makeMatch({
        id: `favorite-miss-${index}`,
        homeTeam: weakHome,
        awayTeam: strongAway,
        homeScore: 0,
        awayScore: 2,
        prediction: makePrediction(`favorite-miss-${index}`, "2026-07-02T10:00:00.000Z", 0.64, 0.21, 0.15, "2-0")
      })
    );

    const gate = buildModelQualityGate(matches);

    expect(gate.status).toBe("fail");
    expect(gate.promotionAllowed).toBe(false);
    expect(gate.resultAccuracy).toBe(0);
    expect(gate.baselineAccuracy).toBe(1);
    expect(gate.gateFailures.join("\n")).toContain("低于基础强弱基线");
    expect(gate.learningActions.join("\n")).toContain("不能推广");
  });
});

function makeMatch(overrides: Partial<Match>): Match {
  return {
    id: "match",
    competition: "2026世界杯测试赛",
    homeTeam: strongHome,
    awayTeam: weakAway,
    homeScore: 0,
    awayScore: 0,
    status: "finished",
    startTime: "2026-07-02T12:00:00.000Z",
    minute: 90,
    ...overrides
  };
}

function makePrediction(
  matchId: string,
  generatedAt: string,
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number,
  topScore: string
): Prediction {
  return {
    matchId,
    modelVersion: "unit-test-model",
    homeWinProb,
    drawProb,
    awayWinProb,
    topScores: [
      { score: topScore, probability: 0.15 },
      { score: "1-1", probability: 0.1 },
      { score: "1-0", probability: 0.08 }
    ],
    gameStyle: "balanced",
    upsetRisk: "medium",
    expectedHomeGoals: 1.5,
    expectedAwayGoals: 1,
    generatedAt
  };
}
