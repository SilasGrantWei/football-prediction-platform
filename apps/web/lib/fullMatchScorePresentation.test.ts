import { describe, expect, it } from "vitest";

import { getFullMatchScorePresentation } from "./fullMatchScorePresentation.js";

describe("getFullMatchScorePresentation", () => {
  it("shows the verified aggregate after extra time without changing the 90-minute score", () => {
    expect(
      getFullMatchScorePresentation({
        status: "finished",
        fullMatchHomeScore: 1,
        fullMatchAwayScore: 2,
        resultDecision: "extra_time"
      })
    ).toEqual({ score: "1-2", suffix: "加时后" });
  });

  it("keeps shootout kicks separate from the on-field full-match score", () => {
    expect(
      getFullMatchScorePresentation({
        status: "finished",
        fullMatchHomeScore: 1,
        fullMatchAwayScore: 1,
        penaltyShootoutHomeScore: 5,
        penaltyShootoutAwayScore: 4,
        resultDecision: "penalties"
      })
    ).toEqual({ score: "1-1", suffix: "点球后", penaltyScore: "5-4" });
  });

  it("labels a regulation finish and hides incomplete or unverified score pairs", () => {
    expect(
      getFullMatchScorePresentation({
        status: "finished",
        fullMatchHomeScore: 2,
        fullMatchAwayScore: 0,
        resultDecision: "regulation"
      })
    ).toEqual({ score: "2-0", suffix: "90分钟结束" });

    expect(
      getFullMatchScorePresentation({
        status: "finished",
        fullMatchHomeScore: 2,
        resultDecision: "regulation"
      })
    ).toBeNull();
    expect(
      getFullMatchScorePresentation({
        status: "scheduled",
        fullMatchHomeScore: 0,
        fullMatchAwayScore: 0,
        resultDecision: "regulation"
      })
    ).toBeNull();
  });
});
