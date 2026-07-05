import { afterEach, describe, expect, it, vi } from "vitest";

import type { Match, Prediction } from "../src/models.js";
import { matchRepository } from "../src/repositories/matchRepository.js";
import { buildPostMatchCalibration } from "../src/services/postMatchCalibrationService.js";

const basePrediction: Prediction = {
  matchId: "sample",
  homeWinProb: 0.55,
  drawProb: 0.28,
  awayWinProb: 0.17,
  topScores: [
    { score: "2-1", probability: 0.12 },
    { score: "1-1", probability: 0.11 },
    { score: "1-0", probability: 0.1 }
  ],
  gameStyle: "balanced",
  upsetRisk: "medium",
  expectedHomeGoals: 1.1,
  expectedAwayGoals: 0.8,
  generatedAt: "2026-07-02T00:00:00.000Z",
  modelVersion: "unit-test-prematch"
};

const targetMatch = makeMatch({
  id: "target",
  startTime: "2026-07-03T12:00:00.000Z",
  status: "scheduled"
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildPostMatchCalibration", () => {
  it("learns only from finished pre-kickoff prediction snapshots before the target match", async () => {
    const validSample = makeMatch({
      id: "valid-clean-sheet-miss",
      startTime: "2026-07-02T04:00:00.000Z",
      homeScore: 2,
      awayScore: 0,
      status: "finished",
      minute: 90,
      prediction: { ...basePrediction, matchId: "valid-clean-sheet-miss" }
    });
    const leakyGeneratedAfterKickoff = makeMatch({
      id: "leaky-generated-after-kickoff",
      startTime: "2026-07-02T04:00:00.000Z",
      homeScore: 3,
      awayScore: 0,
      status: "finished",
      minute: 90,
      prediction: {
        ...basePrediction,
        matchId: "leaky-generated-after-kickoff",
        generatedAt: "2026-07-02T05:00:00.000Z"
      }
    });
    const futureSample = makeMatch({
      id: "future-sample",
      startTime: "2026-07-04T04:00:00.000Z",
      homeScore: 2,
      awayScore: 0,
      status: "finished",
      minute: 90,
      prediction: { ...basePrediction, matchId: "future-sample" }
    });

    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([validSample, leakyGeneratedAfterKickoff, futureSample]);

    const calibration = await buildPostMatchCalibration(targetMatch);

    expect(calibration).toBeDefined();
    expect(calibration?.learnedMatchCount).toBe(1);
    expect(calibration?.sampleSignature).toContain("valid-clean-sheet-miss");
    expect(calibration?.sampleSignature).not.toContain("leaky-generated-after-kickoff");
    expect(calibration?.sampleSignature).not.toContain("future-sample");
    expect(calibration?.favoriteCleanSheetBoost).toBeGreaterThan(0);
    expect(calibration?.favoriteGoalLift).toBeGreaterThan(0);
    expect(calibration?.underdogGoalSuppression).toBeGreaterThan(0);
    expect(calibration?.drawDampener).toBeGreaterThan(0);
    expect(calibration?.favoriteMissRate).toBe(0);
    expect(calibration?.favoriteOverconfidencePenalty).toBe(0);
    expect(calibration?.notes.join("\n")).toContain("热门方向失误率");
  });

  it("turns prior favorite direction failures into a future overconfidence penalty", async () => {
    const favoriteMiss = makeMatch({
      id: "favorite-direction-miss",
      startTime: "2026-07-02T04:00:00.000Z",
      homeScore: 0,
      awayScore: 1,
      status: "finished",
      minute: 90,
      prediction: {
        ...basePrediction,
        matchId: "favorite-direction-miss",
        homeWinProb: 0.62,
        drawProb: 0.2,
        awayWinProb: 0.18,
        expectedHomeGoals: 2.1,
        expectedAwayGoals: 0.7,
        topScores: [
          { score: "2-0", probability: 0.16 },
          { score: "2-1", probability: 0.12 },
          { score: "1-0", probability: 0.1 }
        ]
      }
    });
    const futureSample = makeMatch({
      id: "future-sample",
      startTime: "2026-07-04T04:00:00.000Z",
      homeScore: 0,
      awayScore: 1,
      status: "finished",
      minute: 90,
      prediction: { ...basePrediction, matchId: "future-sample" }
    });

    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([favoriteMiss, futureSample]);

    const calibration = await buildPostMatchCalibration(targetMatch);

    expect(calibration).toBeDefined();
    expect(calibration?.learnedMatchCount).toBe(1);
    expect(calibration?.sampleSignature).toContain("favorite-direction-miss");
    expect(calibration?.sampleSignature).not.toContain("future-sample");
    expect(calibration?.favoriteMissRate).toBe(1);
    expect(calibration?.favoriteOverconfidencePenalty).toBeGreaterThan(0);
    expect(calibration?.underdogResilienceBoost).toBeGreaterThan(0);
    expect(calibration?.notes.join("\n")).toContain("不读取目标比赛赛果");
  });

  it("learns when a high-confidence favorite is dragged into a 90-minute draw", async () => {
    const favoriteDraggedDraw = makeMatch({
      id: "favorite-dragged-draw",
      startTime: "2026-07-02T04:00:00.000Z",
      homeScore: 1,
      awayScore: 1,
      status: "finished",
      minute: 90,
      prediction: {
        ...basePrediction,
        matchId: "favorite-dragged-draw",
        homeWinProb: 0.87,
        drawProb: 0.1,
        awayWinProb: 0.03,
        expectedHomeGoals: 4.49,
        expectedAwayGoals: 0.58,
        topScores: [
          { score: "4-0", probability: 0.12 },
          { score: "3-0", probability: 0.11 },
          { score: "5-0", probability: 0.09 }
        ]
      }
    });
    const futureSample = makeMatch({
      id: "future-sample",
      startTime: "2026-07-04T04:00:00.000Z",
      homeScore: 1,
      awayScore: 1,
      status: "finished",
      minute: 90,
      prediction: { ...basePrediction, matchId: "future-sample" }
    });

    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([favoriteDraggedDraw, futureSample]);

    const calibration = await buildPostMatchCalibration(targetMatch);

    expect(calibration).toBeDefined();
    expect(calibration?.learnedMatchCount).toBe(1);
    expect(calibration?.sampleSignature).toContain("favorite-dragged-draw");
    expect(calibration?.sampleSignature).not.toContain("future-sample");
    expect(calibration?.favoriteMissRate).toBe(1);
    expect(calibration?.favoriteDrawMissRate).toBe(1);
    expect(calibration?.favoriteMarginOverestimate).toBeGreaterThan(2);
    expect(calibration?.favoriteOverconfidencePenalty).toBeGreaterThan(0.2);
    expect(calibration?.drawProtectionBoost).toBeGreaterThan(0.16);
    expect(calibration?.favoriteCleanSheetBoost).toBe(0);
    expect(calibration?.notes.join("\n")).toContain("高置信热门被90分钟拖平");
  });

  it("learns when draw protection was too strong and the favorite breaks through", async () => {
    const drawProtectedFavoriteWin = makeMatch({
      id: "draw-protected-favorite-win",
      startTime: "2026-07-02T04:00:00.000Z",
      homeScore: 0,
      awayScore: 3,
      status: "finished",
      minute: 90,
      prediction: {
        ...basePrediction,
        matchId: "draw-protected-favorite-win",
        homeWinProb: 0.31,
        drawProb: 0.31,
        awayWinProb: 0.38,
        expectedHomeGoals: 1.1,
        expectedAwayGoals: 1.35,
        topScores: [
          { score: "1-1", probability: 0.12 },
          { score: "0-1", probability: 0.1 },
          { score: "1-2", probability: 0.09 }
        ]
      }
    });

    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([drawProtectedFavoriteWin]);

    const calibration = await buildPostMatchCalibration(targetMatch);

    expect(calibration).toBeDefined();
    expect(calibration?.learnedMatchCount).toBe(1);
    expect(calibration?.drawProtectedFavoriteWinRate).toBe(1);
    expect(calibration?.favoriteMarginUnderestimate).toBe(3);
    expect(calibration?.drawProtectionBoost).toBe(0);
    expect(calibration?.drawDampener).toBeGreaterThan(0.1);
    expect(calibration?.favoriteGoalLift).toBeGreaterThan(0.1);
  });

  it("learns near-even draw-trap breakthroughs without requiring a favorite gap", async () => {
    const drawTrapBreakthrough = makeMatch({
      id: "near-even-draw-trap-away-win",
      startTime: "2026-07-02T04:00:00.000Z",
      homeScore: 0,
      awayScore: 3,
      status: "finished",
      minute: 90,
      prediction: {
        ...basePrediction,
        matchId: "near-even-draw-trap-away-win",
        homeWinProb: 0.345,
        drawProb: 0.323,
        awayWinProb: 0.332,
        expectedHomeGoals: 1.15,
        expectedAwayGoals: 1.2,
        topScores: [
          { score: "1-1", probability: 0.12 },
          { score: "1-2", probability: 0.1 },
          { score: "0-1", probability: 0.09 }
        ]
      }
    });

    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([drawTrapBreakthrough]);

    const calibration = await buildPostMatchCalibration(targetMatch);

    expect(calibration).toBeDefined();
    expect(calibration?.learnedMatchCount).toBe(1);
    expect(calibration?.drawTrapBreakthroughRate).toBe(1);
    expect(calibration?.drawTrapMarginUnderestimate).toBe(3);
    expect(calibration?.drawDampener).toBeGreaterThan(0.1);
    expect(calibration?.favoriteGoalLift).toBeGreaterThan(0.08);
    expect(calibration?.drawProtectionBoost).toBe(0);
    expect(calibration?.notes.join("\n")).toContain("平局陷阱");
  });

  it("learns when a favorite wins but concedes multiple goals in a high-total miss", async () => {
    const favoriteWonButConceded = makeMatch({
      id: "favorite-won-3-2",
      startTime: "2026-07-02T04:00:00.000Z",
      homeScore: 3,
      awayScore: 2,
      status: "finished",
      minute: 90,
      prediction: {
        ...basePrediction,
        matchId: "favorite-won-3-2",
        homeWinProb: 0.82,
        drawProb: 0.12,
        awayWinProb: 0.06,
        expectedHomeGoals: 3.8,
        expectedAwayGoals: 0.45,
        topScores: [
          { score: "4-0", probability: 0.16 },
          { score: "3-0", probability: 0.12 },
          { score: "5-0", probability: 0.1 }
        ]
      }
    });
    const futureSample = makeMatch({
      id: "future-sample",
      startTime: "2026-07-04T04:00:00.000Z",
      homeScore: 3,
      awayScore: 2,
      status: "finished",
      minute: 90,
      prediction: { ...basePrediction, matchId: "future-sample" }
    });

    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([favoriteWonButConceded, futureSample]);

    const calibration = await buildPostMatchCalibration(targetMatch);

    expect(calibration).toBeDefined();
    expect(calibration?.learnedMatchCount).toBe(1);
    expect(calibration?.sampleSignature).toContain("favorite-won-3-2");
    expect(calibration?.sampleSignature).not.toContain("future-sample");
    expect(calibration?.favoriteCleanSheetBoost).toBe(0);
    expect(calibration?.favoriteCleanSheetBustRate).toBe(1);
    expect(calibration?.underdogGoalSuppression).toBe(0);
    expect(calibration?.underdogResilienceBoost).toBeGreaterThan(0.1);
    expect(calibration?.volatilityLift).toBeGreaterThan(0.1);
    expect(calibration?.notes.join("\n")).toContain("热门方赢球但丢两球以上");
  });

  it("can use a causal fallback prediction for demo backtests but rejects leaky fallback predictions", async () => {
    const missingSnapshot = makeMatch({
      id: "missing-snapshot",
      startTime: "2026-07-02T04:00:00.000Z",
      homeScore: 0,
      awayScore: 1,
      status: "finished",
      minute: 90,
      prediction: undefined
    });
    const leakyFallback = makeMatch({
      id: "leaky-fallback",
      startTime: "2026-07-02T06:00:00.000Z",
      homeScore: 2,
      awayScore: 0,
      status: "finished",
      minute: 90,
      prediction: undefined
    });

    vi.spyOn(matchRepository, "findMatches").mockResolvedValue([missingSnapshot, leakyFallback]);

    const calibration = await buildPostMatchCalibration(targetMatch, (match) => ({
      ...basePrediction,
      matchId: match.id,
      generatedAt:
        match.id === "missing-snapshot" ? "2026-07-02T03:30:00.000Z" : "2026-07-02T07:30:00.000Z"
    }));

    expect(calibration).toBeDefined();
    expect(calibration?.learnedMatchCount).toBe(1);
    expect(calibration?.sampleSignature).toContain("missing-snapshot");
    expect(calibration?.sampleSignature).not.toContain("leaky-fallback");
  });
});

function makeMatch(overrides: Partial<Match>): Match {
  return {
    id: "sample",
    competition: "2026世界杯淘汰赛",
    homeTeam: {
      id: "home",
      name: "主队",
      fifaRating: 88,
      recentForm: 84,
      attackAvg: 1.9,
      defenseAvg: 84,
      xga: 0.95
    },
    awayTeam: {
      id: "away",
      name: "客队",
      fifaRating: 78,
      recentForm: 72,
      attackAvg: 1.2,
      defenseAvg: 74,
      xga: 1.25
    },
    homeScore: 0,
    awayScore: 0,
    status: "scheduled",
    startTime: "2026-07-03T00:00:00.000Z",
    minute: 0,
    ...overrides
  };
}
