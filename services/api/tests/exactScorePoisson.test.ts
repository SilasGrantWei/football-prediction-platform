import { describe, expect, it } from "vitest";

import {
  buildExactScoreDistribution,
  poissonOutcomeProbabilities
} from "../src/services/exactScorePoisson.js";

describe("buildExactScoreDistribution", () => {
  it("derives Top3 directly from the three highest matrix probabilities", () => {
    const homeLambda = 2.2;
    const awayLambda = 0.78;
    const distribution = buildExactScoreDistribution({
      homeLambda,
      awayLambda,
      homeElo: 2012,
      awayElo: 1880,
      stage: "2026 World Cup knockout quarter-final",
      calibratedOutcome: { home: 0.7935, draw: 0.1347, away: 0.0718 },
      poissonOutcome: poissonOutcomeProbabilities(homeLambda, awayLambda),
      selectionHints: {
        lowTotalPressure: 0.32,
        cleanSheetPressure: 0.24,
        strengthEdge: 13,
        strengthFavorite: "home"
      }
    });

    const matrixTop3 = [...distribution.probabilityMatrix]
      .sort((left, right) => right.probability - left.probability)
      .slice(0, 3)
      .map(({ score, probability }) => ({ score, probability: Math.round(probability * 10_000) / 10_000 }));

    expect(distribution.top3Scores).toEqual(matrixTop3);
  });
});
